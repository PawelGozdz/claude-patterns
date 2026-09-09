# Repository Pattern (Plain) — Rule Card

**Tags**: "api:data-access"

<!-- Egzekwowalne streszczenie repository-pattern-plain.md. WIĄŻĄCE.
     Pełny wzorzec (uzasadnienie, przykłady z iam, anty-wzorce): repository-pattern-plain.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: funkcje/klasy dostępu do danych przez Kysely w projekcie
BEZ agregatów DDD (brak `domain/aggregates/`) · **Odpowiednik DDD**: `repository-pattern.md`
(`BaseKyselyRepository`, `eventMap`, CQRS)

## MUST

- **RPP1** — `db: Kysely<Database>` (albo węższy typ schematu) jako jawny parametr — konstruktor albo
  argument funkcji — nigdy moduł-poziomowy singleton żywego połączenia.
- **RPP2** — Zapis wielo-instrukcyjny w `db.transaction().execute(async (trx) => ...)`, gdy więcej niż
  jedna instrukcja musi się powieść lub nie powieść razem (zapis + wiersz audytu to najczęstszy przypadek).
- **RPP3** — Funkcja działająca WYŁĄCZNIE wewnątrz istniejącej transakcji przyjmuje `Transaction<Database>`,
  nie `Kysely<Database>` — typ dokumentuje wymóg "wywołujący musi już być w transakcji".
- **RPP4** — Funkcja zapytania zwraca typowany, camelCase kształt — mapowanie wiersza DB (snake_case)
  na granicy, nigdy przeciek surowego typu wiersza dalej.
- **RPP5** — `sql` template literal (z `kysely`) dla wszystkiego, czego query builder nie wyrazi
  (`sql\`now()\``, obliczony warunek CAS) — nigdy surowy string wklejony do `.where()`.

## MUST NOT

- **N1** — ❌ Odpytywanie globalnego/importowanego żywego `Kysely` z funkcji, która RÓWNIEŻ przyjmuje
  `db` jako parametr — jedno źródło prawdy per funkcja.
- **N2** — ❌ `throw` z wnętrza callbacku `db.transaction().execute()` dla PRZEWIDYWANEGO wyniku
  (odmowa dostępu, konflikt), jeśli ten wynik powinien mimo to zacommitować własny efekt uboczny
  (wiersz audytu) — rzucony błąd cofa CAŁĄ transakcję, łącznie z tym, co callback już zapisał
  wcześniej w tym samym bloku. Zamiast tego: zwróć dyskryminowany wynik z callbacku, rzuć (jeśli
  w ogóle) DOPIERO po zacommitowaniu transakcji.
- **N3** — ❌ Zwracanie surowego wiersza DB (kolumny snake_case, typy natywne DB) z eksportowanej
  funkcji — zmapuj na potrzebny kształt najpierw.

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `import { db } from '.../db.js'` używane bezpośrednio wewnątrz funkcji dostępu do danych | RPP1 / N1 |
| Zapis + insert do `audit_log` jako dwa oddzielne wywołania bez wspólnej transakcji | RPP2 |
| `throw` zaraz po zapisie wiersza audytu wewnątrz `db.transaction().execute()` | **N2** |
| Funkcja przyjmuje `trx` ale typ parametru to `Kysely<Database>`, nie `Transaction<Database>` | RPP3 |
| `return row` (snake_case) bezpośrednio z eksportowanej funkcji zapytania | RPP4 / N3 |
| String template wklejony do `.where()` zamiast `sql` literала | RPP5 |

**Pełny wzorzec**: [`repository-pattern-plain.md`](./repository-pattern-plain.md) — kontekst,
przykłady z `iam` (funkcje płaskie + klasa z transakcjami), anty-wzorce.
