---
id: DEV-orc-083
status: dismissed
dismissed_reason: >
  Środowisko, nie silnik: unverified_scope wynika z reguły użytkownika „no auto test runs” kolidującej ze skryptem (testy nie mogły ruszyć) i z braku narzędzia Grep w subagencie tamtej sesji (agent security-e2e-verifier ma Grep w definicji). Bez zmiany reguły/narzędzi po stronie juz-ide-api-1 bramka końcowa będzie tu zawsze miała lukę; ścieżka stageForReview (ORC-084) dostarcza pliki do przeglądu. Do obserwacji.
trigger: no_go
rule_ref: ORC-083
first_seen: 2026-10-02
last_seen: 2026-10-02
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-083

## Occurrences

- 2026-10-02 juz-ide-api-1 (TS-REP-BETA-SIGNAL-REPORT-001) run `wf_e5f56f99-009` — Bramka końcowa NO_GO cause=machine: unverified_scope (vitest L1/L2 nie uruchomione przez regułę usera 'no auto test runs' kolidującą ze skryptem; brak narzędzia Grep w subagencie), zero naruszeń VETO
