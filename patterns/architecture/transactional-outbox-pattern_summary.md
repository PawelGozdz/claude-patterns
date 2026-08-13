# Transactional Outbox — Rule Card

**Tags**: "api:events:outbox", "api:data-access:transaction"
<!-- Egzekwowalne streszczenie transactional-outbox-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, poller, przykłady): transactional-outbox-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu.
     Geneza karty (2026-07-03): reguły istniały TYLKO w pełnym wzorcu, poza ścieżką
     wstrzykiwania — implementerzy wołali fanOut wprost z handlerów eventów domenowych. -->

**Layer**: Architecture · **Applies to**: handlery eventów domenowych w `application/**/event-handlers/`, `outbox*.service.ts`, `outbox-poller*`

## Dlaczego (sedno)
Handler eventu domenowego wykonuje się **SYNCHRONICZNIE, WEWNĄTRZ transakcji** CQRS-handlera
(`@Transactional`, CLS). Każdy side-effect wysłany stamtąd bezpośrednio (kolejka, HTTP, fanout):
1. **wycieka mimo rollbacku** — transakcja może się jeszcze wywalić PO handlerze, a event
   integracyjny/zasób zewnętrzny już poszedł w świat;
2. **ginie przy crashu** — push do BullMQ/Redis jest poza atomowością DB (crash window).
Outbox rozwiązuje oba: wiersz w tabeli outbox commit-uje się RAZEM z transakcją; dopiero
poller (po commit) wykonuje faktyczną publikację.

## MUST
- **OB1** — Handler eventu domenowego wykonuje WYŁĄCZNIE operacje w TEJ SAMEJ transakcji DB
  (zapisy tabel + outbox). Zero I/O zewnętrznego.
- **OB2** — Publikacja integracyjna/kolejkowa z handlera przez `outboxService.saveMessage(eventName, jobData)`
  — wiersz outbox w tej samej transakcji co zmiany domenowe.
- **OB3** — Faktyczny fanout (BullMQ/HTTP/integration events) wykonuje **outbox poller PO commit**
  — nigdy handler.
- **OB4** — Konsument joba z outbox jest **idempotentny** (outbox = at-least-once delivery).
- **OB5** — Wpis outbox niesie `eventName` + payload wystarczający do rekonstrukcji joba
  bez ponownego czytania agregatu.

## MUST NOT
- **N1** — ❌ `fanOutService.fanOut(...)` / `queue.add(...)` / `fetch`/`axios`/SMTP bezpośrednio
  z handlera eventu domenowego — crash window + rollback-leak.
- **N2** — ❌ Emisja integration eventu z AGREGATU (agregaty emitują wyłącznie domain events —
  patrz integration-event-pattern / entity-event-emission).
- **N3** — ❌ `saveMessage()` wywołane poza transakcją command-handlera (np. z serwisu bez
  `@Transactional` w łańcuchu) — traci atomowość, czyli cały sens outboxa.

## Minimal correct skeleton
```ts
// application/xxx/event-handlers/xxx-created.handler.ts — WEWNĄTRZ transakcji CQRS
@EventsHandler(XxxCreatedEvent)
export class XxxCreatedHandler {
  constructor(@Inject(OUTBOX_SERVICE) private readonly outbox: IOutboxService) {}
  async handle(event: XxxCreatedEvent): Promise<void> {
    // OB1/OB2 — TYLKO zapis do outbox (ta sama transakcja); ZERO fanout/HTTP/kolejek (N1)
    await this.outbox.saveMessage('integration.xxx.created', { xxxId: event.xxxId });
  }
}
// OB3 — publikację robi outbox-poller.service.ts PO commit (patrz pełny wzorzec)
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `fanOut(` w pliku pod `application/**/event-handlers/` | N1 |
| `queue.add(` / `fetch(` / `axios` / `.emit(` (transport) w handlerze eventu domenowego | N1 |
| `IntegrationEvent` konstruowany/emitowany w `domain/**/aggregates/` | N2 |
| `saveMessage(` w kodzie bez `@Transactional` w łańcuchu wywołań | N3 |
| Nowy typ eventu integracyjnego bez obsługi w pollerze | OB3 |

**Pełny wzorzec**: [`transactional-outbox-pattern.md`](./transactional-outbox-pattern.md)
