---
id: DEV-blocked_by_prior-plik-wymagany-przez-decyzje-mock-mockuserresidenc
status: dismissed
dismissed_reason: >
  Luka zakresu w analizie projektu (3.1), nie silnik: plik mocka
  MockUserResidenceQueryRepository nie należał do żadnej jednostki. Naprawione w
  TS-SEC-D0-BETA-HARDENING-001.analysis.md (juz-ide-api-1): tests-geo-revoke ma go w dirs.
  Odroczenie czerwieni do późniejszej warstwy (ORC-099) działa, gdy plik ma właściciela.
trigger: blocked_by_prior
category: typecheck
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-19
last_seen: 2026-10-19
occurrences: 1
projects:
  - juz-ide
---

# DEV-blocked_by_prior-plik-wymagany-przez-decyzje-mock-mockuserresidenc

## Occurrences

- 2026-10-19 juz-ide (TS-SEC-D0-BETA-HARDENING-001) warstwa `domain:pr4-geo-revoke-port` — Plik wymagany przez decyzję (mock MockUserResidenceQueryRepository) nie należał do żadnej jednostki, więc czerwień typecheck nie została odroczona do późniejszej warstwy (ORC-099) i zablokowała warstwę domeny. Luka zakresu analizy; naprawa: dodanie pliku do jednostki testowej.
