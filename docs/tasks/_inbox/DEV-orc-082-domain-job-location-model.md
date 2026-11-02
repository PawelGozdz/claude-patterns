---
id: DEV-orc-082-domain-job-location-model
status: dismissed
dismissed_reason: >
  Dwie części. (1) Sonda nie wykonała drugiego polecenia z grepem po error TS (tsErrors
  puste), więc odroczenie ORC-082 nie zadziałało: nieodtworzone, ale silnik zapisuje teraz
  powód w logu i report.warnings (typecheckDeferralMismatch, uzupełnienie ORC-082); kolejne
  wystąpienie otworzy rekord z danymi. (2) Testy w __tests__ zamkniętej warstwy nie są
  odraczalne na warstwie testowej z założenia (ORC-093/099: plik ma właściciela w warstwie,
  która już zamknęła GO). 2026-11-02.
trigger: halt
category: infra
sources:
  - orchestrate
rule_ref: ORC-082
first_seen: 2026-10-31
last_seen: 2026-10-31
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-082-domain-job-location-model

## Occurrences

- 2026-10-31 juz-ide-api-3 (TS-GEO-QUICK-JOB-POINT-001) run `wf_67c55201-ef8` warstwa `domain:job-location-model` — Sonda typecheck nie wykonała grepa po error TS (tsErrors puste), więc odroczenie ORC-082 nie zadziałało i warstwa domain dostała BLOCKED_BY_PRIOR; podobnie testy w __tests__ warstwy zamkniętej nie są odraczalne (ORC-093/099) na warstwie testing:geo-guardians.
