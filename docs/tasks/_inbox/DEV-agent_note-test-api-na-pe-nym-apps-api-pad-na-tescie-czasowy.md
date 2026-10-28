---
id: DEV-agent_note-test-api-na-pe-nym-apps-api-pad-na-tescie-czasowy
status: dismissed
dismissed_reason: >
  Flaky test projektu (3.1), ORC-103 obsługuje niestabilne testy:
  email-verification.schemas.spec.ts w grant-flow ma asercję czasową (1000 wejść w < 50 ms)
  padającą pod obciążeniem. Poprawka w teście: próg większy albo bez asercji czasowej.
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-test-api-na-pe-nym-apps-api-pad-na-tescie-czasowy

## Occurrences

- 2026-10-28 grant-flow (TS-UI-010) run `wf_b1414cd3-066` warstwa `application` — test:api na pełnym apps/api padł na teście czasowym spoza zakresu (email-verification.schemas.spec.ts, limit 50 ms); osobno zielony — flaky pod obciążeniem blokował warstwę testing mimo ORC-099/103.
