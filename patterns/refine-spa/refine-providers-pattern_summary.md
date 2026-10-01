# Refine Providers — Rule Card

**Tags**: "web:auth", "web:api-surface:contract"

<!-- Egzekwowalne streszczenie refine-providers-pattern.md. WIĄŻĄCE dla apps/web.
     Promowane z marketing-hub (TS-MH-002) 2026-09-27 — Scope: project-specific
     (marketing-hub), patrz plik bazowy. -->

**Layer**: Cross-Layer · **Applies to**: `authProvider`, `accessControlProvider`,
`dataProvider`, hooki wołające API

## MUST

- **PRV1** — Cały ruch do API idzie przez `dataProvider` albo dedykowany hook w
  `providers/`. Komponent w `features/` nie woła `fetch` bezpośrednio.
- **PRV2** — `authProvider.check()` = `GET /api/me`; 401 → `{ authenticated: false,
  redirectTo }`; `logout()` = przekierowanie na end-session `iam`; brak lokalnego
  stanu sesji poza tym, co zwróci API.
- **PRV3** — `accessControlProvider.can()` czyta `GET /api/me/permissions` z cache
  (TanStack Query, `staleTime` z konfiguracji). Zero zahardkodowanych map ról w kliencie.
- **PRV4** — `dataProvider` parsuje kopertę JSend schematami z pakietu kontraktów
  projektu (np. `@<scope>/contracts`): `success` → `data`; `fail` → `HttpError` z `errors`
  per pole; `error` → `HttpError` ze statycznym komunikatem. Nieznany kształt = błąd,
  nie „przepuść dalej".
- **PRV5** — Providery przyjmują `fetch` (i bazowy URL) jako parametr fabryki; testy L1
  podają atrapę, produkcja `window.fetch`.
- **PRV6** — Typy odpowiedzi endpointów pochodzą wyłącznie z pakietu kontraktów projektu;
  żadnego ręcznego `interface` powielającego DTO API w `apps/web`.

## MUST NOT

- **N1** — ❌ `fetch('/api/...')` w komponencie lub stronie.
- **N2** — ❌ Tabela `{ admin: [...], editor: [...] }` w kliencie.
- **N3** — ❌ Ręczne parsowanie `response.json()` bez schematu z pakietu kontraktów.
- **N4** — ❌ Przekazywanie `error.message` z koperty `error` do UI jako treści
  domenowej — pokazuj komunikat generyczny plus identyfikator z `X-Request-Id`.

## Verifier — najczęstsze naruszenia

| Symptom | Reguła |
|---|---|
| `fetch(` poza `apps/web/src/providers/` | PRV1/N1 |
| `interface XxxResponse` w `apps/web` dublujący pakiet kontraktów | PRV6 |
| `can()` bez zapytania do API | PRV3/N2 |
| `response.json()` bez `safeParse` schematu | PRV4/N3 |
