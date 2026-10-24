---
id: DEV-agent_note-sonda-checks-tests-skipped-bo-testy-app-auth-nal
status: dismissed
dismissed_reason: >
  Zachowanie zamierzone przy podziale na jednostki (units): testy app/auth/ należą do późniejszej jednostki testing, więc sonda warstwy api je pomija, a pokrycie sprawdza ta jednostka i bramka końcowa. Notatka agenta to ostrzeżenie, nie odstępstwo od reguły.
trigger: agent_note
category: test
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-sonda-checks-tests-skipped-bo-testy-app-auth-nal

## Occurrences

- 2026-10-20 aegis-flow (TS-003) run `wf_0a0766cf-6dd` warstwa `api:auth-core` — Sonda checks.tests=skipped, bo testy app/auth/ należą do późniejszej jednostki; pokrycie i test DENY niezweryfikowane w warstwie.
