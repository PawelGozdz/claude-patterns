# Integration Event Pattern — Rule Card

**Tags**: "api:events:integration", "api:events:outbox"
<!-- Egzekwowalne streszczenie integration-event-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, decision tree, incydenty, przykłady): integration-event-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu.
     Karta dopisana 2026-09-09 (TASK-KAIZEN-002 follow-up) — do tej pory brak karty zmuszał
     orchestrate-prepare.mjs do wstrzykiwania PEŁNEGO pliku (38KB) do promptu implementera
     przy każdej turze, ilekroć ten wzorzec się dopasował. -->

**Layer**: Architecture · **Applies to**: klasy `*IntegrationEvent`, domain event handlery
publikujące do outboxa, `IntegrationEventFanOutService`/routing table, `@Processor` per kontekst

## MUST

- **IE1** — Integration event publikowany WYŁĄCZNIE przez domain event handler piszący do
  outboxa (Pattern 1, kanoniczny): `Aggregate → domain event → handler → outbox.saveMessage()
  → [COMMIT] → poller → fanOut → kolejka → processor`.
- **IE2** — Klasa rozszerza `ProjectIntegrationEvent`, payload TYLKO typy prymitywne
  (`string`/`number`/`boolean`/`Date`/`Record<string, unknown>`) — zero VO/Entity/domain types.
- **IE3** — Każda klasa deklaruje pełny `GDPRIntegrationContext` (containsPII, legalBasis,
  retentionPeriod, processingPurpose) I pełny `SecurityIntegrationContext` (issuedBy,
  requiresDeduplication, securityLevel, encryptionRequired).
- **IE4** — `public static readonly EVENT_NAME = 'integration.<context>.<verb>'` (dot-notation)
  + `public override readonly eventName = ClassName.EVENT_NAME`. Używaj `ClassName.EVENT_NAME`
  WSZĘDZIE (routing table klucz, `switch case`, emitter, priority sets) — nigdy string literal.
- **IE5** — Statyczna `fromPayload()` — fabryka do rekonstrukcji w pollerze/procesorze.
- **IE6** — Publikacja to zmiana TRZYCZĘŚCIOWA w jednym diffie: zapis do outboxa +
  wpis w `routingTable` + `case` w procesorze docelowego kontekstu. Brak jednej części = martwy
  kod albo cicha utrata eventu (INC 2026-06-04, TS-INTEGRATION-EVENT-WIRING-AUDIT-001).
- **IE7** — Konsument idempotentny (outbox = at-least-once). `default:` w `switch (eventName)`
  loguje i NIE rzuca.

## MUST NOT

- **N1** — ❌ `eventDispatcher.dispatchEvent(...)` dla integration eventu — anti-pattern
  (in-process, brak atomiczności, brak retry, nie przechodzi granicy procesu API↔worker).
- **N2** — ❌ Agregat emitujący integration event bezpośrednio (`this.apply(new XIntegrationEvent(...))`)
  — agregaty emitują WYŁĄCZNIE domain events.
- **N3** — ❌ Command handler publikujący integration event po `save()` — dual-write, publikacja
  poza transakcją agregatu. Zawsze przez domain event handler → outbox.
- **N4** — ❌ Klucz routing table lub `case` jako string literal nazwy klasy
  (`'FooIntegrationEvent'`) zamiast `FooIntegrationEvent.EVENT_NAME` — `eventName` w payloadzie
  jest dot-notation, string literal daje `routingTable[undefined] = []`, event znika bez śladu.
- **N5** — ❌ Próg/filtr decydujący czy event "się liczy" w konsumencie — próg należy do
  producenta (decyduje, czy w ogóle emitować) albo do payloadu, nie do logiki konsumenta.
- **N6** — ❌ Kontekst konsumujący WŁASNY integration event, który sam wyemitował — to błąd
  modelowania, właściwy mechanizm to domain event.

## Minimal correct skeleton

```ts
// domain event handler — WEWNĄTRZ transakcji, jedyne miejsce emisji (IE1)
@EventHandler(JobCompletedEvent)
export class JobCompletedIntegrationEmitterHandler {
  constructor(@Inject(OUTBOX_SERVICE) private readonly outbox: IOutboxService) {}
  async handle(event: JobCompletedEvent): Promise<void> {
    await this.outbox.saveMessage(JobCompletedIntegrationEvent.EVENT_NAME, {
      jobId: event.getJobId(), // IE2 — prymitywy, nie domain types
    });
  }
}
// routing table (fan-out service) — klucz = ClassName.EVENT_NAME (IE4, nigdy string)
[JobCompletedIntegrationEvent.EVENT_NAME]: [this.neQueue],
// per-context processor — switch na eventName, default nie rzuca (IE7)
switch (eventName) {
  case JobCompletedIntegrationEvent.EVENT_NAME:
    await this.commandBus.execute(new SomeCommand(payload.jobId as string));
    break;
  default:
    break;
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `eventDispatcher.dispatchEvent(new XIntegrationEvent(...))` | N1 |
| `IntegrationEvent` konstruowany/emitowany w `domain/**/aggregates/` | N2 |
| Command handler emituje integration event po `save()` wewnątrz `@CommandHandler` | N3 |
| Klucz routing table lub `case` to string literal (`'FooIntegrationEvent'`) zamiast `Foo.EVENT_NAME` | N4 |
| Próg/filtrowanie w `@Processor` przed wywołaniem `commandBus.execute()` | N5 |
| Nowy `outbox.saveMessage()` bez wpisu w `routingTable` LUB bez `case` w procesorze | IE6 |
| Brak statycznej `fromPayload()` | IE5 |
| Brak pełnego GDPR/security context (4+4 pola) | IE3 |
| Kontekst ma `case` na event, który sam wyemitował | N6 |

**Pełny wzorzec**: [`integration-event-pattern.md`](./integration-event-pattern.md)
