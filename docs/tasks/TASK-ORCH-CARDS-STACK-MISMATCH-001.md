---
id: TASK-ORCH-CARDS-STACK-MISMATCH-001
title: 'Karty reguł DDD/NestJS trafiają do projektów o innym stosie (node-ts, Fastify, flat service, Python)'
type: bugfix
status: todo
priority: P2
story_points: 5
created_date: 2026-10-17
updated_date: 2026-10-17
assignee: '@unassigned'
labels: [kaizen, orchestration, patterns, blocks]
depends_on: []
related: [TASK-ORCH-PATTERN-GAPS-001, TASK-PANEL-NODE-ADVISOR-001]
source: >
  Zebrane 2026-10-17 z docs/tasks/_inbox/ (8 rekordów, 6 projektów). Wspólny objaw: implementer,
  weryfikatory warstw i bramka końcowa dostają karty reguł, których nie da się zastosować do
  stosu projektu, więc zgłaszają deviation_note „niestosowalne” zamiast oceniać kod, a prompt
  rośnie o karty bez wartości.
  (1) DEV-anz-pattern-mismatch: ai-os-bot (BOT-030, Node/TS, discord.js, bez NestJS i DDD)
  dziedziczy z blocks/node.yml w patterns.always karty pisane pod DDD/NestJS
  (conventions-pattern, security-invariants-pattern, safe-error-propagation-pattern,
  logger-pattern-plain, repository-pattern-plain, controller-schema-pattern-plain).
  (2) DEV-agent_note-weryfikatorzy-warstw-i-bramka-koncowa-dostaja-kart: ai-os-bot BOT-030,
  4 deviation_note „nie mogę ocenić” (CV*, TP*, ZOD*, część safe-error-propagation); dodatkowo
  bot-invariants.md bez karty _summary (17 KB w każdym prompcie).
  (3) DEV-anz-pattern-mismatch-testing: ai-gateway TS-AIG-079, testing/testing-pyramid-pattern.md
  zakłada NestJS/DDD (L1 Specification, BUSINESS_RULES.yaml); ai-gateway to płaski serwis Node.
  (4) DEV-agent_note-karta-logger-pattern-log1-log3-nie-pasuje-do-stack i (5) ...-zak-ada-token-logge:
  marketing-hub TS-MH-019, logger-pattern LOG1-LOG3 zakłada token LOGGER_SERVICE, repo loguje
  przez nestjs-pino Logger; wstrzyknięto też karty refine-spa mimo layers_skip web.
  (6) DEV-agent_note-bramka-koncowa-zadania-tylko-web-layers-skip-doma: grant-flow TS-UI-007,
  zadanie tylko-web (layers_skip domain/application/infrastructure) dostało karty warstwy API.
  (7) DEV-agent_note-deviation-note-warstwy-testing-weryfikator-ts-im: ai-os-bot BOT-W4-012,
  weryfikator z listą stałą nie mógł sprawdzić wstrzykniętych kart (TP2/N3, CV5).
  (8) DEV-agent_note-security-e2e-verifier-lokalna-definicja-wymaga-t (część o kartach): iam
  TS-SSO-061, karty cross-layer CV/ZOD/TP z DDD/NestJS nie dotyczą płaskiego Fastify.
  Dopisane 2026-10-18 (3 kolejne rekordy, ten sam objaw): (9) DEV-agent_note-karty-regu-z-patterns-always-conventions-pattern:
  ai-os-bot BOT-036, karty conventions/security-invariants/safe-error-propagation/testing-pyramid/
  zod-schema z patterns.always (kontekst NestJS-DDD/HTTP) niestosowalne w node-ts-claude-api;
  weryfikatory testing i bramka końcowa zgłosiły deviation_note. (10) DEV-agent_note-deviation-note-warstwy-karty-regu-conventions:
  iam TS-SSO-062, zadania na Caddyfile/bash/python/CI nie mają zastosowania dla kart conventions i
  repository-pattern; implementer testing:e2e użył tylko testing-pyramid. Druga część rekordu (sonda
  warstwy `caddy` ślepa: checks skipped, platform/ bez package.json) to konfiguracja iam: warstwa bez
  package.json potrzebuje checks jako komend dosłownych (np. `caddy validate`), nie nazw skryptów.
  Naprawione osobno w tej sesji: python/testing-pattern.md (fixture event_loop usunięty w
  pytest-asyncio 1.0, przykłady SQLAlchemy/domain.* oznaczone jako zależne od stosu).
  Dopisane 2026-10-18 (11): DEV-orc-044-implementation: ai-os-bot BOT-037 (czysty helper czasowy),
  karty always z runtime.yml (conventions, security-invariants, safe-error-propagation,
  logger-pattern-plain, zod-schema-validation) to szablony DDD/NestJS/Fastify; weryfikatory obu
  warstw nie miały czego sprawdzać. Prepare ostrzega też o braku bot-invariants_summary.md (do promptu
  idzie pełny plik 17 KB) — karta zawiera wiążące wyjątki (B3 hop, B8, B10), więc streszczenie ma
  sens dopiero razem z decyzją, które karty zostają w always.
  Dopisane 2026-10-20 (12): DEV-orc-044-implementation: ai-os-bot BOT-039 (core/safety), weryfikatory
  implementation i testing dostały conventions/security-invariants/safe-error-propagation/zod/
  testing-pyramid bez zastosowania; bot-invariants.md nadal bez karty _summary.
  (13) DEV-agent_note-karty-zod-schema-validation-pattern-strict-i: framework-polityczny FP-005,
  warstwa core:sources-adapters — logger-pattern-plain (LGP2) nie rozstrzyga loggera wstrzykniętego
  przez kontekst, conventions-pattern (CV2) zakłada sufiksy DDD dla pakietu plain. Część zod
  (.strict() vs odpowiedzi cudzych API) naprawiona osobno w zod-schema-validation-pattern.
---

# TASK-ORCH-CARDS-STACK-MISMATCH-001: karty reguł a stos projektu

## 🎯 Goal

Projekt dostaje tylko te karty reguł, które da się zastosować do jego stosu. Dziś `patterns.always`
w blokach stosu (np. `blocks/node.yml`) zawiera karty pisane pod DDD/NestJS, a `layers_skip`
nie odfiltrowuje kart warstw, które zadanie pomija.

## Hipotezy do sprawdzenia (kolejność kosztu)

1. **Czy `patterns.remove` w bloku lokalnym zdejmuje karty odziedziczone przez `extends`.**
   `blocks/node.yml` już używa `remove:` (dla repository-pattern i controller-schema-pattern).
   Jeśli działa też z bloku potomnego, część problemu to config projektów (ai-os-bot, ai-gateway,
   iam): dopisać `remove:` w ich lokalnych blokach, bez zmiany centrali.
2. **Rozdzielić karty ogólne od DDD/NestJS.** `cross-layer/conventions-pattern.md`,
   `security-invariants-pattern.md`, `safe-error-propagation-pattern.md` mają części niezależne od
   stosu i części DDD. Albo osobne karty `*-plain` (jak `logger-pattern-plain`), albo przeniesienie
   do `nestjs-ddd`, tak żeby blok `node` miał w `always` wyłącznie neutralne.
3. **`layers_skip` ucina karty warstw.** `orchestrate-prepare.mjs` wstrzykuje `layerPatterns` dla
   warstw pominiętych (grant-flow TS-UI-007, marketing-hub TS-MH-019: karty refine-spa mimo
   `layers_skip web`).
4. **Karta invariantów bez `_summary`** (ai-os-bot `bot-invariants.md`, 17 KB w każdym prompcie):
   wymusić albo ostrzegać przy karcie projektowej powyżej progu.

## ✅ Kryterium ukończenia

- Dla ai-os-bot, ai-gateway, iam i marketing-hub lista kart w `runtime.yml` nie zawiera kart,
  które ich własne weryfikatory zgłaszały jako niestosowalne.
- Test w `tests/flow-evals/materialize-runtime` albo `orchestrate-prepare`: blok potomny z
  `remove:` zdejmuje kartę odziedziczoną; `layers_skip` zdejmuje karty tej warstwy.
- Zgłoszenia z `source:` zamknięte w skrzynce z odesłaniem do wyniku.
