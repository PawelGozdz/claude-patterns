---
id: DEV-agent_note-karty-testing-pyramid-i-rate-limit-guard-sa-ze-sto
status: dismissed
dismissed_reason: >
  Karty NestJS dobrane triggerami po słowach kluczowych (testing-pyramid z bloku ./aig-panel,
  rate-limit-guard z bloku zod), a agent poprawnie nie zastosował ich do płaskiego serwisu
  Fastify. Koszt to kilka kart w kontekście, bez skutku na wynik; powtórka z realną szkodą
  otworzy rekord (wariant plain karty rate-limit-guard albo patterns_exclude w projekcie).
  2026-10-31.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-31
last_seen: 2026-10-31
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-karty-testing-pyramid-i-rate-limit-guard-sa-ze-sto

## Occurrences

- 2026-10-31 ai-gateway (TS-AIG-112) run `wf_58338cfa-689` warstwa `testing:t-surface` — Karty testing-pyramid i rate-limit-guard są ze stosu NestJS/DDD i nie rozstrzygają płaskiego serwisu Fastify
