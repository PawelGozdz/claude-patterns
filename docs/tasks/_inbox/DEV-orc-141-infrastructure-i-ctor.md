---
id: DEV-orc-141-infrastructure-i-ctor
status: proposed
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: ORC-141
first_seen: 2026-11-15
last_seen: 2026-11-15
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-141-infrastructure-i-ctor

## Occurrences

- 2026-11-15 juz-ide-api-3 (TS-TOOLING-DOMAIN-MODEL-CLEANUP-001) warstwa `infrastructure:i-ctor` — BEHAVIOR_NET/reclassifyMinor zamienia minor-findingi ze znacznikiem [zachowanie] na NO_GO mimo GO weryfikatora i pustych violations (d-ctor-auth: throw w fixturze; i-ctor: prozа weryfikatora). Siatka nie odróżnia fixtur testowych (__fixtures__, *.mother.ts, __tests__) od kodu produkcyjnego. Obejście: overrides autoFixMinor=false.
