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
- [ ] **Zewnętrzny watcher transkryptów (rdzeń)** — proces tail-ujący
      `~/.claude/projects/**/subagents/workflows/**/agent-*.jsonl`; liczy tokeny vs zdarzenia
      postępu per agent; pisze **`RUN-STATE.md`** na żywo (bieżąca faza, ostatni artefakt,
      tokeny-od-postępu, status agentów). Niezależny od silnika; przy okazji zbiera dane
      diagnostyczne do niewyjaśnionej przyczyny milknięcia.
- [ ] **HALT przez PreToolUse deny** — po fladze „spinning" hook blokuje dalsze tool-calle
      (nie da się zabić wiszącego agenta z hooka; deny jest realnym punktem egzekucji).
- [ ] **Heartbeat podstawowy** — `log()` co krok fazy w skrypcie Workflow + `/workflows`
      progress + task-notifications.
- [ ] **Kill-switch** + reguła „nie ponawiaj Workflow N-ty raz" (resume `resumeFromRunId`
      zamiast re-run — 4 ślepe przebiegi TS-SEC-VERIFICATION-LEVELS-002 to anty-wzorzec).
- [ ] **Wykrywanie ciszy** — brak tool_use/tekstu przez X → watcher flaguje w RUN-STATE.md.

## Kryteria sukcesu (z analysis, success_criteria filar 0)
- Każdy run widoczny na żywo w RUN-STATE.md.
- Spinning wykryty ≤ ustalony próg tokenów od wystąpienia (próg = parametr do strojenia).
- ZERO przebiegów „odkrytych po 3h".

## Poza zakresem
- Naprawa przyczyny źródłowej milknięcia weryfikatora (poziom silnika, poza repo) — watcher
  tylko wykrywa i dokumentuje.
- Mitygacje pętli (sequential verify, schema-werdykty, git-diff-gate) → TASK-AGENT-CONFORMANCE-001 §3.
