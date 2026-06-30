# Decision: ACL Registry (sync) vs Domain Events (async) — komunikacja cross-context

**Kiedy wypływa:** kontekst A potrzebuje czegoś od kontekstu B. Synchronicznie czy asynchronicznie?
**Wybór między:** [acl-registry-pattern](../patterns/architecture/acl-registry-pattern.md) ↔ [domain-event-pattern](../patterns/domain/domain-event-pattern.md)

## Wybierz ACL Registry (sync, `getGlobalRequired`) gdy
- potrzebujesz **NATYCHMIAST** danych/odpowiedzi z B, aby kontynuować bieżącą operację (zapytanie),
- to odczyt/walidacja w obrębie jednej transakcji użytkownika (np. „pobierz dane usera, by zdecydować").

## Wybierz Domain Events (async) gdy
- **POWIADAMIASZ** inne konteksty, że coś się stało; eventual consistency jest OK,
- luźne sprzężenie ważniejsze niż natychmiastowość; B może zareagować później.

## Pytania rozstrzygające
1. Czy potrzebuję wyniku **synchronicznie**, by kontynuować? (tak → ACL; nie → event)
2. Czy to **zapytanie** (ACL) czy **notyfikacja o fakcie** (event)?
3. Czy B może być chwilowo niedostępny bez blokowania A? (tak → event)

## Pułapki
- Łańcuchy sync-ACL → sprzężenie + latencja + kruchość.
- Eventy, gdy realnie potrzebujesz **synchronicznej decyzji** (wynik teraz).
- EVENT_NAME dot-notation jako SSoT (nie nazwa klasy) — patrz domain-event-pattern.

## Sprawdź precedens projektu
`docs/adr/` + `BUSINESS_RULES.yaml` — jeśli już rozstrzygnięto (np. ADR o cross-context), zastosuj i cytuj; jeśli nie — rekomenduj + zaproponuj nowy ADR.
