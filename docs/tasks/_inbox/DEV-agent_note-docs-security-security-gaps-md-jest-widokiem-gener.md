---
id: DEV-agent_note-docs-security-security-gaps-md-jest-widokiem-gener
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-20
last_seen: 2026-11-20
occurrences: 1
projects:
  - juz-ide-api-6
---

# DEV-agent_note-docs-security-security-gaps-md-jest-widokiem-gener

## Occurrences

- 2026-11-20 juz-ide-api-6 (TS-TOOLING-ERROR-CONTRACT-MIGRATION-001) run `wf_8edc96f3-8da` — docs/security/security-gaps.md jest widokiem generowanym i ignorowanym przez git (.gitignore:265), więc pozycja rundy naprawczej 'uruchom pnpm docs:views i dołącz widok' nie da się wykonać jako zmiana pliku; weryfikacja takiego widoku powinna sprawdzać plik luki w docs/security/gaps/.
