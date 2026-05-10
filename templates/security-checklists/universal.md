# Universal security checklist — every NestJS-DDD task

> **Always included.** These items apply to every task regardless of feature
> scope. Match the 5 universal invariants in
> `claude-patterns/patterns/cross-layer/security-invariants-pattern.md` plus
> B2G-readiness items (audit trail, data sovereignty) that should be on
> by default if the project is heading toward government/regulated workloads.
>
> **B2G-readiness rationale:** even if you're not B2G today, these items
> prevent debt that would otherwise need expensive remediation later
> (audit trail retrofit, data sovereignty migration, etc.).

## 5 universal invariants (NestJS-DDD)

- [ ] **No `userId` in Zod request body schemas** — extract from
  `RequestContextService` / authenticated context, never from client input
- [ ] **Every controller method decorated** — `@Auth()` (with optional
  `@RequirePermissions(...)`) or `@Public()` (with comment justifying why)
- [ ] **Rate-limit guards fail-closed** — throw 503 when Redis/backend
  unavailable, never fail-open (silently allow)
- [ ] **No `error.message` / `error.stack` in HTTP responses** — map
  domain errors to safe codes via error mapper; infrastructure errors
  return generic `INTERNAL_ERROR`
- [ ] **No PII in logger calls** — `logger.info({ userId, emailHash })`,
  not `logger.info({ user })`. Hash/truncate/omit PII fields explicitly

## B2G-readiness (always-on)

- [ ] **Audit trail emitted** — every state mutation emits a Tier-1
  domain/integration event with `actor`, `timestamp`, `correlation_id`
  (project may reference its audit ADR — e.g., LH ADR-0027)
- [ ] **Data sovereignty confirmed** — new data stored on PL/EU
  infrastructure (Postgres region, Redis region, S3 bucket region, log
  retention region). If external SaaS — confirm DPA + Schrems II
  adequacy
- [ ] **DPIA awareness** — if task processes any PII, link to DPIA
  reference or note "no DPIA required because [Art. 35 ground]". Don't
  silently skip
- [ ] **Polish regulatory check** — if task touches identifiers, check
  KSC requirements (PESEL, NIP, REGON normalization & retention rules)

## Reference

- Pattern: `cross-layer/security-invariants-pattern.md` (right/wrong code examples)
- Pattern: `cross-layer/safe-error-propagation-pattern.md` (full error mapping discipline)
- Pattern: `cross-layer/logger-pattern.md` (PII filtering)
