---
id: DEV-agent_note-wykrywanie-plikow-brudnych-przed-startem-ignoruje
status: dismissed
dismissed_reason: >
  Nieodtworzone 2026-10-31: prepare czyta git status --porcelain -uall, który zawiera pliki w
  indeksie. Lista z samym plikiem taska to ORC-132: kolejny prepare na tym samym HEAD uznaje
  pracę poprzednich prób (także staged) za pracę taska, a nie cudzą. Bramka końcowa bada całe
  drzewo względem bazy z założenia, bo weryfikuje zadanie, nie tylko ostatnią deltę.
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-30
last_seen: 2026-10-30
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-agent_note-wykrywanie-plikow-brudnych-przed-startem-ignoruje

## Occurrences

- 2026-10-30 juz-ide-api-3 (TS-GEO-DISTANCE-BUCKETS-001) run `wf_c319d992-336` warstwa `final-gate` — Wykrywanie plików brudnych przed startem ignoruje zmiany w indeksie (staged): lista zawiera tylko plik taska, mimo 22 plików w stagingu z poprzedniego przebiegu; bramka miesza już zbadaną pracę z nową deltą.
