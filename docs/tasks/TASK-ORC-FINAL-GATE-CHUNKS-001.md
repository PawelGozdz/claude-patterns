---
id: TASK-ORC-FINAL-GATE-CHUNKS-001
title: 'Bramka końcowa: pod-przebiegi przy dużym diffie, po sprawdzeniu skuteczności ORC-152'
type: feature
status: todo
priority: P2
story_points: 3
created_date: 2026-11-08
updated_date: 2026-11-08
assignee: '@unassigned'
labels: [orchestrate, final-gate]
source: 'feedback z juz-ide-api-1 (12 plików) i -7: „stopped at its 60-turn limit (partial result)”; ORC-152 wdrożony 2026-11-08, skuteczności nie zmierzono'
---

# TASK-ORC-FINAL-GATE-CHUNKS-001: Bramka końcowa: pod-przebiegi przy dużym diffie, po sprawdzeniu skuteczności ORC-152

## 🎯 Goal

Bramka końcowa kończy z werdyktem także przy diffie ponad ~40 plików, bez podnoszenia `maxTurns`.

## Zakres

1. Najpierw pomiar: po pierwszych przebiegach z ORC-152 sprawdzić w transkryptach bramek (diff ~12 plików), czy werdykt pada przed 70% limitu. Brak poprawy = przyczyna leży gdzie indziej (kontekst agenta, fazy 1–8 w definicji), nie w podziale.
2. Gdy pomiar potwierdza potrzebę: w `orchestrate.template.mjs` sekwencyjne pod-przebiegi z jawną listą plików (podział po `layers[].dirs`), każdy z pełnym budżetem i terminem werdyktu po 70%; werdykt = najgorszy z pod-przebiegów, `unverified_scope` sumowany. Próg ok. 40 plików.
3. Eval w `orchestrate-script`: 60 plików → trzy wywołania bramki, jedno `NO_GO` = `NO_GO`.
4. Zamienić zalecenie w `docs/orchestrate-manual-mode.md` na opis zachowania silnika.
