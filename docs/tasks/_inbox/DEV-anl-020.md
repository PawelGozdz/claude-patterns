---
id: DEV-anl-020
status: proposed
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANL-020
first_seen: 2026-10-15
last_seen: 2026-10-15
occurrences: 1
projects:
  - grant-flow
---

# DEV-anl-020

## Occurrences

- 2026-10-15 grant-flow (TS-UI-007-dashboard) — Stage threat-model nie trafił na when: (brak słów auth/pii/token itd.), a zadanie TS-UI-007 pokazuje kwoty, stawki i dane z godzin innych osób; TM zapisany z powodu widocznego ryzyka. Regex w analyze.panel nie obejmuje widoczności finansów/kwot/stawek (np. koszt|przychód|marża|stawk|read.report).
