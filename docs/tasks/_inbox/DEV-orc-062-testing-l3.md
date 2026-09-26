---
id: DEV-orc-062-testing-l3
status: dismissed
dismissed_reason: >
  Nie blad - poprawne zatrzymanie. L3 wykryl realny defekt produkcyjny poza dirs warstwy
  testing, implementer sluznie sie zatrzymal zamiast dotykac kodu poza zakresem. Defekt
  (audyt request_id NOT NULL vs kanal cli, stare e2e na naglowku) do naprawy w
  marketing-hub jako osobna praca, nie tutaj.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-testing-l3

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_031791b9-efc` warstwa `testing:l3` — L3 wykrył defekt produkcyjny (audyt request_id NOT NULL vs kanał cli bez correlationId) oraz stare e2e opierające uprawnienia na nagłówku; oba poza dirs warstwy testing — poprawne zatrzymanie.
