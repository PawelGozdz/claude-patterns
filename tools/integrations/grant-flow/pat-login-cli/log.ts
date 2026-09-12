// Deliberately NOT this repo's shared pino logger (src/core/logger.ts). Pulling that in
// would tie a supposedly self-contained, temporary module (D2) to iam's own logging setup
// — exactly the coupling this directory is meant to avoid before it moves to its own repo.
// A CLI's natural "log" surface is its own stderr anyway.
const DEBUG = process.env['PAT_CLI_DEBUG'] === '1';

// Task-spec pt. 6: this listener must NEVER log the raw token, not even at debug level.
// This function does not redact anything itself — it trusts every call site to never pass
// the token in `fields`. Grep this module for `debugLog(` before adding a new call site,
// and never add one in callback-listener.ts's success path.
export function debugLog(message: string, fields: Record<string, unknown> = {}): void {
  if (!DEBUG) return;
  process.stderr.write(`[pat-login-cli] ${message} ${JSON.stringify(fields)}\n`);
}

// Always-on, human-facing progress line (browser URL, fallback instructions) — stderr, so
// stdout stays reserved for the token itself (see cli.ts).
export function infoLog(message: string): void {
  process.stderr.write(`[pat-login-cli] ${message}\n`);
}
