# Pattern: Web Security Invariants (Refine SPA za bramą iam)

**Tags**: "web:security", "web:auth"
**Layer**: Cross-Layer
**Status**: stable
**Scope**: project-specific (marketing-hub) — single-project derivation (TS-MH-002), not yet
validated in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "marketing-hub"` to include it. Promote to universal once grant-flow (albo inny
projekt) faktycznie wdroży ten sam kształt panelu Refine.

## What This Is

Panel web (Vite + React + Refine + Ant Design) jest cienkim klientem nad API, stojącym za
wspólną bramą `iam` (Caddy + oauth2-proxy). Każda próba „dodania bezpieczeństwa po stronie
przeglądarki" (tokeny w storage, walidacja uprawnień w UI jako jedyna bariera, własne
fetch-e poza `/api`) tworzy powierzchnię ataku, której API nie kontroluje. Ten wzorzec
spisuje niezmienniki, które egzekwuje bramka VETO warstwy `web`, nie tylko dobre praktyki.

## When to Use

**Use this pattern for:**
- ✅ Panel administracyjny/dashboard na Refine, wystawiony za wspólną bramą `iam`/Caddy z
  sesją w cookie (dokładnie kształt `marketing-hub`, docelowo `grant-flow-ui`)
- ✅ Każdy nowy provider/hook w `apps/web/src/providers/`, który dotyka sieci, storage albo
  renderuje treść przychodzącą z API (markdown, HTML)
- ✅ Audyt bezpieczeństwa istniejącego panelu Refine przed dodaniem nowego kontrolera HTTP
  po stronie API, który panel będzie konsumować

**Do NOT use for:**
- ❌ Samo API/backend — tam obowiązują `cross-layer/security-invariants-pattern.md`
  (dekorator `@Auth()`, reguły SI/N na poziomie kontrolera), nie ten wzorzec
- ❌ Aplikacja mobilna Flutter — tam obowiązuje blok `mobile-security` (wzorce
  `mobile-security-invariants`/`platform-channel`), model sesji i storage jest inny
- ❌ SPA bez współdzielonej bramy `iam` (np. panel z własnym OAuth flow w przeglądarce) —
  WS1/WS3 poniżej zakładają konkretnie ten model sesji; inny model wymaga własnego wzorca

## Implementation

- **WS1** — Sesja żyje w cookie ustawianym przez `iam`/Caddy; przeglądarka nigdy nie widzi
  tokenów. Zero `localStorage`/`sessionStorage`/`IndexedDB`.
- **WS2** — Uprawnienia w UI (`accessControlProvider.can()`) to wyłącznie UX (ukrywanie
  akcji). Egzekwuje API. Test L3 potwierdza, że ukryta akcja wywołana ręcznie dostaje
  401/403 z API.
- **WS3** — Jedyny ruch sieciowy to `/api/*` tego samego originu (Vite proxy w dev, Caddy w
  prod) — zero absolutnych adresów do innych hostów w kodzie sieciowym.
- **WS4** — CSP z nonce serwowana przez API dla `index.html`; brak inline skryptów w
  bundlu produkcyjnym.
- **WS5** — Markdown i HTML z API renderowane wyłącznie przez komponent z sanitizerem
  (np. `rehype-sanitize`), nigdy `dangerouslySetInnerHTML` poza nim.
- **WS6** — Telemetria Refine (`disableTelemetry`) wyłączona od pierwszego commita.
- **WS7** — `console.*` w kodzie produkcyjnym tylko przez wspólny wrapper loggera; nigdy
  identyfikatory sesji, e-maile ani treść odpowiedzi API.

## Anti-Patterns

- ❌ Token sesji w `localStorage`/`sessionStorage` "na wszelki wypadek" — to jedyny cel,
  jaki miałaby kradzież przez XSS.
- ❌ Logika biznesowa w komponencie ("jeśli budżet > X, pokaż...") — API jest źródłem
  prawdy, UI tylko wyświetla decyzję.
- ❌ `fetch()` do adresu poza własnym originem z kodu klienta — omija bramę `iam` i CSP.
- ❌ Sekrety albo adresy wewnętrzne w `import.meta.env` bundlowanym do przeglądarki.

Karta reguł: `web-security-invariants-pattern_summary.md`.
