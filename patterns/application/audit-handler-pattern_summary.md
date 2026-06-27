# Audit Handler — Rule Card
<!-- Egzekwowalne streszczenie audit-handler-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, anti-patterns): audit-handler-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Application · **Applies to**: `*.handler.ts` w `**/application/event-handlers/`
**Base**: `BaseAuditHandler` (@shared/application/audit) · **Decorators**: `@Injectable()`, `@EventHandler(XxxEvent)`
**ADR**: 0027 (tier classification — KRYTYCZNY), 0025 (hybrid event system)

## MUST
- **AH1** — extends `BaseAuditHandler` — dostarcza kolejkę BullMQ, metadane GDPR, circuit breaker.
- **AH2** — implementuje `getBoundedContext()` zwracające nazwę kontekstu (`'Auth'`, `'Trust'` itp.).
- **AH3** — implementuje `getEventCategory()` zwracające kategorię GDPR (`'AUTHENTICATION'` itp.).
- **AH4** — KAŻDY event Tier 1 (ADR-0027) musi mieć metodę handlera — brak oznacza naruszenie GDPR Art. 30.
- **AH5** — każda metoda handlera dekorowana `@EventHandler(XxxEvent)` i `async … Promise<void>`.
- **AH6** — handler rejestrowany w `providers` modułu — auto-discovery przez `VytchesExplorerService`.
- **AH7** — `createAuditEntry()` zawiera wszystkie wymagane pola GDPR: `legalBasis`, `dataCategories`, `retentionPeriod`.
- **AH8** — PII wyłącznie w formie zanonimizowanej: `event.getAnonymizedData()`, nigdy `event.getPiiData()`.
- **AH9** — eventy bezpieczeństwa i compliance oznaczane flagami: `securityEvent: true` / `complianceEvent: true`.
- **AH10** — handler NIE zawiera logiki biznesowej — wyłącznie buduje wpis audytowy na podstawie danych eventu.

## MUST NOT
- **N1** — ❌ pominięcie któregokolwiek eventu Tier 1 — naruszenie GDPR Art. 30 (obowiązkowy rejestr przetwarzania).
- **N2** — ❌ surowe PII w wpisie audytowym (`piiData.email`, `piiData.phone` itp.) — GDPR Art. 5(1)(c) minimalizacja danych.
- **N3** — ❌ `throw` / niezłapany wyjątek — błąd audytu nie może przerywać business flow.
- **N4** — ❌ logika biznesowa w handlerze (walidacje, decyzje domenowe, zmiany stanu) — handler jest TYLKO obserwatorem.
- **N5** — ❌ ominięcie rejestracji w `providers` modułu — handler nie otrzyma eventów.

## Minimal correct skeleton
```ts
import { Injectable } from '@nestjs/common';
import {
  BaseAuditHandler,
  type BoundedContextName,
  type AuditEventCategory,
} from '@shared/application/audit';
import { XxxCreatedEvent, XxxDeletedEvent } from '../../domain/events';

@Injectable()                                              // AH6 — wymagane do auto-discovery
export class XxxAuditHandler extends BaseAuditHandler {   // AH1

  protected getBoundedContext(): BoundedContextName {      // AH2
    return 'Xxx';
  }

  protected getEventCategory(): AuditEventCategory {       // AH3
    return 'XXX_OPERATIONS';
  }

  // AH4 — Tier 1 MANDATORY (ADR-0027)
  @EventHandler(XxxCreatedEvent)                           // AH5
  async handleXxxCreated(event: XxxCreatedEvent): Promise<void> {
    const anonymized = event.getAnonymizedData();          // AH8 — nigdy getPiiData()

    await this.createAuditEntry('XXX_CREATED', {           // AH7 — wszystkie pola GDPR
      userId:          event.aggregateId,
      segment:         anonymized?.hashedUserSegment,
      timestamp:       event.getCreatedAt(),
      legalBasis:      'CONTRACT',
      dataCategories:  ['identity'],
      retentionPeriod: '7_YEARS',
    });
    // AH10 — zero logiki biznesowej powyżej — wyłącznie createAuditEntry()
  }

  // AH4 — Tier 1 MANDATORY — GDPR Art. 17 Right to Erasure
  @EventHandler(XxxDeletedEvent)
  async handleXxxDeleted(event: XxxDeletedEvent): Promise<void> {
    await this.createAuditEntry('XXX_DELETED', {
      userId:          event.aggregateId,
      timestamp:       event.getDeletedAt(),
      legalBasis:      'LEGAL_OBLIGATION',
      dataCategories:  ['identity', 'compliance'],
      retentionPeriod: '10_YEARS',
      complianceEvent: true,                               // AH9
    });
    // AH3 — brak throw — N3
  }
}
```

Rejestracja w module (auto-discovery):
```ts
// xxx.module.ts
@Module({
  providers: [
    XxxAuditHandler,   // AH6 — wystarczy dodać do providers
    // ... pozostałe providery
  ],
})
export class XxxModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    // ✅ Brak ręcznego eventBus.subscribe() — VytchesExplorerService
    // wykrywa @EventHandler dekoratory automatycznie
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| Kontekst z Tier 1 eventami bez handlera audytowego | AH4 / N1 |
| `event.getPiiData().email` / `.phone` w `createAuditEntry()` | AH8 / N2 |
| `throw` lub nieprzecięty `Promise` rejection | N3 |
| Walidacja / `if (x > threshold) doSomething()` w handlerze | AH10 / N4 |
| Brak `XxxAuditHandler` w `providers[]` modułu | AH6 / N5 |
| Brak `legalBasis` / `dataCategories` / `retentionPeriod` | AH7 |
| Brak `@EventHandler(XxxEvent)` na metodzie | AH5 |
| Brak `extends BaseAuditHandler` | AH1 |
| Brak `getBoundedContext()` lub `getEventCategory()` | AH2 / AH3 |
| Tier 1 event z ADR-0027 bez odpowiadającej metody | AH4 / N1 |

**Pełny wzorzec**: [`audit-handler-pattern.md`](./audit-handler-pattern.md)
