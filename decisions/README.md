# Decision Cards — wybór wzorca z wymagań (DDD)

Kuratorskie karty decyzyjne: **jak wybrać** między wzorcami przy danych wymaganiach.
To **FRAMEWORK decyzji** (central, stały) — odróżnij od:
- **patterns/** = „jak zbudować X" (szablon),
- **projekt `docs/adr/` + BUSINESS_RULES** = „co TEN projekt już zdecydował" (PRECEDENS, żywy).

**Reguła:** karta konsultuje ADR-y projektu. Jeśli decyzja już zapadła → zastosuj precedens (cytuj ADR),
nie re-decyduj. Jeśli nie → rekomenduj wg karty + zaproponuj **nowy ADR**. (Pętla: karta→decyzja→ADR→precedens.)

## Karty
| Karta | Decyzja |
|---|---|
| [aggregate-vs-entity](aggregate-vs-entity.md) | korzeń agregatu czy encja wewnątrz? |
| [value-object-vs-entity](value-object-vs-entity.md) | tożsamość przez wartość czy ID? |
| [aggregate-boundary](aggregate-boundary.md) | jeden agregat czy osobne (granica spójności)? |
| [acl-vs-domain-events](acl-vs-domain-events.md) | cross-context sync (ACL) czy async (events)? |
| [policy-vs-specification](policy-vs-specification.md) | predykat selekcji/walidacji czy decyzja biznesowa? |
| [domain-service-vs-aggregate-method](domain-service-vs-aggregate-method.md) | logika wielu agregatów czy jednego? |

## Użycie
Wstrzykiwane w stage **ddd-modeling** komendy `/analyze-ddd` — agent dobiera trafne karty wg tego,
czego dotyka task, konsultuje `docs/adr/`, i rekomenduje wzorzec **z uzasadnieniem** (+ flaguje nowe decyzje jako ADR).

## Override w projekcie
Projekt może dodać `.claude/decisions/<karta>.md` → nadpisuje centralną (rzadko, gdy projekt realnie odbiega).
Materializacja: symlink przez setup-project.sh do `.claude/knowledge/decisions/`.
