---
id: DEV-orc-090-api
status: dismissed
dismissed_reason: >
  Silnik zadziałał zgodnie z regułą: layers_scope zawęził warstwę api do dwóch plików, więc poprawka
  w app/main.py była poza zakresem i trafiła do raportu jako minor_finding bramki końcowej.
  Przyczyną jest zbyt wąski zakres w analizie TS-017 (ANL-038: pliki towarzyszące do layers_scope),
  nie błąd silnika.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-090
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-090-api

## Occurrences

- 2026-10-20 aegis-flow (TS-017) run `wf_d74fa55a-214` warstwa `api` — Zawężony zakres warstwy api (layers_scope: dwa pliki) uniemożliwił weryfikatorowi i implementerowi poprawkę w app/main.py, gdzie create_app odrzuca sink zwrócony przez record_settings_loaded, więc kotwica D5 nie żyje przez życie procesu; ustalenie wróciło jako minor_finding bramki końcowej zamiast jako praca warstwy.
