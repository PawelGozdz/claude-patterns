# Pattern: Migracje wielowydaniowe i backfill

**Tags**: "api:data-access:migration"
**Scope**: project-specific (juz-ide-api)
**Karta reguł**: [migration-release-safety-pattern_summary.md](migration-release-safety-pattern_summary.md) (MG1–MG7, N1–N3)

## When to Use
- ✅ Decyzja dzieli zmianę schematu na wydania: expand i kod teraz, backfill i contract (`DROP`) po wdrożeniu.
- ✅ Zmiana usuwa lub zmienia znaczenie kolumny, którą pisze mapper, upsert albo surowy `sql`.
- ✅ Backfill z gałęziami `continue`/SKIP, uruchamiany w zakresie obejmującym także wiersze już zapisane przez nowego producenta.
- ❌ Jednowydaniowa migracja addytywna bez usuwania i bez backfillu (wystarczy zwykła reguła repozytorium).

## Dlaczego to osobny wzorzec
Testy i typecheck biegną na schemacie po WSZYSTKICH migracjach. Luka między wydaniami (kod już nie pisze kolumny, której `DROP`
jeszcze nie było) i luka w backfillu (wiersz pominięty, ale ze starą wartością bramki) są więc dla nich niewidoczne i wychodzą
dopiero na demo albo produkcji. Bramka końcowa łapie je ręcznie, za ok. $5 za wywołanie; karta przenosi pytania do implementera.

## Incydenty (źródło reguł)
- **MG1–MG3.** 2026-11: `job_requests.location*`, potem `geo_platform_user_snapshot.coordinates` w nowym pisarzu-cronie; port repair
  czytał `current_location` usuwane w migracji 353. Pakiet kodu przestał pisać kolumnę NOT NULL, a `DROP` miał przyjść w osobnym wydaniu.
- **MG4–MG5.** TS-SEC-USER-BLOCK-003 (2026-11-02): migracja backfillu 351 zarejestrowana razem z 350. Merge do main migruje automatycznie
  przed startem nowej rewizji, więc okno, które drugie wydanie miało zamknąć, powstało. Bramka D0 w tym samym `up()` liczyła ten sam
  predykat co `UPDATE`, więc przechodziła z konstrukcji. Plik taska nie opisywał podziału commitów.
- **MG6–MG7.** TS-MAP-MARKER-PRIVACY-001: backfill pominął odległe obszary bez resetu `location_provenance`; krok 3 runbooka istnieje
  właśnie na ten wyścig. Spec L2 nadal twierdził wynik sprzed poprawki i nikt nie zobaczył go na czerwono, bo `npm run test` pomija
  `*.integration.spec.ts`.

## Granice
Karta nie zastępuje decyzji o podziale wydań (należy do analizy i planu) ani testu L2: mówi, o co zapytać i co sprawdzić przed oddaniem.
