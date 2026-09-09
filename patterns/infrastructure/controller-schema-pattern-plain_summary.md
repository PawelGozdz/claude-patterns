# Controller & Schema Pattern (Plain) — Rule Card

**Tags**: "api:api-surface", "api:security:validation"

<!-- Egzekwowalne streszczenie controller-schema-pattern-plain.md. WIĄŻĄCE.
     Pełny wzorzec (uzasadnienie, przykłady z iam, anty-wzorce): controller-schema-pattern-plain.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: trasy Fastify (`app.get/post/put/delete(...)`) w projekcie
BEZ klas kontrolerów i BEZ command/query busa · **Odpowiednik NestJS/DDD**: `controller-schema-pattern.md`

## MUST

- **CSP1** — Każdy query param, path param i body walidowane schematem Zod, `.safeParse()` (nie
  `.parse()`) na początku handlera, przed jakąkolwiek inną logiką.
- **CSP2** — `.strict()` na każdym schemacie obiektowym walidującym body — nieznane pole to 400,
  nigdy ciche pominięcie ani przekazanie dalej.
- **CSP3** — Jednolity kształt błędu przy nieudanym `.safeParse()` — `{ error: string }`, ta sama
  nazwa pola w każdej trasie serwisu.
- **CSP4** — Dokładnie jeden zarejestrowany `setErrorHandler`, który w jednym miejscu decyduje, co
  nieprzechwycony błąd może powiedzieć wywołującemu — błędy klienta (`statusCode < 500`) mogą
  odbić `err.message` (jest frameworkowy: malformed JSON, rate limit), 5xx NIE MOŻE.
- **CSP5** — Uwierzytelnianie przez `preHandler`, nie wewnątrz ciała trasy — funkcja handlera
  powinna być osiągalna dopiero po potwierdzeniu tożsamości wywołującego przez preHandler.

## MUST NOT

- **N1** — ❌ Wywołanie `schema.parse(input)` (wariant rzucający) bezpośrednio w handlerze bez
  otaczającego `try/catch` — nieprzechwycony `ZodError` trafia do generycznego error handlera i
  produkuje cokolwiek ten handler emituje dla 500, nie czyste 400.
- **N2** — ❌ `err.message` w ciele odpowiedzi 5xx — nazwa ograniczenia Postgresa, fragment stosu
  ani żaden inny szczegół wewnętrzny nie może przekroczyć granicy HTTP przy nieoczekiwanym błędzie.
- **N3** — ❌ Nietypowane/`any` body odczytywane pole po polu ręcznie — cały sens `.safeParse()`
  zwracającego `parsed.data` w tym, że każde pole po tej linii jest zweryfikowanym, typowanym wejściem.

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `schema.parse(req.body)` bez `try/catch` w handlerze | **N1** |
| Schemat body bez `.strict()` | CSP2 |
| `reply.send({ error: err.message })` w `setErrorHandler` bez rozróżnienia statusu | **N2** |
| Różne nazwy pola błędu między trasami (`{error}` vs `{message}` vs string) | CSP3 |
| Więcej niż jeden `setErrorHandler` albo brak żadnego | CSP4 |
| Logika autoryzacji wewnątrz ciała handlera zamiast `preHandler` | CSP5 |
| `req.body as any` z ręcznym destrukturowaniem pól | N3 |

**Pełny wzorzec**: [`controller-schema-pattern-plain.md`](./controller-schema-pattern-plain.md) —
kontekst, przykłady z `iam` (query + body walidacja, `setErrorHandler`), anty-wzorce.
