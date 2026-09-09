# Cross-Context Communication — Rule Card

**Tags**: "api:app:cross-context", "api:events"
<!-- Egzekwowalne streszczenie cross-context-communication.md — decision guide
     ACL vs Integration Event vs dedicated queue vs read projection.
     Pełny wzorzec: cross-context-communication.md -->

**Layer**: Architecture · **Assumes**: ddd/core
**Status**: Production-proven (derived from ULS + juz-ide-api patterns)
**Source**: cross-context-communication.md

## Decision rules (MUST pick the matching mechanism)
- **CC1** — Result needed **immediately** for the current request, target op is fast (<500ms,
  no LLM/HTTP/heavy I/O) → **ACL Registry (sync)**.
- **CC2** — A **repeated** read (discovery/list/"near me") whose value will be persisted as a
  content anchor or feeds an authz/guardrail decision → **ACL Registry (sync)**, even though
  it's repeated — staleness there is a permanent error or access-control gap, not a UX nuance.
- **CC3** — A repeated read that is NOT an anchor/authz case → **Per-Context Read Projection**
  (own consumer-owned copy synced by event handlers) — never query ACL per row for discovery.
- **CC4** — Multiple contexts may react to the same fact, or fire-and-forget → **Integration
  Event** (`INTEGRATION_EVENTS` queue).
- **CC5** — One specific context does long-running work (LLM 2-30s, document processing,
  embeddings) and the result returns async → **dedicated BullMQ queue** + completion
  integration event.
- **CC6** — Publisher handler for a domain→integration event bridge lives in the **application
  layer** of the publishing context — domain events are NEVER consumed directly by external
  contexts.

## MUST NOT
- **N1** — ❌ Use ACL sync calls for LLM/AI calls, document processing, notifications, or
  fire-and-forget updates — redesign as async (queue or integration event).
- **N2** — ❌ Let an external context subscribe to another context's `@EventHandler(...DomainEvent)`
  directly — domain events are private to their context.
- **N3** — ❌ Use a Per-Context Read Projection for CREATE-time anchoring or an authz/guardrail
  check — a stale anchor never self-corrects, a stale "allow" is a live access-control gap.
- **N4** — ❌ Centralize projection storage across contexts "to avoid drift" — that reintroduces
  the coupling Pattern 4 exists to avoid; instead keep the handler trio's shape consistent and
  add a periodic consistency-check job.
- **N5** — ❌ Skip Rule 12 (GEO19) column-shape checks for a projection that will feed a
  spatial predicate (`ST_DWithin`/KNN) — a JSONB array is unindexable regardless of the source
  decision being correct.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Deciding which of ACL / Integration Event / dedicated queue / read projection fits a new
  cross-context call.
- ✅ Auditing an existing cross-context call for the wrong mechanism (e.g. sync call doing an
  LLM request).
- ❌ Same-context communication (this is exclusively cross-bounded-context).
- ❌ A one-off migration script's internal calls (decision tree targets steady-state code paths).

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `await aclRegistry...` wołający LLM/dokument w środku | N1 |
| `@EventHandler(XxxDomainEvent)` w innym kontekście niż właściciel | N2 |
| Discovery-read woła ACL per wiersz zamiast projekcji | CC3 |
| CREATE-handler czyta projekcję zamiast ACL dla anchor | N3 |
| Kolumna projekcji JSONB pod `ST_DWithin`/KNN | N5 |

**Pełny wzorzec**: [`cross-context-communication.md`](./cross-context-communication.md)
