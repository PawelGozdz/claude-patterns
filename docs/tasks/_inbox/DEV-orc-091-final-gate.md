---
id: DEV-orc-091-final-gate
status: promoted
resolution: >
  Naprawione jako ORC-103 (2026-10-10): odcisk drzewa przed i po rundzie naprawczej; naprawa bez zmiany plików = ostrzeżenie, bez ponownej bramki.
trigger: agent_note
rule_ref: ORC-091
first_seen: 2026-10-09
last_seen: 2026-10-09
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-091-final-gate

## Occurrences

- 2026-10-09 marketing-hub (TS-MH-007) run `wf_4409871d-8ee` warstwa `final-gate` — Runda naprawcza po NO_GO bramki końcowej zgłosiła naprawę 13 ustaleń, ale żaden plik nie zmienił mtime (bramka to wykryła). Implementer rundy nie zapisał nic, a silnik nie złapał rozjazdu raport vs drzewo przed ponowną bramką; marnuje przebieg i wymaga ręcznego obejścia.
