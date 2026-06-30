# Decision: Aggregate (root) vs Entity

**Kiedy wypływa:** modelujesz obiekt z tożsamością — czy to korzeń agregatu, czy encja wewnątrz?
**Wybór między:** [aggregate-pattern](../patterns/domain/aggregate-pattern.md) ↔ [entity-pattern](../patterns/domain/entity-pattern.md)

## Wybierz AGREGAT (root) gdy
- ma własny cykl życia i jest **granicą spójności/transakcji** (egzekwuje invarianty obejmujące swoje części),
- jest niezależnie pobierany/zapisywany (ma repozytorium),
- jest referowany z zewnątrz przez ID (także cross-context).

## Wybierz ENCJĘ (nie-root) gdy
- ma tożsamość, ale **żyje WEWNĄTRZ agregatu** i jest dostępna tylko przez korzeń,
- nie ma niezależnego cyklu życia ani własnego repozytorium.

## Pytania rozstrzygające
1. Czy jest niezależnie zapisywalna/pobieralna? (tak → agregat)
2. Czy strzeże invariantu, na którym polegają inni? (tak → agregat)
3. Czy jest referowana spoza swojego agregatu? (tak → agregat, przez ID)

## Pułapki
- Robienie WSZYSTKIEGO agregatem → kontencja transakcji, wielkie agregaty.
- Bezpośrednie referowanie encji wewnętrznych (omijając korzeń).

## Sprawdź precedens projektu
`docs/adr/` + `BUSINESS_RULES.yaml` — jeśli już rozstrzygnięto, **zastosuj i cytuj ADR**; jeśli nie — rekomenduj wg powyższego i zaproponuj **nowy ADR**.
