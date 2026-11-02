---
id: DEV-orc-099-testing-e2e-services
status: dismissed
dismissed_reason: >
  Nieodtworzone 2026-10-31: dwie linie FAIL jednego pliku vitest przy "Test Files 1 failed"
  dają zgodną liczbę (testFailExpectedCount liczy unikalne ścieżki), a prawdziwy log przebiegu
  nie został zachowany, więc przyczyny rozjazdu nie ma jak wskazać. Silnik loguje teraz liczby
  przy każdej odmowie odroczenia (testDeferralMismatch, ORC-099 uzupełnienie); kolejne
  wystąpienie otworzy rekord z danymi.
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-099
first_seen: 2026-10-30
last_seen: 2026-10-30
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-099-testing-e2e-services

## Occurrences

- 2026-10-30 juz-ide-api-3 (TS-GEO-DISTANCE-BUCKETS-001) run `wf_917c1acc-0ed` warstwa `testing:e2e-services` — Odroczenie czerwonych testów do późniejszej warstwy nie zadziałało: vitest drukuje po jednej linii FAIL na test (2 linie, 1 plik), a testFilesFailed=1; testFailExpectedCount nie zgadza się z podsumowaniem (plus artefakt parametru w testFailFiles). Obejście: checks bez test w warstwach wcześniejszych niż właściciel pliku.
