---
id: DEV-orc-020-storage-catalog-sql
status: proposed
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: ORC-020
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - my-intelligence
---

# DEV-orc-020-storage-catalog-sql

## Occurrences

- 2026-11-13 my-intelligence (TS-072d) run `wf_1bb4a0b2-ea6` warstwa `storage:catalog-sql` — runtime.yml: warstwa storage ma optional: true bez create_when, wiec createWhenHits nigdy jej nie obejmuje i silnik pomija ja bez ostrzezenia w wyniku (plik migracji nie powstal); obejscie: --overrides createWhenHits
