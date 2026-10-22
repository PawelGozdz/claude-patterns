---
id: DEV-agent_note-d12-nie-zmieniac-statusu-api-kontra-d6-kody-d
status: dismissed
dismissed_reason: >
  Bramka końcowa zadziałała: wykryła, że implementer zmienił mapper 400→422 wbrew
  rules/nestjs-ddd/error-mapper.md, bo decyzje D12 (nie zmieniać statusu API) i D6 (kody D_*
  tylko dla 409/422 w web) nie obejmowały tego przypadku. To luka konkretnej analizy
  grant-flow TS-UI-009, rozstrzygana decyzją człowieka, nie regułą silnika. Przy powtórzeniu
  rekord otworzy się sam.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-d12-nie-zmieniac-statusu-api-kontra-d6-kody-d

## Occurrences

- 2026-10-22 grant-flow (TS-UI-009) run `wf_dbfdcd1a-768` warstwa `final-gate` — D12 (nie zmieniać statusu API) kontra D6 (kody D_* tylko dla 409/422 w web): implementer zmienił mapper 400→422 dla D_PROJECT_INVALID_NAME/BUDGET wbrew rules/nestjs-ddd/error-mapper.md; brak decyzji obejmującej ten przypadek
