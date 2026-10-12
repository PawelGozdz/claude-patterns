---
id: DEV-orc-062-testing
status: proposed
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-10
last_seen: 2026-10-10
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-062-testing

## Occurrences

- 2026-10-10 juz-ide-api-1 (TS-AUTH-SMS-ERROR-MAPPING-001) run `wf_5ac31260-676` warstwa `testing` — Warstwa testing w gałęzi no-op (testy już w drzewie) pomija sondę checks, więc weryfikator nie ma dowodu uruchomienia; unverified_scope x3 bez drogi do GO_WITH_GAPS (probeHasGreenEvidence wymaga sondy) -> ESCALATE machine
