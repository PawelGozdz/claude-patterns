# `blocks/` — jednostki kompozycji stacku (ADR 0008)

**Status: F3 — pilot działa.** `scripts/materialize-runtime.mjs` (wołany przez
`setup-project.sh`) skleja te pliki w `<projekt>/.claude/config/runtime.yml`, a silniki
`/analyze` i `/orchestrate` czytają wyłącznie ten wynik. Zmaterializowane dziś:
`juz-ide-api-2` (nestjs + ddd + kysely + `./geo`) i `vytches-ddd` (`typescript-library`
+ `approval-gate`). Stare `/analyze-ddd` i `/orchestrate-ddd` chodzą równolegle na
`presets/` — `presets/` i `_stack-defaults/` są zamrożone, tylko bugfixy (OQ6).

Projekt deklaruje skład jedną linią w `project.yml`:

```yaml
stack_blocks: [nestjs, ddd, kysely]          # alias `ddd` = pełny zestaw ddd/*
stack_blocks: [nestjs, zod, typeorm]         # projekt bez DDD (np. sso)
stack_blocks: [nestjs, ddd/core, kysely]     # granularnie, bez cqrs/events/acl
stack_blocks: [nestjs, ./moj-blok]           # `./` = blok lokalny z .claude/blocks/
```

## Schemat bloku

```yaml
name: <nazwa>                # płaska (nestjs) lub namespace (ddd/core)
axis: framework|architecture|persistence|validation|security|process  # jedna oś na blok
requires: []                 # zależności; brak = twardy błąd materializacji

patterns:                    # półka 1 i 2 (patrz niżej)
  always: [<ścieżka>.md]     # doklejane do KAŻDEGO taska — trzymaj malutkie
  triggers:
    - keywords: [<słowo>]
      include: [<ścieżka>.md]

overlay:                     # co setup symlinkuje do .claude/ projektu
  agents: []                 # katalogi z agents/
  patterns: []               # katalogi z patterns/
  rules: []                  # katalogi z rules/
  hooks: []                  # hooki do settings.json

env: {}                      # zmienne środowiskowe per projekt

params:                      # parametry wypełniane przez projekt (project.yml → block_params)
  <nazwa>:
    type: path|path[]|string|string[]   # path/path[] = walidowane i rozwijane przy materializacji
    required: true|false                # brak wymaganego = twardy błąd setupu
    default: <wartość>
    doc: "<do czego to służy>"          # trafia do komunikatu błędu
# W treści bloku odwołujesz się przez ${nazwa}. Podstawienie całej wartości
# (`corpus: "${canon}"`) wstawia listę; wewnątrz zdania interpoluje się tekstowo.

analyze:                     # sloty panelu /analyze
  panel:
    - { stage: <id>, agent: "<agent>", when: "<regex>", advisory: true,
        model: opus|sonnet|haiku, effort: max|medium|low, blocking: true }
    # model/effort nadpisują frontmatter agenta — jedyny sposób, żeby podnieść model
    # agentowi spoza repo (ecc:*). Polityka domyślna: zbieranie → haiku, przygotowanie
    # materiału i implementacja → sonnet, OCENA i synteza → opus.
  exit: PAUSE|CONTINUE       # PAUSE = twarda bramka approval (wnosi ddd/core)

orchestrate:                 # sloty /orchestrate
  layers:
    # checks: skrypty repo odpalane przez verify tej warstwy PRZED czytaniem kodu;
    #         werdykt z kodu wyjścia, brak skryptu = pominięty + zaraportowany.
    # optional + create_when: warstwa warunkowa (ocena po wyniku poprzednich warstw).
    - { id: <id>, dirs: [<dir>/], agent: "<agent>",
        checks: ["<npm-script>"], optional: true, create_when: "<opis>" }
  inner_loop: { verify: "<agent>", max_attempts: N, on_max: ESCALATE_AND_HALT }
  final_gate: { agent: "<agent>", on_fail: ESCALATE_AND_HALT }
  exit: STAGE_NOT_COMMIT

budgets:                     # limity wykonania (OQ3: przy konflikcie wygrywa niższy)
  <slot>: { max_tool_calls: N, on_limit: emit-partial }
```

Wszystkie sekcje opcjonalne — blok bez `analyze:` nie dotyka panelu.

## Trzy półki doboru wzorców (OQ4)

1. **`patterns.always`** — twardy rdzeń, wczytywany w 100% tasków. Tylko to, czego
   pominięcie jest groźne (security, konwencje). Materializacja ostrzega przy >8
   pozycjach sumarycznie — sygnał, żeby coś zdegradować na półkę 2 lub 3.
2. **`patterns.triggers`** — deterministyczne doczytki po słowach-kluczach.
3. **MCP `retrieve_patterns`** — cała reszta, dobierana semantycznie per task
   (sekcje ✅/❌ we wzorcach + tagi bloków z D5).

Agenta-proxy decydującego per task NIE budujemy — rozstrzygnięte w OQ4 ADR 0008.

## Osie (`axis:`)

Każdy blok deklaruje dokładnie jedną oś — `framework`, `architecture`, `persistence`,
`validation`, `security` lub `process`. Oś odpowiada na pytanie „co ten blok reprezentuje
w składzie projektu", niezależnie od tego, co konkretnie wnosi (wzorce, agentów, warstwy).

Warstwy orchestracji (`orchestrate.layers`) należą wyłącznie do osi `architecture` —
to architektura projektu (układ katalogów, granice modułów) decyduje o tym, jak dzieli
się praca implementacyjna, nie framework czy warstwa persystencji. Reguła jest
**egzekwowana przy materializacji** (`scripts/materialize-runtime.mjs`), nie jest
konwencją do zapamiętania: blok spoza osi `architecture`, który deklaruje `layers`,
przerywa materializację twardym błędem. Nadal obowiązuje wcześniejsza zasada — dokładnie
jeden blok w całym składzie może wnieść `orchestrate.layers`.

`axis: architecture` nie zobowiązuje bloku do deklarowania warstw — `ddd/cqrs`,
`ddd/events`, `ddd/acl` i `nx-monorepo` są blokami osi architektury bez `layers`;
warstwy wnosi tylko ten jeden blok w składzie, który je faktycznie definiuje.

## `extends:` — lokalny wariant bloku centralnego

Blok lokalny (`.claude/blocks/*.yml`) może dziedziczyć po centralnym i zmienić tylko to,
co go różni. Bez tego projekt chcący wyłączyć jeden stage panelu musiał forkować cały
blok i utrzymywać kopię, która po cichu rozjeżdża się z centralą.

```yaml
# .claude/blocks/nestjs-lite.yml
name: ./nestjs-lite
extends: nestjs
analyze:
  panel:
    - { stage: threat-model, drop: true }                      # usuń odziedziczony stage
    - { stage: tech-analysis, agent: "ecc:code-architect" }    # nadpisz po `stage`
    - { stage: perf-check, agent: "ecc:performance-optimizer", when: "perf" }  # dodaj nowy
```

Reguły scalania (baza ← lokalny):

| Sekcja | Zachowanie |
|---|---|
| `patterns.*`, `overlay.*`, `hooks` | suma, bez duplikatów |
| `analyze.panel` | pozycja o tym samym `stage` zastępuje bazową; nowe dochodzą na koniec; `drop: true` usuwa |
| `analyze.exit` | lokalny wygrywa, gdy podany |
| `orchestrate`, `env`, `budgets`, `params`, `requires_ecc`, `ralphinho` | lokalna sekcja wygrywa w całości |

**Jeden poziom dziedziczenia.** Blok dziedziczący po bloku, który sam używa `extends`,
przerywa materializację. Łańcuch zamieniłby kompozycję w labirynt, w którym pytanie
„skąd wziął się ten stage" przestaje mieć tanią odpowiedź — a `# source:` w `runtime.yml`
wskazywałby wyłącznie ostatnie ogniwo.

## Blok opisujący użycie biblioteki a repo, które ją buduje

`ddd/core` nie jest generycznym blokiem „DDD w ogóle" — jego wzorce mają 68 odwołań do
`@vytches/ddd` i zakładają jej klasy bazowe. Blok deklaruje to jawnie w parametrach
(`ddd_library`, `ddd_library_min_version`), a weryfikator projektu sprawdza, czy ta
biblioteka faktycznie jest w `package.json`.

Stąd reguła, która obowiązuje szerzej niż ten jeden przypadek: **repozytorium, które
BUDUJE bibliotekę, nie bierze bloku opisującego jej UŻYCIE.** `vytches-ddd` zostaje na
`[ts-library, library-layers, nx-monorepo]` i nie dokłada `ddd/core`, bo wzorce mówiące
„rozszerz `AggregateRoot` z `@vytches/ddd`" są instrukcją dla konsumenta, nie dla autora.
Wzięcie ich tam byłoby założeniem samego siebie.

Nie rozdzielamy przy tym „pojęć DDD" od biblioteki: rozbicie oznaczałoby przepisanie 68
miejsc pod hipotezę użycia kiedyś innego frameworka. Obowiązuje ta sama reguła co przy
wzorcach — uniwersalne dopiero po drugim realnym użyciu.

## Domyślne zachowanie silników (poza blokami)

- Synteza panelu `/analyze` zawsze kończy się agentem `tech-lead` (szkielet silnika,
  nie slot bloku).
- Brak `.claude/config/runtime.yml` = silniki odmawiają startu.
- Projekt bez żadnego bloku z `orchestrate.layers` dostaje jedną generyczną warstwę
  implement→verify.

## Konwencje zapisu

- **Cytuj wartości z dwukropkiem**: `id: "api:tests"`, nie `id: api:tests`. Od przejścia
  na prawdziwy parser (2026-08-11) obowiązują reguły YAML — w zapisie inline `{ id: api:tests }`
  dwukropek bez cudzysłowu bywa czytany jako zagnieżdżony klucz.
- **Nieznany klucz najwyższego poziomu = ostrzeżenie przy materializacji.** Wcześniej
  taka literówka znikała bez śladu; teraz materializacja wypisuje nazwę bloku i klucza.
  Klucze `extends`, `layer_contributions`, `tags` są zarezerwowane — deklaracja przechodzi
  z ostrzeżeniem, ale nic jeszcze nie robi.

## Konwencje ścieżek

- `patterns.*` — względne do `claude-patterns/patterns/` (jak w `_stack-defaults/`).
- Ścieżki są walidowane przy materializacji i przy reseedzie (wiszące odwołanie =
  jawne ostrzeżenie, nie cicha omisja).
- Bloki lokalne (`.claude/blocks/*.yml` w projekcie) używają identycznego schematu;
  ich ścieżki wskazują do wnętrza projektu.

## Bloki i aliasy

| blok | oś | wnosi | requires |
|---|---|---|---|
| `nestjs` | framework | konwencje, security, error-handling, logger, testing-pyramid; panel: threat-model + architekt + backend-expert | — |
| `node` | framework | jak `nestjs`, dla czystych serwisów Node/TS bez NestJS (iam, ai-os-bot) | — |
| `flutter` | framework | konwencje, wzorce riverpod/dio/navigation/freezed/testing; panel: threat-model | — |
| `clean-arch` | architektura | Flutter Clean Architecture: agenci (implementer + advisory/VETO verifiers), warstwy domain/application?/data/presentation, bramka PAUSE | — |
| `ddd/core` | architektura | domain-errors, wzorce domenowe, agenci DDD + VETO, bramka PAUSE, warstwy orchestracji; parametry: `ddd_library` (domyślnie `@vytches/ddd`), `ddd_library_min_version` | — |
| `ddd/cqrs` | architektura | wzorce command/query handlerów | `ddd/core` |
| `ddd/events` | architektura | outbox, integration events | `ddd/core` |
| `ddd/acl` | architektura | ACL Registry, komunikacja cross-context | `ddd/core`, `ddd/events` |
| `flat-service` | architektura | płaski serwis bez DDD: 2 warstwy (implementation→testing), verify `ecc:typescript-reviewer`, gate `ecc:security-reviewer` | — |
| `kysely` | persystencja | wzorce infrastruktury persystencji | — |
| `zod` | walidacja | wzorzec schematów wejścia na granicach HTTP/API | — |
| `approval-gate` | proces | twarda bramka PAUSE + hook approval dla projektów bez `ddd/core` | — |
| `decision-registry` | proces | indeks ADR/BDR (`scripts/index-decisions.mjs`) + stage `decision-gate` (haiku, blocking); parametry: `adr_dir`, `bdr_dir`, `open_questions`, `adr_exclude`, `status_active`, `lookup_order` | — |
| `governance` | proces | kanon produktu/strategii/marki w panelu: `strategy-fit` (opus) + `data-classification`; parametry: `canon` (korpus do przeszukania), `canon_inject` (wklejane zawsze), `classification_rules` | — |
| `mobile-security` | bezpieczeństwo mobilne | wzorce mobile-security/platform-channel/offline-first, hook `check-debugprint-guard`, panel: mobile-security-analysis (`flutter-security-verifier`, wąski `when:`) | — |
| `ts-library` | framework | publikowana biblioteka TS: wzorce, panel api-surface-analysis (`library-api-guardian`, advisory), overlay, env — **bez `orchestrate.layers`** (przeniesione do `library-layers`) | — |
| `library-layers` | architektura | `orchestrate.layers` (implementation→testing→api-surface opcjonalna), `inner_loop` verify `ecc:typescript-reviewer`, `final_gate` `library-quality-verifier` | `ts-library` |
| `nx-monorepo` | architektura | granice pakietów i graf zależności w monorepo Nx (bez warstw orchestracji); panel: boundary-analysis (`ecc:architect`, wąski `when:`) | — |

Aliasy: `blocks/_aliases.yml` — 4 zdefiniowane: `ddd`, `nestjs-ddd`, `flutter-clean-arch`,
`typescript-library` (= `[ts-library, library-layers, nx-monorepo]`). Test równoważności
dekompozycji: `node scripts/blocks-equivalence-check.mjs` (bramka wyjścia F1).
