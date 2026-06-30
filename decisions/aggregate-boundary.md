# Decision: Jeden agregat vs osobne agregaty (granica agregatu)

**Kiedy wypływa:** dwa powiązane pojęcia — w jednym agregacie czy osobno?
**Wybór między:** wspólna granica spójności ↔ osobne agregaty (ref przez ID) — [aggregate-pattern](../patterns/domain/aggregate-pattern.md)

## Trzymaj w JEDNYM agregacie gdy
- istnieje **prawdziwy invariant** wymagający spójności w **tej samej transakcji** (muszą się zmieniać atomowo),
- części nie mają sensu bez korzenia.

## Rozdziel na OSOBNE agregaty gdy
- **eventual consistency** jest akceptowalna (brak invariantu same-transaction),
- mają **niezależne cykle życia**,
- chcesz uniknąć kontencji/wielkich agregatów.

## Pytania rozstrzygające
1. Czy jest realny invariant wymagający spójności w jednej transakcji? (tak → jeden agregat)
2. Czy to tylko **asocjacja**, a nie invariant? (tak → osobne, ref przez ID)
3. Czy mają niezależne cykle życia? (tak → osobne)

## Pułapki
- Wielkie agregaty → kontencja, pamięć, wolne zapisy.
- Rozdzielanie rzeczy dzielących prawdziwy invariant → niespójność.
- Referowanie innych agregatów przez OBIEKT zamiast przez ID.

## Sprawdź precedens projektu
`docs/adr/` + `BUSINESS_RULES.yaml` — jeśli już rozstrzygnięto, zastosuj i cytuj ADR; jeśli nie — rekomenduj + zaproponuj nowy ADR.
