---
id: DEV-orc-123-final-gate
status: proposed
trigger: no_go
category: infra
sources:
  - orchestrate
rule_ref: ORC-123
first_seen: 2026-11-12
last_seen: 2026-11-12
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-123-final-gate

## Occurrences

- 2026-11-12 juz-ide-api-3 (TS-OBS-ASYNC-CONTEXT-001) run `wf_a10dbea5-49c` warstwa `final-gate` — Sondy Haiku silnika (tree-pre/post, checks, final-probe) dostały w bloku harnessu dosłowną treść pierwotnego polecenia sesji (/orchestrate przez Skill) i wykonały je zamiast polecenia sondy: typecheck/tests/conformance/tree_hash = skipped, treeHash bound 0/10, bramka końcowa NO_GO machine z samego unverified_scope; sondy nadpisały też report.md i scratchpad prepare.json/workflow.mjs oraz usunęły orchestrating.json. Obejście: checki uruchomione ręcznie z orkiestratora.
