# Migracje wielowydaniowe i backfill — Rule Card

**Tags**: "api:data-access:migration"
<!-- Egzekwowalne streszczenie migration-release-safety-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (uzasadnienie, incydenty): migration-release-safety-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: migracje (`**/migrations/*.ts`, rejestr `migrations/index.ts`), mappery i repozytoria zapisujące kolumny objęte migracją, porty repair/backfill
**Scope**: project-specific (juz-ide-api) · **Źródło**: pamięć bramki końcowej, 3 wpisy, incydenty 2026-11

## MUST
- **MG1** — decyzja dzieli zmianę na wydania (expand/kod teraz, contract/DROP później): kod pakietu NIE pisze kolumny NOT NULL, którą usuwa DROP w osobnym wydaniu, ALBO ten sam pakiet niesie odwracalną migrację expand `DROP NOT NULL` (numer niższy niż contract).
- **MG2** — przed oddaniem sprawdź nullability każdej usuwanej kolumny w wygenerowanych typach z HEAD (`git show HEAD:<plik typów>`: pole bez `?` i bez `Generated<>` = NOT NULL bez domyślnej) i czy mapper (`toPersistence`) oraz upserty nadal ją piszą. `ON CONFLICT DO UPDATE` nie ratuje: NOT NULL jest sprawdzany na krotce INSERT.
- **MG3** — surowy `sql` w portach repair/backfill grepuj po nazwie usuwanej kolumny: po contract pada, `tsc` tego nie widzi.
- **MG4** — migracja „po wdrożeniu" (backfill, contract) NIE trafia do rejestru migracji w tej samej zmianie co expand, chyba że plik taska jawnie dzieli commity. Merge uruchamia zarejestrowane migracje przed startem nowej rewizji, więc okno, które drugie wydanie miało zamknąć, powstaje.
- **MG5** — licznik kontrolny przed następnym krokiem (ile wierszy zostało) to OSOBNE zapytanie, nie ten sam predykat co `UPDATE` (inaczej przechodzi z konstrukcji).
- **MG6** — przy każdej gałęzi `continue`/SKIP backfillu zapytaj „co ten wiersz trzyma w zakresie ALL?". Skip musi wyzerować kolumnę bramki albo liczyć pominięte do bramki. Dotyczy też wspólnego helpera (wczesne `continue` przy nierozwiązanym punkcie nie dociera do adaptera).
- **MG7** — asercje L2 backfillu prześledź statycznie po każdej gałęzi, której wynik się zmienił: L2 nie biegnie w sondzie, a `npm run test` pomija `*.integration.spec.ts`.

## MUST NOT
- **N1** — ❌ kod, który przestał pisać kolumnę NOT NULL, bez migracji expand w tym samym pakiecie: testy i typecheck widzą schemat PO wszystkich migracjach, więc luka między wydaniami jest dla nich niewidoczna.
- **N2** — ❌ rejestracja migracji drugiego wydania obok pierwszej w jednym drzewie.
- **N3** — ❌ SKIP, który zostawia starą niepustą wartość kolumny bramki: licznik `IS NULL = 0` i odczyt fail-closed go nie widzą.

## Jak sprawdzić
```bash
git show HEAD:<plik typów> | grep -n '<usuwana_kolumna>'            # nullability (MG2)
grep -rn "<usuwana_kolumna>" src/ --include=*.ts | grep -v spec      # zapisy i surowy sql (MG2, MG3)
git diff -- <katalog migracji>/index.ts                              # rejestracja drugiego wydania (MG4)
```

## Wyjątek
Plik taska jawnie opisuje podział commitów albo wdrożenie z opróżnioną kolejką: wtedy MG4 wypełnia kolejność z taska, a nie ta karta.
