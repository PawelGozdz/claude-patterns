# Safe Error Propagation — Rule Card

**Tags**: "api:security", "api:api-surface:errors"

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
- **SEP6** — Kontekst z ≥1 plikiem `*-error.mapper.ts` MA mechaniczny guardian test (`*-error-message-leak.guardian.spec.ts` lub odpowiednik) — review kodu bez tego to polityka, nie kontrolka; usterka wraca po cichu (dowód: naprawiona 2026-05-23, wróciła, niewykryta 4 miesiące).
- **SEP7** — Guardian odkrywa pliki mapperów przez skan katalogu (`readdirSync` + regex na nazwie), NIGDY przez ręcznie wpisaną listę — lista cicho nie chroni mappera dodanego jutro.
- **SEP8** — Skan katalogu obejmuje WSZYSTKIE lokalizacje mapperów, nie tylko `src/contexts/**` — global/fallback mapper poza konwencją to realny ślepy punkt.
- **SEP9** — Regex wykrywający leak łapie WSZYSTKIE 4 kształty: (1) `.message` jako pierwszy argument, (2) przez zmienną pośrednią, (3) zagnieżdżone w metadanych pod explicit key, (4) to samo jako object-shorthand PO przypisaniu do zmiennej ORAZ przez receiver w nawiasie/rzutowaniu (`(e as Error).message`). Każdy kształt osobno potwierdzony mutation-testingiem jako realna luka (DREAD 8).
- **SEP10** — Guardian ma kontrolę anty-wakuacyjną: liczba odkrytych plików ≥ próg PLUS nazwany plik-referencja, który musi być obecny — inaczej zepsuty scan root cicho degraduje do `it.each([])` (0 testów = 100% zielono = 0% ochrony).

## MUST NOT

- **N1** — ❌ Interpolacja komunikatu błędu w błąd domenowy (`Result.fail(new SomeError(...${error.message}...))`).
- **N2** — ❌ Przekazanie komunikatu wprost (`Result.fail(new SomeError(error.message))`).
- **N3** — ❌ `static factory(details: string)` wstawiająca `details` do komunikatu — fabryki błędów domenowych nie przyjmują surowych szczegółów infrastruktury.
- **N4** — ❌ `new HttpException(error.message, ...)` w mapperze.
- **N5** — ❌ `catch (e) { return Result.fail(someFactory(e.message)) }` — blok `catch` loguje wewnętrznie i zwraca nowy, generyczny błąd.
- **N6** — ⚠️ `Result.fail(repoResult.error)` wymaga sprawdzenia: dopuszczalne wyłącznie wtedy, gdy repozytorium spełnia **SEP1**.
- **SEP11** — ❌ `case X: default: return sameStaticMessage` — `default:` dzielący treść komunikatu z sąsiednim nazwanym `case` przez fallthrough. Przyszły trzeci kod błędu po cichu dziedziczy niepasujący komunikat, mimo że jego `code` jest zmapowany poprawnie. `default:` ma WŁASNĄ gałąź z WŁASNYM generycznym komunikatem.

## Powiązane

`cross-layer/domain-errors-pattern.md` (Result i hierarchia błędów) · `cross-layer/error-handler-chain-pattern.md` (ADR-0041) · `cross-layer/logger-pattern.md` · `cross-layer/security-invariants-pattern.md` (Invariant 4 to ta sama reguła od strony HTTP) · referencja SEP6-SEP10: `src/shared/response/errors/__tests__/no-raw-error-message-leak.guardian.spec.ts` (juz-ide-api-2)
