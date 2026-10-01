---
id: DEV-orc-062-testing-testing-infrastructure
status: dismissed
dismissed_reason: >
  Zbadane 2026-09-27 — dwie różne, nie-silnikowe przyczyny. Occurrence #1: units[].reason dla
  infrastructure-module-wiring w analizie grant-flow opisał tylko połowę bugu (tokeny
  repozytoriów, nie rejestrację 4 handlerów CQRS) — implementer tej warstwy nigdy nie dostał
  zadania na drugą połowę, downstream testing warstwa poprawnie odmówiła łatania poza swoim
  zakresem. To luka jakości /analyze w grant-flow, nie silnika. Occurrence #2: koordynator
  zatrzymał się NA WYRAŹNĄ PROŚBĘ UŻYTKOWNIKA przed uruchomieniem prawdziwego przebiegu testów
  integracyjnych — to nie awaria, to zamierzona pauza.
trigger: halt
rule_ref: ORC-062
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 2
projects:
  - grant-flow
---

# DEV-orc-062-testing-testing-infrastructure

## Occurrences

- 2026-09-27 grant-flow (TS-RATE-003-rate-card-per-role) run `wf_42bb0132-6f9` warstwa `testing:testing-infrastructure` — 3x ESCALATE_AND_HALT (attempts exhausted, ostatni werdykt NO_GO). Ten sam wzorzec co poprzedni DEV-orc-062 na tej samej warstwie, ale nowa manifestacja: organization.module.ts rejestruje tokeny repozytoriów RATE_CARD_COMMAND_REPOSITORY/RATE_CARD_QUERY_REPOSITORY (naprawione w tym przebiegu przez warstwę infrastructure-module-wiring), ale NIE rejestruje w providers[] czterech handlerów CQRS (CreateRateCardHandler, SetRateCardEntryHandler, GetRateCardEntriesForRolesHandler, ListRateCardEntriesHandler) — VytchesExplorerService nie odkrywa ich, commandBus.execute() rzuca 'No command handler registered for: CreateRateCardCommand'. Blokuje in-scope test rate-card-acl.adapter.integration.spec.ts (5/6 RED). test-implementer poprawnie zgłosił problem 3x zamiast go łatać (poza jego dirs/rolą) — verifier poprawnie odrzucał no-op jako niewystarczający. units[] dla infrastructure-module-wiring miał 'reason' opisujący tylko połowę bugu (tokeny repozytoriów), stąd implementer tej warstwy nie dostał zadania rejestracji handlerów.
- 2026-09-27 grant-flow (TS-RATE-003) run `wf_b22d7915-2cb` warstwa `testing:testing-infrastructure` — Layer testing:testing-infrastructure ESCALATE_AND_HALT again on the 'kod istnieje' no-diff gate, immediately after infrastructure:infrastructure-module-wiring fixed the blocking DI bug (RATE_CARD_COMMAND_REPOSITORY/RATE_CARD_QUERY_REPOSITORY providers, confirmed on disk + tsc --noEmit clean). All 3 in-scope spec files (kysely-rate-card-query.repository.integration.spec.ts, rate-card-acl.adapter.integration.spec.ts, kysely-rate-card.repository.event-map.spec.ts) already exist from prior attempts — nothing left to write, so the implementer correctly made no changes, and the cheap no-diff gate correctly refuses to auto-trust that claim without a real test run. Coordinator is pausing this session at user's request before running the real Postgres-backed test:integration pass; leaving this halt for the next session to resolve (should be a fast GO once the integration suite is actually run against the now-fixed DI wiring).
