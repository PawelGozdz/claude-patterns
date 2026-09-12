import { startCallbackListener } from './callback-listener.js';
import { openBrowser } from './open-browser.js';
import { generateState } from './crypto-utils.js';
import { infoLog } from './log.js';
import { DEFAULT_TIMEOUT_MS } from './config.js';

export interface BrowserLoginOptions {
  iamBaseUrl: string;
  timeoutMs?: number;
  openBrowserAutomatically?: boolean;
}

// Drives one full RFC 8252 loopback round trip against iam's EXISTING, already-implemented
// step-up PAT screen — GET /admin/tokens?redirect=...&state=... (src/admin/routes.ts) and
// its loopback allowlist (src/admin/redirect-validation.ts). Neither is touched by this
// module; this function only calls them the way they already expect to be called. The
// browser does the rest (Zitadel step-up prompt, the "Moje tokeny" form, iam's own
// auto-submitting callback-redirect.eta) and POSTs the result back to the listener below.
export async function runBrowserLogin(opts: BrowserLoginOptions): Promise<string> {
  const state = generateState();
  const listener = await startCallbackListener();

  const authorizeUrl = new URL('/admin/tokens', opts.iamBaseUrl);
  authorizeUrl.searchParams.set('redirect', listener.redirectUri);
  authorizeUrl.searchParams.set('state', state);

  // Task-spec pt. 7: the URL is always printed, whether or not the automatic spawn below
  // runs — the manual-open fallback needs it regardless.
  infoLog(`Otwieram przeglądarkę, aby dokończyć logowanie:`);
  infoLog(authorizeUrl.toString());
  if (opts.openBrowserAutomatically !== false) {
    openBrowser(authorizeUrl.toString());
  }

  return listener.waitForToken(state, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}
