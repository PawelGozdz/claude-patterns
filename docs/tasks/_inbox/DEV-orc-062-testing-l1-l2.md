---
id: DEV-orc-062-testing-l1-l2
status: proposed
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-testing-l1-l2

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_bc5bf913-10b` warstwa `testing:l1-l2` — Globalny guard PII (audience VETO3, information_schema całego schematu) czerwony po nowej kolumnie user_directory.email z innego kontekstu; plik testu poza layers_scope — implementer poprawnie zatrzymał się, potrzebna decyzja.

## Ocena (2026-09-26)

Nie błąd claude-patterns ani config projektu — mechanizm zadziałał zgodnie z
przeznaczeniem (bezpieczny halt zamiast dotykania asercji poza `layers_scope`
tego taska). To realna, otwarta decyzja biznesowa/danych w marketing-hub: czy
nowa kolumna `user_directory.email` (dodana przez inny kontekst) powinna być
uwzględniona w globalnym guardzie PII (audience VETO3), i kto aktualizuje ten
test. Zostawione jako `proposed` — wymaga decyzji zespołu marketing-hub, nie
zmiany w tym repo.

## Nota retro (2026-09-26)

Ten plik wydzielony ręcznie z `DEV-orc-062.md`, który przed naprawą sygnatury w
`report-deviation.mjs` (dodanie `--layer` do sygnatury dla znanych reguł) po
cichu dopisał to jako nowe wystąpienie pod już zamkniętym (`status: dismissed`)
rekordem `DEV-orc-062-domain-rules.md` — inny, niepowiązany problem z tego
samego projektu i tej samej reguły ORC-062, ale innej warstwy.
