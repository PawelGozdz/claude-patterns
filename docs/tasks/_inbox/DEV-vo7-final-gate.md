---
id: DEV-vo7-final-gate
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: VO7
first_seen: 2026-11-15
last_seen: 2026-11-15
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-vo7-final-gate

## Occurrences

- 2026-11-15 juz-ide-api-3 (TS-TOOLING-DOMAIN-MODEL-CLEANUP-001) warstwa `final-gate` — Karta value-object-pattern VO7 każe getEqualityComponents(), a @vytches/ddd 0.32.1 wywołuje getIdentityComponents(); karta nie wskazuje metody kanonicznej dla tej wersji biblioteki.
