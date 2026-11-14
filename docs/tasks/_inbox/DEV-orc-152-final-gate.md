---
id: DEV-orc-152-final-gate
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-152
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-152-final-gate

## Occurrences

- 2026-11-13 juz-ide-api-2 (TS-API-CONCURRENCY-REACH-KEEPALIVE-001) run `wf_ead483bb-248` warstwa `final-gate` — karty command-handler-pattern (CH5/CH6) i repository-pattern (RP5) nie opisuja wspolnego helpera ponowien przy VersionError w application/**/support/ ani zapisu agregatu w SAVEPOINT w repozytorium; jedyny punkt styku to ACL11
