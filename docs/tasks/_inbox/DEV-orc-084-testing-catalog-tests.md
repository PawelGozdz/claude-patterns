---
id: DEV-orc-084-testing-catalog-tests
status: proposed
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-084
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - my-intelligence
---

# DEV-orc-084-testing-catalog-tests

## Occurrences

- 2026-11-13 my-intelligence (TS-072d) run `wf_1bb4a0b2-ea6` warstwa `testing:catalog-tests` — warstwa testing bez checks w runtime.yml: sonda tests skipped, brak zielonego dowodu, GO z unverified_scope po 3 probach konczy sie ESCALATE cause=machine; weryfikator nie przeczytal calego pliku kart (2748 linii)
