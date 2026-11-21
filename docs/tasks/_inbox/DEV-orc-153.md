---
id: DEV-orc-153
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: ORC-153
first_seen: 2026-11-08
last_seen: 2026-11-20
occurrences: 49
projects:
  - juz-ide-api-2
  - juz-ide-api-6
  - juz-ide-api-8
  - juz-ide-api-1
  - juz-ide-api-7
  - juz-ide-api-3
  - juz-ide-api-5
  - juz-ide-mobile-app
  - juz-ide-mobile-app-3
  - juz-ide-api-4
  - my-intelligence
  - juz-ide-api
---

# DEV-orc-153

## Occurrences

- 2026-11-20 juz-ide-api-3 (TS-OBS-LOG-ERROR-TEXT-USER-ORG-001) — Workflow niedostępny na polecenie właściciela (orkiestrator-10), tryb ręczny
- 2026-11-20 juz-ide-api-1 (TS-TOOLING-SEP-MESSAGE-SWEEP-001) — Workflow niedostepny, tryb reczny (zgodnie z polecenia wlasciciela)
- 2026-11-20 juz-ide-api-2 (TS-ARCH-REQUIRE-USERID-CC-001) — Workflow niedostępny, tryb ręczny (polecenie właściciela sesji)
- 2026-11-19 juz-ide-api (TS-OBS-LOG-ERROR-TEXT-AUTH-PRICING-001) — Workflow niedostępny (operator: odpowiedź No na dialog), tryb ręczny
- 2026-11-19 juz-ide-api-3 (TS-TOOLING-LINT-COVERAGE-GAPS-001) — Workflow niedostępny (dialog odrzucony wg instrukcji operatora), tryb ręczny
- 2026-11-19 juz-ide-api-2 (TS-ARCH-REQUIRE-USERID-001) — Workflow niedostępny (decyzja operatora: dialog Run a dynamic workflow = No), tryb ręczny
- 2026-11-19 juz-ide-api-1 (TS-INFRA-CI-LINT-DDD-001) — Workflow niedostępny (dialog odrzucony zgodnie z regułą operatora), tryb ręczny
- 2026-11-19 juz-ide-api-3 (TS-ARCH-RP12-ENFORCE-ERROR-001) — Workflow niedostępny (dialog odrzucony na polecenie operatora), tryb ręczny
- 2026-11-19 juz-ide-api-4 (TS-OBS-LOG-ERROR-TEXT-NE-001) — Workflow niedostepny (dialog Run a dynamic workflow odrzucony na polecenie operatora), tryb reczny
- 2026-11-19 juz-ide-api (TS-OBS-LOG-ERROR-TEXT-CC-AUTHZ-001) — Workflow niedostepny (dialog Run a dynamic workflow odrzucony), tryb reczny
- 2026-11-18 juz-ide-api (TS-AUTH-SYSTEM-KEY-MIGRATION-PORTS-001) — Workflow niedostepny z decyzji sesji (dialog = No), tryb reczny
- 2026-11-18 juz-ide-api-5 (TS-OBS-LOG-ERROR-OBJECT-001) — Workflow niedostepny, tryb reczny (decyzja wlasciciela: dialog Run a dynamic workflow = No)
- 2026-11-18 juz-ide-api-3 (TS-ARCH-RP12-CONTEXT-INFRA-001) — Workflow niedostepny (dialog dynamic workflow odrzucony na polecenie operatora), tryb reczny
- 2026-11-18 juz-ide-api-2 (TS-TOOLING-DOMAIN-INFRA-IMPORT-CLEANUP-001) — Workflow niedostępny na polecenie operatora, tryb ręczny
- 2026-11-18 juz-ide-api-4 (TS-ARCH-RP12-APP-PORTS-001) — Workflow niedostępny (dialog dynamic workflow odrzucony przez operatora), tryb ręczny
- 2026-11-12 juz-ide-api-3 (TS-OBS-ERRORS-001) — Workflow odrzucony (dialog), tryb ręczny
- 2026-11-11 juz-ide-api-2 (TS-INFRA-IDEMPOTENCY-003) — Workflow niedostępny (dialog Run a dynamic workflow z jedyną opcją No), przebieg w trybie ręcznym
- 2026-11-11 juz-ide-api-8 (TS-TOOLING-DOMAIN-ERROR-CONTRACT-001) — Workflow niedostępny (dialog Run a dynamic workflow bez opcji zgody), tryb ręczny wg orchestrate-manual-mode.md
- 2026-11-11 juz-ide-api-5 (TS-GDPR-ERASURE-RETRY-ALERT-001) — Workflow niedostepny (dialog Run a dynamic workflow odrzucony), tryb reczny
- 2026-11-11 my-intelligence (TS-072b) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-11 juz-ide-api-5 (TS-GDPR-ERASURE-ROUTES-REMAINING-001) — Workflow niedostępny (dialog dynamic workflow odrzucony, skrypt 342 KB), tryb ręczny wg orchestrate-manual-mode.md; jednostki vouch dopisane ręcznie (analiza ich nie miała)
- 2026-11-11 juz-ide-api-8 (TS-TOOLING-004) — Workflow niedostępny (skrypt ~300 KB, dialog zatwierdzenia niedostępny), tryb ręczny
- 2026-11-11 juz-ide-api-3 (TS-OBS-LOG-LINE-001) — Workflow niedostępny (skrypt ~380 KB, zatwierdzenie dynamic workflow odrzucone), tryb ręczny wg orchestrate-manual-mode.md
- 2026-11-11 juz-ide-api-2 (TS-INFRA-CI-HOOKS-FIX-001) — Workflow niedostępny (skrypt ~300 KB, dialog bez opcji zatwierdzenia), tryb ręczny
- 2026-11-11 juz-ide-api-4 (TS-OBS-ALERTING-001) — Workflow niedostępny (dialog odrzucony, skrypt 362 KB), tryb ręczny
- 2026-11-11 juz-ide-api-7 (TS-AUTH-ANONYMIZATION-CRON-RESULT-COUNT-001) — Workflow niedostępny (skrypt ~290 KB, dialog zatwierdzenia odrzucony), tryb ręczny
- 2026-11-11 juz-ide-api-6 (TS-OBS-LOG-PII-001) — Workflow niedostępny (skrypt ~327 KB, zatwierdzenie dynamic workflow odrzucone/niedostępne), tryb ręczny
- 2026-11-11 juz-ide-api-1 (TS-GROUPS-UNANSWERED-PREDICATE-001) — Workflow niedostępny (dialog Run a dynamic workflow odrzucony, skrypt ~300 KB), tryb ręczny
- 2026-11-11 juz-ide-mobile-app-3 (PUBLISH-LOCATION-CONSENT-001) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-11 juz-ide-mobile-app (JOB-PUBLISH-WITH-REACH-001) — Workflow niedostepny (dialog odrzucony), tryb reczny
- 2026-11-09 juz-ide-api-5 (TS-MOD-HANDLER-OUTBOX-SWALLOW-001) run `manual-20261109` — Workflow niedostępny, tryb ręczny
- 2026-11-09 juz-ide-api-7 (TS-GEO-LOCATION-INVENTORY-JSONB-001) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-09 juz-ide-api-8 (TS-INFRA-CLI-RUNNER-001) — Workflow niedostępny (dialog odrzucony przez człowieka), tryb ręczny wg orchestrate-manual-mode.md
- 2026-11-09 juz-ide-api-3 (TS-AUTH-CRON-REPO-001) — Workflow niedostępny (odrzucony dialog), tryb ręczny na polecenie człowieka
- 2026-11-09 juz-ide-api-2 (TS-API-CACHE-CONTROL-SELECTED-GETS-001) — Workflow niedostępny (odrzucony dialog), tryb ręczny na polecenie człowieka
- 2026-11-09 juz-ide-api-6 (TS-ARCH-OUTBOX-ERASE-REMAINING-IDS-001) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-09 juz-ide-api-1 (TS-GROUPS-BANNED-MEMBER-WRITE-001) — Workflow niedostępny (dialog odrzucony przez użytkownika), tryb ręczny
- 2026-11-08 juz-ide-api-8 (TS-INFRA-IMAGE-HARDENING-002) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-08 juz-ide-api-5 (TS-GROUPS-PENDING-EDIT-FENCING-001) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-08 juz-ide-api-2 (TS-INFRA-MIGRATION-ORDER-GUARD-001) — Workflow niedostępny (dialog odrzucony przez operatora), tryb ręczny
- 2026-11-08 juz-ide-api-1 (TS-AUTH-DEACTIVATION-MAIL-OUTBOX-001) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-08 juz-ide-api-3 (TS-AUTHZ-CACHE-INVALIDATE-RACE-001) — Workflow niedostepny (dialog odrzucony przez uzytkownika), tryb reczny
- 2026-11-08 juz-ide-api-5 (TS-LS-NONRESIDENT-REMOVE-001) — Workflow niedostepny (dialog odrzucony), tryb reczny wg orchestrate-manual-mode.md
- 2026-11-08 juz-ide-api-3 (TS-GDPR-ANNOUNCEMENTS-ERASURE-ROUTE-001) — Workflow niedostępny (dialog odrzucony), tryb ręczny wg docs/orchestrate-manual-mode.md
- 2026-11-08 juz-ide-api-7 (TS-GDPR-PHONE-ERASURE-001) — Workflow niedostepny (dialog odrzucony), tryb reczny
- 2026-11-08 juz-ide-api-1 (TS-GDPR-AUDIT-LOG-PII-001) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-08 juz-ide-api-8 (TS-INFRA-TRUST-PROXY-RAW-XFF-001) — Workflow niedostepny (dialog odrzucony), tryb reczny
- 2026-11-08 juz-ide-api-6 (TS-MOD-REPORT-INTAKE-001-engagement-report-to-moderation-queue) — Workflow niedostępny (dialog odrzucony), tryb ręczny
- 2026-11-08 juz-ide-api-2 (TS-QJ-CONTACT-DISCLOSURE-001) — Workflow niedostępny (dialog odrzucony przez operatora), tryb ręczny
