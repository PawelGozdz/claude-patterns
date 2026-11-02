---
id: DEV-orc-100-testing-groups-disclosure-tests
status: promoted
resolution: >
  ORC-146 (2026-10-31): w ścieżce verify-noop GO bez naruszeń z unverified_scope na ostatniej
  próbie albo ten sam zbiór luk drugi raz kończy warstwę jako GO_WITH_GAPS, bez halt
  cause=machine (noopGapsAcceptable; czerwień z wcześniejszych warstw i naruszenia nadal
  zatrzymują).
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-100
first_seen: 2026-10-30
last_seen: 2026-10-30
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-100-testing-groups-disclosure-tests

## Occurrences

- 2026-10-30 juz-ide-api-3 (TS-GEO-DISTANCE-BUCKETS-001) run `wf_822d3fd9-34a` warstwa `testing:groups-disclosure-tests` — Warstwa bez zmian w kodzie (guardian 28/28 zielony): ścieżka verify-noop nie przechodzi przez layerGapsAcceptable/repeatedGapsAcceptable i nie ma reverify, więc GO z unverified_scope po 3 próbach daje ESCALATE_AND_HALT cause=machine. Obejście: --overrides skip.
