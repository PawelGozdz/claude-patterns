---
id: DEV-orc-064-storage-vuln-sql
status: proposed
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-064
first_seen: 2026-11-11
last_seen: 2026-11-11
occurrences: 1
projects:
  - my-intelligence
---

# DEV-orc-064-storage-vuln-sql

## Occurrences

- 2026-11-11 my-intelligence (TS-072) run `wf_2d549075-e1e` warstwa `storage:vuln-sql` — Jednostka units[] vuln-sql (layer: storage, optional bez create_when) nie weszła do przebiegu: prepare pomija warstwy optional bez trafienia create_when także dla jednostek z analizy, więc migracja 023 nie miała właściciela i bramka końcowa dała NO_GO (cause=code). Obejście: --overrides createWhenHits.
