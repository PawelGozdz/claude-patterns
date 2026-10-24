---
id: DEV-orc-085-engine
status: dismissed
dismissed_reason: >
  tests skipped w warstwie engine jest zgodne z konfiguracją: warstwa ma checks make typecheck/make lint i nie ma tests:true, a testy należą do jednostki testing. Pokrycie mierzy ta jednostka i bramka końcowa. Część o typecheck/lint skipped obsłużona w ORC-118 (DEV-orc-085-api).
trigger: agent_note
category: verifier
sources:
  - orchestrate
rule_ref: ORC-085
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-085-engine

## Occurrences

- 2026-10-21 aegis-flow (TS-004) run `wf_b7eccac7-82d` warstwa `engine` — sonda warstwy engine pominęła testy (tests skipped), więc pokrycie >=80% nie zostało zmierzone; weryfikator nie mógł powtórzyć testów
