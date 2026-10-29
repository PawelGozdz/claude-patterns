---
id: DEV-agent_note-unverified-scope
status: dismissed
dismissed_reason: >
  Przypadek ORC-138: analiza TS-AIG-104 wpisała .env.example do jednostki, a deny
  Read(./.env.*) blokuje odczyt. Silnik ostrzega o tym od 2026-10-28; ta analiza powstała
  wcześniej.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-unverified-scope

## Occurrences

- 2026-10-28 ai-gateway (TS-AIG-104) warstwa `implementation:docs-card` — Odczyt .env.example zablokowany regułą deny; weryfikator nie sprawdził ADR-0009 i ADR-0010 (unverified_scope).
