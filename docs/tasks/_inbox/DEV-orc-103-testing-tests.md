---
id: DEV-orc-103-testing-tests
status: dismissed
dismissed_reason: >
  Błąd planu w analizie projektu (3.1): zadanie-pakiet z 8 kontekstami miało niekompletne
  units[].dirs (pliki produkcyjne i ok. 33 specyfikacje poza zakresem warstw), a migracje
  contract stały po czytnikach. To klasa ANL-038/ANL-053 (plik zmieniany przez decyzję musi
  mieć właściciela) oraz sygnałów pakietu (bundle). Silnik zatrzymał przebieg zgodnie z
  ORC-103; obejście --overrides zadziałało. 2026-11-02.
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ORC-103
first_seen: 2026-11-02
last_seen: 2026-11-02
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-103-testing-tests

## Occurrences

- 2026-11-02 juz-ide-api-3 (TS-GEO-HOME-POINT-CONTRACT-001) run `wf_d045d476-9ed` warstwa `testing:tests` — units[].dirs w analizie niekompletne (8 kontekstów, bundle): pliki produkcyjne i ~33 specyfikacje poza zakresem warstw; migracje contract (351-356) stoją po czytnikach, więc zepsucie wychodzi dopiero po zmianie generated.ts. Cztery zatrzymania BLOCKED_BY_PRIOR naprawione przez --overrides.
