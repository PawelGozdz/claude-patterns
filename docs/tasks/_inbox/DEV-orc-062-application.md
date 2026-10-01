---
id: DEV-orc-062-application
status: promoted
resolution: >
  Naprawione jako ORC-082 (2026-09-30): sonda typecheck odracza czerwień, której wszystkie
  błędy TS leżą w dirs późniejszych warstw (mechanicznie, w CORE szablonu); błędy we własnym
  zakresie, w wcześniejszych warstwach i bez ścieżki nadal blokują.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-30
last_seen: 2026-09-30
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-062-application

## Occurrences

- 2026-09-30 juz-ide-api-1 (TS-REP-DISCLOSURE-POLICY-001) run `wf_169047bf-a4d` warstwa `application` — Pełny typecheck czerwony na specach application/__tests__ (konstruktor handlera 10 arg.) i implementacji repo w infrastructure — obie należą do późniejszych warstw (testing/infrastructure). Ten sam wzorzec co domain:tier-projector: globalna sonda typecheck na warstwach pośrednich łamie się od zmian portów/konstruktorów. Sugestia: typecheck tylko na testing + bramce końcowej dla zadań zmieniających kontrakty.
