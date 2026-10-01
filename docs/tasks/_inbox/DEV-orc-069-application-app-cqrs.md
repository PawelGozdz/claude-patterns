---
id: DEV-orc-069-application-app-cqrs
status: proposed
trigger: halt
rule_ref: ORC-069
first_seen: 2026-09-29
last_seen: 2026-09-29
occurrences: 2
projects:
  - grant-flow
---

# DEV-orc-069-application-app-cqrs

## Occurrences

- 2026-09-29 grant-flow (TS-SIM-002A) run `wf_fb11e116-996` warstwa `application:app-cqrs` — app-cqrs: 2. halt po podniesieniu budzetu verify do 45; verifier zglasza brak obiektu checks w prompcie (sonda/checks nie dotarly do promptu) i tylko grep na command/query/dto. Reczny tsc/L1 zielone.
- 2026-09-29 grant-flow (TS-SIM-002A) run `wf_d5c12ecc-e1d` warstwa `application:app-cqrs` — application:app-cqrs ESCALATE_AND_HALT: GO z niepustym unverified_scope po 3 probach (handlery/command/query/dto/mappery/ports nie sprawdzone); finalGate nie uruchomiona
