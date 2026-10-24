---
id: DEV-agent_note-domain-application-implementer-bez-bash-nie-uruch
status: dismissed
dismissed_reason: >
  Brak Bash w domain-application-implementer jest celowy (disallowedTools: Bash, koszt wywołań
  powłoki). Typecheck i testy liczy sonda silnika, nie implementer. Brak StructuredOutput w
  rundzie naprawczej po bramce to osobna sprawa: ORC-131 rozszerzył kandydatów rundy o warstwy
  z layers_done.
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-agent_note-domain-application-implementer-bez-bash-nie-uruch

## Occurrences

- 2026-10-24 juz-ide-api-2 (TS-SEC-EVENT-GEOFILTER-ORACLE-001) run `wf_d4ca12c1-27f` warstwa `application:center-handlers` — domain-application-implementer bez Bash (nie uruchomił tsc/testów); runda naprawcza po bramce bez StructuredOutput
