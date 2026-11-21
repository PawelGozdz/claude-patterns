---
id: DEV-agent_note-polecenie-jedno-read-na-ca-y-plik-kart-w-prompci
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-21
last_seen: 2026-11-21
occurrences: 1
projects:
  - juz-ide-api-6
---

# DEV-agent_note-polecenie-jedno-read-na-ca-y-plik-kart-w-prompci

## Occurrences

- 2026-11-21 juz-ide-api-6 (TS-TOOLING-ERROR-CONTRACT-MIGRATION-001) run `wf_8b18b815-0f0` — Polecenie 'jedno Read na cały plik kart' w prompcie bramki końcowej jest niewykonalne: Read zwraca tylko linie 1-688 z 2666 (limit 25000 tokenów) pliku cards-__all.md, więc karty od query-handler dalej były czytane tylko selektywnie.
