# Rule Card: CLI Runner

**Tags**: "api:platform:cli-runner", "api:security"
**Pattern**: `patterns/infrastructure/cli-runner-pattern.md`
**Layer**: Infrastructure
**Level**: quickstart
**Scope**: project-specific (juz-ide-api)

## Why this card exists

Domyślne zachowanie `nest-commander` i obraz distroless łamią dwie zasady runnerów po cichu: błąd joba kończy się kodem 0
(Azure widzi `Succeeded`), a przebieg na żywo startuje bez potwierdzenia, bo skrypt `npm` w obrazie nie istnieje.
**Status: experimental** — punkty CLR7–CLR9 zależą od spike'u zgodności z Nest 12 (ADR-0133, D2); do czasu jego przejścia traktuj je jako cel, nie opis kodu.

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **CLR1** | Jeden program startowy na job: `src/app/cli/<job>/<job>.cli.ts` woła `runCliJob(<Job>CliModule, { preflight })`. Zero wspólnego entrypointu. | `nest-commander` zbiera komendy z całego grafu: wszystkie runnery w jednym procesie, drugi adapter ACL pod tym samym kluczem (ACL6), jeden błąd dotyka wszystkich jobów. |
| **CLR2** | Moduł jobu to `CliCoreModule.forJob({ jobName, providers, imports?, aclAdapters? })` z `src/app/cli/shared/`. Nie kopiuj bootstrapu (Config, logowanie, CLS, baza, DDD, Secrets). | Kolejna kopia 60–80 linii; rozjazd konfiguracji CLS lub logowania między runnerami. |
| **CLR3** | Rdzeń CLI nie importuje `AppModule`, `BullModule`, `ScheduleModule`, Redisa ani `LoggerModule.register()`. `forJob` nie importuje modułów kontekstów. Pilnuje tego test L1 na metadanych importów. | Workery BullMQ i `@Cron` ruszają obok danych, które job zmienia; log przez kolejkę ciągnie Redisa. |
| **CLR4** | `ClsPluginTransactional` bez middleware. `DATABASE_TOKEN` tylko w konfiguracji adaptera CLS, nigdy w konstruktorze klasy (RP12). | `@Transactional` nie działa albo klasa dostaje surowego klienta bazy. |
| **CLR5** | Adapter ACL przez `aclAdapters` (stała, np. `DISCLOSED_HOME_POINT_ACL_PROVIDERS`), jeden adapter na klucz kontekstu; `ACLModule` i `CliAclRegistrar` tylko przy niepustej liście. | Naruszenie ACL6; ACLModule ładowany bez potrzeby. |
| **CLR6** | Port jobu (`{ provide: *_PORT, useClass }`) i jego handler wiążesz w module CLI, nigdy w module kontekstu ładowanym przez API. Guardian L1 chodzi po grafie `AppModule`; lista wyjątków tylko maleje (powód + id długu przy wpisie), nowy wpis czerwieni test. | Proces API niesie komendę i adapter, których nic nie woła (TS-MAP-MARKER-PRIVACY-001). |
| **CLR7** | `runCliJob` ustawia `process.exitCode = 1` na starcie, robi `preflight(process.env)` przed bazą, nadpisuje `serviceErrorHandler` (kod 1, na stderr tylko statyczny tekst i klasa błędu) i kończy jawnym `process.exit` z watchdogiem. `CliJobCommand` ustawia 0 dopiero po jawnym sukcesie. | Domyślny handler: błąd = kod 0 + `err.toString()` na stderr. Azure widzi `Succeeded` przy nieudanym backfillu. |
| **CLR8** | `usePlugins: false` i `completion: false` na sztywno (test L1). Bez `enableShutdownHooks`. | `cosmiconfig` wykonuje kod z plików w katalogu roboczym. |
| **CLR9** | Komendę deklaruj jako `@RootCommand` (lub `@Command({ isDefault: true })`); błąd opcji nie może omijać `runCliJob`. Wynik porównania z spike D15. | `exitOverride` nie przenosi się na komendy dołączone przez `addCommand`: błąd opcji kończy proces z pominięciem obsługi. |
| **CLR10** | `<X>_DRY_RUN` czytaj przez `parseStrictBoolean(env, name)`: brak lub śmieć = błąd, zero wartości domyślnej. Przy `DRY_RUN=false` wymagaj `CONFIRM_*=yes` w PROCESIE (`requireConfirmation`, fail-closed). Skrypt `npm` tylko ustawia `DRY_RUN=false`. | W obrazie distroless nie ma skryptu `npm`: przebieg na żywo startuje bez potwierdzenia. |
| **CLR11** | Konfiguracja to czyste `read<Job>RunConfig(env)`, parsowane raz i podane do `forJob` jako `useValue`. Bez `@Option({ env, argParser })` dla parametrów bezpieczeństwa. Błąd konfiguracji nie wypisuje wartości zmiennej. | Błąd parsowania `commandera` wypisuje wartość; parsowanie następuje po starcie DI, więc wymaga bazy i sekretów. |
| **CLR12** | Kod CLI nie importuje `commander` (`nest-commander` 3.21.0 pinuje 11.1.0, projekt ma ^15). Pilnuje guardian L1 lub reguła dependency-cruiser. | Dwie wersje `commandera`: konflikt typów i zachowania. |
| **CLR13** | Smoke obrazu: pętla po `src/app/cli/**/*.cli.js` (bez `generate-openapi`), uruchamiana w obrazie bez env, oczekiwany kod 1 z komunikatem preflight; lista plików liczona na hoście. Bez `--help`. | Obraz bez zależności prod lub z zepsutymi aliasami po `tsc-alias` wychodzi na produkcję niezauważony. |
| **CLR14** | Guardian i pętla smoke mają kontrolę anty-wakuacyjną: liczba elementów ≥ próg oraz nazwany plik referencyjny, który musi być obecny. | Pusty glob lub graf = 0 testów = zielono = zero ochrony (por. SEP10). |
| **CLR15** | `CONFIRM_*` to bezpiecznik na pomyłkę, nie autoryzacja. W dev zakaz `CONFIRM_*` w `.env`; `run-*.sh` dopisują `CONFIRM_*` do `--env-vars`. | Fałszywe poczucie autoryzacji; przypadkowy przebieg na żywo z lokalnego `.env`. |

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| Jeden `cli.ts` ładujący kilka modułów jobów lub komenda bez własnego pliku `*.cli.ts` | CLR1 |
| Skopiowany blok `ClsModule.forRoot` + `*CliLoggingModule` w nowym `*-cli.module.ts` | CLR2 |
| Handler lub `*_PORT` jobu w `providers` modułu z grafu `AppModule` | CLR6 |
| `CommandFactory.run` bez `serviceErrorHandler` lub bez `process.exitCode = 1` na starcie | CLR7 |
| `CONFIRM`/`DRY_RUN` sprawdzane tylko w `package.json` lub `run-*.sh` | CLR10 |
| `@Option({ env: ... })` dla `DRY_RUN`/`CONFIRM` albo domyślna wartość `DRY_RUN` | CLR10, CLR11 |
| `import ... from 'commander'` w `src/app/cli/` | CLR12 |
| `error.message` lub `err.toString()` na stderr lub w logu joba | CLR7, SEP4 |

**Pełny wzorzec**: [`cli-runner-pattern.md`](./cli-runner-pattern.md) · reguła: `rules/nestjs-ddd/cli-runner.md`
