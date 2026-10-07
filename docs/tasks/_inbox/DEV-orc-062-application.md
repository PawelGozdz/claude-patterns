---
id: DEV-orc-062-application
status: promoted
resolution: >
  Naprawione jako ORC-082 (2026-09-30): sonda typecheck odracza czerwień, której
  wszystkie błędy TS leżą w dirs późniejszych warstw (mechanicznie, w CORE
  szablonu); błędy we własnym zakresie, w wcześniejszych warstwach i bez ścieżki
  nadal blokują. Drugie wystąpienie (grant-flow TS-UI-004): kontroler i spec poza
  zawężeniem layers_scope — pokryte ORC-090 (własność po pełnych dirs, ścieżki
  względne pakietu).
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-30
last_seen: 2026-10-03
occurrences: 2
projects:
  - juz-ide-api-1
  - grant-flow
reopened_at: 2026-10-03
reopened_from_status: promoted
---

# DEV-orc-062-application

## Occurrences

- 2026-10-03 grant-flow (TS-UI-004) run `wf_69cd0d0f-651` warstwa `application` — application: zmiana sygnatury GetProjectTasksQuery/GetProjectTaskQuery (scope) czerwona przez wywolania poza zawezonym zakresem: kontroler (pozniejsza warstwa) i integration spec w create-project-task/__tests__ (nieprzypisany do zadnej warstwy po zawezeniu layers_scope)
- 2026-09-30 juz-ide-api-1 (TS-REP-DISCLOSURE-POLICY-001) run `wf_169047bf-a4d` warstwa `application` — Pełny typecheck czerwony na specach application/__tests__ (konstruktor handlera 10 arg.) i implementacji repo w infrastructure — obie należą do późniejszych warstw (testing/infrastructure). Ten sam wzorzec co domain:tier-projector: globalna sonda typecheck na warstwach pośrednich łamie się od zmian portów/konstruktorów. Sugestia: typecheck tylko na testing + bramce końcowej dla zadań zmieniających kontrakty.
