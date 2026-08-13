# Flutter Clean Architecture — Rule Card

**Tags**: "mobile:app", "mobile:domain"

<!-- Egzekwowalne streszczenie clean-architecture-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (struktura feature-first, przykłady warstw): clean-architecture-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Architecture · **Applies to**: `lib/features/*/{domain,data,presentation}`, `lib/shared/`

## MUST

- **FCA1** — Warstwa domeny ma **zero importów paczek**: bez Fluttera, bez Dio, bez Riverpoda. Dozwolone `dart:core` i `dartz`.
- **FCA2** — Warstwa data importuje domenę i implementuje jej interfejsy; nigdy nie importuje prezentacji.
- **FCA3** — Prezentacja nie sięga do warstwy data bezpośrednio — wyłącznie przez providery.
- **FCA4** — Każdy use case zwraca `Future<Either<Failure, T>>`; z domeny nie wychodzi surowy wyjątek.
- **FCA5** — Jeden use case = jedna metoda publiczna (`call()`).
- **FCA6** — Modele rozszerzają lub implementują encje, nigdy odwrotnie.
- **FCA7** — Zaczynaj od kodu w obrębie feature'a; do `shared/` przenoś dopiero, gdy potrzebuje tego drugi feature.

## MUST NOT

- **N1** — ❌ `import 'package:flutter/...'` w `domain/`.
- **N2** — ❌ Widget czytający repozytorium albo źródło danych z pominięciem providera.
- **N3** — ❌ Encja domenowa dziedzicząca po modelu warstwy data (odwrócona zależność).
- **N4** — ❌ Serwis-moloch z wieloma operacjami zamiast osobnych use case'ów.

## Powiązane

`flutter/either-error-pattern.md` (kontrakt błędów między warstwami) · `flutter/riverpod-provider-pattern.md`
