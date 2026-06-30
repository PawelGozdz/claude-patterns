# Decision: Value Object vs Entity

**Kiedy wypływa:** modelujesz pojęcie domenowe — tożsamość przez wartość czy przez ID?
**Wybór między:** [value-object-pattern](../patterns/domain/value-object-pattern.md) ↔ [entity-pattern](../patterns/domain/entity-pattern.md)

## Wybierz VALUE OBJECT gdy
- **tożsamość przez wartość** (dwa o tych samych atrybutach są równe), np. Money, Address, Coordinates, EmailAddress,
- **niemutowalny** — zmiana = nowy obiekt (replace, nie mutate),
- brak własnego cyklu życia; nie obchodzi cię „który to egzemplarz", tylko jego wartość.

## Wybierz ENCJĘ gdy
- **tożsamość przez ID** (dwa o tych samych atrybutach to różne byty),
- ma cykl życia i śledzony, zmienny stan.

## Pytania rozstrzygające
1. Czy obchodzi mnie KTÓRY to egzemplarz, czy tylko jego wartość? (wartość → VO)
2. Czy zmienia się w czasie (encja) czy jest podmieniany w całości (VO)?
3. Czy dwa o identycznych polach to to samo? (tak → VO)

## Pułapki
- ID/timestampy/kwoty jako prymitywy zamiast VO (primitive obsession).
- Mutowalne VO (settery) — VO musi być immutable, walidacja TYLKO formatu.

## Sprawdź precedens projektu
`docs/adr/` + `BUSINESS_RULES.yaml` — jeśli już rozstrzygnięto, zastosuj i cytuj ADR; jeśli nie — rekomenduj + zaproponuj nowy ADR.
