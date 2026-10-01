---
id: TASK-ORCH-VERIFY-BUDGET-001
title: 'Weryfikator: realny defekt znaleziony późno konkuruje o ten sam budżet prób co powierzchowna weryfikacja — czy rozdzielić?'
type: spike
status: todo
priority: P3
story_points: 3
created_date: 2026-09-27
updated_date: 2026-09-27
assignee: '@unassigned'
labels: [kaizen, orchestration, verifier, budget]
depends_on: []
related: [ORC-069, ORC-074]
source: >
  docs/tasks/_inbox/DEV-orc-032-application-application.md (grant-flow TS-RATE-003, run
  wf_06525c67-339, warstwa application:application) — zgłoszone przez satelitę pod numerem
  ORC-032, który w historii reguł tego repo już oznacza coś innego (twardy limit tur na
  wywołaniu agenta); treść to NOWY problem, nie duplikat.
---

# TASK-ORCH-VERIFY-BUDGET-001: konkurencja o budżet prób między "nie zdążyłem sprawdzić" a "znalazłem prawdziwy błąd"

## 🎯 Goal

grant-flow TS-RATE-003, `application:application`, run `wf_06525c67-339`: próby 1-2 dały
GO-with-`unverified_scope` z powierzchownej weryfikacji (pliki nieprzeczytane, typecheck/testy
nieuruchomione albo niejednoznacznie), a nie z realnej analizy logiki biznesowej. Próba 3
w końcu przeczytała kod dokładnie i znalazła prawdziwy, mechanicznie prosty do naprawienia błąd
(`RateCardResultDto.entryCount: number` deklarowane, ale nigdy nie wypełniane przez
`CreateRateCardHandler.toDto()` — każdy wywołujący dostaje `entryCount: undefined`) — ale budżet
`maxAttempts` (3) był już wyczerpany na dwóch wcześniejszych, płytkich próbach, więc przebieg
eskalował zamiast wysłać jednolinijkową poprawkę do implementera.

Weryfikator sam odnotował wyczerpanie budżetu 15 wywołań narzędzi jeden plik przed pełnym
pokryciem w POPRZEDNIEJ rundzie tej samej warstwy.

## Pytanie do rozstrzygnięcia

Dwie propozycje z raportu (nie wykluczają się wzajemnie):

1. **Podnieść budżet `verify` dla tego typu warstwy** (`budgets.verify.max_tool_calls` w
   `project.yml`/`runtime.yml`) — prostsze, zero zmian w silniku, ale nie gwarantuje, że
   głębsza analiza zmieści się w PIERWSZEJ próbie zamiast w trzeciej.
2. **`decideVerdict()` waży inaczej "realny defekt (NO_GO z konkretnymi naruszeniami)" od
   "niepełne pokrycie weryfikacji (GO z `unverified_scope`)"** — np. próby zużyte na
   GO-with-unverified_scope nie liczą się tak samo do `maxAttempts` jak próby z realnym NO_GO,
   bo pierwsze to koszt płytkości weryfikatora, nie iteracji nad kodem. Wymaga decyzji
   projektowej: czy to nie otwiera furtki do nieskończonych prób na warstwie, którą weryfikator
   permanentnie nie jest w stanie ocenić w pełni (patrz ORC-074 — ai-os-bot ma dokładnie taki
   przypadek, ale tam ORC-074 już ogranicza koszt bez zmiany logiki `maxAttempts`).

## ✅ Kryterium ukończenia

Decyzja maintainera: (a) podnieść domyślny/zalecany budżet `verify`, (b) zmienić wagę w
`decideVerdict()`, (c) obie, albo (d) świadomie zostawić bez zmian (koszt akceptowalny — to
było jedno wystąpienie). Wpis w `orchestrate-rule-history.md` z numerem ORC-0NN, jeśli (b)
albo (c).
