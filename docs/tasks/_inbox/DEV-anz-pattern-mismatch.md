---
id: DEV-anz-pattern-mismatch
status: proposed
resolution: >
  Część aegis-flow naprawiona 2026-10-17: python/testing-pattern.md (fixture
  event_loop usunięty w pytest-asyncio 1.0, przykłady SQLAlchemy/domain.*
  oznaczone jako zależne od stosu). Część ai-os-bot (karty DDD/NestJS w
  patterns.always bloku node) przeniesiona do TASK-ORCH-CARDS-STACK-MISMATCH-001
  (wdrożone 2026-10-24 jako ORC-136, commit 11de3f4). Wystąpienie marketing-hub
  (TS-MH-025, 2026-10-18): rules/nestjs-ddd/error-mapper.md zakładała bramkę
  `D_` i DomainErrorHandler (łańcuch LocalHero), a marketing-hub kieruje błędy
  samym IDomainErrorMapper (kody typu VALIDATION_FAILED, bez DomainErrorHandler)
  — dodane zastrzeżenie „Scope of step (1)”: bez handlera pomijać klauzule
  D_/canHandle, a rejestrację w mapperze i test guardian zostawić. Wystąpienie
  aegis-flow TS-004 (2026-10-21): fałszywy alarm. python/ w
  .claude/knowledge/patterns/ to symlink do patterns/python/
  (security-invariants, safe-error-propagation i testing-pattern istnieją, a
  prepare rozwiązuje je po ścieżce względnej, nie po nazwie pliku); cross-layer/
  to osobne, TS-owe wersje. Agent najpewniej szukał bez -L. Dopisane ostrzeżenie
  w ANL-008 (commands/analyze.md). Otwarta zostaje część juz-ide-api-2 (zod,
  brakujące wzorce). 2026-10-23 juz-ide-api-4 (TS-MAP-MARKER-PRIVACY-001): brak
  wzorców punktu ujawnionego z polityką ujawniania, guardiana L1 producentów,
  projekcji markera fail-closed i wsadowego ACL zwracającego klasę. Zostaje
  project-specific do czasu drugiego niezależnego adoptera (CLAUDE.md); promocja
  do wzorca wymaga decyzji właściciela. 2026-10-24 aegis-flow (TS-007): blok
  python ciągnął testing/testing-pyramid-pattern.md (wzorzec TypeScript/NestJS)
  po słowie test. Usunięte z triggera w blocks/python.yml, runtime.yml
  aegis-flow zmaterializowany. 2026-11-01 juz-ide-api-3: karta
  rules/common/database-migrations.md powoływała się na wyjątek BDR-129, którego
  w docs/decisions nie było; zmiana karty w indeksie gita (niezacommitowana)
  wskazuje BDR-130, który istnieje w api-2 i api-3. Rozjazd BDR-128 (dwie różne
  treści w api-2 i develop) to sprawa numeracji decyzji w projekcie, nie
  silnika. Wyjątek projektowy w karcie centralnej zostaje decyzją właściciela
  (CLAUDE.md: project-specific do drugiego adoptera).
trigger: analyze_note
category: pattern_card
sources:
  - analyze
rule_ref: ANZ-PATTERN-MISMATCH
first_seen: 2026-10-10
last_seen: 2026-11-12
occurrences: 21
projects:
  - aegis-flow
  - ai-os-bot
  - marketing-hub
  - juz-ide-api-2
  - framework-polityczny
  - juz-ide-api-4
  - juz-ide-api-3
  - juz-ide-api-6
  - juz-ide-api-1
  - juz-ide-mobile-app-1
  - juz-ide-api-5
  - juz-ide-api-8
  - juz-ide-mobile-app
  - juz-ide-api
reopened_at: 2026-11-07
reopened_from_status: promoted
---

# DEV-anz-pattern-mismatch

## Occurrences

- 2026-11-12 juz-ide-api-8 (TS-TOOLING-USERID-GUARD-001) — Karty wzorców sprzeczne w sprawie userId w Command/Query: dual-identity-pattern_summary.md DI2/DI7 (userId jako parametr konstruktora ustawiany przez kontroler) vs command-handler-pattern_summary.md CH4/N1 i dual-identity N6 (zakaz); szkielet QH8 w query-handler-pattern_summary.md (requestingUserId) łamie N6. Strażnik zgodny z CH4 flaguje to, co DI2 nakazuje.
- 2026-11-11 juz-ide-api-5 (TS-GDPR-ERASURE-RETRY-ALERT-001) — Dobór wzorców dla taska o alercie z procesora kolejki: słowa kolejka/queue kierują do command-handler-queue-port-pattern.md, który wyłącza procesory i serwisy; architecture/bullmq-queue-pattern.md (karta procesorów, BQ1-BQ12) nie ma w triggers runtime.yml; brak karty alertu operacyjnego. Slot threat-model: when: nie zawiera haseł RODO/anonimiz/Art. 17, trafienia były fałszywe (token-economy, blokady).
- 2026-11-11 juz-ide-api-6 (TS-OBS-LOG-PII-001) — logger-pattern_summary.md N4 twierdzi, że LOGGER_SERVICE redaguje automatycznie przez REDACTION_SERVICE; w juz-ide-api EnhancedLoggerService i LoggerService nie wołają RedactionService (redakcja tylko przez pino redact.paths, jeden poziom). Karta nie ma też reguły o jednym punkcie redakcji; SI5/N5 w security-invariants_summary.md nie wymieniają współrzędnych, JWT, kodu OTP ani query; safe-error-propagation_summary.md nie rozstrzyga logowania error.message po stronie serwera.
- 2026-11-10 juz-ide-api (TS-TOOLING-005) — patterns.always (conventions, security-invariants, safe-error-propagation, logger, domain-errors) to wzorce NestJS/DDD; dla taska w tools/*.mjs bez kodu w src/ nie mają zastosowania
- 2026-11-09 juz-ide-mobile-app (STATE-MUTATION-REFRESH-JOBS-SHARES-SERVICES-001) — flutter/riverpod-state-pattern.md pokazuje StateNotifier/StateNotifierProvider, a projekt jest na Riverpod 3 (Notifier + SessionScopedNotifier); karta nieaktualna dla stosu
- 2026-11-08 juz-ide-api-8 (TS-INFRA-IMAGE-HARDENING-002) — Biblioteka wzorców nie ma karty o bramce obrazu w CI, skanerze obrazów, Renovate ani wyjątkach z datą wygaśnięcia (.claude/knowledge/patterns/, 0 trafień po słowach image/trivy/renovate/docker)
- 2026-11-08 juz-ide-api-5 (TS-GROUPS-PENDING-EDIT-FENCING-001) — Przykład kodu w moderated-edit-buffer-pattern.md sekcja 5 (L225-233) stawia idempotent-same PRZED stale/unknown, a implementacje referencyjne (local-share.aggregate.ts L1924-1967, Event BR) stawiają je PO sprawdzeniu rewizji; karta MEB5-MEB9 nie ustala kolejności, więc przykład wprowadza w błąd.
- 2026-11-08 juz-ide-api-5 (TS-GROUPS-PENDING-EDIT-FENCING-001) — Wzorzec domain/moderated-edit-buffer-pattern.md nie ma triggera w runtime.yml (patterns.triggers) ani w pattern-routing.local.json, więc ANL-008 go nie dobiera, choć zadania fencingu (grupy, wydarzenia, udostępnienia) opierają się na nim; dobrany ręcznie w analizie.
- 2026-11-08 juz-ide-mobile-app-1 (MOBILE-API-ALIGN-002) — retrieve_patterns dla zapytania o nullable DTO mapper zwrocil wylacznie karty nestjs-ddd (nietrafne dla projektu Flutter)
- 2026-11-08 juz-ide-api-1 (TS-GDPR-AUDIT-LOG-PII-001) — karta application/audit-handler-pattern nie ma reguły o polu email w eventData ani o guardianach L1 skanujących handlery audytu; N2 wymienia tylko piiData.email/phone, BaseAuditHandler przepisuje email bez kontroli (base-audit.handler.ts:147-151,195)
- 2026-11-07 juz-ide-api-3 (TS-ARCH-OUTBOX-GUARDIAN-001) — integration-event-pattern.md Pattern 2 (l.277-292) i bullmq-queue-pattern_summary.md BQ1-BQ6 opisują queue.add w handlerze zdarzenia jako normę, wbrew OB1/N1 i application-handlers.md NEVER; przykład Pattern 2 (engagement/.../moderate-comment.handler.ts) nie istnieje
- 2026-11-07 juz-ide-api-6 (TS-MOD-REPORT-INTAKE-001-engagement-report-to-moderation-queue) — trigger keywords wzorca command-handler-queue-port-pattern.md trafia słowem 'kolejk' (kolejka moderacji, nie BullMQ); wyłączone przez patterns_exclude w artefakcie
- 2026-11-01 juz-ide-api-3 (TS-GEO-HOME-POINT-CONTRACT-001) — rules/common/database-migrations.md (claude-patterns) powołuje się na wyjątek BDR-129, którego nie ma w docs/decisions w develop ani api-3 (plik tylko w katalogu api-2); w tej samej chwili BDR-128 ma dwie różne treści w api-2 i develop
- 2026-10-24 aegis-flow (TS-007) — testing/testing-pyramid-pattern.md (karta _summary) trafiła z triggers bloku python po słowie 'test', ale jest wzorcem TypeScript/NestJS (*.spec.ts, BUSINESS_RULES.md, e2e L3); projekt aegis-flow to Python/pytest
- 2026-10-23 juz-ide-api-4 (TS-MAP-MARKER-PRIVACY-001) — Brak wzorców w claude-patterns: punkt ujawniony i polityka ujawniania z werdyktem ACL; guardian L1 producentów (jako wzorzec; instancje istnieją w kodzie); projekcja markera fail-closed; wsadowy ACL zwracający klasę zamiast liczby. Wymieniła je analiza TS-MAP-MARKER-PRIVACY-001 (pattern-fit).
- 2026-10-21 aegis-flow (TS-004) — runtime.yml patterns.always wskazuje python/security-invariants-pattern.md i python/safe-error-propagation-pattern.md, a pliki leżą w .claude/knowledge/patterns/cross-layer/ i opisują NestJS/Zod/Kysely (stos TS), nie Python/FastAPI; trigger 'test' wskazuje python/testing-pattern.md, którego nie ma
- 2026-10-20 framework-polityczny (FP-005) — Brak wzorca TypeScript dla odpornego pobierania z zewnetrznych API (retry/backoff/checkpoint/archiwum surowe); python/resilient-collection-pattern.md jest w Pythonie, infrastructure/external-adapter-pattern.md to atrapa pod NestJS bez I/O
- 2026-10-20 juz-ide-api-2 (TS-MAP-MARKER-PRIVACY-001) — Brak wzorcow w claude-patterns: (1) punkt ujawniony / zaokraglenie przy zapisie (GEO17 to jedna linijka karty bez przykladu), (2) pisanie guardiana L1 (taint tracking), (3) repozytorium projekcji read-modelu (repository.md zaklada agregat z version i eventMap, a MapMarkersKyselyRepository jest projekcja). Dodatkowo: runtime.yml patterns.triggers nie obejmuje controller-schema, zod-schema-validation i business-rules-yaml dla zadan zmieniajacych odpowiedz API.
- 2026-10-18 marketing-hub (TS-MH-025) — rules/nestjs-ddd/error-mapper.md zakłada DomainErrorHandler z wymogiem kodu D_ (shared/response/handlers), a marketing-hub nie ma tego katalogu: SubjectInvalidError ma kod VALIDATION_FAILED i działa przez IDomainErrorMapper (authorization-error.mapper.ts:87)
- 2026-10-17 ai-os-bot (BOT-030) — blocks/node.yml ładuje w patterns.always karty pisane pod DDD/NestJS (conventions-pattern, security-invariants-pattern, safe-error-propagation-pattern, logger-pattern-plain, repository-pattern-plain, controller-schema-pattern-plain). Repo ai-os-bot (Node/TS, discord.js, bez NestJS i DDD) dziedziczy je przez extends: node w lokalnym bloku bot-panel i wstrzykuje do promptów implementera i weryfikatorów (BOT-030: weryfikatorzy oceniali je tylko tam, gdzie pasują). Lokalny bot-panel.yml ma w always tylko bot-invariants. Propozycja: blok node bez kart DDD/NestJS w always albo patterns.exclude w extends. Niesprawdzone: czy materialize-runtime.mjs wspiera wykluczanie dziedziczonych kart.
- 2026-10-10 aegis-flow (TS-002) — python/testing-pattern.md: przykłady SQLAlchemy/domain.entities oraz session-scoped fixture event_loop (usunięty w pytest-asyncio 1.0); niedopasowane do aegis-flow (brak DDD/DB)
