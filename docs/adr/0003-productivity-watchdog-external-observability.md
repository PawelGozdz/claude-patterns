# ADR 0003 — Watchdog produktywności per-kontrakt-etapu + observability POZA silnikiem

**Status**: accepted (2026-07-02) · **Źródło**: `docs/tasks/TASK-RAG-002.analysis.md` (D1, D6, Q3/Q4) · **Implementacja**: TASK-OBS-001 (commit 8d5c700)

## Kontekst
Regresja: generowanie kodu 15 min → 4h, przebiegi po ~$120 bez wartości. Diagnoza (D1, z dowodem):
ból NIE pochodzi z RAG (niewpięty), tylko z maszynerii egzekwowania + zawodności Workflow —
`TS-SEC-VERIFICATION-LEVELS-002`: 4 przebiegi, ~5.2M tokenów, 0 ukończeń; weryfikator milknie
w środku pracy **bez śladu hooka i bez błędu** (poziom silnika Workflow, poza zasięgiem repo).
Wymóg użytkownika: widzieć na bieżąco, co dzieje się w tle, i móc reagować.

## Decyzja

### D-A — Metryka RELATYWNA, świadoma kontraktu etapu (nie twardy cap tokenów)
Nie limitujemy tokenów absolutnie — większy kontekst bywa uzasadniony. Karzemy **tokeny rosnące
BEZ zdarzenia postępu zdefiniowanego dla roli agenta**:
- `*-implementer` → Write/Edit/MultiEdit/NotebookEdit,
- `*-verifier` → StructuredOutput (werdykt) lub wynik w `journal.jsonl`,
- inne (analiza/synteza) → artefakt końcowy + limit czasu etapu.

Globalna metryka „tokeny bez Write/Edit" dawałaby fałszywe alarmy dokładnie na etapach, które
najczęściej milkną (weryfikatory mają `tools: Read/Glob/Grep/Bash` — legalnie zero Write).

### D-B — Mechanizm obserwacji POZA silnikiem
`scripts/workflow-watcher.js` — osobny proces tail-ujący transkrypty
(`~/.claude/projects/<slug>/*/subagents/workflows/wf_*/agent-*.jsonl`, inkrementalnie po offsetach),
piszący `RUN-STATE.md` na żywo (burn, tokeny-od-postępu, cisza, status per agent). Ponieważ
udokumentowana awaria jest na poziomie silnika, hook in-process fizycznie nie może jej złapać —
watcher przeżywa dokładnie ten failure mode i zbiera dane diagnostyczne do wciąż niewyjaśnionej
przyczyny.

### D-C — HALT przez PreToolUse deny (nie kill)
Nie da się zabić wiszącego agenta z hooka. `hooks/productivity-watchdog.js` (opt-in per projekt)
czyta flagi watchera (`.claude/run-state/halt.json`, TTL 15 min) + kill-switch (`KILL`) i ODMAWIA
kolejnych tool-calli oflagowanym subagentom. Main agent NIGDY nie jest blokowany (musi móc
reagować); detekcja subagenta przez `agent_id`, zero skanowania transkryptów (znana pułapka).
Progi: SPINNING > `--spin-tokens` (60k default), HALT > 2×; martwe przebiegi = STALE (raport bez flag).

### D-D — No-rerun
Padniętego Workflow NIE ponawia się od zera (anty-wzorzec 4×5.2M). Wznowienie przez
`resumeFromRunId`; po 2 nieudanych wznowieniach → STOP i eskalacja do człowieka.

## Odrzucone
- **Twardy budżet tokenów per run** — odrzucony przez użytkownika: duży kontekst bywa legalny;
  problem to koszt-bez-outputu, nie koszt sam w sobie.
- **Watchdog jako hook in-process** — nie przeżyje awarii silnika, którą ma wykrywać.
- **Zabijanie agentów** — niedostępne z poziomu hooków; deny kolejnych narzędzi wystarcza.

## Konsekwencje
- (+) Smoke-test na realnych transkryptach awarii: weryfikatory 60k–279k burn bez JEDNEGO zdarzenia
  postępu → metryka łapie udokumentowany incydent (wykrycie po ~120k zamiast po 5.2M).
- (+) Kill-switch = jeden `touch`; wgląd bez czytania transkryptów.
- (−) Progi (spin-tokens, TTL, stale) wymagają strojenia na żywych przebiegach.
- (−) Pełna pętla (watcher→flaga→deny→eskalacja) nie zagrała jeszcze razem na żywo — pierwszy
  przebieg walidacyjny w juz-ide-api-1 jest twardym punktem kontrolnym.
