---
id: TASK-EVAL-001
title: 'Automatyzacja evali L1 + korpusy L2 (kontynuacja D7 / ADR 0004)'
type: task
status: planned
created_date: 2026-07-02
updated_date: 2026-09-07
---

# TASK-EVAL-001 — Automatyzacja evali L1 + korpusy L2 (kontynuacja D7 / ADR 0004)

**Status: TODO — została tylko Faza 2** · **Źródło:** ADR 0004 (eval modularny) + sesja
2026-07-02 (pytanie: „czy muszę wywoływać evale ręcznie?")

> **Faza 1 zamknięta 2026-08-27 przez K11 z `TASK-KAIZEN-001`** (`docs/completed-tasks/TASK-KAIZEN-001.md:101`).
> Zrealizowana inaczej, niż tu zaplanowano, i lepiej: zamiast osobnego `run-all.js` +
> opt-in hooka PostToolUse bramka siedzi w `scripts/pre-commit-guards.mjs` — jeden punkt
> wejścia, jedna instalacja przez `simple-git-hooks`. Odpala 5 evali L1
> (hooks / watcher / workflow-lint / workflow-metrics / broadcast) i 7 walidatorów
> `scripts/ci/validate-*`, całość poniżej 2 s, bez zależności na żywym Qdrancie.
> Uzasadnienie odstępstwa jest w nagłówku tamtego skryptu.
**Stan wyjściowy:** L1 działają, ale RĘCZNIE — `node tests/flow-evals/<x>/run.js`:
hooks 17/17 · watcher 7/7 · workflow-lint 3/3 · retrieval (golden 20, bramka hit@5 ≥ 0.6;
wymaga żywego Qdranta + embeddera GPU 192.168.0.150:8301).

## Problem
Ręczność = trzeba PAMIĘTAĆ o odpaleniu właściwego evala przy zmianie komponentu — dokładnie
ten typ dyscypliny, który zawodzi (lekcja pola `rag:`: instrukcja bez wymuszenia = drift).

## Faza 1 — automatyzacja (mała, wysoka dźwignia) — ✅ ZAMKNIĘTA 2026-08-27 (K11)
- [x] **Hook PostToolUse „eval-on-change"** — **zastąpiony bramką pre-commit**, nie zbudowany.
      Powód: hook per-edycja odpala eval kilkadziesiąt razy w sesji, żeby złapać to samo, co
      commit łapie raz, a exit 0 („informuje, nie blokuje") nie ma zębów. Zasada D7 („eval
      komponentu odpala się, gdy TEN komponent się zmienia") jest utrzymana — pre-commit widzi
      dokładnie zmienione pliki.
- [x] **`tests/flow-evals/run-all.js`** — **nie powstał jako osobny plik**; jego rolę pełni
      `scripts/pre-commit-guards.mjs`, który zbiera wszystkie błędy zamiast przerywać na
      pierwszym (jeden commit = jeden pełny raport).
- [x] **git pre-commit** w claude-patterns → `scripts/pre-commit-guards.mjs`
      (`package.json` → `simple-git-hooks.pre-commit`). Pierwszy przebieg ujawnił 18 realnych
      błędów: 2 agentów bez `tools`, 16 martwych referencji w `commands/`.
- [x] **Log wyników retrieval**: zrobione w `TASK-GUARDRAILS-001` Sekcja 2 (2026-08-18) —
      `tests/flow-evals/retrieval/run.js` dopisuje JSONL `{date, hit1, hit5, mrr, n, threshold,
      gitSha}` do `results.jsonl` po każdym runie. Nie duplikować tutaj.

## Faza 2 — korpusy L2 (jawna luka z ADR 0004)
- [ ] **Seeded-bugs dla `code-quality-verifier`**: pliki z celowo wstrzykniętymi naruszeniami
      (≥1 per rule-ID z Rule Cards, w tym N4-dekorator-bez-delegacji) + pliki czyste →
      czułość / false-positive rate. Scorer = porównanie z etykietami, zero LLM-judge.
- [ ] **Bounded-task dla implementerów**: mały zadany task → output oceniany AST
      `/conformance-check` (deterministyczny sędzia).
- [ ] **Labeled corpus Rule Cards**: 35 oznaczonych plików z audytu CONFORMANCE §1 →
      precision/recall per rule-ID dla `/conformance-check`.
- [ ] **Replay stage'ów panelu `/analyze`**: nagrane wejścia (transkrypty już są) →
      kontrakt wyjścia (struktura, obecność decyzji/pytań, pole `rag:`). Panel nie jest już
      stałą listą z presetu — po [ADR 0008](../adr/0008-stack-blocks-composition.md) składa się
      ze slotów `analyze.panel` w `blocks/**` i zależy od kompozycji projektu, więc replay musi
      brać wejście razem z `runtime.yml`, który je wyprodukował.

## Zasada (D7)
Eval komponentu odpala się, gdy TEN komponent się zmienia. Faza 1 zamieniła to z reguły
pamięciowej w mechanizm (pre-commit). Dowód wartości z 2026-07-02: 3 regresje watchera odkryte incydentami
na żywo — z fixtures każda kosztowałaby 2 sekundy zamiast przebiegu produkcyjnego.
