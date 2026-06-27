# Domain Event — Rule Card
<!-- Egzekwowalne streszczenie domain-event-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): domain-event-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Domain · **Applies to**: `*.event.ts` w `**/domain/events/`
**Base**: `ProjectDomainEvent<PII, Anonymized, Business>` (@shared/domain) · **ADR**: 0025, 0027

## MUST
- **EV1** — extends `ProjectDomainEvent<PiiData, AnonymizedData, BusinessData>` z 3 generics.
- **EV2** — GDPR segregacja: KAŻDY event ma `piiData`, `anonymizedData`, `businessData`, `cryptoShredding` — BEZ wyjątków.
- **EV3** — nazwa eventu z enum kontekstu (TS-EVENTS-002): `public static readonly EVENT_NAME = ContextEventNames.XXX` ORAZ `public override readonly eventName = ContextEventNames.XXX`.
- **EV4** — wersja eventu: `public readonly eventVersion = 1`.
- **EV5** — `correlationId: string` w KAŻDYM `businessData` — wymagane do tracingu.
- **EV6** — konstruktor ustawia `(this as any).aggregateId = props.businessData.{primaryId}`.
- **EV7** — KAŻDE pole `businessData` ma getter z undefined check: `this.getBusinessData()?.field || fallback`.
- **EV8** — `cryptoShredding` zawiera `piiFields: string[]`, `retentionPeriod: number` (dni), `isShredded: boolean`.
- **EV9** — `businessData` zawiera timestamp (`createdAt` / `updatedAt` / akcja-specific).
- **EV10** — metody query dla logiki handlerów (np. `wasApproved()`, `isReply()`).
- **EV11** — Tier 1 eventy (PII + state change) mają audit handler per ADR-0027 (patrz `audit-handler-pattern.md`).

## MUST NOT
- **N1** — ❌ PII (email, token, hash) w `businessData` — TYLKO w `piiData`.
- **N2** — ❌ brak `correlationId` w `businessData`.
- **N3** — ❌ dostęp do danych bez undefined check (direct `this.businessData.field`).
- **N4** — ❌ hardcoded string w eventMap (`'engagement.comment.created'`) — użyj enum z computed property.
- **N5** — ❌ duplikacja nazwy eventu — SSoT w enum (TS-EVENTS-002).
- **N6** — ❌ brak `cryptoShredding` w propsach eventu.
- **N7** — ❌ brak rejestracji eventu w `eventMap` repozytorium — runtime error.
- **N8** — ❌ pominięcie audit handlera dla Tier 1 eventów — naruszenie GDPR Art. 30.

## Minimal correct skeleton
```ts
import { ProjectDomainEvent } from '@shared/domain';
import { ContextEventNames } from './event-names.enum';     // EV3 — context enum

// EV2 — GDPR segregacja
export interface XxxPiiData { sensitiveField: string; }     // N1 — PII tu, nie w business
export interface XxxAnonymizedData { category: string; hourOfDay: number; }
export interface XxxBusinessData {
  entityId: string;                                         // EV6
  correlationId: string;                                    // EV5
  createdAt: Date;                                          // EV9
}
export interface XxxEventProps {
  piiData: XxxPiiData;
  anonymizedData: XxxAnonymizedData;
  businessData: XxxBusinessData;
  cryptoShredding: {                                        // EV8
    piiFields: string[];       // np. ['sensitiveField']
    retentionPeriod: number;   // dni — 2555 = 7 lat (prawo PL)
    isShredded: boolean;       // false przy tworzeniu
  };
}

export class XxxCreatedEvent extends ProjectDomainEvent<   // EV1
  XxxPiiData, XxxAnonymizedData, XxxBusinessData
> {
  public static readonly EVENT_NAME = ContextEventNames.XXX_CREATED; // EV3
  public override readonly eventName = ContextEventNames.XXX_CREATED; // EV3
  public readonly eventVersion = 1;                        // EV4

  constructor(props: XxxEventProps) {
    super(props);
    (this as any).aggregateId = props.businessData.entityId; // EV6
  }

  getEntityId(): string {                                  // EV7 — undefined check
    return this.getBusinessData()?.entityId || '';
  }

  wasCreatedToday(): boolean {                             // EV10 — query method
    return this.getBusinessData()?.createdAt.toDateString() === new Date().toDateString();
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `email` / `token` / `hash` w interfejsie `BusinessData` | N1 |
| brak `correlationId` w `BusinessData` | N2 |
| `this.businessData.field` bez `?.` | N3 |
| `'context.entity.action'` jako string klucz eventMap | N4 |
| `EVENT_NAME` i `eventName` z różnych źródeł (string vs enum) | N5 |
| brak `cryptoShredding` w propsach | N6 |
| nowy event niezarejestrowany w `eventMap` repozytorium | N7 |
| Tier 1 event bez audit handlera | N8 |
| brak `extends ProjectDomainEvent` | EV1 |
| brak `eventVersion` | EV4 |
| brak `(this as any).aggregateId = ...` w konstruktorze | EV6 |

**Pełny wzorzec**: [`domain-event-pattern.md`](./domain-event-pattern.md)
