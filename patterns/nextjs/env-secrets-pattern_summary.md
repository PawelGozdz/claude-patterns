# Env & Secrets (Next.js) — Rule Card

**Tags**: "web:security", "web:platform:nextjs"

**Layer**: Cross-Layer · **Applies to**: `lib/env.server.ts`, `lib/env.public.ts`, every
`process.env` read, `.env*` files, Dockerfile / CI build config

## MUST

- **ES1** — Secrets never carry the `NEXT_PUBLIC_` prefix. If a browser needs it, it is not
  a secret.
- **ES2** — All server variables are validated once at startup in one `server-only` module;
  failure names the variables, never prints values.
- **ES3** — `NEXT_PUBLIC_*` is referenced statically (`process.env.NEXT_PUBLIC_X`), never
  through a variable, alias or `process.env[name]`.
- **ES4** — `NEXT_PUBLIC_*` is frozen at `next build`. One image promoted across environments
  has no environment-specific `NEXT_PUBLIC_` values; runtime values are served at runtime.
- **ES5** — Real secrets are never committed; `.env*.local` is gitignored; `.env.example`
  documents every variable name.
- **ES6** — Only the data layer reads secrets; other modules receive already-safe values.
- **ES7** — Modules holding secrets or business logic import `server-only`; Client Components
  get minimal props, not whole records.
- **ES8** — A per-request value in a prerendered page is read after opting into dynamic
  rendering (`connection()` or a request-time API).

## MUST NOT

- **N1** — ❌ `NEXT_PUBLIC_API_SECRET` or any secret/internal URL behind the public prefix.
- **N2** — ❌ `process.env.X!` scattered across modules.
- **N3** — ❌ Logging the env object or its values.
- **N4** — ❌ Importing the DB client in a Client Component.
- **N5** — ❌ Treating React taint APIs (experimental) as a replacement for DAL filtering.

## Verifier — most common violations -> VETO

| Symptom | Rule |
|---|---|
| `NEXT_PUBLIC_` name containing SECRET, KEY, TOKEN or an internal host | ES1/N1 |
| `process.env[...]` or aliased `env.NEXT_PUBLIC_*` in client code | ES3 |
| `process.env.X!` outside `env.server.ts` | ES2/N2 |
| `.env` with real values tracked in git / no `.env.example` | ES5 |
| Env-specific `NEXT_PUBLIC_` value in a shared image build | ES4 |
| Module with secrets lacking `import 'server-only'` | ES7 |
| Error message or log containing an env value | ES2/N3 |
