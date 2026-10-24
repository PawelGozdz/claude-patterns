---
id: DEV-orc-044-implementation
status: promoted
resolution: >
  Karty DDD/NestJS w patterns.always dla projektu Node/TS to ten sam objaw, co w
  TASK-ORCH-CARDS-STACK-MISMATCH-001 (wdrożone 2026-10-24 jako ORC-136, commit 11de3f4) (dopisane jako wystąpienie 11, 2026-10-18),
  wraz z uwagą o braku bot-invariants_summary.md — karta ma wiążące wyjątki (B3,
  B8, B10), więc streszczenie dopiero razem z decyzją, które karty zostają w
  always.
  Dopisane 2026-10-20 (12) do TASK-ORCH-CARDS-STACK-MISMATCH-001: ai-os-bot BOT-039, weryfikatory
  implementation i testing dostały karty NestJS/DDD/HTTP bez zastosowania do zmiany w core/safety;
  bot-invariants.md nadal bez karty _summary (decyzja razem z wyborem kart w always).
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-044
first_seen: 2026-10-18
last_seen: 2026-10-20
occurrences: 2
projects:
  - ai-os-bot
reopened_at: 2026-10-20
reopened_from_status: promoted
---

# DEV-orc-044-implementation

## Occurrences

- 2026-10-20 ai-os-bot (BOT-039) run `wf_a822ae65-d24` warstwa `implementation` — Weryfikatory warstw implementation i testing: karty conventions/security-invariants/safe-error-propagation/zod-schema/testing-pyramid (stos NestJS/DDD/HTTP) trafiły do promptu, a nie mają zastosowania do zmiany w core/safety; bot-invariants.md bez karty _summary (pełny plik 17,6 KB)
- 2026-10-18 ai-os-bot (BOT-037) run `wf_61d51583-bc2` warstwa `implementation` — Karty always z runtime.yml (conventions, security-invariants, safe-error-propagation, logger-pattern-plain, zod-schema-validation) to szablony DDD/NestJS/Fastify; weryfikatory obu warstw BOT-037 (czysty helper czasowy) zgłosiły, ze nie mialy tu czego sprawdzac. Dodatkowo prepare ostrzega: bot-invariants.md nie ma karty bot-invariants_summary.md (do promptu idzie pelny plik 17 KB).
