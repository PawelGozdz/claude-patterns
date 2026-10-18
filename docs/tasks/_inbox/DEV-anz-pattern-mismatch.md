---
id: DEV-anz-pattern-mismatch
status: promoted
resolution: >
  Część aegis-flow naprawiona 2026-10-17: python/testing-pattern.md (fixture event_loop usunięty
  w pytest-asyncio 1.0, przykłady SQLAlchemy/domain.* oznaczone jako zależne od stosu). Część
  ai-os-bot (karty DDD/NestJS w patterns.always bloku node) przeniesiona do
  TASK-ORCH-CARDS-STACK-MISMATCH-001.
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-PATTERN-MISMATCH
first_seen: 2026-10-10
last_seen: 2026-10-17
occurrences: 2
projects:
  - aegis-flow
  - ai-os-bot
---

# DEV-anz-pattern-mismatch

## Occurrences

- 2026-10-17 ai-os-bot (BOT-030) — blocks/node.yml ładuje w patterns.always karty pisane pod DDD/NestJS (conventions-pattern, security-invariants-pattern, safe-error-propagation-pattern, logger-pattern-plain, repository-pattern-plain, controller-schema-pattern-plain). Repo ai-os-bot (Node/TS, discord.js, bez NestJS i DDD) dziedziczy je przez extends: node w lokalnym bloku bot-panel i wstrzykuje do promptów implementera i weryfikatorów (BOT-030: weryfikatorzy oceniali je tylko tam, gdzie pasują). Lokalny bot-panel.yml ma w always tylko bot-invariants. Propozycja: blok node bez kart DDD/NestJS w always albo patterns.exclude w extends. Niesprawdzone: czy materialize-runtime.mjs wspiera wykluczanie dziedziczonych kart.
- 2026-10-10 aegis-flow (TS-002) — python/testing-pattern.md: przykłady SQLAlchemy/domain.entities oraz session-scoped fixture event_loop (usunięty w pytest-asyncio 1.0); niedopasowane do aegis-flow (brak DDD/DB)
