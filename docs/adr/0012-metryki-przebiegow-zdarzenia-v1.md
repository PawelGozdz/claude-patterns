# ADR 0012 — Metryki przebiegów: wspólny format zdarzeń v1

**Status**: accepted (2026-10-10) — krok 1 wdrożony, kroki 2–6 kolejno
**Rozszerza**: [ADR 0011](0011-raportowanie-dryfu-i-telemetria-floty.md) (punkt B6 — telemetria floty)
**Context source**: decyzja użytkownika z 2026-10-10: „jak będziemy wstawiać tylko problemy, to nie
da nam to procentowego rozbicia dobre vs błędy" + docelowo metryki trafiają na serwer zespołu
rozwijającego claude-patterns, który podejmuje decyzje rozwojowe na podstawie danych.

---

## Kontekst

Stan na 2026-10-10:

| Kanał | Co ma | Czego nie ma |
|---|---|---|
| `docs/tasks/_inbox/` | tylko problemy, 1 plik na sygnaturę, dobre opisy | mianownika — nie wiadomo, z ilu prób |
| `~/.claude/metrics/workflow-steps.jsonl` | każdy krok `/orchestrate` (11 220 kroków, 867 przebiegów), także udany | planu (ile kroków zaplanowano), powiązania naprawa→błąd, spójnych wyników (`NO-GO` i `NO_GO` obok siebie), kosztu kroku (`costUsd: null`), prawdziwego TS-ID |
| `/analyze` | nic — panel to wywołania narzędzia Agent z głównej pętli, nie Workflow, więc hook metryk go nie widzi | wszystkiego |
| audyt, setup | zgłoszenia błędów do skrzynki | wyników OK, więc i odsetka zdrowia floty |

Już z istniejących danych wychodzi: 74% GO / 26% NO-GO werdyktów weryfikatorów, 3,9% kroków
kończy się cichym zgonem agenta. Tego nie było nigdzie widać.

## Decyzja

### 1. Dwa strumienie, połączone identyfikatorami — nie jeden plik

| | **Zdarzenia** (metryki) | **Skrzynka** (ustalenia) |
|---|---|---|
| zawartość | każdy krok każdego procesu, także udany | problem wart naprawy, z opisem |
| wolumen | tysiące dziennie | kilka dziennie |
| forma | JSONL append-only | markdown w gicie, edytowany w triage |
| odpowiada na | ile, jak często, ile kosztuje | co dokładnie i dlaczego |

Połączenie: `report-deviation.mjs` przy KAŻDYM wywołaniu (także gdy `--once-per-project`
pomija wpis w skrzynce) dopisuje zdarzenie `deviation` z `signature` = id rekordu skrzynki
i `runId`. Skrzynka mierzy zasięg problemu, zdarzenia jego częstość; dashboard liczy
procenty ze zdarzeń, a szczegóły pokazuje z rekordu skrzynki o tej sygnaturze.

### 2. Format zdarzenia v1 — niezależny od procesu

Kontrakt: [`schemas/telemetry-event-v1.schema.json`](../../schemas/telemetry-event-v1.schema.json);
implementacja zapisu: `scripts/lib/telemetry-events.mjs` (eval pilnuje zgodności list z
schematem).

- `kind`: `run.start` (z `plan` — listą zaplanowanych kroków), `step.end`, `run.end`, `deviation`.
- `process`: `orchestrate | analyze | audit | setup` — lista zamknięta; nowy proces = świadoma
  zmiana schematu, jak w taksonomii tagów.
- `outcome` (zamknięty): `ok go no_go fixed failed died skipped cached halted killed unknown`.
  Stare wartości są normalizowane (`NO-GO`/`NO_GO` → `no_go`, `silent-death` → `died`,
  `GO_WITH_CONDITIONS` → `go`, `not-started` → `skipped`, `completed` → `ok`).
- `cause` (zamknięty): `typecheck test lint verifier scope config infra silent budget other`.
- `step.fixes`: id kroku, który ten krok naprawia — z tego wynika „NO-GO → naprawione / otwarte".
- `m`: `toolCalls durationMs tokensIn tokensOut cacheRead cacheWrite costUsd`.
- Każde zdarzenie ma `id` (UUID — idempotentny upload na serwer) i `host`
  (pseudonim maszyny: skrót SHA z hosta i użytkownika, nie nazwa).

### 3. Prywatność — od pierwszego zdarzenia, nie dopiero przy wysyłce

Zdarzenie NIE zawiera: treści promptów, treści `reason` ze skrzynki, ścieżek plików, nazw
tasków poza `taskRef` (TS-ID), niczego z konfiguracji projektu (np. assetów z `scope.yaml`
aegis-flow). Opis problemu żyje w skrzynce, w gicie — zdarzenie niesie tylko jego sygnaturę.
`taskRef` zostaje lokalnie; agregaty i wysyłka na serwer go pomijają.

### 4. Gdzie leżą dane

- Surowe zdarzenia: `claude-patterns/telemetry/events/<RRRR-MM>.jsonl` — centralnie w repo,
  ale **poza gitem** (per maszyna, wysoka zmienność, konflikty przy commitach z wielu maszyn).
  Ścieżkę nadpisuje `CLAUDE_TELEMETRY_DIR` (testy).
- Agregaty dzienne: `claude-patterns/telemetry/rollups/<projekt>/<dzień>.json` — w gicie
  (krok 5).
- Serwer (później): transport czyta te same pliki; `id` zdarzenia zapewnia deduplikację.
  Format v1 jest kontraktem tego transportu — zmiana niekompatybilna = `v: 2`.

### 5. Emitery

| Proces | Mechanizm |
|---|---|
| orchestrate | `orchestrate-prepare` → `run.start` z planem warstw; collector (`workflow-metrics-collect.mjs`) → `step.end`/`run.end` w v1 |
| analyze | `scripts/telemetry-emit.mjs run-start/run-end` z komendy + ogólny hook PostToolUse na narzędziu Agent, który przypina kroki do otwartego przebiegu sesji (ten sam mechanizm dla każdego przyszłego procesu bez Workflow) |
| audit | przebieg + wynik każdej kontroli w każdym projekcie, także OK |
| setup | `run.start/run.end` + `deviation` (ADR 0011 B3) |
| report-deviation | zawsze `deviation` |

Zapis zdarzeń jest best-effort: błąd zapisu idzie na stderr i nigdy nie przerywa procesu,
który go wywołał.

### 6. Metryki docelowe

First-pass yield (krok przechodzi weryfikację w 1. próbie), udział napraw (kroków i kosztu
przy `attempt > 1`), skuteczność napraw (`fixed` vs `halted`), gęstość odstępstw (deviation
na 100 kroków per sygnatura), cichy zgon / eskalacje / zabite przebiegi, koszt i czas na task
i rolę, dla analizy: pytania otwarte, pominięte stage panelu, odsetek zatwierdzeń; dla floty:
odsetek kontroli audytu na OK dzień po dniu.

## Kolejność wdrożenia

1. **(2026-10-10)** Schemat v1, `scripts/lib/telemetry-events.mjs`, `scripts/telemetry-emit.mjs`,
   `report-deviation` → `deviation`, eval `telemetry-events`.
2. Orchestrate: plan w `run.start`, collector w v1, normalizacja wyników, `fixes`, koszt kroku,
   prawdziwy TS-ID; migracja 11 tys. historycznych kroków (trend od pierwszego dnia).
3. Analyze: `run-start/run-end` w `commands/analyze.md` + hook PostToolUse(Agent).
4. Audit i setup.
5. Rollup dzienny `telemetry-aggregate.mjs` → `telemetry/rollups/`.
6. Dashboard (terminal na żywo, potem web) i transport na serwer.

## Konsekwencje

- Jedno źródło liczb dla wszystkich procesów; dashboard i serwer nie znają różnic między
  orchestrate a analyze — widzą proces, rolę, wynik, przyczynę.
- `workflow-steps.jsonl` żyje równolegle do zakończenia kroku 2 (istniejące raporty
  `workflow-metrics-report.mjs` i `telemetry-freshness.mjs` z niego czytają).
- Zamknięte listy `outcome`/`cause` wymuszają klasyfikację u źródła; „other" jest dozwolone,
  ale jego udział sam jest metryką jakości danych.
