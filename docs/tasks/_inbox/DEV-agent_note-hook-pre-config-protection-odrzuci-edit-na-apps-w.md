---
id: DEV-agent_note-hook-pre-config-protection-odrzuci-edit-na-apps-w
status: dismissed
dismissed_reason: >
  Hook pre:config-protection (ECC) działa zgodnie z przeznaczeniem: nie pozwala osłabiać
  konfiguracji lintu. Kształt override selektora ról w apps/web/.eslintrc.json to decyzja
  grant-flow, edycję robi człowiek.
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-hook-pre-config-protection-odrzuci-edit-na-apps-w

## Occurrences

- 2026-10-25 grant-flow (TS-UI-010) run `wf_c352741c-b42` warstwa `web:web-foundation` — Hook pre:config-protection odrzucił Edit na apps/web/.eslintrc.json (zdublowany "error" w no-restricted-syntax); poprawka mechaniczna niewykonana, selektor ról wymaga decyzji o kształcie override.
