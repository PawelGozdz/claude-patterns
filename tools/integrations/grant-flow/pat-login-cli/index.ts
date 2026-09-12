import { readCachedToken, writeCachedToken, deleteCachedToken } from './token-cache.js';
import { runBrowserLogin } from './login-flow.js';
import { resolveIamBaseUrl } from './config.js';
import type { GetPatTokenOptions } from './types.js';

export type { GetPatTokenOptions, CachedToken } from './types.js';

// Task-spec pt. 8: the one function this module exists to export. Returns a valid bearer
// PAT — reads the cache first, only opens a browser when the cache is empty (or the
// caller forces a refresh).
export async function getOrRefreshPatToken(opts: GetPatTokenOptions = {}): Promise<string> {
  const iamBaseUrl = resolveIamBaseUrl(opts.iamBaseUrl);

  if (!opts.forceRefresh) {
    const cached = await readCachedToken(iamBaseUrl, opts.cacheKey);
    if (cached) return cached.token;
  }

  const token = await runBrowserLogin({
    iamBaseUrl,
    timeoutMs: opts.timeoutMs,
    openBrowserAutomatically: opts.openBrowser,
  });
  await writeCachedToken(iamBaseUrl, opts.cacheKey, token);
  return token;
}

// Task-spec pt. 5: a caller talking to a PROTECTED API (not iam itself) that gets a 401
// must call this immediately, then call getOrRefreshPatToken({ forceRefresh: true }) —
// never simply retry the same cached token. This module cannot enforce that from here (it
// does not own the protected API's fetch call); this export is the contract's other half.
export async function invalidateCachedToken(opts: { iamBaseUrl?: string; cacheKey?: string } = {}): Promise<void> {
  const iamBaseUrl = resolveIamBaseUrl(opts.iamBaseUrl);
  await deleteCachedToken(iamBaseUrl, opts.cacheKey);
}
