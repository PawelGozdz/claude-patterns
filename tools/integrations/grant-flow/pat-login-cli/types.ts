// TS-SSO-035 / D2: shared types for this module only — deliberately not imported from, or
// exported into, the rest of src/ (this whole directory is temporary code slated to move
// to its own repo later; keeping its type surface self-contained is what makes that move a
// copy, not an untangling).

export interface GetPatTokenOptions {
  /** iam admin-panel origin, e.g. "https://admin.app.dev.juz-ide.pl". Falls back to the
   *  IAM_ADMIN_BASE_URL env var when omitted — see config.ts. No hardcoded default: an
   *  unset value is a configuration error, not "assume localhost". */
  iamBaseUrl?: string;
  /** Distinguishes multiple cached tokens for the same iamBaseUrl (e.g. one per tool that
   *  imports this module). Defaults to a single, unkeyed cache file per base URL. */
  cacheKey?: string;
  /** Skip the cache and force a fresh browser login even if a cached token exists. The
   *  401-retry contract (task-spec pt. 5) is: caller calls invalidateCachedToken() first,
   *  then getOrRefreshPatToken({ forceRefresh: true }) — not a bare retry of the old token. */
  forceRefresh?: boolean;
  /** Hard timeout for the whole browser round trip, in ms. Defaults to DEFAULT_TIMEOUT_MS
   *  (config.ts) — always applied, never skippable (task-spec pt. 2). */
  timeoutMs?: number;
  /** Set to false to skip the automatic browser spawn and only print the URL — useful over
   *  SSH or in a headless/CI context. Defaults to true. */
  openBrowser?: boolean;
}

export interface CachedToken {
  readonly token: string;
  readonly issuedAt: string; // ISO 8601 — informational only, this module has no way to
  // know the token's real expiry (the callback only ever carries the raw token itself, see
  // callback-redirect.eta); expiry is discovered the moment the protected API says 401.
}
