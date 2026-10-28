---
id: DEV-agent_note-karta-logger-pattern-plain-lgp2-createlogger-na-p
status: dismissed
dismissed_reason: >
  LGP2 jest nadpisana celowo przez override w aig-invariants (logger z compose.ts). Karty
  conventions(DDD) w ai-gateway znikną po materializacji: ORC-136 (2026-10-24) zdjął je z
  bloku node, a runtime.yml projektu pochodzi z 1ca2574, sprzed tej zmiany. Po zakończeniu
  TS-AIG-104: node scripts/materialize-runtime.mjs /opt/projects/ai-gateway.
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

# DEV-agent_note-karta-logger-pattern-plain-lgp2-createlogger-na-p

## Occurrences

- 2026-10-28 ai-gateway (TS-AIG-104) run `wf_451d6c4c-9a7` warstwa `implementation:llm-signals` — Karta logger-pattern-plain LGP2 (createLogger na poziomie modułu) jest nadpisana override w aig-invariants (logger wstrzykiwany z compose.ts); karty repository/controller-schema/zod/conventions(DDD) nie dotyczą warstwy
