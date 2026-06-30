# Decision: Policy vs Specification

**Kiedy wypływa:** kodujesz regułę domenową — predykat selekcji/walidacji czy decyzja biznesowa?
**Wybór między:** policy ↔ specification (oba: [specification-policy-pattern](../patterns/domain/specification-policy-pattern.md))

## Wybierz SPECIFICATION gdy
- **reużywalny PREDYKAT** — „czy X spełnia warunek?" (`isSatisfiedBy`),
- do selekcji, walidacji, filtrowania, query; komponowalny (and/or/not),
- bezstanowy, bez efektów ubocznych.

## Wybierz POLICY gdy
- **reguła/decyzja biznesowa** — „co powinno się stać / czy to dozwolone wg reguł",
- może komponować wiele specyfikacji i nadawać im znaczenie biznesowe,
- egzekwuje politykę (np. PolicyBuilder.must(spec)).

## Pytania rozstrzygające
1. Testuję **warunek** (spec) czy podejmuję **decyzję/egzekwuję regułę** (policy)?
2. Czy to reużywalny predykat (spec) czy orkiestracja reguł (policy)?
3. Czy chcę to komponować (spec) czy nadać nazwę decyzji biznesowej (policy)?

## Pułapki
- Wpychanie decyzji biznesowych do specyfikacji (spec ma tylko orzekać true/false).
- Duplikowanie logiki spec zamiast komponowania w policy.

## Sprawdź precedens projektu
`docs/adr/` + `BUSINESS_RULES.yaml` — jeśli już rozstrzygnięto, zastosuj i cytuj ADR; jeśli nie — rekomenduj + zaproponuj nowy ADR.
