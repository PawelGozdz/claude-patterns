---
id: DEV-orc-026
status: proposed
trigger: halt
rule_ref: ORC-026
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-026

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_c1bc4f18-d4f` warstwa `infrastructure:auth-switch` — Sonda (haiku) w tail przypisała błąd import/order plikowi business-rule.decorator.ts zamiast permissions.guard.spec.ts; fix-runda nie mogła trafić w błąd, 3 próby zjedzone, ESCALATE. Tail sondy powinien cytować ścieżki z outputu dosłownie, nie streszczać.
