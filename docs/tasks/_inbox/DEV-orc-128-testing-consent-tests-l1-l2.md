---
id: DEV-orc-128-testing-consent-tests-l1-l2
status: dismissed
dismissed_reason: >
  Silnik zadziałał zgodnie z regułą: zawężony layers_scope słusznie nie pozwala ruszać
  specyfikacji spoza zakresu (ORC-042), halt jest bezpieczny. Luka zakresu leży w analizie
  projektu (3.1), jak w DEV-orc-082-domain i DEV-orc-062-testing-l1-l2.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-128
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-128-testing-consent-tests-l1-l2

## Occurrences

- 2026-10-25 juz-ide-api-1 (TS-SEC-SP-PIN-CONSENT-001) run `wf_ec533ee5-946` warstwa `testing:consent-tests-l1-l2` — Istniejące specyfikacje w 4 katalogach __tests__ (application/infrastructure NE, discovery) spoza zawężonego zakresu jednostki; BLOCKED_BY_PRIOR
