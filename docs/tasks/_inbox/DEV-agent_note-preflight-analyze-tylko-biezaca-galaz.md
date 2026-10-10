---
id: DEV-agent_note-preflight-analyze-tylko-biezaca-galaz
status: proposed
trigger: agent_note
rule_ref: ANL-006
first_seen: 2026-10-10
last_seen: 2026-10-10
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-preflight-analyze-tylko-biezaca-galaz

## Occurrences

- 2026-10-10 ai-gateway (TS-AIG-072) — `/analyze` przeszedł preflight ANL-006 na `develop` i napisał analizę od zera, choć praca była już zrobiona i scommitowana na niezmergowanej gałęzi `feature/TS-AIG-072-lint-z-typami` (przebieg z 9.10, raport w gitignored `.claude/run-state/`). Dublowanie wyszło dopiero na starcie `/orchestrate`. Koszt: pełna analiza z czterema agentami i zatwierdzeniem (~14 USD), plus ręczne rozwiązywanie konfliktów merge w KANBAN i karcie niezmienników.

## Przyczyna

ANL-006 każe sprawdzić `git status` i `git log -15`, ale tylko dla bieżącej gałęzi. Zadanie bez śladu na `develop` wygląda na niezrobione. Dodatkowo `/orchestrate` kończy się na `STAGE_NOT_COMMIT`, a merge do `develop` jest osobnym, niczym niewymuszonym krokiem, więc stan zadania w KANBAN i `tasks/` rozjeżdża się z gałęziami. Ślad w `.claude/run-state/` (stary `{TASK-ID}.report.md`, `{TASK-ID}.workflow.mjs`) nie jest sprawdzany przez żadną bramkę.

## Proponowana zmiana

1. ANL-006 (preflight `/analyze`) i start `/orchestrate`: przed rozpisaniem jednostek uruchom
   - `git branch -a --no-merged develop` (gałęzie niezmergowane),
   - `git log --all --oneline --grep=<TASK-ID>` (commity zadania na dowolnej gałęzi),
   - `ls .claude/run-state/<TASK-ID>.*` (raport lub skrypt z poprzedniego przebiegu).
   Trafienie = STOP z pytaniem „kontynuować istniejącą gałąź czy zaczynać od nowa”, nie cicha analiza od zera.
2. Najlepiej mechanicznie: dopisać te trzy sprawdzenia do `orchestrate-prepare.mjs` (exit 2 z komunikatem) i wystawić ten sam skrypt dla `/analyze`, zamiast reguły „tylko prompt”.
3. Opcjonalnie: po `STAGE_NOT_COMMIT` w wiadomości końcowej przypominać jedną linią „commit + merge do develop, potem KANBAN”.
