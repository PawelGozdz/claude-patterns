---
id: DEV-agent_note-nowe-wymagane-pole-settings-check-profiles-path-wy
status: dismissed
dismissed_reason: >
  ORC-042 zadziałał: plik spoza zakresu (docker-compose) zgłoszony zamiast edytowany. ANL-038
  już każe wpisywać pliki towarzyszące (compose, .env.example) do dirs jednostki; to luka
  planu aegis-flow, nie silnika.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-nowe-wymagane-pole-settings-check-profiles-path-wy

## Occurrences

- 2026-10-24 aegis-flow (TS-007) run `wf_cc338944-276` warstwa `api:startup` — Nowe wymagane pole Settings.check_profiles_path wymaga wpisu w docker-compose (AEGISFLOW_CHECK_PROFILES_PATH); plik poza zakresem app/, nie zmieniony.
