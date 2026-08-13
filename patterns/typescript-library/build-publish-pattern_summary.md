# Build & Publish — Rule Card

**Tags**: "lib:build"
<!-- Egzekwowalne streszczenie build-publish-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, CI): build-publish-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: `packages/*/package.json`, konfiguracja bundlera/tsconfig biblioteki, pipeline CI wydania, `.changeset/`, `nx.json`/`project.json` (targety release)

## MUST

- **BP1** — `exports` zawiera oba warunki, `import` i `require`, każdy wskazujący na realny plik w `dist/` (dual ESM+CJS) — nie sam ESM.
- **BP2** — Każdy blok warunku w `exports` (root i subpath) ma własne pole `types`, umieszczone jako pierwszy klucz warunku — TS rozwiązuje deklaracje poprawnie dla ESM i CJS.
- **BP3** — `"sideEffects": false` ustawione dla bibliotek bez efektów ubocznych na poziomie modułu — włącza tree-shaking u konsumenta.
- **BP4** — `files` to jawna allowlista (`["dist/", "CHANGELOG.md", "README.md"]` lub węższa) — nigdy `["*"]` ani brak pola.
- **BP5** — Subpath exports (np. `./testing`, `./react`) mają własny warunek `types` i własny wpis w build output — traktowane jak osobny mini-pakiet w `dist/`.
- **BP6** — Zależność-host (framework, plugin-host, `@scope/*` oczekiwany jako singleton u konsumenta) zadeklarowana w `peerDependencies`, nie w `dependencies`.
- **BP7** — Wersjonowanie automatyczne przez dokładnie JEDNO narzędzie — `@changesets/cli` ALBO `nx release` — nie ręczne bumpy w `package.json`.
- **BP8** — CI uruchamia `publint` i `arethetypeswrong` (attw) na zbudowanym `dist/`/spakowanym tarballu jako krok przed publikacją; pipeline failuje przy błędzie z któregokolwiek.
- **BP9** — `declarationMap: true` + `inlineSources: true` w tsconfig biblioteki — konsument debugguje przez źródło bez klonowania repo.
- **BP10** — Publikacja (`changeset publish` / `nx release publish`) uruchamiana wyłącznie z CI, po przejściu build+test+typecheck — nie z lokalnej maszyny.

## MUST NOT

- **N1** — ❌ `exports` bez warunku `require` (lub bez odpowiadającego builda CJS) — konsumenci na `require()` / starszym Node dostają błąd resolucji.
- **N2** — ❌ Warunek w `exports` bez pola `types` — TypeScript rozwiązuje złe lub brakujące deklaracje (BP2).
- **N3** — ❌ `"files": ["*"]` lub brak pola `files` — publikacja ciągnie node_modules, testy, `.env`, configi.
- **N4** — ❌ `sideEffects: true` (lub brak pola) na czystej bibliotece — bundler konsumenta nie może tree-shakeować, dostaje cały pakiet.
- **N5** — ❌ Jednoczesna konfiguracja `@changesets/cli` I `nx release` w tym samym repo — dwa konkurujące źródła prawdy o wersji, rozjazd numeracji.
- **N6** — ❌ Zależność-host w `dependencies` zamiast `peerDependencies` — duplikat instancji u konsumenta (np. dwa DI containery, złamany identity-check).
- **N7** — ❌ Brak kroku `publint`/`attw` w CI przed publikacją — rozjazd typów dual ESM/CJS wykrywany dopiero przez konsumenta w produkcji.
- **N8** — ❌ Publikacja z lokalnej maszyny (ręczny `npm publish` poza CI) — niereprodukowalny build, ryzyko dirty state.

## Minimal correct skeleton

```json
{
  "name": "@scope/payments",
  "version": "2.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": { "types": "./dist/types/index.d.ts", "default": "./dist/esm/index.mjs" },
      "require": { "types": "./dist/types/index.d.cts", "default": "./dist/cjs/index.cjs" }
    },
    "./package.json": "./package.json"
  },
  "main": "./dist/cjs/index.cjs",
  "module": "./dist/esm/index.mjs",
  "types": "./dist/types/index.d.ts",
  "files": ["dist/", "CHANGELOG.md", "README.md"],
  "sideEffects": false,
  "peerDependencies": {
    "typescript": ">=5.0.0"
  }
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `exports` bez klucza `require` lub bez pliku `.cjs`/`dist/cjs/` w outputcie | **N1 / BP1** |
| Warunek `import`/`require` bez zagnieżdżonego `types` | **N2 / BP2** |
| `"files"` równe `["*"]` lub pole nieobecne w `package.json` | **N3 / BP4** |
| `sideEffects` nieobecne lub `true` przy braku dowodu efektów ubocznych | **N4 / BP3** |
| Subpath w `exports` (np. `./testing`) bez własnego `types` | **BP5** |
| Zależność frameworkowa w `dependencies`, mimo że konsument ją dostarcza | **N6 / BP6** |
| Repo ma zarówno `.changeset/config.json`, jak i skonfigurowany `nx release` (release target w `nx.json`) | **N5 / BP7** |
| Pipeline CI (`.github/workflows/*.yml`) bez kroku `publint` / `attw` przed `changeset publish`/`nx release publish` | **N7 / BP8** |
| tsconfig biblioteki bez `declarationMap`/`inlineSources` | **BP9** |
| `npm publish` / `changeset publish` uruchamiany poza `.github/workflows/*` (skrypt lokalny, README instrukcja ręcznej publikacji) | **N8 / BP10** |

**Pełny wzorzec**: [`build-publish-pattern.md`](./build-publish-pattern.md)
