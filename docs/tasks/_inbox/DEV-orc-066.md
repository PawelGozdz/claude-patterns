---
id: DEV-orc-066
status: promoted
resolution: >
  Karta conventions CV5 dostała wyjątek: projekt z ustaloną kolokacją (handler.spec.ts obok
  handler.ts, jak marketing-hub) trzyma swoją konwencję, nowy test dopasowuje do sąsiednich, a
  weryfikator nie liczy tego jako naruszenia CV5. Reseed wykonany.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-066
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-066

## Occurrences

- 2026-10-24 marketing-hub (TS-MH-027) run `wf_e1164b6e-b51` — conventions-pattern_summary CV5 (testy handlera w __tests__/ obok handlera) nie pasuje do marketing-hub: wszystkie handler.spec.ts leżą obok handler.ts, karta nie rozstrzyga konwencji
