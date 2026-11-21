---
id: DEV-anl-053-application-result-log
status: proposed
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ANL-053
first_seen: 2026-11-18
last_seen: 2026-11-18
occurrences: 1
projects:
  - juz-ide-api
---

# DEV-anl-053-application-result-log

## Occurrences

- 2026-11-18 juz-ide-api (TS-TEST-LOAD-015) warstwa `application:result-log` — analiza dopisała wołającego nowej metody kontraktu (handlery w application) bez właściciela kontraktu (tokens.ts) w tej samej jednostce; typecheck warstwy application czerwony, BLOCKED_BY_PRIOR cause machine/plan
