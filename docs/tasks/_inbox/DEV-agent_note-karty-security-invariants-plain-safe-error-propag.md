---
id: DEV-agent_note-karty-security-invariants-plain-safe-error-propag
status: dismissed
dismissed_reason: >
  Karty plain (security-invariants, safe-error-propagation, repository, controller-schema)
  wybiera własny blok ./bot-panel projektu w patterns.always, a agent poprawnie nie zastosował
  ich do konfiguracji klienta LLM. Koszt to kilka kart w kontekście, bez skutku na wynik;
  ORC-136 dotyczył bloku node, nie panelu projektu. 2026-11-02.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-01
last_seen: 2026-11-01
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-agent_note-karty-security-invariants-plain-safe-error-propag

## Occurrences

- 2026-11-01 ai-os-bot (BOT-045) run `wf_617071c6-9ef` warstwa `implementation:gateway-config` — Karty security-invariants-plain, safe-error-propagation-plain, repository-pattern-plain, zod-schema-validation dotyczą HTTP/Kysely/Zod i nie mają zastosowania do konfiguracji klienta LLM; testing-pyramid oceniona pobieżnie (brak warstw Specification)
