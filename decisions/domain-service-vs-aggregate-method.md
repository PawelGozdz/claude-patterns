# Decision: Domain Service vs Aggregate Method

**Kiedy wypływa:** gdzie umieścić logikę domenową — w agregacie czy w domain service?
**Wybór między:** [domain-service-pattern](../patterns/domain/domain-service-pattern.md) ↔ [aggregate-pattern](../patterns/domain/aggregate-pattern.md)

## Wybierz METODĘ AGREGATU gdy
- logika operuje na stanie i invariantach **JEDNEGO** agregatu,
- to naturalna odpowiedzialność tego agregatu (zachowanie, nie tylko dane).

## Wybierz DOMAIN SERVICE gdy
- logika obejmuje **WIELE agregatów** lub nie należy naturalnie do żadnego,
- bezstanowa koordynacja (np. transfer między dwoma kontami, parsowanie cross-cutting),
- przyjmuje gotowe obiekty domenowe (nie ID), bez zależności infrastrukturalnych, zwraca Result.

## Pytania rozstrzygające
1. Czy logika potrzebuje **>1 agregatu**? (tak → domain service)
2. Czy mieści się w odpowiedzialności jednego agregatu? (tak → metoda)
3. Czy to bezstanowa koordynacja? (tak → domain service)

## Pułapki
- Anemiczne agregaty (cała logika w serwisach) — preferuj metody agregatu, gdy dotyczy jednego.
- Agregat sięgający do innego agregatu (zamiast tego: domain service lub event).

## Sprawdź precedens projektu
`docs/adr/` + `BUSINESS_RULES.yaml` — jeśli już rozstrzygnięto, zastosuj i cytuj ADR; jeśli nie — rekomenduj + zaproponuj nowy ADR.
