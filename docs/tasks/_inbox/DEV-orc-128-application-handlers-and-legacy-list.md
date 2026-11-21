---
id: DEV-orc-128-application-handlers-and-legacy-list
status: proposed
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-128
first_seen: 2026-11-20
last_seen: 2026-11-20
occurrences: 1
projects:
  - juz-ide-api-5
---

# DEV-orc-128-application-handlers-and-legacy-list

## Occurrences

- 2026-11-20 juz-ide-api-5 (TS-ARCH-REQUIRE-USERID-ORG-001) run `wf_d52dcbfd-8e3` warstwa `application:handlers-and-legacy-list` — Skreślenie ostatnich wpisów legacy daje pusty files w tools/lint-ddd/eslint.ddd.config.mjs:386 i ESLint nie ładuje configu; plik poza zakresem warstwy, decyzja D4 zakazywała jego zmiany
