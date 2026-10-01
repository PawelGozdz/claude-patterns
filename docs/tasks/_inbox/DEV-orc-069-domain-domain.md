---
id: DEV-orc-069-domain-domain
status: promoted
resolution: >
  Naprawione 2026-09-26 jako ORC-070 (docs/decisions/orchestrate-rule-history.md#orc-070):
  `decideVerdict()` odfiltrowuje teraz pozycje `unverified_scope`, które leżą wyłącznie w dirs
  INNEJ warstwy tego samego przebiegu (dokładnie ten przypadek — domain/repositories/ i
  error-mapper wiring należące do application/infrastructure-persistence). Trzecia pozycja
  (duplikat weryfikacji z innej jednostki/przebiegu) POZOSTAJE poza zasięgiem tego filtra —
  nie da się mechanicznie odróżnić duplikatu od realnej luki bez historii poprzednich jednostek.
trigger: halt
rule_ref: ORC-069
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-069-domain-domain

## Occurrences

- 2026-09-26 grant-flow (TS-RATE-003) run `wf_5312821d-f64` warstwa `domain:domain` — Layer domain:domain ESCALATE_AND_HALT after 3 attempts: verifier returned GO with non-empty unverified_scope on attempts 2 and 3 (violations: []). Diagnostic re-check of journal + disk state confirmed the aggregate/entity/events/errors required by this unit are complete and correct. Two of the three unverified_scope items (domain/repositories/, error-mapper wiring) are by design out of this unit's layers_scope.dirs and owned by other units in the same run (application, infrastructure-persistence); the third (VO rule-by-rule re-walk) duplicates verification already done in a prior unit/run. ORC-069's blanket 'non-empty unverified_scope = not clean GO' treatment consumed the retry budget and forced escalation on what was, on inspection, a false positive.
