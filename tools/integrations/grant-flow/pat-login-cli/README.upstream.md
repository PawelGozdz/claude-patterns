# pat-login-cli

TS-SSO-035. Local CLI helper that logs a developer in to iam's self-service PAT flow using
an RFC 8252 "loopback interpretation" redirect, caches the resulting bearer token in the
OS profile cache directory, and hands it back to whatever local tool asked for it (a shell
script, `/log-time`, eventually Claude Code itself).

**This is temporary code.** Per the approved TS-SSO-035 analysis (D2), this module lives
inside `src/` only so the repo's existing `/orchestrate` layer plan (`dirs: [src/]`) covers
it. It is deliberately self-contained — its only imports are Node built-ins (`node:http`,
`node:crypto`, `node:fs/promises`, `node:path`, `node:os`, `node:child_process`) and its own
sibling files, nothing else from this repo's `src/` tree — so that moving it to its
eventual home (`tooling/security` in a different repo) is a straight copy, not an
untangling job. Do not add an import from outside this directory.

## What it does NOT touch

The server side of this flow — step-up PKCE, `POST /admin/tokens/new`,
`GET /admin/tokens/step-up/callback`, the loopback redirect allowlist — already exists and
is out of scope here (`src/admin/step-up.ts`, `src/admin/redirect-validation.ts`,
`src/admin/routes.ts`). This module is purely the client side of that already-implemented
contract.

## Usage

### As a library

```ts
import { getOrRefreshPatToken, invalidateCachedToken } from './index.js';

const token = await getOrRefreshPatToken(); // opens a browser only if the cache is empty

const res = await fetch(someProtectedApiUrl, {
  headers: { Authorization: `Bearer ${token}` },
});

if (res.status === 401) {
  // Task-spec pt. 5: never retry the same token — drop it and log in again.
  await invalidateCachedToken();
  const fresh = await getOrRefreshPatToken({ forceRefresh: true });
  // retry once with `fresh`
}
```

`getOrRefreshPatToken(opts)`:

| option | default | meaning |
|---|---|---|
| `iamBaseUrl` | `IAM_ADMIN_BASE_URL` env var | iam admin-panel origin, e.g. `https://admin.app.dev.juz-ide.pl`. No hardcoded fallback. |
| `cacheKey` | none | lets two different callers keep separate cached tokens against the same `iamBaseUrl`. |
| `forceRefresh` | `false` | skip the cache, always do a fresh browser login. |
| `timeoutMs` | 3 min | hard timeout for the whole browser round trip. |
| `openBrowser` | `true` | set `false` to skip the automatic spawn and only print the URL (SSH / headless). |

### As a standalone script

```bash
IAM_ADMIN_BASE_URL=https://admin.app.dev.juz-ide.pl tsx src/tooling/pat-login-cli/cli.ts
```

Prints only the token to stdout (everything else — progress, the login URL, errors — goes
to stderr), so `TOKEN=$(tsx .../cli.ts)` works.

## Design notes / task-spec traceability

Numbers below refer to the threat-model recommendations this task's brief called out as
binding (`docs/security/threat-models/TM-TS-SSO-035.md`, Rekomendacje/Addendum).

1. **Port**: `http.createServer().listen(0, '127.0.0.1')`, then read `server.address().port`
   — never a fixed or guessed port (`callback-listener.ts`).
2. **One-shot listener**: `server.close()` runs the instant a request with the matching
   `state` arrives, stopping new connections immediately; a separate hard timeout
   (default 3 min, `config.ts`) is the backstop for an abandoned login.
3. **State**: `crypto.randomBytes(32)` (`crypto-utils.ts`, mirrors — but does not import —
   `src/admin/step-up.ts`'s own `generateState()`), verified with a constant-time compare
   *before* the POST body's `token` field is trusted at all. A state mismatch is logged and
   ignored — the listener keeps waiting rather than aborting the whole flow over what could
   just be a stray/garbage request.
4. **Token cache**: OS profile cache dir (`cache-paths.ts`) — never `/tmp`, this repo, or a
   cloud-synced folder. Directory `0700` / file `0600`, both set via explicit `fs.chmod`
   calls (never relied on umask). Writes go through a tmp-file-then-`rename()` in the same
   directory (`token-cache.ts`), so two CLI instances racing each other never see a
   half-written file.
5. **401 handling**: this module exposes `invalidateCachedToken()` for exactly that; it
   cannot enforce the "delete then re-login, never retry" contract itself, because it does
   not own the protected API's own `fetch` call — see the usage example above.
6. **No raw-token logging**: `log.ts`'s `debugLog`/`infoLog` are never called with the token
   anywhere in this module, including in `callback-listener.ts`'s success path.
7. **Opening the browser**: a plain per-platform `spawn` (`open` / `xdg-open` /
   `cmd /c start`, `open-browser.ts`) — no "open"-style npm dependency, keeping this module
   at zero non-builtin dependencies. If the spawn fails (missing binary, headless
   environment, restricted sandbox), it falls back to printing the URL, which is always
   printed anyway before the spawn is attempted.
8. **Public surface**: `getOrRefreshPatToken()` / `invalidateCachedToken()` (`index.ts`) —
   both importable, and `cli.ts` wraps the first one for direct script use.
9. **Self-containment**: see "What it does NOT touch" above.

## Loopback host: 127.0.0.1 only

The server-side allowlist (`redirect-validation.ts`) accepts both `127.0.0.1` and `[::1]`
literals. This CLI only ever binds `127.0.0.1` — picking one avoids dual-stack bind
complexity for a first version; nothing here prevents adding `[::1]` support later if a
platform ever needs it.
