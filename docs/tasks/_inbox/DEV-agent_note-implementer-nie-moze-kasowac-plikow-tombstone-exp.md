---
id: DEV-agent_note-implementer-nie-moze-kasowac-plikow-tombstone-exp
status: dismissed
dismissed_reason: >
  Zachowanie zgodne z projektem: implementerzy nie kasują plików, a analiza
  TS-SEC-D0-FOLLOWUPS-001 (jednostka dead-code) wprost przewidywała tombstone w źródłach i git
  rm przez orkiestratora. Mapper błędów poza zakresem warstwy domain to zakres analizy
  (ORC-042: zgłoś, nie ruszaj). Przy powtórzeniu rekord otworzy się sam.
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-agent_note-implementer-nie-moze-kasowac-plikow-tombstone-exp

## Occurrences

- 2026-10-22 juz-ide-api-1 (TS-SEC-D0-FOLLOWUPS-001) run `wf_25230deb-cc6` warstwa `domain` — Implementer nie może kasować plików (tombstone export {} zamiast git rm); mapper błędów leży poza zakresem warstwy domain.
