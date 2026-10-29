---
id: DEV-orc-042-engine-trigger-ids
status: dismissed
dismissed_reason: >
  Zgodne z regułą: testy Trigger i EXECUTE_REJECTED należą do warstwy testing (tests/),
  implementer engine/ słusznie je pominął (ORC-042).
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-042-engine-trigger-ids

## Occurrences

- 2026-10-28 aegis-flow (TS-008) run `wf_bd4d9051-6b0` warstwa `engine:trigger-ids` — Drobne ustalenia weryfikatora (testy Trigger, is_valid_asset_id, is_valid_profile_id, EXECUTE_REJECTED) dotyczą tests/, poza dirs warstwy engine/; implementer pominął je zgodnie z zakazem wychodzenia poza zakres.
