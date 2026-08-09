# Pattern: External Adapter (Logging Placeholder)

**Layer**: Infrastructure
**Status**: production
**Scope**: project-specific (grant-flow) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "grant-flow"` to include it. Promote to universal once a second project adopts
this shape.

## What This Is

Port domenowy (prawdziwy kontrakt) + adapter infrastrukturalny, który **implementuje ten
port bez wykonywania jakiegokolwiek I/O sieciowego** — loguje strukturalnie intencję
i zwraca jawnie oznaczony wynik-placeholder.

Kontekst powstania: GrantFlow ma zidentyfikowanych 13 potencjalnych integracji
zewnętrznych (KSeF, ZUS, GUS/REGON, Biała lista VAT, PSD2/banki, NBP, GitHub/Jira/
Kalendarz/Slack/Stripe — `docs/platform/integrations.md`). Świadoma decyzja produktowa
(`TS-AUDIT-INTEGRATIONS-001`, D1/D2, 2026-08-08): to WEWNĘTRZNE narzędzie firmy i na tym
etapie **żadna** z tych integracji nie wykonuje realnego ruchu do usługi zewnętrznej.

Domena i handlery muszą mieć COŚ do wywołania — port musi istnieć, żeby handler się
kompilował i był testowalny. Ale budowanie pełnej infrastruktury produkcyjnej (circuit
breaker, outbound idempotency, retry/backoff, klient SOAP/REST, zarządzanie sekretami)
dla usługi bez terminu i bez potwierdzonej potrzeby biznesowej to praca bez odbiorcy.
Rozwiązaniem nie jest też `TODO` ani `throw new Error('not implemented')` w handlerze —
to nie jest testowalne, nie zostawia śladu w logach i nie daje ścieżki podmiany bez
przepisywania wywołującego kodu.

Adapter placeholder robi siedem rzeczy:

1. **Implementuje realny port** (`domain/ports/`) — handler używa go tak, jakby wołał
   prawdziwą integrację. Podmiana na realną implementację NIE zmienia kontraktu portu
   ani wywołującego kodu (tylko provider w module DI).
2. **Zero wywołań sieciowych** — brak HTTP/SOAP/DB do zewnętrznego systemu.
3. **Loguje intencję strukturalnie** przez `ILoggerService` (nie `console.log` — patrz
   `cross-layer/logger-pattern.md`), np. „would call GUS/REGON with NIP=X" — placeholder
   ma być widoczny w telemetrii, nie cichy.
4. **Zwraca jawnie oznaczony, bezpieczny wynik** — `Result.ok()` z neutralną wartością
   (gdy handler ma działać end-to-end bez integracji, np. onboarding) albo
   `Result.fail(NotImplemented)` (gdy handler MA ujawniać lukę, nie udawać sukcesu).
   Wybór per integracja, nie uniwersalny domyślny.
5. **Konfiguracja przez `ConfigService`, nie `process.env`** w metodzie — tryb
   (`stub_allow_all` / `stub_reject_all` / `not_implemented`) czytany raz przy starcie.
6. **Fail-fast przy starcie, nie per-request** — niebezpieczna konfiguracja (tryb stub
   w `NODE_ENV=production` bez świadomej flagi) wysadza bootstrap w `onModuleInit()`.
   Cicha odmowa na każde żądanie jest łatwa do przeoczenia w logach; wysadzony start nie.
7. **Osobne klasy błędów dla osobnych przyczyn** — „funkcja jeszcze nie istnieje"
   (`XxxNotImplementedError`) to semantycznie inny błąd niż „provider tymczasowo
   niedostępny" (`XxxUnavailableError`), nawet gdy oba mapują dziś na to samo 503.

## When to Use

**Use this pattern for:**

- ✅ Port/kontrakt integracji jest potrzebny domenie lub handlerowi **teraz** — żeby kod
  się kompilował, testował i miał miejsce na przyszłą podmianę.
- ✅ Realna integracja zewnętrzna **nie ma potwierdzonego terminu** ani potwierdzonej
  potrzeby biznesowej.
- ✅ Chcesz zachować widoczność w telemetrii tego, co aplikacja „chciałaby zrobić", bez
  podejmowania ryzyka sieciowego.
- ✅ Handler ma działać end-to-end w środowisku dev/test mimo braku integracji
  (tryb `stub_allow_all`), albo świadomie ujawniać lukę (tryb `not_implemented`).

**Do NOT use for:**

- ❌ **Integracja ma zaplanowany termin wdrożenia** — buduj pełny adapter integracyjny
  (circuit breaker, retry, outbound idempotency, sekrety; w grant-flow: zarezerwowany
  ADR-0017). Placeholder byłby wtedy dodatkowym krokiem do wyrzucenia.
- ❌ **Adapter faktycznie woła sieć** — dodanie `fetch`/`axios`/klienta SOAP łamie
  bramkę EA7 i czyni ten wzorzec nieadekwatnym z definicji.
- ❌ **Potrzebujesz resilience** (circuit breaker, retry, backoff) — to jest praca dla
  momentu, w którym integracja staje się realna, nie dla adaptera bez I/O.
- ❌ **Test double na potrzeby testów** — do tego służy mock/fake w teście, nie provider
  produkcyjny w module DI. Placeholder jest bytem produkcyjnym o zdefiniowanym zachowaniu.
- ❌ **Ukrywanie awarii istniejącej integracji** — od „provider padł" jest
  `XxxUnavailableError` i resilience, nie tryb stub.

## Implementation

### Kształt portu

```ts
// domain/ports/xxx-checker.port.ts
export interface XxxCheckResult {
  isActive: boolean;
  checkedAt: Date;
  rawResponse: Record<string, unknown>;   // opaque, NIE gołe `unknown`
}

export interface IXxxChecker {
  check(input: string): Promise<Result<XxxCheckResult, XxxError | XxxNotImplementedError>>;
}

export const XXX_CHECKER = Symbol('XXX_CHECKER');
```

### Kształt adaptera

```ts
// infrastructure/adapters/stub-xxx-checker.adapter.ts
@Injectable()
export class StubXxxCheckerAdapter implements IXxxChecker, OnModuleInit {
  private mode!: 'stub_allow_all' | 'stub_reject_all' | 'not_implemented';

  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {}

  onModuleInit(): void {
    const config = this.configService.getConfig();
    this.mode = config.integration?.xxxVerificationMode ?? 'stub_allow_all';

    // Fail-fast: tryb stub w produkcji poza jawnym 'not_implemented' = błąd konfiguracji.
    if (config.app.environment === 'production' && this.mode !== 'not_implemented') {
      this.logger.error('SECURITY: Xxx stub adapter misconfigured for production', {
        mode: this.mode,
        event: 'SECURITY_EVENT',
      });
      throw new Error('Xxx stub adapter cannot run in production outside not_implemented mode');
    }
  }

  async check(input: string): Promise<Result<XxxCheckResult, XxxError | XxxNotImplementedError>> {
    this.logger.info('Xxx check placeholder — would call real provider', { input, mode: this.mode });

    switch (this.mode) {
      case 'stub_allow_all':
        return Result.ok({ isActive: true, checkedAt: new Date(), rawResponse: { stub: true, mode: this.mode } });
      case 'stub_reject_all':
        return Result.ok({ isActive: false, checkedAt: new Date(), rawResponse: { stub: true, mode: this.mode } });
      case 'not_implemented':
      default:
        return Result.fail(new XxxNotImplementedError());
    }
  }
}
```

### Referencyjny przykład w kodzie (grant-flow)

`StubVatWhiteListCheckerAdapter`
(`src/contexts/organization/infrastructure/adapters/stub-vat-white-list-checker.adapter.ts`)
jest kanonicznym przykładem tego wzorca — po refaktorze D7 (`TS-AUDIT-INTEGRATIONS-001`)
jest to jedyny adapter spełniający WSZYSTKIE punkty powyżej (ConfigService, fail-fast
`onModuleInit`, rozdzielone klasy błędów `VatCheckError` / `VatCheckNotImplementedError`,
typowany `rawResponse`). Nowe placeholdery (KSeF, ZUS, GUS itd.) powinny kopiować JEGO
kształt, nie wersję sprzed refaktoru.

## Rules

### MUST

- **EA1** — implementuje realny port domenowy (`IXxxChecker` lub podobny) — handler nie wie, że to placeholder.
- **EA2** — `@Injectable()`, konfiguracja przez wstrzyknięty `ConfigService`, NIE `process.env` w metodzie.
- **EA3** — loguje intencję przez `ILoggerService` (structured), nie `console.log`.
- **EA4** — `rawResponse`/payload w porcie typowany jako `Record<string, unknown>`, nie gołe `unknown`.
- **EA5** — walidacja bezpiecznej konfiguracji dzieje się RAZ, w `onModuleInit()` — fail-fast, nie per-request.
- **EA6** — osobna klasa błędu dla „nie zaimplementowane" vs „provider niedostępny", każda `extends BaseError`, zarejestrowana w context error-mapperze (`rules/nestjs-ddd/error-mapper.md`).
- **EA7** — zero realnego I/O sieciowego — bramkę łamie sam fakt dodania `fetch`/`axios`/klienta SOAP.

### MUST NOT

- **N1** — ❌ `process.env.XXX` czytane bezpośrednio w metodzie adaptera.
- **N2** — ❌ production guard sprawdzany na każde wywołanie zamiast raz przy starcie.
- **N3** — ❌ jedna klasa błędu reprezentująca dwie niepowiązane przyczyny („nie ma" vs „nie działa").
- **N4** — ❌ gołe `unknown` w porcie domenowym dla pola, które w praktyce zawsze jest obiektem.
- **N5** — ❌ budowanie resilience dla integracji, która nie robi żadnego I/O.

## Anti-Patterns

### 1. Cichy `TODO`/`throw` bez portu

```ts
// ❌ Handler nie ma czego mockować w testach, brak śladu w logach produkcyjnych.
async executeBusinessLogic() {
  throw new Error('KSeF integration not implemented');
}
```

### 2. Pełna infrastruktura resilience dla integracji bez terminu

```ts
// ❌ Circuit breaker + retry + outbound idempotency dla adaptera, który i tak
// nigdy nie woła sieci — praca na zapas, zero wartości dziś.
@UseCircuitBreaker() @UseRetry({ attempts: 3 }) async check() { ... }
```

### 3. Guard per-request zamiast fail-fast

```ts
// ❌ Cicho odmawia na KAŻDE żądanie w produkcji zamiast wysadzić bootstrap raz.
async check() {
  if (process.env.NODE_ENV === 'production') return Result.fail(...);
  ...
}
```

## References

### Decyzje / ADR (grant-flow)

- `project-orchestration/analysis/TS-AUDIT-INTEGRATIONS-001-external-integrations-gap.analysis.md`
  — D1, D2, D5, D7 (odejście od pełnej infrastruktury integracyjnej + refaktor adaptera referencyjnego).
- ADR-0017 (zarezerwowany, NIEUŻYWANY — patrz D6 w analizie) — pełny wzorzec integracyjny
  (circuit breaker, sync/async per integracja, sekrety) na moment, gdy realna integracja
  zostanie zaplanowana z terminem.

### Pliki implementacyjne (grant-flow)

- `src/contexts/organization/infrastructure/adapters/stub-vat-white-list-checker.adapter.ts` — referencyjny adapter.
- `src/contexts/organization/domain/ports/vat-white-list-checker.port.ts` — referencyjny port.
- `src/shared/infrastructure/resilience/`, `src/shared/infrastructure/idempotency/` (ADR-0008)
  — ISTNIEJĄ, ale NIE są używane przez placeholdery; potrzebne dopiero przy realnej integracji.

### Powiązane wzorce

- `cross-layer/logger-pattern.md` — structured logging (EA3).
- `rules/nestjs-ddd/error-mapper.md` — rejestracja nowych klas błędów (EA6).
- `rules/nestjs-ddd/acl-registry.md` — gdy placeholder ma być wołany z innego bounded contextu.
