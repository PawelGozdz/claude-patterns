# Pattern: Refine Providers (auth, access control, data JSend)

**Tags**: "web:auth", "web:api-surface:contract"
**Layer**: Cross-Layer
**Status**: stable
**Scope**: project-specific (marketing-hub) — single-project derivation (TS-MH-002), not yet
validated in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "marketing-hub"` to include it. Promote to universal once grant-flow (albo inny
projekt) faktycznie wdroży ten sam kształt panelu Refine.

## What This Is

Refine daje trzy szwy do świata zewnętrznego: `authProvider`, `accessControlProvider`,
`dataProvider`. Jeśli każdy ekran sam woła API, kontrakt odpowiedzi (JSend) i sesja `iam`
rozlewają się po komponentach i nie da się ich podmienić ani przetestować w izolacji.

## When to Use

**Use this pattern for:**
- ✅ Pierwsza implementacja panelu Refine za bramą `iam` — jak skonstruować
  `authProvider`/`accessControlProvider`/`dataProvider` od zera
- ✅ Nowy endpoint API konsumowany przez panel — gdzie w `providers/` powinien wylądować
  kod, który go woła
- ✅ Code review providerów albo hooków sieciowych w `apps/web/src/providers/`

**Do NOT use for:**
- ❌ Panel na innym frameworku niż Refine (np. czysty React Query + własny router) — trzy
  szwy providerów są specyficzne dla API Refine, nie przenoszą się bez zmian
- ❌ Warstwa API/backend, która wystawia te endpointy — tam obowiązuje `zod.yml`
  (`infrastructure/controller-schema-pattern.md`) po stronie serwera

## Implementation

- **PRV1** — Cały ruch do API idzie przez `dataProvider` albo dedykowany hook w
  `providers/`. Komponent w `features/` nie woła `fetch` bezpośrednio.
- **PRV2** — `authProvider.check()` → `GET /api/me`; 401 → `{ authenticated: false,
  redirectTo }`; `logout()` → przekierowanie na URL end-session `iam`; `getIdentity()`
  zwraca DTO `Identity` ze wspólnego pakietu kontraktów projektu.
- **PRV3** — `accessControlProvider.can({resource, action})` → `GET /api/me/permissions`,
  cache w TanStack Query ze `staleTime` z konfiguracji; brak własnej tabeli uprawnień w
  kliencie.
- **PRV4** — `dataProvider` na `@refinedev/simple-rest` z adapterem koperty JSend:
  `success.data` → wynik; `fail.data` → `HttpError` z polami walidacji; `error.message` →
  `HttpError` ze statycznym komunikatem. Kształt koperty sprawdzany schematami Zod z
  pakietu kontraktów projektu (np. `@<scope>/contracts`, współdzielonego między API i web).
- **PRV5** — Providery to czyste moduły przyjmujące `fetch` jako zależność — testowalne L1
  bez DOM.
- **PRV6** — Typy odpowiedzi endpointów pochodzą wyłącznie z pakietu kontraktów projektu;
  żadnego ręcznego `interface` powielającego DTO API w `apps/web`.

## Anti-Patterns

- ❌ `fetch('/api/...')` bezpośrednio w komponencie lub stronie, zamiast przez provider.
- ❌ Tabela `{ admin: [...], editor: [...] }` zahardkodowana w kliencie.
- ❌ Ręczne parsowanie `response.json()` bez schematu z pakietu kontraktów.
- ❌ Przekazywanie `error.message` z koperty `error` do UI jako treści domenowej — pokazuj
  komunikat generyczny plus identyfikator z `X-Request-Id`.

Karta reguł: `refine-providers-pattern_summary.md`.
