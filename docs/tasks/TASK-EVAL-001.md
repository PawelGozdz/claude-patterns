# TASK-EVAL-001 — Automatyzacja evali L1 + korpusy L2 (kontynuacja D7 / ADR 0004)

**Status: TODO** · **Źródło:** ADR 0004 (eval modularny) + sesja 2026-07-02 (pytanie: „czy muszę wywoływać evale ręcznie?")
**Stan wyjściowy:** L1 działają, ale RĘCZNIE — `node tests/flow-evals/<x>/run.js`:
hooks 17/17 · watcher 7/7 · workflow-lint 3/3 · retrieval (golden 20, bramka hit@5 ≥ 0.6;
wymaga żywego Qdranta + embeddera GPU 192.168.0.150:8301).

## Problem
Ręczność = trzeba PAMIĘTAĆ o odpaleniu właściwego evala przy zmianie komponentu — dokładnie
ten typ dyscypliny, który zawodzi (lekcja pola `rag:`: instrukcja bez wymuszenia = drift).

## Faza 1 — automatyzacja (mała, wysoka dźwignia)
- [ ] **Hook PostToolUse „eval-on-change"** (opt-in, w `.claude/settings.json` repo claude-patterns —
      NIE globalnie): mapa plik→eval:
      `scripts/workflow-watcher.js` → `tests/flow-evals/watcher/run.js`;
      `hooks/*.js` → `tests/flow-evals/hooks/run.js` (dla `hooks/workflow-lint.js` dodatkowo
      `workflow-lint/run.js`). Wynik na stderr od razu po edycji; hook ZAWSZE exit 0
      (informuje, nie blokuje — wzorzec `post-edit-typecheck`). Retrieval WYKLUCZONY z auto
      (wymaga infry).
- [ ] **`tests/flow-evals/run-all.js`** — wszystkie L1 bez retrieval, jeden exit code.
- [ ] **git pre-commit** w claude-patterns → `run-all.js` (siatka na zmiany „przy okazji").
- [ ] **Log wyników retrieval**: po każdym runie append JSONL
      `{date, hit1, hit5, mrr, n, threshold, gitSha}` do `tests/flow-evals/retrieval/results.jsonl`
      — trend po zmianach chunkera/modelu/seedu (dziś każdy run to migawka bez historii).

## Faza 2 — korpusy L2 (jawna luka z ADR 0004)
- [ ] **Seeded-bugs dla `code-quality-verifier`**: pliki z celowo wstrzykniętymi naruszeniami
      (≥1 per rule-ID z Rule Cards, w tym N4-dekorator-bez-delegacji) + pliki czyste →
      czułość / false-positive rate. Scorer = porównanie z etykietami, zero LLM-judge.
- [ ] **Bounded-task dla implementerów**: mały zadany task → output oceniany AST
      `/conformance-check` (deterministyczny sędzia).
- [ ] **Labeled corpus Rule Cards**: 35 oznaczonych plików z audytu CONFORMANCE §1 →
      precision/recall per rule-ID dla `/conformance-check`.
- [ ] **Replay stage'ów panelu `/analyze-ddd`**: nagrane wejścia (transkrypty już są) →
      kontrakt wyjścia (struktura, obecność decyzji/pytań, pole `rag:`).

## Zasada (D7)
Eval komponentu odpala się, gdy TEN komponent się zmienia. Faza 1 zamienia to z reguły
pamięciowej w mechanizm. Dowód wartości z 2026-07-02: 3 regresje watchera odkryte incydentami
na żywo — z fixtures każda kosztowałaby 2 sekundy zamiast przebiegu produkcyjnego.
