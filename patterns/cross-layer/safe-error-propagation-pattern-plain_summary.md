# Safe Error Propagation (Plain) — Rule Card

**Tags**: "api:security", "api:api-surface:errors"

<!-- Egzekwowalne streszczenie safe-error-propagation-pattern-plain.md. WIĄŻĄCE.
     Pełny wzorzec (przykłady, uzasadnienie): safe-error-propagation-pattern-plain.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: warstwa dostępu do danych, kod łapiący błędy bazy/SDK/HTTP i obsługa błędów HTTP w serwisie Node BEZ `Result` i mapperów NestJS · **Odpowiednik NestJS**: `safe-error-propagation-pattern.md`

## MUST

- **SEPP1** — Warstwa dostępu do danych rzuca błąd o **statycznym** komunikacie (bez nazw tabel, kolumn, SQL ani identyfikatorów sterownika); surowy błąd trafia wyłącznie do `cause`.
- **SEPP2** — Warstwa, która obsługuje porażkę, **najpierw loguje surowy błąd po stronie serwera**, dopiero potem zwraca albo rzuca nowy, generyczny błąd.
- **SEPP3** — Błąd przechodzi dalej bez zmian tylko wtedy, gdy ma kontrolowaną treść: własne klasy błędów ze statycznym tekstem i błędy walidacji. Błąd opakowujący sterownik, SDK albo klienta HTTP trzeba najpierw zamienić (SEPP1–2).
- **SEPP4** — Handler błędów HTTP to ostatnia linia obrony: odpowiedź 5xx powstaje ze statycznego tekstu, nigdy z `err.message`; echo komunikatu dozwolone wyłącznie dla 4xx opisujących samo żądanie.
- **SEPP5** — Błąd usługi zewnętrznej (OAuth, SMS, płatności) jest logowany wewnętrznie, a na zewnątrz idzie nowy, generyczny błąd.
- **SEPP6** — W tabeli kod → komunikat gałąź `default:` ma WŁASNY generyczny komunikat; nie dzieli go z sąsiednim `case` przez fallthrough.

## MUST NOT

- **N1** — ❌ Interpolacja komunikatu błędu w nowy błąd (`new AppError(`...${err.message}`)`).
- **N2** — ❌ Przekazanie komunikatu wprost (`new AppError(err.message)`).
- **N3** — ❌ Fabryka błędu przyjmująca surowe `details: string` i wstawiająca je do komunikatu.
- **N4** — ❌ `reply.send({ error: err.message })` dla błędu 5xx.
- **N5** — ❌ `catch (e) { return fail(makeError(e.message)) }` — blok `catch` loguje wewnętrznie i zwraca NOWY, generyczny błąd.

## Powiązane

`cross-layer/safe-error-propagation-pattern.md` (wariant NestJS/DDD) · `cross-layer/security-invariants-pattern-plain.md` (SIP4: odpowiedzi 5xx) · `cross-layer/logger-pattern-plain.md`
