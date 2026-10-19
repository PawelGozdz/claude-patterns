---
id: DEV-orc-062-application
status: promoted
resolution: >
  Nowe wystąpienie (juz-ide-api-2, 2026-10-18) to inna przyczyna niż typecheck z ORC-082/090/104 (zob. previous_*): implementer bez Bash nie może usuwać plików ani uruchamiać komend, więc zgłasza brak zmian i ORC-062 słusznie staje. Zebrane w TASK-ORCH-IMPLEMENTER-FILE-DELETE-001 (2026-10-18).
previous_dismissed_reason: >
  Nieaktualne po ORC-082 (czerwony typecheck tylko w późniejszych warstwach jest
  odroczony), ORC-090 (odroczenie typechecku w monorepo) i ORC-104 (sonda z
  kotwicą korzenia repo; wystąpienie z 2026-10-08 miało błędny cwd sondy, co sam
  rekord odnotowuje).
previous_resolution: >
  Naprawione jako ORC-082 (2026-09-30): sonda typecheck odracza czerwień, której
  wszystkie błędy TS leżą w dirs późniejszych warstw (mechanicznie, w CORE
  szablonu); błędy we własnym zakresie, w wcześniejszych warstwach i bez ścieżki
  nadal blokują. Drugie wystąpienie (grant-flow TS-UI-004): kontroler i spec
  poza zawężeniem layers_scope — pokryte ORC-090 (własność po pełnych dirs,
  ścieżki względne pakietu).
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-30
last_seen: 2026-10-18
occurrences: 4
projects:
  - juz-ide-api-1
  - grant-flow
  - juz-ide-api-2
reopened_at: 2026-10-18
reopened_from_status: dismissed
sources:
  - orchestrate
category: other
---

# DEV-orc-062-application

## Occurrences

- 2026-10-18 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) run `wf_db145b3f-cb3` warstwa `application` — machine: domain-application-implementer bez Bash nie może usuwać plików/uruchamiać komend; BLOCKED_BY_PRIOR
- 2026-10-08 grant-flow (TS-PROJ-COMPANY-001) run `wf_899d0e0f-9c5` warstwa `application` — Typecheck application czerwony wyłącznie przez specy spoza zakresu warstwy (CreateProjectCommand z undefined w testach infra/application), ORC-082 nie odroczył; wcześniej sonda z błędnym cwd (wf_b52ef1f3-3f0)
- 2026-10-03 grant-flow (TS-UI-004) run `wf_69cd0d0f-651` warstwa `application` — application: zmiana sygnatury GetProjectTasksQuery/GetProjectTaskQuery (scope) czerwona przez wywolania poza zawezonym zakresem: kontroler (pozniejsza warstwa) i integration spec w create-project-task/__tests__ (nieprzypisany do zadnej warstwy po zawezeniu layers_scope)
- 2026-09-30 juz-ide-api-1 (TS-REP-DISCLOSURE-POLICY-001) run `wf_169047bf-a4d` warstwa `application` — Pełny typecheck czerwony na specach application/__tests__ (konstruktor handlera 10 arg.) i implementacji repo w infrastructure — obie należą do późniejszych warstw (testing/infrastructure). Ten sam wzorzec co domain:tier-projector: globalna sonda typecheck na warstwach pośrednich łamie się od zmian portów/konstruktorów. Sugestia: typecheck tylko na testing + bramce końcowej dla zadań zmieniających kontrakty.
