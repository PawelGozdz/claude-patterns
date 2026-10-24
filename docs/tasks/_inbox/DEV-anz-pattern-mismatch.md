---
id: DEV-anz-pattern-mismatch
status: proposed
resolution: >
  Część aegis-flow naprawiona 2026-10-17: python/testing-pattern.md (fixture
  event_loop usunięty w pytest-asyncio 1.0, przykłady SQLAlchemy/domain.*
  oznaczone jako zależne od stosu). Część ai-os-bot (karty DDD/NestJS w
  patterns.always bloku node) przeniesiona do
  TASK-ORCH-CARDS-STACK-MISMATCH-001. Wystąpienie marketing-hub (TS-MH-025,
  2026-10-18): rules/nestjs-ddd/error-mapper.md zakładała bramkę `D_` i
  DomainErrorHandler (łańcuch LocalHero), a marketing-hub kieruje błędy samym
  IDomainErrorMapper (kody typu VALIDATION_FAILED, bez DomainErrorHandler) —
  dodane zastrzeżenie „Scope of step (1)”: bez handlera pomijać klauzule
  D_/canHandle, a rejestrację w mapperze i test guardian zostawić. Wystąpienie
  aegis-flow TS-004 (2026-10-21): fałszywy alarm. python/ w
  .claude/knowledge/patterns/ to symlink do patterns/python/
  (security-invariants, safe-error-propagation i testing-pattern istnieją, a
  prepare rozwiązuje je po ścieżce względnej, nie po nazwie pliku); cross-layer/
  to osobne, TS-owe wersje. Agent najpewniej szukał bez -L. Dopisane ostrzeżenie
  w ANL-008 (commands/analyze.md). Otwarta zostaje część juz-ide-api-2 (zod,
  brakujące wzorce).
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-PATTERN-MISMATCH
first_seen: 2026-10-10
last_seen: 2026-10-23
occurrences: 7
projects:
  - aegis-flow
  - ai-os-bot
  - marketing-hub
  - juz-ide-api-2
  - framework-polityczny
  - juz-ide-api-4
reopened_at: 2026-10-20
reopened_from_status: promoted
---

# DEV-anz-pattern-mismatch

## Occurrences

- 2026-10-23 juz-ide-api-4 (TS-MAP-MARKER-PRIVACY-001) — Brak wzorców w claude-patterns: punkt ujawniony i polityka ujawniania z werdyktem ACL; guardian L1 producentów (jako wzorzec; instancje istnieją w kodzie); projekcja markera fail-closed; wsadowy ACL zwracający klasę zamiast liczby. Wymieniła je analiza TS-MAP-MARKER-PRIVACY-001 (pattern-fit).
- 2026-10-21 aegis-flow (TS-004) — runtime.yml patterns.always wskazuje python/security-invariants-pattern.md i python/safe-error-propagation-pattern.md, a pliki leżą w .claude/knowledge/patterns/cross-layer/ i opisują NestJS/Zod/Kysely (stos TS), nie Python/FastAPI; trigger 'test' wskazuje python/testing-pattern.md, którego nie ma
- 2026-10-20 framework-polityczny (FP-005) — Brak wzorca TypeScript dla odpornego pobierania z zewnetrznych API (retry/backoff/checkpoint/archiwum surowe); python/resilient-collection-pattern.md jest w Pythonie, infrastructure/external-adapter-pattern.md to atrapa pod NestJS bez I/O
- 2026-10-20 juz-ide-api-2 (TS-MAP-MARKER-PRIVACY-001) — Brak wzorcow w claude-patterns: (1) punkt ujawniony / zaokraglenie przy zapisie (GEO17 to jedna linijka karty bez przykladu), (2) pisanie guardiana L1 (taint tracking), (3) repozytorium projekcji read-modelu (repository.md zaklada agregat z version i eventMap, a MapMarkersKyselyRepository jest projekcja). Dodatkowo: runtime.yml patterns.triggers nie obejmuje controller-schema, zod-schema-validation i business-rules-yaml dla zadan zmieniajacych odpowiedz API.
- 2026-10-18 marketing-hub (TS-MH-025) — rules/nestjs-ddd/error-mapper.md zakłada DomainErrorHandler z wymogiem kodu D_ (shared/response/handlers), a marketing-hub nie ma tego katalogu: SubjectInvalidError ma kod VALIDATION_FAILED i działa przez IDomainErrorMapper (authorization-error.mapper.ts:87)
- 2026-10-17 ai-os-bot (BOT-030) — blocks/node.yml ładuje w patterns.always karty pisane pod DDD/NestJS (conventions-pattern, security-invariants-pattern, safe-error-propagation-pattern, logger-pattern-plain, repository-pattern-plain, controller-schema-pattern-plain). Repo ai-os-bot (Node/TS, discord.js, bez NestJS i DDD) dziedziczy je przez extends: node w lokalnym bloku bot-panel i wstrzykuje do promptów implementera i weryfikatorów (BOT-030: weryfikatorzy oceniali je tylko tam, gdzie pasują). Lokalny bot-panel.yml ma w always tylko bot-invariants. Propozycja: blok node bez kart DDD/NestJS w always albo patterns.exclude w extends. Niesprawdzone: czy materialize-runtime.mjs wspiera wykluczanie dziedziczonych kart.
- 2026-10-10 aegis-flow (TS-002) — python/testing-pattern.md: przykłady SQLAlchemy/domain.entities oraz session-scoped fixture event_loop (usunięty w pytest-asyncio 1.0); niedopasowane do aegis-flow (brak DDD/DB)
