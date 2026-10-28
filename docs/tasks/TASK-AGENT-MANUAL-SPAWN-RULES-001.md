---
id: TASK-AGENT-MANUAL-SPAWN-RULES-001
title: 'Ręcznie uruchamiani implementerzy dostają reguły wprost w poleceniu — bez tego bramki silnika ich nie obejmują'
type: implementation
status: todo
priority: P2
story_points: 5
created_date: 2026-10-28
updated_date: 2026-10-28
assignee: '@claude'
labels: [orchestration, hooks, agents, rule-cards]
depends_on: [TASK-ENGINE-GUARDRAILS-001]
related: [TASK-ENGINE-GUARDRAILS-001, TASK-ORCH-VERIFY-BUDGET-001]
source: >
  Punkt 8 TASK-ENGINE-GUARDRAILS-001 (decyzja D9, odpowiedź Q6: osobne zadanie). Audyt juz-ide-api-1,
  gałąź feature/TS-SEC-D0-BETA-HARDENING-001: karty reguł trafiają do promptów wyłącznie przez `orchestrate-prepare`,
  więc agent uruchomiony ręcznie (`test-implementer`, `*-implementer`) nie dostaje ich wcale.
---

# TASK-AGENT-MANUAL-SPAWN-RULES-001

## Cel

Agent uruchomiony ręcznie, poza `/orchestrate`, dostaje polecenie „przeczytaj reguły" zamiast samych reguł, a hooki, które
miałyby go pilnować, albo sprawdzają tylko odczyt wzorca, albo ostrzegają bez skutku. TASK-ENGINE-GUARDRAILS-001 łapie
skutek (kontrola `conformance`, hook zakresu `test-implementera`), ale nie przyczynę. To zadanie zamyka przyczynę.

## Zakres

| # | Zmiana | Uwaga |
|---|--------|-------|
| 1 | Hook `SubagentStart` wstrzykujący karty z routingu (`pattern_routing`) dla agentów `*-implementer` | Najpierw zweryfikować, jakie pola ma payload `SubagentStart` (`agent_id`, `agent_type`) i czy `additionalContext` trafia do agenta; do tej pory niezweryfikowane. |
| 2 | `check-subagent-pattern-reads` obejmuje zapisy przez Bash | Dziś skanuje tylko Write/Edit/MultiEdit; użyć rozpoznawania celów zapisu z `check-test-implementer-scope`. |
| 3 | Wymóg uruchomienia `code-quality-verifier` po ręcznym implementerze | Albo hook `SubagentStop` z przypomnieniem w kontekście głównej sesji, albo reguła w `CLAUDE.md` projektu. |
| 4 | Eksperyment: czy ostrzeżenie `PostToolUse` z exit 0 dociera do modelu | Hipoteza z audytu, niezweryfikowana. Wynik decyduje, czy `check-domain-purity` (dziś tylko ostrzega) ma blokować. |

## Ograniczenia

- Zmiany w `hooks/` i rejestracji hooków propagują się symlinkami do wszystkich projektów: pracować w worktree, scalać po sygnale właściciela.
- Rejestracja hooków wchodzi przez bloki (`blocks/**/*.yml`), co wymusza zmaterializowane `runtime.yml` w projektach (bramka `audit-projects --gate`).
- Nowy tekst w promptach i kartach przechodzi bramki archeologii, wymaganych kroków i rachunku kontekstu.

## Kryteria ukończenia

- Ręcznie uruchomiony `test-implementer` i `*-implementer` dostaje w kontekście karty właściwe dla plików, które edytuje (test na transkrypcie).
- Zapis kodu przez Bash bez przeczytania karty jest blokowany tak samo jak przez Edit.
- Eksperyment (pkt 4) opisany w `docs/decisions/` z wynikiem i decyzją, co z ostrzeżeniami exit 0.
