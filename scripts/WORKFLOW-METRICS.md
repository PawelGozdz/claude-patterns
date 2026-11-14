# Workflow Metrics — metryki per-krok przebiegów Workflow (TASK-OBS-002)

Globalna, deterministyczna (zero LLM) obserwowalność przebiegów narzędzia Workflow:
ile każdy krok zużył tokenów i $, czy skończył się sukcesem, gdzie przebieg stanął
i czy trzymał się planu z `runtime.yml`. Do śledzenia regresji i usprawnień
(np. „czy diff-sonda z §2a′ p. 6a wyeliminowała spalone próby?").

## Pliki

| Plik | Co to |
|------|-------|
| `~/.claude/metrics/workflow-steps.jsonl` | Rekordy `step` + `run`, append-only, dedup przy odczycie (ostatnia linia per klucz `runId+agentId` / `runId` wygrywa) |
| `~/.claude/metrics/prices.json` | Stawki per model × 4 rodzaje tokenów (USD/1M). Inicjalizowany z `scripts/workflow-metrics-prices.default.json`; aktualizuj ze skilla `claude-api`, NIGDY z pamięci modelu |
| `~/.claude/metrics/runtime-snapshots/<hash>.yml` | Kopie `runtime.yml` per hash — plan, względem którego liczona jest konformancja (D5) |
| `~/.claude/metrics/costs.jsonl` | (ECC, tylko odczyt) komplementarny poziom SESYJNY — nie duplikujemy |

## Format rekordu

Rekord kroku (`type: "step"`, jedna linia per agent przebiegu):

```json
{"type":"step","ts":"2026-08-14T22:16:22.230Z","project":"-opt-projects-juz-ide-api-1",
 "sessionId":"6284f48f-…","runId":"wf_379c0a41-ff2","taskId":"wvjpdk2ry",
 "workflowName":"ts-token-topup-001-a2a3b","agentId":"a2c33965…","phase":"Infrastructure",
 "label":"A2-impl-1","agentType":"infrastructure-implementer","model":"claude-sonnet-5",
 "attempt":1,"outputTokens":36694,"inputTokens":80,"cacheReadTokens":3670819,
 "cacheWriteTokens":129354,"reportedTokens":129373,"toolCalls":58,"durationMs":597242,
 "outcome":"silent-death","reason":"brak wyniku — …","resumedFrom":null,
 "costUsd":1.424649,"runtimeYmlHash":"2893cd7b0cea"}
```

- **4 liczniki tokenów** pochodzą z transkryptu subagenta (dedup po `message.id` — transkrypt to
  snapshoty streamingu). ~91% kosztu to cache read/write, więc koszt liczony tylko z output byłby
  fikcją (memory `workflow-cost-is-context-not-work`). `reportedTokens` = licznik z
  `workflowProgress` (inna miara, zostaje dla porównań). Gdy transkryptu brak: `partial: true`
  i `outputTokens` przepisany z `workflowProgress`.
- **outcome** (D3): `GO`/`NO_GO`/`ok` (wpis w journalu), `silent-death` (started bez result —
  agent umarł bez StructuredOutput), `killed`/`failed` (agent przerwany razem z przebiegiem o takim statusie —
  nie jest cichym zgonem), `not-started`, `cached` (resume z cache, koszt 0), `unknown`.
- **Cichy zgon implementera** (ORC-167): `reason` z `result.askErrors` (ucięty do 160 znaków), gdy logi go nie niosą.
  Szablon sam ratuje pracę: sonda diffu (Haiku) sprawdza, czy pliki warstwy leżą w drzewie, i przebieg idzie do
  weryfikatora. Ślad: `report.silentRescues` → `step.rescue = {files, attempt}` na kroku `<warstwa>-impl`
  (`files > 0` = praca ocalona i zweryfikowana, `0` = sonda jej nie znalazła, następuje powtórka).
- **costUsd** (D4): szacunek lokalny z `prices.json`; kalibracja miesięczna względem Admin API
  (`--calibrate`), nie zastąpienie.

Rekord przebiegu (`type: "run"`, jedna linia per run): `status`, `escalatedAt`, `agentCount`,
`totalTokens`, `totalToolCalls`, `durationMs`, `resumedFrom` (runId poprzednika przy resume),
`costUsd` (suma kroków), `costCoverage`, `runtimeYmlHash`.

Powody werdyktów (ORC-167; tylko identyfikatory i krótkie kody, stare rekordy ich nie mają → null):

- `step.ruleIds` (unikalne `ruleId` z ustaleń werdyktu; `new` = ustalenie bez znanego id) i `step.violationCount`.
  NO_GO bez ustaleń dostaje `reason`: `violations-without-rule-id` albo `no-findings`.
- `run.finalCause` (`code` | `machine` | null), `run.finalRuleIds` (reguły z ustaleń bramki końcowej),
  `run.round1Verdict` / `round1Cause` / `round1RuleIds` (bramka przed rundą naprawczą), `run.finalOverrides`
  (które gałęzie maszynowe zmieniły werdykt bramki LLM: `conformance`, `unverified-scope`, `minor-repair-red`,
  `no-verdict`, `stale-tree`, w formie `gałąź@runda`), `run.gateDelta` (czy runda 2 szła w trybie delty).
- `run.endedAt` (`final-gate` | `layer` | `complete` | `no-result`), `run.haltLayer`, `run.haltCause` — wyjaśniają
  `finalVerdict: null`: przebieg zatrzymał się na warstwie, zanim bramka końcowa mogła się odbyć.
- Przebieg wznowiony pod tym samym `runId` rośnie po zebraniu; kolektor dopisuje wtedy nowszy rekord `run`
  (wygrywa przy odczycie), gdy `agentCount` w pliku jest większy niż w zapisanym.

Ranking reguł łamanych przy NO_GO bramki końcowej, jedna linia:

```
node -e "const fs=require('fs');const c={};for(const l of fs.readFileSync(process.env.HOME+'/.claude/metrics/workflow-steps.jsonl','utf8').split('\n').filter(Boolean)){const r=JSON.parse(l);if(r.type==='run'&&r.finalVerdict==='NO_GO')for(const id of r.finalRuleIds||['(brak)'])c[id]=(c[id]||0)+1}console.log(Object.entries(c).sort((a,b)=>b[1]-a[1]))"
```

## Użycie

Z DOWOLNEGO katalogu przez wrappery w `~/.local/bin` (dane i tak są globalne w `~/.claude/metrics/`):
`wf-metrics …` (= report), `wf-collect`, `wf-conformance`. Wrappery wskazują na to repo absolutną
ścieżką — po przeniesieniu repo utwórz je na nowo.

```bash
node scripts/workflow-metrics-collect.mjs            # zbierz (idempotentnie) wszystkie przebiegi
node scripts/workflow-metrics-report.mjs             # przegląd per label + success-rate
node scripts/workflow-metrics-report.mjs --by task|model|agentType|day|project --since 2026-08-01
node scripts/workflow-metrics-report.mjs --regression  # delta kosztu/outcome tego samego labela
                                                       #  (>50% wzrost albo utrata wyniku = REGRESSION,
                                                       #   <20% = szum, cisza)
node scripts/workflow-metrics-report.mjs --top 10    # najdroższe kroki
node scripts/workflow-metrics-report.mjs --json      # pod przyszły dashboard (TASK-OBS-003?)
node scripts/workflow-metrics-report.mjs --calibrate # rozjazd % vs /cost-report (ANTHROPIC_ADMIN_API_KEY)
node scripts/workflow-metrics-report.mjs --sessions  # poziom SESYJNY (ECC costs.jsonl) obok workflow:
                                                     #  $ per dzień/model/projekt + udział workflow%.
                                                     #  Wpisy costs.jsonl są KUMULATYWNE per sesja —
                                                     #  raport liczy deltę (naiwna suma linii kłamie)
node scripts/workflow-conformance.mjs [--run wf_x]   # OK | DEVIATIONS(n) względem planu runtime.yml
```

Zbieranie automatyczne: hook `hooks/workflow-metrics-postrun.js` (PostToolUse na `Workflow`,
fire-and-forget, nigdy nie blokuje) — zarejestrowany w `hooks/hooks.json`.

## Konformancja (runtime'owy odpowiednik `/conformance-check`)

Kody dewiacji: `AGENT_OUTSIDE_SLOTS`, `MISSING_VERIFY`, `VERIFY_NOT_GO`, `MISSING_FINAL_GATE`,
`FINAL_GATE_WRONG_AGENT`, `LAYER_ORDER`, `MAX_ATTEMPTS_EXCEEDED`. Eskalacja (`escalatedAt`)
to info, nie dewiacja. Generyczne agenty narzędziowe (`general-purpose`, `claude`, `Explore`,
`state-reader` — diff-sondy, typechecki) nie liczą się jako „agent spoza slotów".

**Ograniczenie backfillu:** snapshot `runtime.yml` powstaje w momencie ZBIERANIA — dla przebiegów
zebranych z opóźnieniem (historycznych) plan może być nowszy niż był w momencie runu. Od chwili
włączenia hooka snapshot łapany jest tuż po przebiegu, więc rozjazd znika.

## Ewaluatory

`node tests/flow-evals/workflow-metrics/run.js` — E1 collector-golden (PRAWDZIWE zarchiwizowane
fixture'y wf_379c0a41-ff2 z 2× silent-death), E2 budget-regression (progi 50%/20%),
E3 conformance (OK / DEVIATIONS z poprawną listą). Odpalaj przy każdej zmianie tych skryptów.
Automatyzacja uruchamiania: TASK-EVAL-001 (poza zakresem OBS-002).

## Anty-zakres (świadomie)

Dashboard TUI na żywo (osobny task po kilku dniach danych), OTEL/Grafana, przechowywanie
per-wiadomość (transkrypty pozostają źródłem; tu tylko SUMY per krok), modyfikacja `costs.jsonl`.
