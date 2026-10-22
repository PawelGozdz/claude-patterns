---
id: DEV-orc-098
status: promoted
resolution: >
  ORC-121 (2026-10-22): analiza ma final_checks: [..] dołączane do checks bramki końcowej (test:l3, skrypty
  taska po decyzji D3); sonda po naprawie rundy bramki liczy lint: fail jak czerwień; prompt rundy 2
  (finalRoundExtra) mówi wprost, które pozycje implementer pominął jako spoza zakresu (poprawki w KANBAN/TM
  nie należą do żadnej warstwy kodu i nadal robi je człowiek).
trigger: no_go
category: verifier
sources:
  - orchestrate
rule_ref: ORC-098
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 2
projects:
  - marketing-hub
---

# DEV-orc-098

## Occurrences

- 2026-10-22 marketing-hub (TS-MH-022) run `wf_a6682904-bd3` — Sonda bramki końcowej uruchomiła typecheck/lint/test/format/validate:br/build, ale nie test:l3 ani własnych skryptów taska test:gateway/test:harness, których wymaga D3 analizy po zmianie vitest-e2e.config.ts; weryfikator uruchamiał je sam z własnego budżetu. Lista checks bramki nie uwzględnia obowiązków z uzasadnień decyzji
- 2026-10-22 marketing-hub (TS-MH-022) run `wf_a9e9656e-280` — Bramka końcowa NO_GO cause=machine mimo zera naruszeń: runda naprawcza (poprawka 4, przeniesienie authorization-fixtures do test/shared) wprowadziła 28 błędów import/order i 5 plików bez prettier, a sonda rundy 2 była czerwona; poprawki 5/6 (KANBAN, TM §8) leżały poza dirs każdej jednostki i runda naprawcza ich nie wykonała, choć prompt rundy 2 podał je jako poprawione
