---
id: DEV-halt-warstwa-testing-l1-l2-dla-campaign-knowledge-2-a
status: dismissed
dismissed_reason: >
  Projektowe — zakres jednostki (2 agregaty, ~9 handlerów, 4 repo, 2 kontrolery, ACL) za duży
  na jeden budżet tury, 2x cicha śmierć implementera. Wymaga podziału units[] w analizie
  marketing-hub (per-context albo L1/L2), nie zmiany silnika.
trigger: halt
rule_ref: null
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - marketing-hub
---

# DEV-halt-warstwa-testing-l1-l2-dla-campaign-knowledge-2-a

## Occurrences

- 2026-09-27 marketing-hub (TS-MH-006) run `wf_ca9ff4f3-43d` warstwa `testing` — Warstwa testing (L1/L2 dla campaign+knowledge: 2 agregaty, ~9 command/query handlerów, 4 repozytoria Kysely, 2 kontrolery, ACL) eskalowała po dwóch kolejnych cichych śmierciach implementera (no result) — zakres najwyraźniej za duży na jeden budżet tury. Wymaga podziału na units[] (np. per-context albo per-warstwa L1 vs L2) w analizie, nie ślepego ponawiania.
