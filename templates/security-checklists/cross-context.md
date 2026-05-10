# Cross-context checklist — augment when task crosses bounded contexts

> Appended to task when canonical-labels matches `cross_context` group
> (integration, multi-context, ACL Registry usage). Inherits universal items.

## Boundary discipline

- [ ] **No direct cross-context imports** — never `import { X } from
  '../other-context/...'`. Use ACL Registry: `aclRegistry.getGlobalRequired<IAuth>()`
- [ ] **Hybrid event pattern** — internal communication via domain events
  (within context) + integration events (between contexts). Domain events
  emitted in aggregates, integration events from handlers ONLY
- [ ] **Anti-corruption layer (ACL)** — translate other context's
  vocabulary at the boundary; don't leak external context's domain
  language inward

## Data flow

- [ ] **No PII spread without lawful basis** — when context A passes data
  to context B, B's lawful basis covers receipt + processing
- [ ] **Idempotency keys** — cross-context mutations use idempotency keys
  to prevent duplicate processing on retry
- [ ] **Event versioning** — integration events have schema version
  field; consumer handles both N and N-1 (graceful upgrade)

## Failure modes

- [ ] **Optimistic locking on aggregates** — concurrent mutations
  detected via version field, not last-write-wins
- [ ] **Saga compensation** — multi-context workflows have explicit
  compensation actions for each step (rollback of distributed changes)
- [ ] **Circuit breaker for outgoing calls** — calls to other context's
  HTTP/RPC endpoints have timeout + circuit breaker to prevent cascade
  failure

## Audit trail (cross-context is high-stakes)

- [ ] **Both contexts emit Tier-1 events** — A emits "X.requested", B
  emits "X.completed". Correlation_id links them
- [ ] **Schema documented** — integration event JSON schema in
  `BUSINESS_RULES.yaml` or equivalent, versioned

## B2G additions (when labels include `b2g` or `audit-required`)

- [ ] **Distributed audit trace** — every cross-context flow has
  end-to-end trace ID propagated through all contexts (for regulator
  audits)
- [ ] **Retention policy aligned** — audit events kept ≥ 5 years (KSC
  default for government systems)
