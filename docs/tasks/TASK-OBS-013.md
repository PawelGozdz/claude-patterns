---
id: TASK-OBS-013
title: 'Taksonomia przyczyn, obowiązkowa kategoria agent_note, PAUSE to nie halt'
type: feature
status: done
priority: P1
story_points: 3
created_date: 2026-10-22
updated_date: 2026-10-24
assignee: '@unassigned'
labels: [observability, telemetry, reporting]
epic: EP-OBSERVABILITY-002
depends_on: []
related: [TASK-OBS-012, TASK-OBS-017]
source: 'ADR 0015 D5'
---

# TASK-OBS-013: taksonomia przyczyn i wynik PAUSE

## 🎯 Goal

Żeby liczniki per przyczyna coś znaczyły. Dziś 97 ze 106 kategorii w skrzynce to `other`, a jedenaście
promowanych rekordów dotyczyło jednej sprawy (karty wzorców z obcego stosu), dla której nie ma kodu.
`/analyze` kończy 61 z 62 przebiegów jako `halted`, bo zaplanowane PAUSE i awaria wyglądają tak samo.

## Zakres

1. `schemas/telemetry-event-v1.schema.json` i `scripts/lib/telemetry-events.mjs`: `cause` dostaje
   `pattern_card` i `plan`; `defaultCategory` mapuje `analyze_gate`/`analyze_note` z regułami `ANZ-*`
   dotyczącymi warstw na `plan`. Aneks w ADR 0012.
2. `scripts/report-deviation.mjs`: `--trigger agent_note` bez `--category` to błąd użycia (exit 1, komunikat
   z listą). Komendy (`orchestrate.md`, `analyze.md`) i `DEVIATION_NOTE_DESCRIPTION` w szablonie Workflow
   mówią agentowi, że kategoria jest wymagana i jak ją wybrać.
3. Reklasyfikacja istniejących rekordów `other` w skrzynce: skrypt jednorazowy po słowach kluczowych
   (`karta`, `card`, `layers_scope`, `dirs`) z podglądem, zmiany w `category:` zatwierdza człowiek.
4. `commands/analyze.md`: `run-end` przy `analyze.exit: PAUSE` i poprawnie zapisanym artefakcie
   `--outcome ok`; `halted` tylko dla przerwań. `telemetry-emit` bez zmian.
5. Eval `telemetry-events` (nowe wartości, odrzucony `agent_note` bez kategorii) i `validate-commands`
   (treść komend).

## Kryteria akceptacji

- [x] Nowy `agent_note` bez kategorii nie trafia do skrzynki; z kategorią działa jak dotąd (eval `telemetry-events`).
- [x] Udział `other` w skrzynce po reklasyfikacji poniżej 30% (liczba w CHANGELOG): 209/244 (85,7%) → 34/244 (13,9%),
      175 rekordów w dwóch falach zatwierdzonych przez człowieka.
- [x] Nowy przebieg `/analyze` z PAUSE kończy się `run.end` z `outcome: ok` (treść komendy pilnuje `validate-commands`).
      Potwierdzone 2026-10-24 15:59: grant-flow TS-UI-010, `analyze.exit: PAUSE`, artefakt `awaiting-human`, `run.end` = `ok`.
