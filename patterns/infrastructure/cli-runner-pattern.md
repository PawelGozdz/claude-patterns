# Pattern: CLI Runner (jednorazowy job operacyjny)

**Tags**: "api:platform:cli-runner", "api:security"
**Layer**: Infrastructure
**Level**: core
**Status**: experimental
**Scope**: project-specific (juz-ide-api) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "juz-ide-api"` to include it. Promote to universal once a second project adopts this shape.

## What This Is

Sposób uruchamiania jednorazowych zadań operacyjnych (backfill, repair, migracja danych) poza procesem API:
osobny program startowy na każdy job, wspólny moduł bazowy `CliCoreModule.forJob(...)`, wspólny `runCliJob(...)`
z własną obsługą błędów, potwierdzenie przebiegu na żywo sprawdzane w samym procesie oraz dwie bramki
(guardian grafu `AppModule`, smoke obrazu). Reguła dla agentów: `rules/nestjs-ddd/cli-runner.md`.

## Stan weryfikacji (czytaj przed użyciem)

Źródło: ADR-0133 i analiza `TS-INFRA-CLI-RUNNER-001` w juz-ide-api (2026-11-09). To jest **projekt, nie kod
produkcyjny**. Stan faktyczny:

- **Sprawdzone czytaniem kodu** `nest-commander` 3.21.0 (tarball): domyślny `serviceErrorHandler` kończy proces
  kodem 0 i pisze `err.toString()`; komendy są zbierane z całego grafu modułów; `createWithoutRunning` leży poza `try`.
- **Niesprawdzone uruchomieniem** (spike D2 w pierwszej jednostce zadania): zgodność z Nest 12 po podmianie
  `@golevelup/nestjs-discovery` na 7.1.0, `abortOnError: false`, zachowanie `pg` `pool.end()` przy wycieku klienta,
  `@RootCommand` kontra `@Command({ isDefault: true })`, semantyka `az containerapp job start --env-vars`.
- Dziś w kodzie jest **stan wyjściowy**: pięć ręcznie pisanych runnerów z powielonym bootstrapem (sekcja 2).
  Sekcje oznaczone „docelowy" opisują decyzje, nie istniejące pliki.

Gdy spike obali założenie (a/b/d/f) — wzorzec wraca do właściciela produktu; nie wracaj po cichu do własnego modułu bazowego.
Po przejściu spike'u i pilota zamień szkice na kod z repo i zmień `**Status**` na `production`.

## When to Use

**Use this pattern for:**
- ✅ Nowy handler komendy bez endpointu HTTP i bez crona (backfill, repair, jednorazowa migracja danych), który ma być uruchamiany jako job kontenera.
- ✅ Job w obrazie produkcyjnym bez powłoki (distroless) — gdzie `CONFIRM`, `DRY_RUN` i preflight muszą działać w samym programie.
- ✅ Dodanie kolejnego runnera: dopisujesz `<job>.cli.ts` + `<Job>CliModule`, nie kopiujesz bootstrapu.
- ✅ Audyt: dlaczego handler jobu jest w `providers` modułu ładowanego przez `AppModule` (guardian L1 wyłapuje to mechanicznie).

**Do NOT use for:**
- ❌ Zadania cyklicznego — właściwy jest `@Cron`/BullMQ (`architecture/bullmq-queue-pattern.md`), nie runner.
- ❌ Migracji schematu — mają własne CLI i bramkę `irreversible` (`src/shared/database/migrations/cli.ts`), poza zakresem tego wzorca.
- ❌ Narzędzia builda wymagającego pełnego `AppModule` (np. `generate-openapi`) — to nie job operacyjny na danych.
- ❌ Skryptów `scripts/*.ts` uruchamianych ręcznie z maszyny dewelopera — obraz produkcyjny ich nie zawiera; jeśli ma biec w produkcji, przenieś do `src/app/cli/`.
- ❌ Projektu bez `nestjs-ddd` — wzorzec zakłada `DDDModule`, `ICommandBus` i ACL Registry.

## Implementation

### 1. Układ plików

```
src/app/cli/
  shared/                          # CliCoreModule, CliLoggingModule, CliAclRegistrar, runCliJob,
                                   # CliJobCommand, cli-env (parseStrictBoolean, requireConfirmation), batch-loop
  <job>/
    <job>.cli.ts                   # program startowy: woła runCliJob(<Job>CliModule, { preflight })
    <job>.config.ts                # czyste read<Job>RunConfig(env)
    <job>.module.ts                # <Job>CliModule = CliCoreModule.forJob({ ... })
    <job>.runner.ts                # pętla po paczkach przez ICommandBus
    __tests__/                     # config.spec, runner.spec, module.integration.spec
```

**Jeden program na job, bez wspólnego entrypointu.** `nest-commander` zbiera komendy z całego grafu modułów,
więc wspólny entrypoint załadowałby wszystkie runnery naraz i złamał regułę „jeden adapter ACL na klucz kontekstu"
(ACL6 z `architecture/acl-registry-pattern.md`; dwa runnery rejestrujące `geographic-auth` w jednym procesie).
Kod wyjścia per proces jest też jedynym sygnałem dla skryptów `run-*.sh` i statusu `Succeeded` joba w Azure.

### 2. Stan obecny (kod z repo, juz-ide-api-8) — bootstrap do zastąpienia

Każdy z pięciu runnerów powiela ten blok (około 250–300 linii razem). Wzór: `src/app/cli/backfill-target-area-from-disclosed-point/`.

```typescript
// backfill-target-area.module.ts — lekki moduł CLI: bez HTTP, BullMQ, @Cron, Redisa
@Module({
  imports: [
    ConfigModule,
    BackfillTargetAreaCliLoggingModule,          // prywatna kopia w każdym runnerze
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [DatabaseModule],
          adapter: new TransactionalAdapterKysely({ kyselyInstanceToken: DATABASE_TOKEN }),
        }),
      ],
    }),
    DatabaseModule, DDDModule, SecretsModule, ACLModule,
  ],
  providers: [
    DisclosedHomePointOnlyAclAdapter,            // lekki adapter ACL zamiast GeographicAuthModule
    BackfillContentReachAreasHandler,
    { provide: CONTENT_REACH_AREA_BACKFILL_PORT, useClass: ContentReachAreaBackfillKyselyRepository },
  ],
})
export class BackfillTargetAreaCliModule implements OnModuleInit {
  onModuleInit(): void {
    this.aclRegistry.registerGlobal(GEOGRAPHIC_AUTH_ACL_KEY, this.geographicAuthAdapter, '...');
  }
}
```

```typescript
// backfill-target-area-from-disclosed-point.cli.ts — program startowy (skrót)
async function main(): Promise<number> {
  let config;
  try { config = readTargetAreaBackfillConfig(process.env); }
  catch (error) { writeStderr(error instanceof Error ? error.message : 'invalid configuration'); return 1; }

  const app = await NestFactory.createApplicationContext(BackfillTargetAreaCliModule, { logger: ['error', 'warn'] });
  try { /* runTargetAreaBackfill({ commandBus: app.get(ICommandBus), logger }, config) */ return exitCodeFor(outcome, config); }
  catch (error) { const { errorClass, errorCode } = describeFailure(error); writeStderr(`unexpected failure (${errorClass}, ${errorCode})`); return 1; }
  finally { await app.close(); }
}
if (require.main === module) {
  main().then(code => process.exit(code)).catch(() => process.exit(1));
}
```

Co w tym jest dobre i zostaje: `src/` zamiast `scripts/`, stderr ze statycznym tekstem i klasą błędu (nigdy `error.message`),
kod wyjścia 0/1, `app.close()` w `finally`. Co jest do usunięcia: kopia bootstrapu per runner i brak jednego miejsca na preflight i watchdog.

### 3. Docelowy rdzeń: `CliCoreModule.forJob` (szkic ADR-0133 D4 — niezaimplementowany)

```typescript
CliCoreModule.forJob({
  jobName: 'backfill-target-area',
  providers: [BackfillContentReachAreasHandler, { provide: CONTENT_REACH_AREA_BACKFILL_PORT, useClass: ContentReachAreaBackfillKyselyRepository }],
  aclAdapters: DISCLOSED_HOME_POINT_ACL_PROVIDERS,   // stała zamiast trzech kopii; pusta → bez ACLModule i CliAclRegistrar
});
```

Rdzeń (zawsze): `ConfigModule`, wspólny `CliLoggingModule`, `ClsModule.forRoot` z `ClsPluginTransactional` **bez middleware**
(brak HTTP), `DatabaseModule`, `DDDModule`, `SecretsModule`. `ACLModule` i `CliAclRegistrar` (`OnModuleInit`) tylko przy niepustym `aclAdapters`.
`forJob` przyjmuje wyłącznie jawne `providers` i **nie importuje modułów kontekstów**.
Zakazane w rdzeniu i pilnowane testem L1 na metadanych importów: `AppModule`, `BullModule`, `ScheduleModule`, Redis,
`LoggerModule.register()`. `DATABASE_TOKEN` trafia tylko do konfiguracji adaptera CLS, nigdy do konstruktora klasy (RP12 bez wyjątku).

### 4. Docelowy `runCliJob` (szkic ADR-0133 D5 — niezaimplementowany)

```typescript
export async function runCliJob(
  module: Type<unknown>,
  options: { preflight: (env: NodeJS.ProcessEnv) => void },
): Promise<void> {
  process.exitCode = 1;                                   // domyślnie porażka; sukces ustawia tylko jawnie CliJobCommand
  try {
    options.preflight(process.env);                       // przed bazą i sekretami: błąd konfiguracji bez bootu DI
    await CommandFactory.run(module, {
      serviceErrorHandler: (error) => {                   // domyślny połyka błąd (kod 0) i pisze err.toString()
        process.exitCode = 1;
        process.stderr.write(`[${jobName}] failure (${errorClassOf(error)})\n`);   // tylko statyczny tekst + klasa
      },
      errorHandler: (error) => { process.exitCode = error.exitCode; },             // --help = 0
      abortOnError: false,
      usePlugins: false,                                  // cosmiconfig wykonywałby kod z katalogu roboczego
      completion: false,                                  // na sztywno, pilnowane testem L1
    });
  } catch (error) {
    process.stderr.write(`[${jobName}] fatal (${errorClassOf(error)})\n`);
  } finally {
    armUnrefWatchdog();                                   // timer unref uzbrojony w finally
    process.exit(process.exitCode ?? 1);                  // jawne wyjście: pool.end() mógłby wisieć do replicaTimeout
  }
}
```

`CliJobCommand` (klasa bazowa komend) ustawia `process.exitCode = 0` dopiero po jawnym sukcesie. Bez `enableShutdownHooks`.
Komendę deklaruj jako `@RootCommand` (preferowane) lub `@Command({ isDefault: true })` — wynik porównania w spike D15.

### 5. Konfiguracja i potwierdzenie w procesie (szkic ADR-0133 D6, D7)

Obraz produkcyjny jest distroless, bez powłoki. Skrypt `npm` tam nie istnieje, więc **bramka musi siedzieć w programie**:

```typescript
// <job>.config.ts — czysta funkcja, testowana bez Nesta; bez @Option({ env }) dla parametrów bezpieczeństwa
export function readTargetAreaBackfillConfig(env: NodeJS.ProcessEnv): TargetAreaBackfillConfig {
  const dryRun = parseStrictBoolean(env, 'TARGET_AREA_BACKFILL_DRY_RUN');   // brak lub śmieć = błąd, bez wartości domyślnej
  if (!dryRun) requireConfirmation(env, 'CONFIRM_TARGET_AREA_BACKFILL');    // fail-closed: wymaga dokładnie 'yes'
  // ...
}
```

Błąd walidacji nie wypisuje wartości zmiennej. Parsowanie następuje raz, wynik idzie do `forJob` jako `useValue`.
Kod CLI **nie importuje `commander`**: `nest-commander` 3.21.0 pinuje `commander` 11.1.0, a projekt ma ^15.
Skrypt `npm` tylko ustawia `<X>_DRY_RUN=false`; `run-*.sh` dopisują `CONFIRM_*` do `--env-vars`; w dev zakaz `CONFIRM_*` w `.env`.
`CONFIRM` to bezpiecznik na pomyłkę, nie autoryzacja: kto ma uprawnienie `jobs/start/action`, nadpisze env.

### 6. Guardian L1 i smoke obrazu

```typescript
// map-marker-backfill-wiring.guardian.spec.ts jest szablonem; guardian chodzi po grafie AppModule
// (Reflect imports i providers, rekurencyjnie, DynamicModule, forwardRef; fallback skan tekstowy)
const KNOWN_EXCEPTIONS = [ { handler: 'X', reason: '...', debtId: 'TS-...' } /* malejąca lista, jest 6 */ ];
// nowy wpis = czerwony test; usunięcie wpisu po przeniesieniu bindingu = zielony
```

```bash
# scripts/smoke-test-image.sh — lista plików liczona na hoście (distroless nie ma powłoki)
for cli in $(cd dist && ls app/cli/*/*.cli.js | grep -v generate-openapi); do
  docker run --rm "$IMAGE" "dist/$cli"; code=$?       # bez env: preflight ma się nie powieść
  [ "$code" -eq 1 ] || fail "$cli: oczekiwano kodu 1, jest $code"
done
```

Smoke dowodzi aliasów po `tsc-alias`, obecności zależności prod i bramki DRY_RUN bez bazy. Bez `--help`: wymaga bootu DI.

## Anti-Patterns

- **Wspólny entrypoint na wszystkie joby** — `nest-commander` załaduje komendy z całego grafu: drugi adapter ACL pod tym samym kluczem, jeden błąd wywala wszystkie joby.
- **Domyślny `serviceErrorHandler`** — błąd komendy kończy się kodem 0 i `err.toString()` na stderr; Azure uznaje job za `Succeeded`, a nieudany backfill wygląda na zakończony, razem z treścią błędu w logach.
- **`CONFIRM`/`DRY_RUN` sprawdzane tylko w skrypcie `npm`** — w obrazie distroless skryptu nie ma; przebieg na żywo startuje bez potwierdzenia.
- **`@Option({ env, argParser })` dla `DRY_RUN`** — błąd parsowania `commandera` wypisuje wartość, a parsowanie i `--help` następują dopiero po starcie DI (wymagałyby bazy i sekretów).
- **Import `commander` w kodzie CLI** — dwie wersje (11.1.0 zagnieżdżona i ^15 projektu), konflikt typów i zachowania.
- **Binding portu jobu w module kontekstu ładowanym przez API** — proces API niesie komendę i adapter na tabeli, których nic nie woła (TS-MAP-MARKER-PRIVACY-001; dziś sześć takich wyjątków na liście guardiana).
- **Guardian lub pętla smoke bez kontroli anty-wakuacyjnej** — gdy glob lub graf zwróci 0 elementów, test przechodzi na zielono i nic nie chroni (por. SEP10 w `cross-layer/safe-error-propagation-pattern.md`).
- **Ciche przejście na własny moduł bazowy po porażce spike'u** — decyzja należy do właściciela produktu (ADR-0133, pkt 2).
