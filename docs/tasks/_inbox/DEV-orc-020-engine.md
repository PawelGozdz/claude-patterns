---
id: DEV-orc-020-engine
status: dismissed
dismissed_reason: >
  Przyczyna 3.1 (config projektu), to samo co DEV-orc-020-engine-loader. Naprawione 2026-10-17 w
  aegis-flow: create_when jako regexy w .claude/blocks/aegis-pipeline.yml.
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: ORC-020
first_seen: 2026-10-10
last_seen: 2026-10-10
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-020-engine

## Occurrences

- 2026-10-10 aegis-flow (TS-002) warstwa `engine` — create_when warstw engine/api to zdania prozą kompilowane jako regex w orchestrate-prepare (createWhenHits zawsze false) — wszystkie warstwy opcjonalne pominięte, przebieg zatrzymany na warstwie testing
