# Pattern: Web Testing (L1 providery, L2 RTL, L3 Playwright smoke)

**Tags**: "web:tests"
**Layer**: Testing
**Status**: stable
**Scope**: project-specific (marketing-hub) — single-project derivation (TS-MH-002), not yet
validated in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "marketing-hub"` to include it. Promote to universal once grant-flow (albo inny
projekt) faktycznie wdroży ten sam kształt panelu Refine.

## What This Is

Piramida testów dla panelu Refine: L1 (Vitest bez DOM) dla providerów i adapterów, L2
(Vitest + React Testing Library) dla stron/komponentów, L3 (Playwright) dla jednego smoke
end-to-end. Reguły biznesowe są udowadniane w L1/L2 API, nie powtarzane w L3 przeglądarki.

## When to Use

**Use this pattern for:**
- ✅ Nowy provider Refine (auth/accessControl/data) — jaki poziom testu, jaka atrapa
- ✅ Nowa strona `*.page.tsx` — jakie stany (dane/pusto/błąd/bez uprawnienia) musi pokryć L2
- ✅ Decyzja, czy dany scenariusz to L3 (smoke sieciowy) albo należy do testów API

**Do NOT use for:**
- ❌ Testy samego API (`apps/api`) — tam obowiązuje `testing/testing-pyramid-pattern.md`
- ❌ Testy reguł biznesowych — te żyją w L1/L2 API, L3 tego panelu ich nie dowodzi (WT4)
- ❌ Testy widgetów Flutter — inny runtime testowy, patrz `flutter/testing-pattern.md`

## Implementation

- **WT1** — L1 (Vitest, bez DOM): providery Refine z atrapą `fetch`; adapter JSend; utils
  w `shared/lib`. Przypadki `success`/`fail`/`error` koperty i 401 w `check()`.
- **WT2** — L2 (Vitest + React Testing Library + jsdom): strona lub komponent na trzy
  stany (dane/pusto/błąd) plus wariant „bez uprawnienia" ukrywający akcję; dostępność
  podstawowa (role, etykiety).
- **WT3** — L2 nie woła sieci: `fetch` zastąpiony przez MSW albo atrapę providera; test,
  który potrzebuje realnego API, jest L3.
- **WT4** — L3 (Playwright): wyłącznie smoke „logowanie tożsamością dev → dashboard" plus
  nasłuch żądań sieciowych (tylko `/api/*`). Reguły biznesowe nie są testowane w L3.
- **WT5** — Specy co-located obok kodu (`*.spec.tsx`), jak w `apps/api`; L3 w
  `apps/web/e2e/`.
- **WT6** — `pnpm --filter <pakiet-web> test` (nazwa pakietu z jego `package.json`) = L1+L2,
  poniżej 60 s; L3 uruchamiany osobnym skryptem, w osobnym jobie CI, nie blokuje L1/L2.

## Anti-Patterns

- ❌ Snapshot całej strony jako jedyny test — kruchy, nic nie dowodzi.
- ❌ `fetch` do prawdziwego API w L1/L2.
- ❌ Playwright do reguł biznesowych i przypadków brzegowych — to zadanie L1/L2 API.

Karta reguł: `web-testing-pattern_summary.md`.
