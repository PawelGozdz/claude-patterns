---
name: security-review
description: Complete security review for NestJS/DDD applications. Covers STRIDE threat analysis, DREAD risk scoring, LINDDUN privacy threats, and code-level security patterns. Use before PR merge or when implementing auth, PII handling, cross-context integration, or new API endpoints.
origin: LocalHero-patterns
allowed-tools: Read, Glob, Grep, Bash
effort: medium
paths:
  - "**/auth/**"
  - "**/guards/**"
  - "**/controllers/**"
  - "**/handlers/**"
  - "**/*.controller.ts"
  - "**/*.handler.ts"
  - "**/*.guard.ts"
---

# Security Review — NestJS/DDD

## When to Activate

Run this review when you are:
- Adding a new API endpoint (controller method)
- Adding a new command or query handler
- Implementing or modifying an authentication / session flow
- Adding cross-context integration (ACL Registry calls)
- Processing or storing PII data (new field, new table, new data flow)
- Adding or modifying roles, permissions, or access policies
- Modifying rate limiting guards

---

## Phase 1: Code-Level Security Checklist

Review each modified file against these 12 checks. Mark PASS, WARN, or VETO.

1. **No PII in logs** — No `console.log`, `console.error`, or `this.logger` call contains email, name, address, coordinates, userId, or other PII fields.

2. **Auth decorator on every endpoint** — Every `@Controller` method has either `@Auth()` + `@RequirePermissions(...)` or `@Public()` with a comment explaining why public access is intentional.

3. **DTO validated by Zod before handler** — Every command/query DTO is parsed through a Zod schema at the controller boundary before reaching the handler. No raw `req.body` passed to handlers.

4. **No userId in request body** — The Zod schema for request body does not contain a `userId` field. Identity is extracted from `RequestContextService` or JWT claims only (Dual Identity pattern).

5. **PII fields have crypto-shredding plan** — Every new PII field added to a database table has a corresponding entry in `BUSINESS_RULES.yaml` describing retention policy and deletion mechanism (crypto-shredding or anonymization).

6. **Repository uses query builder** — All database queries use Kysely, TypeORM query builder, or parameterized raw queries. No string interpolation in SQL (`WHERE field = '${value}'` is a VETO).

7. **Domain error factory does not accept free-text details** — `DomainError` subclasses do not accept `details: string` as a constructor parameter (prevents leaking internal context into error objects that propagate to HTTP layer).

8. **Error mapper does not use error.message in response body** — The controller error mapper (or `@Catch()` filter) does not forward `error.message` directly as the HTTP response body. Only mapped, safe error codes are returned.

9. **Cross-context via ACL Registry** — Any reference to another bounded context's types or services uses `aclRegistry.getGlobalRequired(ContextToken)`. No direct imports between context directories.

10. **Secrets from env with startup validation** — Any new secret or external service URL is read from `process.env` and validated at module initialization (throws on missing value, not at first use).

11. **Audit event for PII operations** — Any operation that reads or modifies another user's PII, or changes role/permission assignments, emits a Tier-1 or Tier-2 audit domain event (per ADR-0027).

12. **Zero high/critical CVEs** — `pnpm audit --prod` shows 0 high or critical vulnerabilities, OR each existing finding has a documented suppression with justification in `docs/security/audit-suppressions.md`.

---

## Phase 2: STRIDE Quick Check

For each new or modified component, answer these questions YES or NO. A NO answer is a finding that must be addressed or explicitly accepted.

| Category | Question |
|----------|----------|
| **S** Spoofing | Does this endpoint verify identity through `@Auth()` + JWT claims extracted server-side, rather than trusting identity data from the request body? |
| **T** Tampering | Are all mutations idempotent or protected by optimistic locking (e.g., version field, `WHERE updated_at = $expected`)? |
| **R** Repudiation | Does this operation emit a Tier-1 audit event (ADR-0027) so the action cannot be denied? |
| **I** Information Disclosure | Is it impossible for an error response from this endpoint to contain a stack trace, raw SQL query, internal class name, or other infrastructure detail? |
| **D** Denial of Service | Is the rate limit guard on this endpoint fail-closed — meaning it returns 503 when Redis is unavailable, rather than allowing unlimited requests? |
| **E** Elevation of Privilege | If this introduces a new role or permission check, is it enforced via `PolicyBuilder.must(spec)` rather than an inline `if (user.role === ...)` check? |

---

## Phase 3: DREAD Risk Score

When a finding is identified in Phase 1 or Phase 2, calculate its DREAD score before deciding on severity.

**Formula**: Score = D + R + E + A + D (range 5–15)

| Dimension | 1 — Low | 2 — Medium | 3 — High |
|-----------|---------|-----------|---------|
| **D** Damage | Minimal, no data leak | Data leak < 100 users, limited outage | Sensitive PII leak, platform unavailable, contract loss |
| **R** Reproducibility | Hard to reproduce, requires special conditions | Repeatable by skilled attacker | Fully reproducible by anyone with internet access |
| **E** Exploitability | Requires deep knowledge or physical access | Requires system knowledge and available tools | Public exploit or point-and-click tool available |
| **A** Affected users | < 10 users | 10–1000 users | > 1000 users or all users |
| **D** Discoverability | Requires source code access | Requires active scanning | Publicly visible, easy to discover via recon |

**Thresholds**:
- Score **≥ 12** → Critical — **BLOCK merge**
- Score **9–11** → High — **BLOCK merge**
- Score **6–8** → Medium — fix before release
- Score **5** → Low — document and monitor

---

## Phase 4: LINDDUN Privacy Check

For every data flow or data store that handles PII, answer each question. A YES triggers the listed action.

| # | Threat | Question | YES triggers |
|---|--------|----------|-------------|
| **L** | Linkability | Can two pseudonymized records belonging to the same person be linked without accessing identity data? | Pseudonymization review required |
| **I** | Identifiability | Can the data combined with any available context re-identify a specific person? | Data minimization or Art. 25 review |
| **N** | Non-repudiation | Does the system force users to leave a trace (audit log, public record) that could harm them? | Art. 22 appeal workflow review |
| **D** | Detectability | Can an attacker determine that a specific person is in the system without seeing their data (existence disclosure)? | Access control review |
| **D** | Disclosure | Can an unauthorized party read private data? | Authorization and encryption review |
| **U** | Unawareness | Is the user unaware that their data is being processed in this way (missing Art. 13/14 GDPR notice)? | Privacy policy update required |
| **N** | Non-compliance | Does this processing violate GDPR, local data protection law, or other applicable regulation? | **DPIA required before deployment** |

When **Non-compliance = YES** → do not merge until DPIA is completed or legal counsel confirms exemption.

---

## Output Format

Report findings per file in this format:

```
[PASS] src/contexts/auth/application/handlers/login.handler.ts — all 12 checks passed
[WARN] src/contexts/auth/infrastructure/controllers/auth.controller.ts — check #11: no audit event on password change
[VETO] src/contexts/community/infrastructure/controllers/post.controller.ts — check #4: userId accepted from body in CreatePostDto
```

- **PASS** — no issues found
- **WARN** — issue found, does not block merge but must be tracked (create task)
- **VETO** — issue found that blocks merge; must be fixed before approval

DREAD scores for VETO findings:

```
VETO: userId in CreatePostDto body
DREAD: D=3, R=3, E=2, A=3, D=2 → Score=13 (Critical)
Fix: Remove userId from Zod schema; extract from RequestContextService in handler
```
