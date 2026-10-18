---
id: DEV-no_go-bramka-koncowa-no-go-code-poprawki-rundy-2-impl
status: promoted
resolution: >
  Naprawione jako ORC-103 (2026-10-10): odcisk drzewa przed i po rundzie naprawczej
  (fixLeftTreeUnchanged) wykrywa naprawę zgłoszoną bez zmiany w drzewie. To dokładnie ten objaw
  (poprawki rundy 2 nie trafiły do repo).
trigger: no_go
rule_ref: null
first_seen: 2026-10-05
last_seen: 2026-10-05
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-no_go-bramka-koncowa-no-go-code-poprawki-rundy-2-impl

## Occurrences

- 2026-10-05 juz-ide-api-1 (TS-REP-NEIGHBOR-SIGNALS-001) run `wf_5659bf89-b11` warstwa `final-gate` — Bramka końcowa NO_GO (code): poprawki rundy 2 implementera nie trafiły do repo (drzewo czyste, brak commitów), 11/12 ustaleń rundy 1 bez zmian; wszystkie warstwy były w layers_done, więc runda naprawcza biegła tylko po bramce
