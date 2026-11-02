---
id: DEV-orc-128-testing-geo-guardians
status: dismissed
dismissed_reason: >
  Błąd planu w analizie projektu (3.1): rejestr migracji (migrations/index.ts) oraz guardiany
  zależne od zmiany (home-point-write-surface, on-behalf-allowlist-snapshot) nie miały
  właściciela w jednostkach. To klasa ANL-045/046 (rejestracje i rejestry mają właściciela) i
  ANL-053 (zmiana kontraktu przecina warstwy); reguły istnieją od 2026-10-29, analiza ich nie
  zastosowała. Silnik zatrzymał przebieg zgodnie z ORC-128. 2026-11-02.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-128
first_seen: 2026-10-31
last_seen: 2026-10-31
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-128-testing-geo-guardians

## Occurrences

- 2026-10-31 juz-ide-api-3 (TS-GEO-QUICK-JOB-POINT-001) run `wf_ce110f21-e5d` warstwa `testing:geo-guardians` — Analiza nie objęła w jednostkach migrations/index.ts (rejestracja migracji) oraz guardianów home-point-write-surface i on-behalf-allowlist-snapshot; wyszło dopiero jako BLOCKED_BY_PRIOR na warstwie testów (2 zatrzymania). prepare ostrzega tylko o plikach z decyzji, nie o rejestrach i guardianach zależnych od zmian.
