---
id: DEV-agent_note-karty-zod-schema-validation-pattern-strict-i
status: promoted
resolution: >
  Naprawione 2026-10-20 w części zod: patterns/infrastructure/zod-schema-validation-pattern.md i
  _summary.md mają jawny wyjątek — ZOD1/N3 (.strict()) dotyczą kontraktu, który posiadamy, nie
  odpowiedzi cudzych API (adaptery, klienci dostawców). Część o loggerze wstrzykniętym przez kontekst
  (LGP2) i sufiksach DDD pakietu plain (CV2) to ten sam objaw co w
  TASK-ORCH-CARDS-STACK-MISMATCH-001 (dopisane jako wystąpienie 13).
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-agent_note-karty-zod-schema-validation-pattern-strict-i

## Occurrences

- 2026-10-20 framework-polityczny (FP-005) run `wf_53302ff1-8ed` warstwa `core:sources-adapters` — karty zod-schema-validation-pattern (.strict()) i logger-pattern-plain (LGP2) nie rozstrzygaja schematow odpowiedzi cudzego API ani loggera wstrzyknietego przez kontekst; conventions-pattern (CV2) zaklada sufiksy DDD dla pakietu plain
