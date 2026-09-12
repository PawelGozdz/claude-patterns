// TS-SSO-035 / D2, task-spec pt. 8: the iam admin-panel origin this CLI talks to MUST be
// configurable, never hardcoded — this repo's own local admin panel lives behind Caddy at
// a domain like https://admin.app.dev.juz-ide.pl, and a different deployment (or a future
// home for this module, outside this repo) will have a different one entirely.
const BASE_URL_ENV_VAR = 'IAM_ADMIN_BASE_URL';

// Task-spec pt. 2: "osobny twardy timeout (2-5 min)" — 3 minutes sits in the middle of
// that range. Always applied by login-flow.ts unless a caller explicitly overrides it via
// GetPatTokenOptions.timeoutMs; there is no "no timeout" option.
export const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

// Resolves and validates the base URL once, at the start of a call — failing fast here
// (a clear config error) beats failing deep inside the login flow with a confusing
// "invalid URL" thrown from somewhere unrelated.
export function resolveIamBaseUrl(explicit?: string): string {
  const raw = explicit ?? process.env[BASE_URL_ENV_VAR];
  if (!raw || raw.trim() === '') {
    throw new Error(
      `${BASE_URL_ENV_VAR} is not set — point it at the iam admin panel origin ` +
        '(e.g. https://admin.app.<BASE_DOMAIN>). No default is assumed on purpose: ' +
        'silently falling back to some guessed host would risk minting a token against ' +
        'the wrong environment.',
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${BASE_URL_ENV_VAR} is not a valid URL: "${raw}"`);
  }
  // Normalises away any trailing path/query the caller might have pasted in by mistake —
  // every request this module makes builds its own path (/admin/tokens) from here.
  return url.origin;
}
