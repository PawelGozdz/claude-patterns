---
id: DEV-agent_note-karta-logger-pattern-plain-lgp2-przeczy-override
status: dismissed
dismissed_reason: >
  Duplikat DEV-agent_note-karta-logger-pattern-plain-lgp2-createlogger-na-p: LGP2 jest
  nadpisana celowo w aig-invariants.md. Zostaje rematerializacja runtime.yml ai-gateway po
  zakończeniu TS-AIG-104 (ORC-136 zdjęło karty obcego stosu z bloku node).
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-karta-logger-pattern-plain-lgp2-przeczy-override

## Occurrences

- 2026-10-28 ai-gateway (TS-AIG-104) warstwa `implementation:wiring` — Karta logger-pattern-plain (LGP2) przeczy override w aig-invariants.md; karty z obcego stosu (Kysely, NestJS, DDD) nie rozstrzygają przypadków płaskiego serwisu.
