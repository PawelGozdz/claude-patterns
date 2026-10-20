---
id: DEV-agent_note-the-app-layer-has-no-tests-for-create-app-setti
status: dismissed
dismissed_reason: >
  Zamknięte w aegis-flow: TS-020 done, testy ustawień, aplikacji HTTP, tras odczytu i
  Dockerfile dodane (commit 380b985). Założenie agenta o osobnej jednostce testing:http-tests
  się potwierdziło.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-the-app-layer-has-no-tests-for-create-app-setti

## Occurrences

- 2026-10-18 aegis-flow (TS-020) run `wf_26f33140-1c4` warstwa `api:http` — The `app` layer has no tests for create_app, settings, runs or policy in tests/unit. I assumed the separate testing:http-tests unit covers them, so I did not measure the 80% coverage required for the changed files.
