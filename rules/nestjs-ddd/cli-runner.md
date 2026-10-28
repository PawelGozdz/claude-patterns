# Rule: CLI Runner (one-off / operational job)
**Governs**: wzorzec runnera jednorazowego (backfill, repair, migracja danych) uruchamianego poza procesem API — w projekcie: `src/app/cli/<job>/` (przykład: `repair-disclosed-point-projections/`), `src/contexts/geographic-auth/infrastructure/cli/` (backfill home points), `src/shared/database/migrations/cli.ts`
**Applies to**: `*.cli.ts`, `*-cli.module.ts` / `*.module.ts` pod `**/cli/**`; każdy command handler, który nie ma wejścia HTTP ani crona, oraz jego binding portu

> Karta wzorca jeszcze nie istnieje — reguła opiera się na istniejącym kodzie. Przed dodaniem
> kolejnego runnera sprawdź `src/app/cli/` i `**/infrastructure/cli/`, nie zakładaj, że go brak
> (TS-MAP-MARKER-PRIVACY-001: backfill zbindowany w module kontekstu, bo nikt nie sprawdził).

## ALWAYS
- Zanim napiszesz handler komendy bez endpointu i bez crona, ustal w analizie JAK i KTO go uruchamia: nazwany runner (`*.cli.ts`), skrypt `package.json` i wpis w runbooku. Komenda bez wyzwalacza to kod, którego nikt nie wykona.
- Uruchamiaj job w LEKKIM module CLI (`NestFactory.createApplicationContext`, bez listenera HTTP), nigdy w `AppModule`: bez workerów BullMQ (zjadłyby produkcyjne kolejki), `@Cron` i Redisa obok danych, które job zmienia.
- Składaj w module CLI tylko to, czego potrzebuje handler: `ConfigModule`, `DatabaseModule`, `DDDModule`, `ACLModule` oraz (gdy trzeba) `SecretsModule`. Brak providera ma wywalić `app.init()` błędem DI od razu, nie po cichu w połowie przebiegu.
- Gdy handler woła kontekst `geographic-auth` przez ACL, zarejestruj w module CLI lekki adapter (np. `DisclosedHomePointOnlyAclAdapter`) pod kluczem kontekstu. Nie ładuj w runnerze `GeographicAuthModule` (ACL6: jeden adapter na klucz).
- Binduj port joba (`{ provide: *_PORT, useClass: … }`) w module CLI, nie w module kontekstu. Adapter zostaje w `infrastructure/` kontekstu; zmienia się tylko miejsce wiązania.
- Trzymaj `*.cli.ts` cienki, zero logiki biznesowej: bootstrap kontekstu, pętla po paczkach przez `ICommandBus`, kursor z poprzedniego wyniku (wznowienie), kod wyjścia 0/1. Każda paczka to osobna transakcja w handlerze.
- Umieszczaj kod runnera w `src/` (nie w `scripts/`): `tsc` kopiuje go do `dist/`, a obraz produkcyjny nie ma katalogu `scripts/`.
- Wymagaj jawnej konfiguracji z env: `*_DRY_RUN` bez wartości domyślnej (brak lub śmieć = błąd, nigdy cichy przebieg na żywo) i `CONFIRM_*=yes` dla skryptu `npm` z prawdziwym przebiegiem; obok osobny skrypt `:dry-run`.
- Loguj strukturalnie, same liczniki i kursor. Zero współrzędnych, adresów, kluczy, digestów i `error.message`.
- Napisz testy runnera: config (dry-run, brak CONFIRM), runner (pętla, kursor, zatrzymanie przy pustej paczce, błąd portu = kod ≠ 0) i `module.integration` na prawdziwych providerach (`app.init()` bez błędu DI, handler rozwiązany z busa).
- Opisz w runbooku komendy i kolejność wdrożenia (np. migracja → backfill → odczyt fail-closed).

## NEVER
- Wiązać port jednorazowego joba ani jego handler w module kontekstu ładowanym przez API („bo tam jest reszta handlerów") — proces API niesie wtedy komendę i adapter na tabeli, których nic nie woła.
- Ładować `AppModule` w runnerze jednorazowym.
- Kopiować blok bootstrapu CLI po raz czwarty bez sprawdzenia, czy wspólny moduł bazowy już istnieje (dziś trzy kopie: migracje, backfill home points, repair projections).
- Dawać `*_DRY_RUN` wartość domyślną lub uruchamiać prawdziwy przebieg bez `CONFIRM_*`.
- Dopisywać runner do `scripts/` w projekcie, którego obraz produkcyjny go nie zawiera.

## Why
Backfill map markerów (TS-MAP-MARKER-PRIVACY-001, 2026-10-24) dostał `MAP_MARKER_BACKFILL_PORT` w
`discovery.module.ts` i handler bez żadnego wyzwalacza: w repo działały już dwa lekkie runnery
(`backfill-home-points`, `repair-disclosed-point-projections`), a analiza i prompty implementera
ich nie wskazywały — biblioteka wzorców nie miała karty o CLI, RAG był wyłączony. Skutek: wiązanie
w złym module i luka w runbooku („wyzwalacza z linii poleceń jeszcze nie ma"), wyłapane dopiero po
bramce końcowej, gdy człowiek zapytał o miejsce bindingu. Reguła przesuwa to pytanie na etap
analizy.
