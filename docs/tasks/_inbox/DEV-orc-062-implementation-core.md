---
id: DEV-orc-062-implementation-core
status: dismissed
dismissed_reason: >
  Proces zadziałał: analiza ai-gateway TS-AIG-066 pominęła drugiego konsumenta GatewayErrorKind, implementer słusznie zgłosił poza zakresem, naprawione przez --overrides (scope.dirs) + wznowienie. Luka jest w analizie, nie w silniku; do obserwacji, jeśli analiza będzie systematycznie pomijać konsumentów unii/enumów.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 1
projects:
  - ai-gateway
---

# DEV-orc-062-implementation-core

## Occurrences

- 2026-10-03 ai-gateway (TS-AIG-066) run `wf_09aa37b9-7a2` warstwa `implementation:core` — Analiza nie objęła drugiego wyczerpującego konsumenta GatewayErrorKind (REJECTED_KINDS w src/observability/metrics.ts); typecheck czerwony po zmianie core, implementer słusznie zgłosił poza zakresem. Naprawione przez --overrides (scope.dirs) + 1 wznowienie.
