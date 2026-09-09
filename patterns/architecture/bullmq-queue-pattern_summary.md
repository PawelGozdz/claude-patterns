# BullMQ Queue — Rule Card

**Tags**: "api:events:queue"
<!-- Egzekwowalne streszczenie bullmq-queue-pattern.md. Pełny wzorzec: bullmq-queue-pattern.md -->

**Layer**: Architecture
**Status**: PRODUCTION
**Source**: bullmq-queue-pattern.md

## MUST — Producer (event handler enqueuing a job)
- **BQ1** — Use the `QueueName` enum for the queue name — never a string literal.
- **BQ2** — Type the queue as `Queue<XxxJobData>` — never an untyped `Queue`.
- **BQ3** — Job data extends `BaseJobData` (includes `timestamp`, `correlationId`).
- **BQ4** — Job options always specify `attempts`, `backoff`, `priority`.
- **BQ5** — Use a 200ms delay for jobs depending on FK/MVCC visibility (e.g. integration events
  right after a transaction commit).
- **BQ6** — Event handlers **never throw** — log the error and continue (graceful degradation);
  throwing here would crash the in-process user request that triggered it.

## MUST — Consumer (Processor)
- **BQ7** — `@Processor(QueueName.XXX)` with the enum, never a string literal; extend
  `BaseQueueProcessor` for standardized error handling/logging.
- **BQ8** — Implement `protected async processJob(job: Job<T>): Promise<void>` with a typed
  `Job<XxxJobData>` parameter.
- **BQ9** — **Throw** from `processJob()` on failure — the only signal BullMQ has to retry; a
  `return` on error marks the job **completed**, silently dropping it (no retry).

## MUST — Consumer-Helper Handler (called from inside a Processor)
- **BQ10** — Throw on `result.isFailure` from `commandBus.execute()` — the processor's
  `try/catch` re-throws to trigger BullMQ retry; swallowing it with `return` causes silent data
  loss (confirmed incident pattern).
- **BQ11** — Throw on infrastructure errors (DB/network) caught from `commandBus.execute()` —
  these are transient, retry will help.
- **BQ12** — `return` without throwing is allowed **only** for an explicitly-documented expected
  absence (e.g. a specific `Result.fail()` error code meaning "not applicable, not an error") —
  must be commented inline at the check.

## MUST NOT
- **N1** — ❌ String literal instead of `QueueName` enum (producer or `@Processor`).
- **N2** — ❌ Untyped `Queue`/`Job` — always `Queue<T>`/`Job<T>`.
- **N3** — ❌ Throw from an event handler (producer side) — breaks the user's request flow.
- **N4** — ❌ `return` instead of `throw` on a processor/consumer-helper error — silently drops
  the job, no BullMQ retry.
- **N5** — 🚨 ❌ Wrap `commandBus.execute()` in `safeRun()` inside a consumer-helper —
  `safeRun` only catches thrown exceptions, but `BaseCommandHandler.execute()` returns
  `Result.fail()` (does not throw); this hid a DB failure as silent GDPR Art.17 erasure failure
  (TS-GDPR-004). Always check `result.isFailure` explicitly.
- **N6** — ❌ Plain job-data objects not extending `BaseJobData`.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Async processing >100ms that must not block the request.
- ✅ Operations needing automatic retry semantics.
- ✅ Background jobs: email, notifications, batch processing.
- ✅ MVCC-visibility-delayed cross-context integration events.
- ❌ Sub-100ms sync operations (overhead not worth it — use ACL Registry).
- ❌ Fan-out to multiple unknown consumers (use Integration Events, not a dedicated queue).

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `@InjectQueue('content-moderation')` (string literal) | BQ1/N1 |
| `Queue` bez generyka `<T>` | BQ2/N2 |
| `throw` w event handlerze producenta | N3 |
| `return` zamiast `throw` w `processJob`/consumer-helper na błąd | BQ9/BQ10/N4 |
| `safeRun(() => commandBus.execute(...))` w consumer-helperze | N5 |
| Job data bez `extends BaseJobData` | N6 |

**Pełny wzorzec**: [`bullmq-queue-pattern.md`](./bullmq-queue-pattern.md)
