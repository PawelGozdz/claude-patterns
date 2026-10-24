---
id: DEV-agent_note-karty-regu-python-nie-maja-powierzchni-w-warstwie
status: dismissed
dismissed_reason: >
  Zgodne z projektem: warstwa config w aegis-flow to schemat i YAML (dirs config/), więc karty Python SI/I nie mają tam czego sprawdzać. Weryfikacja bez trafień jest tu normalna, a kod z tych kart sprawdzają warstwy engine i api. Zmiana nie jest potrzebna.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-karty-regu-python-nie-maja-powierzchni-w-warstwie

## Occurrences

- 2026-10-20 aegis-flow (TS-003) run `wf_0a0766cf-6dd` warstwa `config:principals-config` — Karty reguł Python nie mają powierzchni w warstwie dokumentacja/config/.gitignore; SI1-SI5 i I1-I6 nie miały czego sprawdzać.
