import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { constantTimeEqual } from './crypto-utils.js';
import { debugLog } from './log.js';

const CALLBACK_PATH = '/callback';
// Generous for a name+state form POST (see callback-redirect.eta), but bounded — this
// listener accepts connections from any local process for its whole lifetime, so an
// unbounded body read would be a local DoS vector against the CLI itself.
const MAX_BODY_BYTES = 64 * 1024;

export interface CallbackListener {
  readonly port: number;
  readonly redirectUri: string;
  /** Resolves with the raw token once a POST arrives whose `state` field matches
   *  `expectedState`, or rejects on timeout / a listener-level error. Either way the
   *  server has stopped accepting new connections by the time this settles
   *  (task-spec pt. 2). Call at most once per listener. */
  waitForToken(expectedState: string, timeoutMs: number): Promise<string>;
}

// Task-spec pt. 1: port 0 — the OS assigns an unused ephemeral port; a fixed or guessed
// port would let another local process squat on it ahead of us, or collide with a second
// concurrent instance of this same CLI.
export async function startCallbackListener(): Promise<CallbackListener> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Loopback listener did not report a numeric port');
  }
  const port = address.port;
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

  function waitForToken(expectedState: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;

      // Task-spec pt. 2: a hard timeout independent of the state check above — the backstop
      // for an abandoned login (user closed the tab, never finished the Zitadel prompt).
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        server.close();
        reject(new Error('Timed out waiting for the browser login to complete'));
      }, timeoutMs);
      timer.unref();

      function finish(err: Error | null, token?: string): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Task-spec pt. 2: stop accepting NEW connections the instant the matching state
        // arrives. server.close() lets the in-flight response for THIS request finish
        // sending — it just refuses anything after it.
        server.close();
        if (err) reject(err);
        else resolve(token as string);
      }

      server.on('request', (req: IncomingMessage, res: ServerResponse) => {
        void handleRequest(req, res, expectedState, finish);
      });
      server.on('error', (err) => finish(err));
    });
  }

  return { port, redirectUri, waitForToken };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedState: string,
  finish: (err: Error | null, token?: string) => void,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method !== 'POST' || url.pathname !== CALLBACK_PATH) {
    res.writeHead(404).end();
    return; // not the delivery POST — keep listening, do not touch `finish`
  }

  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    res.writeHead(400).end();
    debugLog('callback body read failed', { message: (err as Error).message });
    return; // malformed/oversized request from *something* local — keep listening for the
    // real callback rather than giving up on the whole flow over one bad request.
  }

  const form = new URLSearchParams(body);
  const state = form.get('state');
  const token = form.get('token');

  // Task-spec pt. 3: state is verified BEFORE the POST body is trusted for anything else —
  // the only defence against a token minted for this flow being handed to a different,
  // unrelated open tab that also happens to POST to this loopback port during the same
  // window.
  if (typeof state !== 'string' || !constantTimeEqual(state, expectedState)) {
    debugLog('callback state mismatch — ignoring, listener stays open');
    res.writeHead(400).end();
    return; // deliberately does NOT call finish(): a guessed/garbage state must not be
    // able to burn the one legitimate callback by racing it.
  }

  if (typeof token !== 'string' || token.length === 0) {
    res.writeHead(400).end();
    finish(new Error('Callback matched state but carried no token'));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><meta charset="utf-8"><p>Zalogowano. Możesz zamknąć tę kartę.</p>');
  // Task-spec pt. 6: `token` is handed straight to the caller via finish()/the returned
  // promise — it is never passed to debugLog/infoLog from here or anywhere else in this
  // file.
  finish(null, token);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Callback body exceeded size limit'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
