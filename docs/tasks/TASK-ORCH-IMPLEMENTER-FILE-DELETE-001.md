---
id: TASK-ORCH-IMPLEMENTER-FILE-DELETE-001
title: 'Implementer bez Bash nie może usuwać plików: tombstone `export {}` i BLOCKED_BY_PRIOR'
type: bugfix
status: todo
priority: P2
story_points: 3
created_date: 2026-10-18
updated_date: 2026-10-18
assignee: '@unassigned'
labels: [kaizen, orchestration, engine]
depends_on: []
related: [TASK-ORCH-CARDS-STACK-MISMATCH-001]
source: >
  Zebrane 2026-10-18 z docs/tasks/_inbox/ (2 rekordy, 3 projekty, 4 wystąpienia).
  (1) DEV-orc-062-application (reopen): juz-ide-api-2 TS-SEC-MAP-GROUP-PIN-001, warstwa application,
  agent domain-application-implementer ma `disallowedTools: Bash`, więc nie usuwa plików ani nie
  uruchamia komend; twierdzi „brak zmian", ORC-062 zatrzymuje przebieg (BLOCKED_BY_PRIOR). Obejście
  człowieka: override agent=infrastructure-implementer. Wcześniejsze wystąpienia: juz-ide-api-1,
  grant-flow (zamknięte jako ORC-082/090, ale ten wariant się nie powtórzył na typecheck, tylko na
  braku narzędzia).
  (2) DEV-orc-087-domain: juz-ide-api-1 TS-SEC-BLOCK-CACHE-001, warstwa domain, ten sam agent zostawia
  tombstone `export {}` (block-cache.port.ts, block-cache-write-through.handler.ts + 2 specy), a
  orkiestrator robi `git rm` po przebiegu. Pusty spec vitest = „No test suite found", więc testy są
  czerwone do czasu sprzątania.
---

# TASK-ORCH-IMPLEMENTER-FILE-DELETE-001: usuwanie plików w warstwach bez Bash

## 🎯 Goal

Zadanie, którego część to usunięcie plików, nie zatrzymuje się na warstwie z implementerem bez
Bash i nie zostawia plików-nagrobków czerwieniących testy.

## Fakty

- W juz-ide-api-1 i juz-ide-api-2 `domain-application-implementer` ma `disallowedTools: Bash`
  świadomie (czystość domeny: bez I/O i komend). Usunięcie pliku wymaga `git rm`/`rm`.
- ORC-062 poprawnie nie ufa twierdzeniu „brak zmian" przy czerwonej sondzie. Problem jest wcześniej:
  agent nie ma jak wykonać zadania.
- ORC-087 (tree probe) już wylicza zmiany w drzewie, więc silnik wie, co zostało po warstwie.

## Hipotezy (kolejność kosztu)

1. **Konfiguracja projektu:** dopuścić wąski Bash dla tego agenta (`Bash(git rm:*)`) w jego
   frontmatterze. Bez zmiany silnika; do sprawdzenia, czy `tools` w agencie wspiera wzorce poleceń.
2. **Pole `deleted_files` w wyniku implementera** (schemat StructuredOutput). Skrypt po warstwie
   uruchamia mechaniczny krok `git rm -f -- <pliki>` (agentem z Bash, jak sonda drzewa), tylko dla
   ścieżek w `dirs` warstwy; potem sonda. Zastępuje tombstone.
3. **Wykrywanie tombstone w tree probe:** plik z samą treścią `export {}` w zakresie warstwy →
   `git rm` w kroku mechanicznym. Tańsze, ale zgaduje intencję.

## ✅ Kryterium ukończenia

- Eval w `tests/flow-evals/orchestrate-script`: warstwa z implementerem zwracającym `deleted_files`
  kończy z plikami usuniętymi, a ścieżka spoza `dirs` jest odrzucona.
- Rekordy z `source:` zamknięte w skrzynce z odesłaniem do wyniku.
