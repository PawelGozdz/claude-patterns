# TASK-OBS-001 — Performance & Observability: watchdog produktywności + zewnętrzny watcher (Filar 0)

**Źródło:** `docs/tasks/TASK-RAG-002.analysis.md` (status: approved, 2026-07-02) — Filar 0, decyzja D6, odpowiedzi Q3/Q4.
**Priorytet:** NAJWYŻSZY — wykonać PRZED mitygacjami z TASK-AGENT-CONFORMANCE-001 §3 (Filar 1) i przed dalszym RAG (TASK-RAG-002/003).

## Problem
Agenci /orchestrate-ddd działają 2-3h w tle bez wglądu; bywa ~$120 spalone bez wartości w kodzie.
Udokumentowana awaria (CONFORMANCE §3: weryfikator milknie bez śladu hooka i bez błędu) jest na
poziomie silnika Workflow — hook in-process fizycznie jej nie złapie. Mechanizm obserwacji musi
żyć POZA silnikiem.

## Zasada nadrzędna (D6)
NIE twardy cap tokenów. Watchdog produktywności **świadomy kontraktu etapu** — „postęp" per rola:
- `implement` → Write/Edit,
- `verify` → zwrócony werdykt / StructuredOutput,
- `analysis` → artefakt końcowy + limit czasu etapu.

HALT gdy tokeny rosną BEZ zdarzenia postępu zdefiniowanego DLA TEGO etapu. Duże zużycie przy
realnym postępie = OK. (Globalne „tokeny bez Write/Edit" dawałoby fałszywe alarmy na
weryfikatorach — `tools: Read, Glob, Grep, Bash`, legalnie zero Write.)

## Zakres
- [x] **Zewnętrzny watcher transkryptów (rdzeń)** — `scripts/workflow-watcher.js`: tail
      inkrementalny (offsety) `~/.claude/projects/<slug>/*/subagents/workflows/wf_*/agent-*.jsonl`;
      kontrakt etapu z `agent-*.meta.json::agentType` (implementer→Write/Edit/MultiEdit/NotebookEdit,
      verifier→StructuredOutput, inne→oba; DONE z `journal.jsonl`); pisze `RUN-STATE.md`
      (project-orchestration/ jeśli istnieje, inaczej root). Statusy: OK/SPINNING/HALT/SILENT/STALE/DONE.
      SMOKE-TEST na realnych transkryptach juz-ide-api-1 (wf_1d72895a-716): weryfikatory z awarii
      CONFORMANCE §3 pokazane jako 60k–279k burn bez JEDNEGO zdarzenia postępu — metryka D6 łapie
      dokładnie udokumentowany incydent. STALE (cisza > --stale-sec, domyślnie 1h) = tylko raport,
      bez flagowania martwych przebiegów.
- [x] **HALT przez PreToolUse deny** — `hooks/productivity-watchdog.js` (opt-in per projekt, NIE w
      globalnym hooks.json): czyta `.claude/run-state/halt.json` (TTL 15 min) + `KILL`; deny=exit 2;
      main agent NIGDY nie blokowany (detekcja subagenta przez `agent_id`, bez skanowania
      transkryptów). `WATCHDOG_MODE=block|warn|off`. Eval L1 (D7): `tests/flow-evals/hooks/run.js`
      — 10/10 fixtures (main-pass, flagged-deny, TTL-expiry, kill-switch, halt-all, warn/off, garbage).
- [x] **Heartbeat podstawowy** — sekcja „Obserwowalność" w `commands/orchestrate-ddd.md` już wymaga
      `phase()`/`log()`/labeli; dopisano wskazanie watchera do bloku monitorowania.
- [x] **Kill-switch** (`touch .claude/run-state/KILL` — hook zatrzymuje wszystkich subagentów)
      + **reguła no-rerun** dopisana do `orchestrate-ddd.md`: nigdy od zera, `resumeFromRunId`,
      po 2 nieudanych wznowieniach → STOP i eskalacja.
- [x] **Wykrywanie ciszy** — status SILENT (brak linii > --silence-sec) w RUN-STATE.md.
- [x] gitignore runtime-stanu: `templates/gitignore-claude.template` (+`.claude/run-state/`,
      `RUN-STATE.md`); dokumentacja: `hooks/README.md` (blok opt-in z przykładem settings.json).

**Parametry do strojenia w praktyce:** `--spin-tokens` (domyślnie 60k; HALT przy 2×),
`--silence-sec` (300), `--stale-sec` (3600), TTL flag w hooku (15 min).

## Kryteria sukcesu (z analysis, success_criteria filar 0)
- Każdy run widoczny na żywo w RUN-STATE.md.
- Spinning wykryty ≤ ustalony próg tokenów od wystąpienia (próg = parametr do strojenia).
- ZERO przebiegów „odkrytych po 3h".

## Poza zakresem
- Naprawa przyczyny źródłowej milknięcia weryfikatora (poziom silnika, poza repo) — watcher
  tylko wykrywa i dokumentuje.
- Mitygacje pętli (sequential verify, schema-werdykty, git-diff-gate) → TASK-AGENT-CONFORMANCE-001 §3.
