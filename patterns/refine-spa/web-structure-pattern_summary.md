# Web Structure — Rule Card

**Tags**: "web:ui", "web:platform:react"

<!-- Egzekwowalne streszczenie web-structure-pattern.md. WIĄŻĄCE dla apps/web.
     Promowane z marketing-hub (TS-MH-002) 2026-09-27 — Scope: project-specific
     (marketing-hub), patrz plik bazowy. -->

**Layer**: Cross-Layer · **Applies to**: każdy nowy plik `.ts`/`.tsx` w `apps/web/src`

## MUST

- **WST1** — Katalogi: `app/` (shell, `<Refine>`, routing, layout), `providers/`,
  `features/<kontekst>/`, `shared/ui/`, `shared/lib/`. Nowy kod trafia do jednego z nich.
- **WST2** — `features/<a>` nie importuje z `features/<b>`. Egzekwuje
  `eslint-plugin-boundaries` w `apps/web/.eslintrc` (konfiguracja bliźniacza do `apps/api`).
- **WST3** — `shared/ui` nie importuje `providers/`, `features/` ani pakietu kontraktów
  projektu.
- **WST4** — Strona: `*.page.tsx`, jeden nazwany eksport równy nazwie pliku w PascalCase;
  hook: `use-*.ts`; komponent: `PascalCase.tsx`.
- **WST5** — Stan serwera wyłącznie przez Refine/TanStack Query; stan UI lokalnie w
  komponencie lub kontekście feature. Globalny store dopiero przy drugim konsumencie.
- **WST6** — Motyw i tokeny w `app/theme.ts` (Ant Design `ConfigProvider`); kolory
  i odstępy nie są wpisywane w komponentach.
- **WST7** — Ścisły TypeScript jak w `apps/api` (`strict`, `noUnusedLocals`,
  `noImplicitReturns`); `any` tylko z komentarzem uzasadniającym.

## MUST NOT

- **N1** — ❌ `import ... from '../../features/xxx'` w innym feature.
- **N2** — ❌ `components/` luzem w `src/` bez przypisania do feature lub shared.
- **N3** — ❌ Logika domenowa (reguły, obliczenia biznesowe) w kliencie — API jest źródłem prawdy.
- **N4** — ❌ Kolejny `<Refine>`/router poza `app/`.

## Verifier — najczęstsze naruszenia

| Symptom | Reguła |
|---|---|
| Import między `features/*` | WST2/N1 |
| Pakiet kontraktów projektu w `shared/ui` | WST3 |
| Plik strony bez sufiksu `.page.tsx` | WST4 |
| Wartość koloru hex w komponencie | WST6 |
