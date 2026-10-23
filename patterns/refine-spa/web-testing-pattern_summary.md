# Web Testing — Rule Card

**Tags**: "web:tests"

<!-- Egzekwowalne streszczenie web-testing-pattern.md. WIĄŻĄCE dla apps/web.
     Promowane z marketing-hub (TS-MH-002) 2026-09-27 — Scope: project-specific
     (marketing-hub), patrz plik bazowy. -->

**Layer**: Testing · **Applies to**: `apps/web/src/**/*.spec.ts(x)`, `apps/web/e2e/**`

## MUST

- **WT1** — Providery mają testy L1 bez DOM: atrapa `fetch`, przypadki `success`/`fail`/
  `error` koperty JSend i 401 w `check()`.
- **WT2** — Każda strona ma test L2 (RTL) na trzy stany: dane, pusto, błąd; plus
  wariant „bez uprawnienia" ukrywający akcję.
- **WT3** — L2 nie dotyka sieci: MSW albo atrapa providera; test, który potrzebuje
  realnego API, jest L3.
- **WT4** — L3 to smoke Playwright (tożsamość dev → dashboard) i asercja, że wszystkie
  żądania idą do `/api/*` (WS3). Kolejne scenariusze L3 (przepływ zapisu przez bramę) są
  dopuszczone, gdy zatwierdzona analiza zadania je przewiduje (decyzja `D*`); dowodzą
  przejścia przez bramę, nie reguł biznesowych — te nie są testowane w L3.
- **WT5** — Specy L1/L2 co-located obok kodu (`*.spec.tsx`), jak w `apps/api`; L3 w katalogu
  z `playwright.config.ts` projektu (domyślnie `apps/web/e2e/`; projekt z innym układem,
  np. `apps/web/test/e2e/`, trzyma się własnego — to nie naruszenie).
- **WT6** — `pnpm --filter <pakiet-web> test` (nazwa pakietu z jego `package.json`) =
  L1+L2, poniżej 60 s; L3 osobnym skryptem.

## MUST NOT

- **N1** — ❌ Snapshot całej strony jako jedyny test (kruchy, nic nie dowodzi).
- **N2** — ❌ `fetch` do prawdziwego API w L1/L2.
- **N3** — ❌ Playwright do reguł biznesowych i przypadków brzegowych.

## Verifier — najczęstsze naruszenia

| Symptom | Reguła |
|---|---|
| Provider bez `*.spec.ts` | WT1 |
| Strona bez testu stanu błędu/pustki | WT2 |
| `toMatchSnapshot()` jako jedyna asercja | N1 |
| Test L2 z `http://localhost` | WT3/N2 |
