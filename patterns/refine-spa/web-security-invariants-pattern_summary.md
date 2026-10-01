# Web Security Invariants (Refine SPA za bramą iam) — Rule Card

**Tags**: "web:security", "web:auth"

<!-- Egzekwowalne streszczenie web-security-invariants-pattern.md. WIĄŻĄCE dla apps/web.
     Promowane z marketing-hub (TS-MH-002) 2026-09-27 — Scope: project-specific
     (marketing-hub), patrz plik bazowy. -->

**Layer**: Cross-Layer · **Applies to**: `apps/web/src/**` — providery Refine, hooki
sieciowe, komponenty renderujące treść z API, konfiguracja Vite/CSP

## MUST

- **WS1** — Sesja w cookie ustawianym przez `iam`/Caddy. Zero tokenów w `localStorage`,
  `sessionStorage`, `IndexedDB` ani w pamięci aplikacji. ESLint w `apps/web` zakazuje
  `localStorage`/`sessionStorage` (`no-restricted-globals`).
- **WS2** — `accessControlProvider.can()` służy UX. Każda mutacja ma test L3 dowodzący,
  że API odrzuca ją bez uprawnienia niezależnie od UI.
- **WS3** — Jedyny host sieciowy to własny origin, ścieżki `/api/*`. Test L3 nasłuchuje
  żądań i zalicza tylko te do `/api/`.
- **WS4** — `index.html` serwowane z CSP z nonce (helmet po stronie API/Caddy); brak
  `unsafe-inline`; Vite bez inline runtime w buildzie prod.
- **WS5** — Treść z API (markdown, HTML) przechodzi przez jeden komponent z sanitizerem
  (`rehype-sanitize`). Zakaz `dangerouslySetInnerHTML` poza tym komponentem.
- **WS6** — `<Refine options={{ disableTelemetry: true }}>` od pierwszego commita.
- **WS7** — `console.*` w kodzie produkcyjnym tylko przez wspólny wrapper loggera;
  nigdy identyfikatory sesji, e-maile ani treść odpowiedzi API.

## MUST NOT

- **N1** — ❌ `localStorage.setItem('token', ...)` i każdy odpowiednik.
- **N2** — ❌ Logika biznesowa w komponencie („jeśli budżet > X, pokaż…") — to domena API.
- **N3** — ❌ `fetch('https://...')` do hosta innego niż własny origin.
- **N4** — ❌ `dangerouslySetInnerHTML` poza komponentem sanitizera.
- **N5** — ❌ Sekrety (klucze, adresy wewnętrzne) w `import.meta.env` bundlowanym do przeglądarki.

## Verifier — najczęstsze naruszenia → VETO

| Symptom | Reguła |
|---|---|
| `localStorage`/`sessionStorage` w `apps/web/src` | WS1/N1 |
| Mutacja bez testu L3 „API odrzuca bez uprawnienia" | WS2 |
| Adres absolutny innego hosta w kodzie sieciowym | WS3/N3 |
| `dangerouslySetInnerHTML` poza `shared/ui/SafeMarkdown` | WS5/N4 |
| Brak `disableTelemetry: true` | WS6 |
