# Command Handler Queue Port — Rule Card

**Tags**: "api:events:queue", "api:app"
<!-- Egzekwowalne streszczenie command-handler-queue-port-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kod portu, adapterów, uzasadnienie): command-handler-queue-port-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu.
     Geneza (2026-10-21): TS-SEC-D0-BETA-HARDENING-001 w juz-ide-api-1 — dwa handlery komend
     (register-with-phone, login-with-phone) dostały @InjectQueue wprost, bo żadna karta tego nie
     zakazywała, a analiza uzasadniała to zdaniem „handler nie pisze do bazy" (fałszywym). -->

**Layer**: Application · **Applies to**: `*.handler.ts` w `**/application/commands|queries/`
**Poza zakresem**: event handlery i serwisy (patrz `bullmq-queue-pattern`; handler eventu DOMENOWEGO dodatkowo przez outbox — OB1/N1), procesory BullMQ w `infrastructure/`.

## Dlaczego (sedno)
Handler komendy działa wewnątrz `@Transactional`. Bezpośrednie `queue.add` nie jest atomowe z commitem:
zadanie przeżywa rollback, a szybki worker może ruszyć przed commitem i nie zobaczyć danych. Bezpośredni
import BullMQ do warstwy application dodatkowo uzależnia ją od Redisa i uniemożliwia test jednostkowy.

## MUST
- **QP1** — Handler komendy/zapytania kolejkuje WYŁĄCZNIE przez port: `Symbol` + interfejs w `application/` (obok handlera, `queue.port.ts`), wstrzykiwany przez `@Inject(SYMBOL)`.
- **QP2** — Port mówi językiem przypadku użycia (`add(jobName, typedData, opts?)`). Nie ujawnia typów BullMQ (`Queue`, `Job`, `JobsOptions`).
- **QP3** — Wiązanie portu (`provide: SYMBOL`) i `@InjectQueue` żyją w module lub `infrastructure/` — nigdzie indziej.
- **QP4** — Zadanie czytające to, co TEN handler zapisał, albo które nie może istnieć po rollbacku → adapter portu zapisuje do outboxa (`outboxService.saveMessage`), nie woła `queue.add`. Bezpośrednie wiązanie BullMQ tylko dla zadań niezależnych od stanu tej transakcji (np. koordynator planujący niezależną pracę).
- **QP5** — Enqueue DOPIERO po sprawdzeniu `Result` z `save` (`if (saved.isFailure) return Result.fail(...)`). Błąd `add()` obsłużony jawnie: `Result.fail` albo best-effort z logiem (tylko dla zadań idempotentnych) — nigdy `throw` z `executeBusinessLogic` (CH5).
- **QP6** — Uzasadnienie w komentarzu lub analizie („handler nie pisze do bazy", „kolejka jest bezpieczna") NIE jest dowodem zgodności. Weryfikuj w kodzie handlera; karta ma pierwszeństwo.

## MUST NOT
- **N1** — ❌ `@InjectQueue`, `import ... from 'bullmq'` lub `'@nestjs/bullmq'` w `*.handler.ts` pod `application/commands|queries/`.
- **N2** — ❌ `queue.add(...)` w `executeBusinessLogic` dla zadania zależnego od zapisu z tej transakcji (patrz QP4).
- **N3** — ❌ enqueue przed `save` albo ignorowanie `Result` z `save`.
- **N4** — ❌ typ `Queue<T>` / `Job<T>` w sygnaturze portu.

## Minimal correct skeleton
```ts
// application/commands/register-with-phone/queue.port.ts
export const SMS_OTP_DELIVERY_QUEUE = Symbol('SMS_OTP_DELIVERY_QUEUE');
export interface ISmsOtpDeliveryQueue {
  add(jobName: string, data: SmsOtpDeliveryJobData): Promise<void>;
}

// handler.ts — konstruktor: @Inject(SMS_OTP_DELIVERY_QUEUE) private readonly otpQueue: ISmsOtpDeliveryQueue
const saved = await this.repository.save(aggregate);             // QP5
if (saved.isFailure) return Result.fail(saved.error);
await this.otpQueue.add('deliver-otp', { /* ... */ });          // QP1, po zapisie

// module / infrastructure — tu i tylko tu BullMQ (QP3); adapter outboxowy, gdy zadanie zależy od zapisu (QP4)
{ provide: SMS_OTP_DELIVERY_QUEUE, useClass: SmsOtpDeliveryOutboxAdapter }
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `@InjectQueue(` / `from 'bullmq'` / `from '@nestjs/bullmq'` w `application/commands\|queries/**/handler.ts` | QP1 / N1 |
| `Queue<`, `Job<`, `JobsOptions` w `queue.port.ts` | QP2 / N4 |
| `queue.add` w handlerze komendy, a zadanie czyta rekord zapisany w tym handlerze | QP4 / N2 |
| `queue.add` / `port.add` przed `repository.save(...)` lub `save` bez sprawdzenia `isFailure` | QP5 / N3 |
| komentarz „handler nie pisze do bazy" przy kolejce, a w handlerze jest `save(` | QP6 |

**Pełny wzorzec**: [`command-handler-queue-port-pattern.md`](./command-handler-queue-port-pattern.md)
