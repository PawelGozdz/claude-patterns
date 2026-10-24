---
id: DEV-agent_note-runda-naprawcza-po-bramce-koncowej-kierowana-tylko
status: promoted
resolution: >
  ORC-131: kandydaci rundy naprawczej po bramce końcowej obejmują warstwy z layers_done; przy
  wznowieniu z samą warstwą testową ustalenia w kodzie produkcyjnym idą do warstwy-właściciela
  pliku, a nie do fallbacku z zakazem zmian kodu.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - juz-ide-api
---

# DEV-agent_note-runda-naprawcza-po-bramce-koncowej-kierowana-tylko

## Occurrences

- 2026-10-24 juz-ide-api (TS-SEC-SP-LOCATION-001) run `wf_04685e97-c0f` warstwa `testing` — Runda naprawcza po bramce końcowej kierowana tylko do warstwy testing (zakaz zmian kodu produkcyjnego): 5 z 6 ustaleń w plikach application/discovery/config/infrastructure wróciło bez zmian; poprawki final-gate powinny trafiać do warstwy właściciela pliku
