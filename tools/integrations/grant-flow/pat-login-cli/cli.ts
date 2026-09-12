#!/usr/bin/env node
// Local copy of iam's src/tooling/pat-login-cli (TS-SSO-035) — that module's own README
// calls itself "temporary code" meant to be copied into consumers like this one, not
// imported across repos. Copied 2026-09-08 for grantflow-log-time (TS-SSO-028/033 follow-up
// on the grant-flow side). Only addition vs the iam original: --invalidate, wiring the
// 401-retry contract documented in index.ts (invalidateCachedToken() then a forced
// re-login) into something a bash caller can invoke as two separate process calls.
import { getOrRefreshPatToken, invalidateCachedToken } from './index.js';
import { infoLog } from './log.js';

// Prints ONLY the token on stdout — every other message (progress, the browser URL, errors)
// goes to stderr via log.ts, so `TOKEN=$(tsx cli.ts)` in a shell script captures just the
// token and nothing else.
async function main(): Promise<void> {
  if (process.argv.includes('--invalidate')) {
    await invalidateCachedToken();
    return;
  }
  const token = await getOrRefreshPatToken();
  process.stdout.write(`${token}\n`);
}

main().catch((err: unknown) => {
  infoLog(`Logowanie nie powiodło się: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
