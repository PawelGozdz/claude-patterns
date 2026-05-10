---
name: security-check
description: Quick pre-commit security checklist for NestJS/DDD projects. Scans modified files for common security anti-patterns. Use before every PR or commit touching auth, controllers, handlers, or PII data.
origin: LocalHero-patterns
allowed-tools: Read, Glob, Grep, Bash
effort: low
---

# Security Check — Pre-Commit

## When to Use

Run this check before every PR or commit that touches:
- Controllers (`*.controller.ts`)
- Command or query handlers (`*.handler.ts`)
- Auth guards or permission guards (`*.guard.ts`)
- DTOs or Zod schemas for request validation
- Domain aggregates or value objects handling PII
- Rate limiting configuration
- Cross-context ACL integrations

---

## Automated Checks

Run these grep commands against the modified files. Each finding is a potential BLOCK.

```bash
# Check 1: userId in request body schema (Dual Identity violation)
# Finds userId field defined inside Zod body schemas
grep -rn "userId.*z\." src/ --include="*.dto.ts" --include="*.schema.ts"

# Check 2: console.log / console.error / console.warn in production code
# Excludes test files — any hit in non-test TS file is a warning
grep -rn "console\.\(log\|error\|warn\)" src/ --include="*.ts" \
  | grep -v "\.spec\." | grep -v "\.test\." | grep -v "__tests__"

# Check 3: Controllers missing @Auth or @Public decorator
# Lists controller files that have no auth annotation at all
grep -rn "@Controller" src/ --include="*.ts" -l \
  | xargs grep -L "@Auth\|@Public"

# Check 4: Rate limit guard catch block that does not throw or return false
# Detects potential fail-open pattern in guards
grep -rn "catch" src/ --include="*.guard.ts" \
  | grep -v "throw\|Result\.fail\|return false\|next(err)"

# Check 5: Raw SQL string interpolation (SQL injection risk)
# Finds template literals inside repository or query files containing SQL keywords
grep -rn "\`.*SELECT\|INSERT\|UPDATE\|DELETE.*\${" src/ --include="*.ts" \
  | grep -v "\.spec\." | grep -v "\.test\."

# Check 6: Direct cross-context imports (ACL Registry violation)
# Finds imports that cross context boundaries — adjust path pattern to match project layout
grep -rn "from '.*contexts/[^']*'" src/ --include="*.ts" \
  | grep -v "index\|__tests__\|\.spec\." \
  | grep -v "aclRegistry\|acl-registry"
```

---

## Manual Checklist

Work through these 12 items for every modified file. Check each one before marking the PR ready for review.

- [ ] **1. No PII in logs** — No logger or console call includes email, name, address, coordinates, or userId as a value.
- [ ] **2. Auth on every endpoint** — Each controller method has `@Auth()` + `@RequirePermissions(...)` or `@Public()` with an explanatory comment.
- [ ] **3. DTO validated by Zod** — Every command/query DTO passes through a Zod schema parse at the controller boundary before reaching the handler.
- [ ] **4. No userId in request body** — The Zod schema for the request body has no `userId` field. Identity comes from `RequestContextService` or JWT claims.
- [ ] **5. PII field has crypto-shredding plan** — Any new PII column is documented in `BUSINESS_RULES.yaml` with retention and deletion strategy.
- [ ] **6. Query builder only** — All database access uses Kysely, TypeORM query builder, or explicit parameterized queries. No string interpolation.
- [ ] **7. Domain error factory — no free-text details** — `DomainError` subclasses do not accept a raw `string` as a `details` parameter.
- [ ] **8. Error mapper does not forward error.message** — The `@Catch()` filter or controller error handler returns only mapped, safe error codes in the HTTP body.
- [ ] **9. Cross-context via ACL Registry** — Any reference to another bounded context uses `aclRegistry.getGlobalRequired(Token)`. No direct directory imports.
- [ ] **10. Secrets from env with startup validation** — Any new secret is read from `process.env` and validated at module init (fails at startup, not at first use).
- [ ] **11. Audit event for PII operations** — Operations that read or modify another user's PII, or change role/permission assignments, emit a Tier-1 or Tier-2 audit event.
- [ ] **12. pnpm audit --prod = 0 high/critical** — No unaddressed high or critical CVEs. Existing suppressions are documented in `docs/security/audit-suppressions.md`.

---

## Output

Report per file using this format:

```
PASS  src/contexts/auth/application/handlers/login.handler.ts
WARN  src/contexts/auth/infrastructure/controllers/auth.controller.ts
      → Check #11: no audit event emitted on password change
BLOCK src/contexts/community/infrastructure/controllers/post.controller.ts
      → Check #4: userId found in CreatePostDto Zod schema body definition
```

If any item is **BLOCK** — do not commit. Fix the issue first and re-run the check.

If any item is **WARN** — you may commit, but create a follow-up task before the PR is merged.
