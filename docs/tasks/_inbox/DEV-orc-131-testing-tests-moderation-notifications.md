---
id: DEV-orc-131-testing-tests-moderation-notifications
status: proposed
trigger: no_go
category: infra
sources:
  - orchestrate
rule_ref: ORC-131
first_seen: 2026-11-15
last_seen: 2026-11-15
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-131-testing-tests-moderation-notifications

## Occurrences

- 2026-11-15 juz-ide-api-3 (TS-ARCH-RP12-SHARED-JOBS-001) run `wf_3e71a98f-daf` warstwa `testing:tests-moderation-notifications` — Bramka przyrostu ORC-035 dała ESCALATE (przyrost 0) w kolejnej próbie, choć pierwsza próba tej warstwy zmierzyła 18 nowych bloków (sonda a370bd69); ORC-131(a) nie zadziałał. Testy zielone (EXIT 0), typecheck zielony.
