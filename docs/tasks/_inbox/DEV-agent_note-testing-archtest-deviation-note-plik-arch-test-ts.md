---
id: DEV-agent_note-testing-archtest-deviation-note-plik-arch-test-ts
status: dismissed
dismissed_reason: >
  Działanie zgodne z projektem: zawężony layers_scope słusznie nie pozwala na nowy plik
  poza zakresem, a 578 linii mieści się w limicie 800 z reguł stylu. Wydzielenie FIXTURE
  to ewentualny refaktor osobnego zadania w iam, nie błąd silnika ani konfiguracji.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - iam
---

# DEV-agent_note-testing-archtest-deviation-note-plik-arch-test-ts

## Occurrences

- 2026-10-18 iam (TS-SSO-064) run `wf_403b1c92-67c` warstwa `testing:archtest` — testing:archtest deviation_note: plik arch.test.ts 578 linii, wydzielenie FIXTURE wymaga nowego pliku poza zawężonym layers_scope
