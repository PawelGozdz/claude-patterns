---
id: DEV-agent_note-karta-logger-pattern-summary-md-n4-twierdzi-ze-lo
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-11
last_seen: 2026-11-11
occurrences: 1
projects:
  - juz-ide-api-6
---

# DEV-agent_note-karta-logger-pattern-summary-md-n4-twierdzi-ze-lo

## Occurrences

- 2026-11-11 juz-ide-api-6 (TS-OBS-LOG-PII-001) — Karta logger-pattern_summary.md N4 twierdzi, że LOGGER_SERVICE redaguje PII przez REDACTION_SERVICE; po TS-OBS-LOG-PII-001 redakcję robi sanitizeLogRecord w formatters.log (jeden punkt dla obu ścieżek loggera), a ConfiguredLoggerService nadal woła RedactionService. Brak reguły o jednym punkcie redakcji; pino 10 woła serializers PO formatters.log (serializer req, bindingi child i msg omijają sanitizer).
