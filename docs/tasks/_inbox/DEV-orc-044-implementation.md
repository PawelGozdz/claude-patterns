---
id: DEV-orc-044-implementation
status: promoted
resolution: >
  Karty DDD/NestJS w patterns.always dla projektu Node/TS to ten sam objaw, co w
  TASK-ORCH-CARDS-STACK-MISMATCH-001 (dopisane jako wystąpienie 11, 2026-10-18),
  wraz z uwagą o braku bot-invariants_summary.md — karta ma wiążące wyjątki (B3, B8,
  B10), więc streszczenie dopiero razem z decyzją, które karty zostają w always.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-044
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-044-implementation

## Occurrences

- 2026-10-18 ai-os-bot (BOT-037) run `wf_61d51583-bc2` warstwa `implementation` — Karty always z runtime.yml (conventions, security-invariants, safe-error-propagation, logger-pattern-plain, zod-schema-validation) to szablony DDD/NestJS/Fastify; weryfikatory obu warstw BOT-037 (czysty helper czasowy) zgłosiły, ze nie mialy tu czego sprawdzac. Dodatkowo prepare ostrzega: bot-invariants.md nie ma karty bot-invariants_summary.md (do promptu idzie pelny plik 17 KB).
