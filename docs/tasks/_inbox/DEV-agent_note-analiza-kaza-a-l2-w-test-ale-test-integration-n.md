---
id: DEV-agent_note-analiza-kaza-a-l2-w-test-ale-test-integration-n
status: promoted
resolution: >
  ANL-044: analiza sprawdza w configu runnera (vitest/jest include), że katalog nowych testów
  jest objęty; brak pokrycia to decyzja (zmiana configu albo inny katalog). Reguła tylko w
  prompcie; przyczyna zatrzymania to wniosek z opisu zgłoszenia, bez dziennika przebiegu
  wf_d4ca12c1-27f.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-agent_note-analiza-kaza-a-l2-w-test-ale-test-integration-n

## Occurrences

- 2026-10-24 juz-ide-api-2 (TS-SEC-EVENT-GEOFILTER-ORACLE-001) run `wf_d4ca12c1-27f` warstwa `testing:guardians-l1-l3` — Analiza kazała L2 w test/, ale test/integration/ nie jest w include żadnego configu vitest; plan warstwy testing nie przewidział zakresu src/shared/application/reach/__tests__/ (guardiany z allowlistami) — halt BLOCKED_BY_PRIOR w 1. przebiegu
