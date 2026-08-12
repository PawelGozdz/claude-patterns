# Either / Failure Handling — Rule Card

<!-- Egzekwowalne streszczenie either-error-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (hierarchia Failure, fold(), konwencja UI ERROR-UX-001): either-error-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: repozytoria, źródła danych, use case'y, providery, widgety obsługujące błąd

## MUST

- **FEE1** — Repozytoria **nigdy nie rzucają**: każda metoda publiczna zwraca `Either<Failure, T>`.
- **FEE2** — Źródła danych rzucają wyjątki; repozytorium je łapie i opakowuje w `Failure`.
- **FEE3** — Use case zwraca `Either`; rozpakowanie przez `fold()` należy do prezentacji.
- **FEE4** — `Failure` niesie komunikat dla użytkownika — do UI nie trafia stack trace.
- **FEE5** — Każdy typ `Failure` odpowiada konkretnej akcji naprawczej (ponów, zaloguj się ponownie, popraw dane).
- **FEE6** — W `catch` łap typy szczegółowe przed ogólnymi; `Exception` nigdy jako jedyny catch.

## MUST NOT

- **N1** — ❌ `throw` z metody repozytorium.
- **N2** — ❌ `catch (e) { throw e }` w warstwie data bez zamiany na `Failure`.
- **N3** — ❌ Surowy komunikat wyjątku wyświetlony użytkownikowi.
- **N4** — ❌ Jeden generyczny `Failure` na wszystko — traci się mapowanie na akcję naprawczą.

## Konwencja prezentacji (ERROR-UX-001)

Globalny toast, gdy błąd nie ma właściciela w UI · błąd inline, gdy akcja ma konkretny element odpowiedzialny · dedykowany stan błędu (`ErrorState`), gdy ekran nie ma czego pokazać.

## Powiązane

`flutter/clean-architecture-pattern.md` (FCA4 — kontrakt wyjścia use case'a)
