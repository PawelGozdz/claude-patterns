---
id: DEV-agent_note-zmiany-auth-module-ts-i-user-registered-handler-sp
status: dismissed
dismissed_reason: >
  Kolejność jednostek i zakres plików to decyzja analizy TS-SEC-D0-FOLLOWUPS-001:
  auth.module.ts wydzielono do osobnej, końcowej jednostki module-wiring, więc czerwona
  kompilacja między jednostkami wynika z tombstone w dead-code. Zasadę dla analizy daje
  ANL-038 (decyzja usuwająca eksport wymaga w dirs także importerów albo jednostki, która je
  domknie). Silnik działał zgodnie z zakresem.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-agent_note-zmiany-auth-module-ts-i-user-registered-handler-sp

## Occurrences

- 2026-10-22 juz-ide-api-1 (TS-SEC-D0-FOLLOWUPS-001) run `wf_25230deb-cc6` warstwa `application:dead-code` — Zmiany auth.module.ts i user-registered.handler.spec.ts poza layers_scope jednostki; git rm musi iść razem z edycją modułu — kolejność jednostek wymusza kompilację czerwoną między warstwami.
