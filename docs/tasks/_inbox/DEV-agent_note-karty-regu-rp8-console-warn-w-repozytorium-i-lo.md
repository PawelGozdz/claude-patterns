---
id: DEV-agent_note-karty-regu-rp8-console-warn-w-repozytorium-i-lo
status: promoted
resolution: >
  Karta infrastructure/repository-pattern (RP8): ostrzeżenie o nieznanym evencie idzie przez
  this.logger.warn, gdy repozytorium ma LOGGER_SERVICE (LOG1/N5 wygrywają z console.*);
  console.warn tylko w repozytorium bez loggera (RP2-EXCEPTION), bez dodawania DI wyłącznie
  dla tego ostrzeżenia. Przykład w karcie i wiersz tabeli weryfikatora zaktualizowane.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-agent_note-karty-regu-rp8-console-warn-w-repozytorium-i-lo

## Occurrences

- 2026-10-22 juz-ide-api-1 (TS-SEC-D0-FOLLOWUPS-001) run `wf_25230deb-cc6` warstwa `infrastructure:sessions-write` — Karty reguł RP8 (console.warn w repozytorium) i LOG1/N5 (zakaz console) nie rozstrzygają kolejności w repozytorium — implementer zostawił RP8.
