# Package Boundaries — Rule Card

**Tags**: "lib:api-surface", "lib:build"
<!-- Egzekwowalne streszczenie package-boundary-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): package-boundary-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Architecture · **Applies to**: `packages/*/project.json` (tagi), `nx.json`, importy między pakietami, `packages/*/package.json` (deps)

## MUST

- **PB1** — Każdy pakiet ma tagi Nx (`type:*`, ew. `scope:*`) w `project.json` odzwierciedlające jego warstwę w grafie zależności.
- **PB2** — Workspace-root ESLint config definiuje `@nx/enforce-module-boundaries` z `depConstraints` dla każdego tagu — zależności płyną WYŁĄCZNIE w dół warstw.
- **PB3** — Współdzielenie typów między pakietami idzie przez dedykowany pakiet kontraktów (np. `contracts`) — liść grafu, bez własnych zależności.
- **PB4** — Pakiet kontraktów zawiera wyłącznie typy/interfejsy/proste value objects — żadnej logiki implementacyjnej, żadnych zależności zewnętrznych.
- **PB5** — Publiczna powierzchnia pakietu to `src/index.ts` (lub pole `exports` w `package.json`) — moduły wewnętrzne (`src/internal/**`) NIGDY nie są re-eksportowane z indeksu.
- **PB6** — Wyższa warstwa potrzebująca funkcjonalności niższej warstwy zależy od interfejsu (portu) zdefiniowanego w kontraktach, nie od konkretnej implementacji; konkretny adapter wpinany jest na poziomie app/kompozycji.
- **PB7** — Cykl zależności między pakietami tej samej warstwy rozwiązywany przez wydzielenie współdzielonych typów do kontraktów albo event-driven decoupling — nigdy przez pozostawienie cyklu.
- **PB8** — Import między pakietami odbywa się po nazwie pakietu (`@scope/nazwa-pakietu`), nie po ścieżce względnej przekraczającej granicę pakietu.

## MUST NOT

- **N1** — ❌ Pakiet niższej warstwy (np. `domain-*`) importuje z pakietu wyższej/infrastrukturalnej warstwy (np. `repositories`, `nestjs`) — odwraca kierunek zależności.
- **N2** — ❌ Dwa pakiety tej samej warstwy importują się nawzajem bezpośrednio — cykl łamie build i rozumowanie o grafie (patrz PB7).
- **N3** — ❌ Import po ścieżce względnej przez granicę pakietu (`../../other-package/src/...`) zamiast po nazwie pakietu — ESLint `enforce-module-boundaries` tego nie złapie.
- **N4** — ❌ Import ze ścieżki `dist/` zamiast z punktu wejścia pakietu — kruche, psuje się przy zmianie konfiguracji builda.
- **N5** — ❌ Nieograniczony pakiet "utils"/"shared", od którego zależy prawie wszystko — magnes zależności, każda zmiana wywołuje pełny rebuild.
- **N6** — ❌ Pakiet kontraktów z logiką implementacyjną (serwisy, adaptery, dostęp do bazy) lub zależnością zewnętrzną — łamie PB4, zamienia liść grafu w węzeł.
- **N7** — ❌ Moduł z `src/internal/**` re-eksportowany z `src/index.ts` — inne pakiety fizycznie mogą go zaimportować mimo intencji ukrycia.

## Minimal correct skeleton

```ts
// packages/domain-services/project.json
{
  "name": "@vytches/domain-services",
  "tags": ["type:domain"],                                    // PB1
  ...
}

// nx.json / .eslintrc.json (workspace root)
"@nx/enforce-module-boundaries": ["error", {
  "enforceBuildableLibDependency": true,
  "allow": [],
  "depConstraints": [                                          // PB2
    { "sourceTag": "type:domain",
      "onlyDependOnLibsWithTags": ["type:contracts", "type:shared"] },
    { "sourceTag": "type:contracts",
      "onlyDependOnLibsWithTags": ["type:shared"] }             // PB3
  ]
}]

// packages/domain-services/src/index.ts        -- PUBLIC API
export { PolicyEngine } from './policy-engine';                // PB5

// packages/domain-services/src/internal/rule-cache.ts
// NIE re-eksportowany z index.ts                                // PB5, N7

// packages/domain-services/src/policy-engine.ts
import type { PolicyPort } from '@vytches/contracts';           // PB6 — port, nie konkret
// ZŁE:  import { X } from '../../repositories/src/internal/x';  // N1/N3
// DOBRE: import { X } from '@vytches/repositories';              // PB8
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| Import po ścieżce względnej przez granicę pakietu (`../../other-package/src/...`) zamiast po nazwie pakietu | **N3 / PB8** |
| `packages/*/project.json` bez pola `tags` albo z pustą tablicą `tags` | **PB1** |
| Workspace ESLint config bez reguły `@nx/enforce-module-boundaries` lub bez `depConstraints` dla nowego tagu | **PB2** |
| Pakiet `domain-*`/`aggregates`/`value-objects` importuje z `repositories`/`nestjs`/`messaging` (infrastruktura → domena odwrócona) | **N1** |
| Dwa pakiety importują się nawzajem (grep: `@vytches/a` w `packages/b/src/**`, `@vytches/b` w `packages/a/src/**`) | **N2 / PB7** |
| Import zawierający segment `/dist/` w ścieżce | **N4** |
| Pakiet `contracts` ma zależność w `package.json` inną niż TypeScript/devDependencies, albo zawiera plik poza typami/interfejsami (klasa z logiką, adapter) | **N6 / PB4** |
| `src/internal/**` pojawia się w `export * from './internal/...'` lub podobnym re-eksporcie w `index.ts` | **N7 / PB5** |
| Pakiet `utils`/`shared` rośnie bez podziału i jest importowany przez większość pozostałych 19 pakietów | **N5** |
| Wyższa warstwa importuje konkretną klasę implementującą port zamiast typu portu z `contracts` | **PB6** |

**Pełny wzorzec**: [`package-boundary-pattern.md`](./package-boundary-pattern.md)
