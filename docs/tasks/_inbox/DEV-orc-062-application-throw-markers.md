---
id: DEV-orc-062-application-throw-markers
status: proposed
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - juz-ide-api-8
---

# DEV-orc-062-application-throw-markers

## Occurrences

- 2026-11-13 juz-ide-api-8 (TS-TOOLING-HANDLER-NO-THROW-001) run `wf_f899943e-529` warstwa `application:throw-markers` — Plan D5 zakłada osobny wcześniejszy commit znaczników wyjątków, a ratchet conformance liczy znacznik dodany w przebiegu jako exception-new i czeka na człowieka; warstwa throw-markers (znaczniki w 9 handlerach, jedyne ustalenie process-projection-chunk/handler.ts:259) nie może przejść automatycznie.
