# Value Object — Rule Card
<!-- Egzekwowalne streszczenie value-object-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): value-object-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Domain · **Applies to**: `*.vo.ts` w `**/domain/value-objects/`
**Base**: `BaseValueObject<Props>` (@vytches/ddd) · **ADR**: 0013, 0021

## MUST
- **VO1** — extends `BaseValueObject<Props>` — ZAWSZE, bez wyjątków (w tym VO oparte na enumach).
- **VO2** — konstruktor `private` — NIGDY wywoływany bezpośrednio przez klienta.
- **VO3** — tworzenie przez `static create(...)` zwracające `Result<VO, ValidationError>`.
- **VO4** — wszystkie pola `readonly`, ZERO setterów (immutability).
- **VO5** — normalizacja w fabryce: trim whitespace, lowercase/uppercase gdy wymagane.
- **VO6** — TYLKO walidacja formatu/struktury (ADR-0021): długość, zakres, regex, format.
- **VO7** — implementacja `getEqualityComponents()` — wymagana dla poprawnego `.equals()`.
- **VO8** — implementacja `validate(props)` wymagana przez `BaseValueObject`.
- **VO9** — metody obliczeniowe jako czyste funkcje (zero side effects, zero async).
- **VO10** — dla VO opartych na enumach: `declare public readonly value: EnumType` (re-deklaracja bez emisji JS).

## MUST NOT
- **N1** — ❌ reguły biznesowe w VO — tylko format/struktura (ADR-0021); logika biznesowa → Specification.
- **N2** — ❌ import z `infrastructure/` lub zależności zewnętrznych (DB, HTTP).
- **N3** — ❌ `async`/`Promise` — value objects muszą być synchroniczne.
- **N4** — ❌ settery ani mutowalne pola.
- **N5** — ❌ bezpośrednie `new XxxVO(...)` poza metodami fabrycznymi.
- **N6** — 🚨 ❌ plain class zamiast `extends BaseValueObject` — brak `.equals()`, hash, kontraktów DDD.

## Minimal correct skeleton
```ts
import { BaseValueObject, Result } from '@vytches/ddd';

// Wzorzec props-based (tekst, liczby, złożone struktury)
interface XxxProps {
  value: string;
  hash: string;                                     // VO7 — hash-based equality
}

export class XxxVO extends BaseValueObject<XxxProps> {  // VO1
  protected readonly props: XxxProps;               // VO4

  private constructor(props: XxxProps) {            // VO2
    super(props);
    this.props = props;
  }

  static create(raw: string): Result<XxxVO, XxxValidationError> {  // VO3
    if (!raw) return Result.fail(XxxValidationError.required('xxx'));
    const normalized = raw.trim().toLowerCase();    // VO5
    if (normalized.length < 3 || normalized.length > 100) {        // VO6 — format only
      return Result.fail(XxxValidationError.invalidLength('xxx', 3, 100));
    }
    return Result.ok(new XxxVO({ value: normalized, hash: XxxVO.hash(normalized) }));
  }

  validate(props: XxxProps): boolean {              // VO8
    return props.value.length >= 3 && props.value.length <= 100 && props.hash.length === 64;
  }

  protected getEqualityComponents(): unknown[] {    // VO7
    return [this.props.hash];
  }

  get value(): string { return this.props.value; }  // VO4 — getter, no setter

  pureCalc(): number { return this.props.value.length; }  // VO9 — pure fn

  private static hash(v: string): string {
    return require('crypto').createHash('sha256').update(v).digest('hex');
  }
}

// Wzorzec enum-based (canonical)
export class XxxTypeVO extends BaseValueObject<XxxTypeEnum> {  // VO1
  declare public readonly value: XxxTypeEnum;                  // VO10

  private constructor(value: XxxTypeEnum) { super(value); }   // VO2

  static create(raw: string): Result<XxxTypeVO, XxxError> {   // VO3
    const normalized = raw?.toUpperCase().trim();              // VO5
    if (!Object.values(XxxTypeEnum).includes(normalized as XxxTypeEnum))
      return Result.fail(new XxxError(raw));
    return Result.ok(new XxxTypeVO(normalized as XxxTypeEnum));
  }

  static foo(): XxxTypeVO { return new XxxTypeVO(XxxTypeEnum.FOO); }

  // @ts-ignore: TS2416 — intentional covariant override
  override getValue(): XxxTypeEnum { return this.value; }

  validate(v: unknown): boolean {
    return typeof v === 'string' && Object.values(XxxTypeEnum).includes(v as XxxTypeEnum);
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `class XxxVO {` bez `extends BaseValueObject` | VO1 / N6 |
| `new XxxVO(` poza fabrykami | VO2 / N5 |
| brak `static create()` lub zwraca `XxxVO` (nie `Result`) | VO3 |
| setter / brak `readonly` na polach | VO4 / N4 |
| brak `.trim()` / `.toLowerCase()` dla string VO | VO5 |
| walidacja reguły biznesowej (np. minAge, uprawnienie) | VO6 / N1 |
| brak `getEqualityComponents()` | VO7 |
| brak `validate(props)` | VO8 |
| `async` / `await` w metodzie VO | VO9 / N3 |
| `import { ... } from '...infrastructure...'` | N2 |
| plain enum class bez `declare public readonly value` | VO10 |

**Pełny wzorzec**: [`value-object-pattern.md`](./value-object-pattern.md)
