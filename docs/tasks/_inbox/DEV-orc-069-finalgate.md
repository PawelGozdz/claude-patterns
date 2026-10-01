---
id: DEV-orc-069-finalgate
status: dismissed
dismissed_reason: >
  Ten sam wzorzec co DEV-orc-069 (grant-flow, ai-os-bot) — bramka końcowa
  wymusiła NO_GO wyłącznie z powodu niepustego unverified_scope, mimo 0
  naruszeń VETO i obu czerwonych gate'ów potwierdzonych jako spoza zakresu
  zadania. Working as intended (ORC-069, bramka końcowa surowa, bez retry).
  Zatwierdzone ręcznie jako GO po niezależnej weryfikacji — decyzja projektowa
  (marketing-hub), nie zmiana silnika.
trigger: no_go
rule_ref: ORC-069
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-069-finalgate

## Occurrences

- 2026-09-27 marketing-hub (TS-MH-006) run `wf_5fb50a87-c5e` warstwa `finalGate` — Bramka końcowa (run wv5uqvxu3): 0 naruszeń VETO, oba czerwone gate'y (format:check, test:l2) potwierdzone jako spoza zakresu tego zadania; NO_GO wymuszony wyłącznie przez niepusty unverified_scope (luki pokrycia testami ->live/->retro, uwagi o współdzielonej infrastrukturze). Zatwierdzone ręcznie jako GO po niezależnej weryfikacji (L3 91/91, format:check czerwony tylko na 1 pliku spoza zadania), zastagowane z wykluczeniem 9 plików spoza zakresu (task file pkt 5 + final_gate pkt 6-7).
