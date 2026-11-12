---
id: DEV-agent_note-agent-bramki-koncowej-security-e2e-verifier-zapi
status: proposed
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-11
last_seen: 2026-11-11
occurrences: 1
projects:
  - juz-ide-api-6
---

# DEV-agent_note-agent-bramki-koncowej-security-e2e-verifier-zapi

## Occurrences

- 2026-11-11 juz-ide-api-6 (TS-OBS-LOG-PII-001) — Agent bramki końcowej (security-e2e-verifier) zapisał pamięć agenta (.claude/agent-memory, MEMORY.md) mimo briefu 'tylko czytaj'; sam cofnął przed werdyktem (git status czysty, hash drzewa niezmieniony). Definicja agenta powinna zabraniać zapisów poza plikiem roboczym w trybie bramki.
