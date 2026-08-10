# `blocks/` — jednostki kompozycji stacku (ADR 0008)

**Status: F1 (TASK-BLOCKS-001) — schemat + dekompozycja `nestjs-ddd`. Żaden silnik
jeszcze tych plików nie konsumuje**; konsumpcja wchodzi w F2 (`setup-project.sh`
materializuje `.claude/config/runtime.yml`) i F3 (silniki `/analyze`, `/orchestrate`).
Do tego czasu źródłem prawdy dla działających komend pozostają `_stack-defaults/`
i `presets/` (zamrożone, tylko bugfixy — OQ6).

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

analyze:                     # sloty panelu /analyze
  panel:
    - { stage: <id>, agent: "<agent>", when: "<regex>", advisory: true }
  exit: PAUSE|CONTINUE       # PAUSE = twarda bramka approval (wnosi ddd/core)

orchestrate:                 # sloty /orchestrate
  layers:
    - { id: <id>, dirs: [<dir>/], agent: "<agent>" }
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

## Domyślne zachowanie silników (poza blokami)

- Synteza panelu `/analyze` zawsze kończy się agentem `tech-lead` (szkielet silnika,
  nie slot bloku).
- Brak `.claude/config/runtime.yml` = silniki odmawiają startu.
- Projekt bez żadnego bloku z `orchestrate.layers` dostaje jedną generyczną warstwę
  implement→verify.

## Konwencje ścieżek

- `patterns.*` — względne do `claude-patterns/patterns/` (jak w `_stack-defaults/`).
- Ścieżki są walidowane przy materializacji i przy reseedzie (wiszące odwołanie =
  jawne ostrzeżenie, nie cicha omisja).
- Bloki lokalne (`.claude/blocks/*.yml` w projekcie) używają identycznego schematu;
  ich ścieżki wskazują do wnętrza projektu.

## Bloki i aliasy (stan F1)

| blok | wnosi | requires |
|---|---|---|
| `nestjs` | konwencje, security, error-handling, logger, testing-pyramid; panel: threat-model + architekt + backend-expert | — |
| `ddd/core` | domain-errors, wzorce domenowe, agenci DDD + VETO, bramka PAUSE, warstwy orchestracji | — |
| `ddd/cqrs` | wzorce command/query handlerów | `ddd/core` |
| `ddd/events` | outbox, integration events | `ddd/core` |
| `ddd/acl` | ACL Registry, komunikacja cross-context | `ddd/core`, `ddd/events` |
| `kysely` | wzorce infrastruktury persystencji | — |

Aliasy: `blocks/_aliases.yml`. Test równoważności dekompozycji:
`node scripts/blocks-equivalence-check.mjs` (bramka wyjścia F1).
