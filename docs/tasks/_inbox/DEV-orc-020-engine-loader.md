---
id: DEV-orc-020-engine-loader
status: dismissed
dismissed_reason: >
  Przyczyna 3.1 (config projektu), nie silnik: orchestrate-prepare.mjs:640 celowo liczy create_when jako RegExp ('i') na tekście zadania i analizy, a blok aegis-pipeline.yml miał w create_when zdania po polsku. Naprawione 2026-10-17 w aegis-flow: .claude/blocks/aegis-pipeline.yml (regexy dla warstw config, engine, workers, api, daemon) i przegenerowany .claude/config/runtime.yml (staged, bez commita).
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-020
first_seen: 2026-10-17
last_seen: 2026-10-17
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-020-engine-loader

## Occurrences

- 2026-10-17 aegis-flow (TS-005) run `wf_9cea179a-1e5` warstwa `engine:loader` — create_when z bloku projektu to zdania po polsku, a orchestrate-prepare.mjs:640 liczy je jako RegExp, więc warstwy optional nigdy nie trafiają; naprawa: regexy w aegis-pipeline.yml (obejście: --overrides createWhenHits).
