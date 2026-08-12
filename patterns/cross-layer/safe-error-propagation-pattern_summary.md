# Safe Error Propagation — Rule Card

<!-- Egzekwowalne streszczenie safe-error-propagation-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): safe-error-propagation-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: repozytoria, handlery, fabryki błędów domenowych, mappery HTTP · **Źródło**: audyt TS-SEC-011

## MUST

- **SEP1** — Repozytorium (`BaseKyselyRepository` i pochodne) zwraca **generyczny** komunikat błędu; surowy błąd trafia wyłącznie do `cause`. Nazwy tabel, kolumn, treść SQL ani identyfikatory sterownika nie pojawiają się w `message`.
- **SEP2** — Logowanie należy do handlerów, nie do repozytoriów. Handler opakowujący porażkę repozytorium **najpierw loguje surowy błąd po stronie serwera**, dopiero potem zwraca generyczny błąd domenowy.
- **SEP3** — Propagacja `Result.fail(x.error)` jest dozwolona tylko dla błędów o kontrolowanej treści: błędy agregatu, błędy Value Objectów (`Email.create()` itp.) oraz błędy celowo użytkownikowe (`LockAcquisitionError`, `ConcurrentOperationError`).
- **SEP4** — Mapper błędów kontekstu to ostatnia linia obrony: konstruuje wyjątki HTTP z **komunikatów statycznych**, nigdy z `error.message`.
- **SEP5** — Błąd usługi zewnętrznej (OAuth, SMS, płatności) jest logowany wewnętrznie, a na zewnątrz idzie nowy, generyczny błąd domenowy.

## MUST NOT

- **N1** — ❌ Interpolacja komunikatu błędu w błąd domenowy (`Result.fail(new SomeError(...${error.message}...))`).
- **N2** — ❌ Przekazanie komunikatu wprost (`Result.fail(new SomeError(error.message))`).
- **N3** — ❌ `static factory(details: string)` wstawiająca `details` do komunikatu — fabryki błędów domenowych nie przyjmują surowych szczegółów infrastruktury.
- **N4** — ❌ `new HttpException(error.message, ...)` w mapperze.
- **N5** — ❌ `catch (e) { return Result.fail(someFactory(e.message)) }` — blok `catch` loguje wewnętrznie i zwraca nowy, generyczny błąd.
- **N6** — ⚠️ `Result.fail(repoResult.error)` wymaga sprawdzenia: dopuszczalne wyłącznie wtedy, gdy repozytorium spełnia **SEP1**.

## Powiązane

`cross-layer/domain-errors-pattern.md` (Result i hierarchia błędów) · `cross-layer/error-handler-chain-pattern.md` (ADR-0041) · `cross-layer/logger-pattern.md` · `cross-layer/security-invariants-pattern.md` (Invariant 4 to ta sama reguła od strony HTTP)
