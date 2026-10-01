---
id: DEV-orc-069-web-web-shell
status: dismissed
dismissed_reason: >
  Dodatkowy dowód dla TASK-ORCH-VERIFY-BUDGET-001 — GO z unverified_scope po 3 próbach
  (sonda pominęła typecheck/testy, pomiar WT6 nie wykonany), ten sam mechanizm konkurencji
  o budżet co poprzednie zgłoszenia tej klasy. Brak nowej przyczyny; decyzja o rozdzieleniu
  budżetów zostaje przy istniejącym spike'u.
trigger: halt
rule_ref: ORC-069
first_seen: 2026-09-28
last_seen: 2026-09-28
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-069-web-web-shell

## Occurrences

- 2026-09-28 marketing-hub (TS-MH-009) run `wf_a7ba08fd-d2e` warstwa `web:web-shell` — web:web-shell: GO z niepustym unverified_scope po 3 probach; sonda pominela typecheck/testy (skipped), pomiar WT6 nie wykonany
