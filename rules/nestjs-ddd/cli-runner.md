# Rule: CLI Runner (one-off / operational job)
**Governs**: wzorzec runnera jednorazowego (backfill, repair, migracja danych) uruchamianego poza procesem API — w projekcie: `src/app/cli/<job>/` (przykłady: `repair-disclosed-point-projections/`, `backfill-target-area-from-disclosed-point/`), `src/contexts/geographic-auth/infrastructure/cli/` (backfill home points, do przeniesienia do `src/app/cli/`), `src/shared/database/migrations/cli.ts`
**Applies to**: `*.cli.ts`, `*-cli.module.ts` / `*.module.ts` pod `**/cli/**`; każdy command handler, który nie ma wejścia HTTP ani crona, oraz jego binding portu

> Karta wzorca: `patterns/infrastructure/cli-runner-pattern.md` (+ `_summary.md`, reguły CLR1–CLR15; **Status: experimental**,
> **project-specific (juz-ide-api)**). Punkty oznaczone **[cel]** opisują docelowy fundament na `nest-commander`
> (ADR-0133 w juz-ide-api, zadanie TS-INFRA-CLI-RUNNER-001): do czasu przejścia spike'u zgodności z Nest 12 i powstania
> `src/app/cli/shared/` sprawdź, czy ten katalog istnieje. Jeśli nie, stosuj wersję bez **[cel]**.
> Przed dodaniem kolejnego runnera sprawdź `src/app/cli/` i `**/infrastructure/cli/`, nie zakładaj, że go brak
> (TS-MAP-MARKER-PRIVACY-001: backfill zbindowany w module kontekstu, bo nikt nie sprawdził).
> ID poniżej (A1…, N1…) to numeracja porządkowa sprzed 2026-11; odwołania z analiz używają jej, więc nie przenumerowuj.

## ALWAYS
- **A1** Zanim napiszesz handler komendy bez endpointu i bez crona, ustal w analizie JAK i KTO go uruchamia: nazwany runner (`*.cli.ts`), skrypt `package.json` i wpis w runbooku. Komenda bez wyzwalacza to kod, którego nikt nie wykona.
- **A2** Uruchamiaj job w LEKKIM module CLI (`NestFactory.createApplicationContext` lub `CommandFactory.run`, bez listenera HTTP), nigdy w `AppModule`: bez workerów BullMQ (zjadłyby produkcyjne kolejki), `@Cron` i Redisa obok danych, które job zmienia. **[cel]** Moduł jobu budujesz przez `CliCoreModule.forJob({ jobName, providers, imports?, aclAdapters? })` z `src/app/cli/shared/`.
- **A3** Składaj w module CLI tylko to, czego potrzebuje handler: `ConfigModule`, `DatabaseModule`, `DDDModule`, `SecretsModule`, wspólne logowanie CLI, `ClsModule` z `ClsPluginTransactional` (bez middleware) oraz `ACLModule` tylko gdy job woła kontekst przez ACL. Brak providera ma wywalić `app.init()` błędem DI od razu, nie po cichu w połowie przebiegu. **[cel]** Rdzeń daje `forJob`; `forJob` nie importuje modułów kontekstów.
- **A4** Gdy handler woła kontekst `geographic-auth` przez ACL, zarejestruj w module CLI lekki adapter (np. `DisclosedHomePointOnlyAclAdapter`) pod kluczem kontekstu. Nie ładuj w runnerze `GeographicAuthModule` (ACL6: jeden adapter na klucz). **[cel]** Adaptery przekazujesz przez `aclAdapters` (stała `DISCLOSED_HOME_POINT_ACL_PROVIDERS`).
- **A5** Binduj port joba (`{ provide: *_PORT, useClass: … }`) w module CLI, nie w module kontekstu. Adapter zostaje w `infrastructure/` kontekstu; zmienia się tylko miejsce wiązania.
- **A6** Trzymaj `*.cli.ts` cienki, zero logiki biznesowej: bootstrap kontekstu, pętla po paczkach przez `ICommandBus`, kursor z poprzedniego wyniku (wznowienie), kod wyjścia 0/1. Każda paczka to osobna transakcja w handlerze. **Błąd komendy ma dawać kod ≠ 0.** **[cel]** Bootstrap i obsługę błędów robi wspólne `runCliJob(<Job>CliModule, { preflight })`, bo domyślny `serviceErrorHandler` z `nest-commander` połyka błąd (kod 0) i pisze `err.toString()`; `runCliJob` nadpisuje go (kod 1, na stderr statyczny tekst i klasa błędu).
- **A7** Umieszczaj kod runnera w `src/` (nie w `scripts/`): `tsc` kopiuje go do `dist/`, a obraz produkcyjny nie ma katalogu `scripts/`.
- **A8** Wymagaj jawnej konfiguracji z env: `*_DRY_RUN` bez wartości domyślnej (brak lub śmieć = błąd, nigdy cichy przebieg na żywo) i `CONFIRM_*=yes` przy `DRY_RUN=false`. **Oba warunki sprawdza SAM PROCES** (`parseStrictBoolean`, `requireConfirmation`, fail-closed), nie skrypt `npm`: obraz produkcyjny jest distroless, bez powłoki. Skrypt `npm` tylko ustawia `<X>_DRY_RUN=false`, obok osobny skrypt `:dry-run`. Konfiguracja to czyste `read*RunConfig(env)`, bez `@Option({ env })` dla parametrów bezpieczeństwa. `CONFIRM_*` jest bezpiecznikiem na pomyłkę, nie autoryzacją.
- **A9** Loguj strukturalnie, same liczniki i kursor. Zero współrzędnych, adresów, kluczy, digestów, `error.message` i `err.toString()` (także na stderr).
- **A10** Napisz testy runnera: config (dry-run, brak CONFIRM), runner (pętla, kursor, zatrzymanie przy pustej paczce, błąd portu = kod ≠ 0) i `module.integration` na prawdziwych providerach (`app.init()` bez błędu DI, handler rozwiązany z busa).
- **A11** Opisz w runbooku komendy i kolejność wdrożenia (np. migracja → backfill → odczyt fail-closed).
- **A12** **[cel]** Każdy job ma własny program startowy `src/app/cli/<job>/<job>.cli.ts`. `nest-commander` zbiera komendy z całego grafu modułów, więc wspólny entrypoint załadowałby wszystkie runnery i złamał ACL6.
- **A13** **[cel]** Pilnuj bramek mechanicznie: guardian L1 chodzący po grafie `AppModule` (handler jobu w module API = czerwony test; lista znanych wyjątków tylko maleje, powód i id długu przy wpisie) oraz smoke obrazu (pętla po `src/app/cli/**/*.cli.js`, bez env, oczekiwany kod 1 z komunikatem preflight). Oba z kontrolą anty-wakuacyjną: liczba elementów ≥ próg i nazwany plik referencyjny.
- **A14** **[cel]** Kod CLI nie importuje `commander`: `nest-commander` 3.21.0 pinuje `commander` 11.1.0, a projekt ma ^15.

## NEVER
- **N1** Wiązać port jednorazowego joba ani jego handler w module kontekstu ładowanym przez API („bo tam jest reszta handlerów") — proces API niesie wtedy komendę i adapter na tabeli, których nic nie woła. Istniejące wyjątki (dziś sześć) są długiem na liście guardiana, nie wzorem do naśladowania.
- **N2** Ładować `AppModule` w runnerze jednorazowym.
- **N3** Kopiować blok bootstrapu CLI, gdy istnieje wspólny moduł bazowy (**[cel]** `CliCoreModule`). Dopóki `src/app/cli/shared/` nie istnieje, nie dopisuj kolejnej kopii bez sprawdzenia stanu zadania (wg analizy TS-INFRA-CLI-RUNNER-001 dziś pięć kopii: home-points, repair, map-markers, event-reach-centers, target-area; migracje są poza Nestem).
- **N4** Dawać `*_DRY_RUN` wartość domyślną lub uruchamiać prawdziwy przebieg bez `CONFIRM_*`.
- **N5** Dopisywać runner do `scripts/` w projekcie, którego obraz produkcyjny go nie zawiera.
- **N6** **[cel]** Zostawiać domyślny `serviceErrorHandler` z `nest-commander` albo wspólny entrypoint dla wielu jobów.
- **N7** Sprawdzać `CONFIRM_*` lub `DRY_RUN` wyłącznie w skrypcie `npm` / `run-*.sh`.
- **N8** Wracać po cichu do własnego modułu bazowego, gdy spike zgodności `nest-commander` zawiedzie: to decyzja właściciela produktu (ADR-0133, pkt 2).

## Why
Backfill map markerów (TS-MAP-MARKER-PRIVACY-001, 2026-10-24) dostał `MAP_MARKER_BACKFILL_PORT` w
`discovery.module.ts` i handler bez żadnego wyzwalacza: w repo działały już dwa lekkie runnery
(`backfill-home-points`, `repair-disclosed-point-projections`), a analiza i prompty implementera
ich nie wskazywały — biblioteka wzorców nie miała karty o CLI, RAG był wyłączony. Skutek: wiązanie
w złym module i luka w runbooku („wyzwalacza z linii poleceń jeszcze nie ma"), wyłapane dopiero po
bramce końcowej, gdy człowiek zapytał o miejsce bindingu. Reguła przesuwa to pytanie na etap
analizy.

Analiza TS-INFRA-CLI-RUNNER-001 (2026-11-09) dołożyła punkty A6, A8, A12–A14 i N6–N8: biblioteka `nest-commander`
domyślnie kończy błąd kodem 0, obraz jest distroless (potwierdzenie musi być w procesie), a wspólny entrypoint
złamałby ACL6. Wszystko oznaczone **[cel]** czeka na spike D2 (zgodność z Nest 12).
