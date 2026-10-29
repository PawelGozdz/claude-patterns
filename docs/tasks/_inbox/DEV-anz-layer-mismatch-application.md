---
id: DEV-anz-layer-mismatch-application
status: promoted
resolution: >
  ANL-053 (2026-10-29): /analyze wpisuje do dirs jednostki zmieniającej sygnaturę portu,
  komendy albo zdarzenia także implementację i wołających z późniejszych warstw; reguła tylko
  w prompcie (docs/decisions/orchestrate-rule-history.md#anl-053). Dwa projekty:
  juz-ide-api-4, grant-flow.
trigger: analyze_note
category: plan
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - juz-ide-api-4
---

# DEV-anz-layer-mismatch-application

## Occurrences

- 2026-10-28 juz-ide-api-4 (TS-GEO-ADDRESS-LOOKUP-001) warstwa `application` — Zmiana sygnatury portu (application/interfaces) wymusza jednoczesną zmianę repozytorium (infrastructure) i wołających (application); przy checks: typecheck per warstwa i kolejności domain→application→infrastructure nie da się zachować zielonego typechecku między warstwami bez przesunięcia pliku infrastrukturalnego do jednostki warstwy application (ANL-038 mówi o dirs importujących, ale nie o przecięciu warstw)
