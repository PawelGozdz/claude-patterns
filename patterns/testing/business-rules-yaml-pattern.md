# Business Rules YAML Pattern

**Category:** Testing
**Level:** Advanced
**Prerequisites:** Testing Pyramid Pattern, DDD basics, Specification Pattern
**Compatible with:** NestJS, DDD, CQRS
**Version:** 2.1

---

## Overview

Structured, machine-readable format for documenting business rules with automated test coverage tracking. Enables human comprehension, AI agent context retention, and automated tooling (mobile docs, coverage reports, CI validation).

### Problem

Traditional business rules documentation (v1 YAML or markdown):
- Inline test tracking goes stale within days (manual `status: done` + `coverage: 100%`)
- 55 lines per rule (~60% is test tracking boilerplate)
- Implementation details documented as "business rules" (repo save, transaction boundary)
- No rule categorization (validation vs authorization vs policy mixed together)
- Template abandoned in practice (L1_unit vs L1_spec/L1_aggregate/L1_schema)
- Duplicate YAML keys silently corrupt data (no schema validation)
- Event emission documented as separate rules instead of flow outcomes

### Solution

YAML-based business rules (v2.1) with:
- Slim rule structure (no inline test tracking)
- Automated test coverage via `enforcement.primary.class` matching
- Rule categories (validation/authorization/invariant/policy/guard)
- Domain expert test: only business-relevant rules
- Events documented at flow level (`on_success.emits`)
- JSON Schema validation (prevents structural errors)
- Flow-to-OpenAPI bridge (`request_schema`/`response_schema`)

---

## When to Use

Use this pattern when:
- Building DDD applications with specification pattern
- Mobile/frontend team needs workflow documentation
- Using Claude Code or LLM agents for development
- Need automated test coverage visibility per business rule
- Want dependency graphs between rules

Don't use when:
- Simple CRUD app (overkill)
- No testing strategy (implement Testing Pyramid first)
- No specification pattern (enforcement matching won't work)

---

## YAML Style Guide

Always use **pure multi-line YAML**. Never use condensed JSON-style inline objects.

```yaml
# CORRECT - pure multi-line
on_failure:
  error_code: VALIDATION_ERROR
  error_class: ValidationError

# WRONG - condensed (do not use)
on_failure: {error_code: VALIDATION_ERROR, error_class: ValidationError}
```

**Why:** Readability, clean line-by-line git diffs, easier maintenance, better YAML linting support.

---

## Rule Categories

Every rule must have a `category` field. This enables filtering, visualization, and enforces the domain expert test.

| Category | Description | Example |
|----------|-------------|---------|
| `validation` | Input/format validation | UUID format, price range, title length |
| `authorization` | Who can do this | Only owner can publish, only moderator |
| `invariant` | Domain state constraints | Must be published to receive offers |
| `policy` | Business decisions | Monthly quota, max 10 offers, rate limits |
| `guard` | Preconditions | Time window not expired, not already claimed |

**Domain expert test:** "Would a business stakeholder care about this rule?" If not (transaction boundary, repository save, return value), it's an infrastructure concern - test it but don't document it as a business rule.

---

## Naming Convention

Format: `BR-{CTX}-{GROUP?}-{SEQ}`

| Part | Description | Examples |
|------|-------------|----------|
| `CTX` | 2-5 letter context abbreviation | QJ, AUTH, GEO, SP, COMM, AUTHZ |
| `GROUP` | Optional sub-namespace (2-6 chars) | PUB, CMP, UPD, NEG, QUOTA, VERIF |
| `SEQ` | 3-digit sequential number | 001, 002, 003 |

```
BR-QJ-001          # quick-jobs, rule 1
BR-QJ-PUB-001      # quick-jobs, publish group, rule 1
BR-QJ-QUOTA-001    # quick-jobs, quota group, rule 1
BR-AUTH-001         # auth, rule 1
```

Rules: sequential within groups, no gaps, no suffixes like `-A`.

---

## Structure

### Field Specification

**Business Rule Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `title` | yes | Short identification name (max 80 chars) |
| `description` | yes | What the rule enforces |
| `rationale` | yes | Business reason - highest documentation value |
| `enforcement` | yes | Object with `primary` (required) and optional `secondary` enforcement targets |
| `category` | yes | Classification (validation/authorization/invariant/policy/guard) |
| `on_failure` | yes | `null` = can't fail, or object with `error_code` (required, can be null), optional `error_class`, `http_status`, `message`, `notes` |
| `requires` | no | Rule dependencies - omit if none |
| `on_success` | no | Description only, for non-obvious outcomes |
| `tests` | no | Test coverage mapping by pyramid level (e.g., `L1_spec: "file.spec.ts"`) |
| `gherkin` | no | BDD scenario in Gherkin format (Given/When/Then) |
| `deprecated` | no | Mark rule for retirement with `deprecated_reason` and `deprecated_date` |

**Flow Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `description` | yes | High-level description |
| `endpoint` | yes | HTTP method + path, or INTERNAL/CRON prefix for non-HTTP flows |
| `handler` | yes | Handler class name |
| `steps` | yes | Ordered execution steps |
| `request_schema` | no | Zod schema class - bridge to OpenAPI |
| `response_schema` | no | Response DTO class - bridge to OpenAPI |
| `deprecated` | no | Mark flow as deprecated (kept for backward compatibility) |
| `on_success` | no | Entity, state, emits, next_possible_flows, response, notes |
| `errors` | no | Complete error list with HTTP status codes |

### 1. Business Rules (Atomic, ~9 lines each)

```yaml
business_rules:

  # Standard rule (~12 lines with enforcement object)
  BR-AUTH-001:
    title: Password strength requirements
    description: Password must be 8+ chars with uppercase, lowercase, number
    rationale: Security - prevent weak passwords
    enforcement:
      primary:
        class: PasswordStrengthSpecification
        layer: domain
    category: validation
    on_failure:
      error_code: WEAK_PASSWORD
      error_class: WeakPasswordError
      http_status: 400

  # Rule with dependencies
  BR-AUTH-002:
    title: Email must be unique
    description: No duplicate email addresses allowed
    rationale: Data integrity - one account per email
    enforcement:
      primary:
        class: EmailUniqueSpecification
        layer: domain
    category: validation
    requires:
      - BR-AUTH-001
    on_failure:
      error_code: EMAIL_ALREADY_EXISTS
      error_class: EmailAlreadyExistsError
      http_status: 409

  # Rule that cannot fail (on_failure: null = intentional, not omission)
  BR-AUTH-003:
    title: Initial status is unverified
    description: New accounts start as unverified
    rationale: Domain invariant - security requirement
    enforcement:
      primary:
        class: UserIdentityAggregate
        method: create()
        layer: domain
    category: invariant
    on_failure: null

  # Rule with secondary enforcement and gherkin
  BR-AUTH-004:
    title: Quota decremented on creation
    description: Free tier quota counter decremented when job created
    rationale: Monetization - enforce free tier limits
    enforcement:
      primary:
        class: QuotaService
        method: decrement()
        layer: application
      secondary:
        class: QuotaGuard
        layer: application
    category: policy
    on_failure:
      error_code: QUOTA_DECREMENT_FAILED
      error_class: QuotaError
      http_status: 403
    on_success:
      description: Quota counter decremented, remaining count updated
    gherkin: |
      Given a user on the free tier with 3 remaining quota
      When they create a new job
      Then quota is decremented to 2
    tests:
      L1_spec: quota-service.spec.ts
      L2_hdl: create-job.handler.integration.spec.ts
```

**Key Principles:**
- **Atomic** - rule doesn't know "what happens next" (flows handle orchestration)
- **Domain-only** - no infrastructure concerns (repo save, transaction, return value)
- **`on_failure` is always required** - `null` = explicit "can't fail", not omission
- **`on_success` is optional** - description only, for non-obvious outcomes
- **`enforcement` is an object** - `primary.class` required, optional `primary.layer`, `primary.method`, `secondary` enforcement target
- **`tests` is optional** - maps pyramid levels to test files (e.g., `L1_spec`, `L2_hdl`)
- **`gherkin` is optional** - BDD scenario for domain experts (Given/When/Then)
- **Terminality is a flow concern** - rules say what error, flows decide what to do with it
- **No `emits`** - event emission belongs in flows, not rules

### 2. Flows (Orchestration)

```yaml
flows:

  register-user:
    description: Register new user account
    endpoint: POST /auth/register
    handler: RegisterUserHandler
    request_schema: RegisterUserSchema
    response_schema: RegisterUserResponseDto

    steps:
      - step: validate-password
        rule: BR-AUTH-001

      - step: check-email-unique
        rule: BR-AUTH-002

      - step: create-account
        action: UserIdentityAggregate.create()

      - step: persist
        action: repository.save()
        on_failure: rollback

    on_success:
      entity: UserIdentity
      state: unverified
      emits:
        - UserRegisteredEvent
      next_possible_flows:
        - verify-email
        - login

    errors:
      - error_code: WEAK_PASSWORD
        from: BR-AUTH-001
        http_status: 400
      - error_code: EMAIL_ALREADY_EXISTS
        from: BR-AUTH-002
        http_status: 409
```

**Key Principles:**
- **Human-readable step names** - PM/mobile team can understand without rule lookup
- **`on_failure: abort` is implicit** - don't write it (97% of cases)
- **Only specify `on_failure`** when it differs: `rollback`, `continue`, `retry`
- **`emits`** - events documented at flow level (not as separate rules)
- **`request_schema`/`response_schema`** - bridge to OpenAPI specs
- **`errors`** section = complete error list for API consumers (adds `http_status`)
- **One flow per handler/endpoint**
- **`notes`** on `on_success` - optional, for side effects and cascading behavior

---

## Test Coverage via Enforcement Matching

v2 removes inline test tracking from YAML entirely. Coverage is computed automatically by matching the `enforcement` field to test files.

### How It Works

```
YAML rule                    Code                         Test file
─────────────                ────                         ─────────
enforcement.primary.class:   class                        test imports/describes
PasswordStrengthSpec   →     PasswordStrengthSpec    ←    password-strength.spec.ts
```

| Level | What's matched | How |
|-------|---------------|-----|
| L1 | Rule -> Spec test | `enforcement.primary.class` -> find `*.spec.ts` that imports/tests it |
| L2 | Flow -> Handler test | flow `handler` field -> find `*.integration.spec.ts` for that handler |
| L3 | Flow -> Endpoint test | flow `endpoint` field -> find `*.e2e.spec.ts` for that endpoint |

### Key Insight

- **L1 coverage is per-rule** (does the specification have a unit test?)
- **L2/L3 coverage is per-flow** (does the handler/endpoint have integration/E2E tests?)

This matches how testing actually works - you don't write a separate E2E test per rule, you write one E2E test per endpoint that exercises multiple rules.

When the optional `tests` field is present on a rule, it provides explicit mappings (e.g., `L1_spec: "file.spec.ts"`) that supplement automated matching.

### CI Script Output

```
L1 Coverage (per-rule):
  BR-AUTH-001 (PasswordStrengthSpec)     → password-strength.spec.ts ✅
  BR-AUTH-002 (EmailUniqueSpec)          → email-unique.spec.ts ✅
  BR-AUTH-003 (UserIdentityAggregate)    → ❌ NO TEST FOUND

L2 Coverage (per-flow):
  register-user (RegisterUserHandler)    → handler.integration.spec.ts ✅
  verify-email (VerifyEmailHandler)      → ❌ NO TEST FOUND

L3 Coverage (per-flow):
  POST /auth/register                    → auth-core.e2e.spec.ts ✅
  POST /auth/verify-email                → ❌ NO TEST FOUND
```

### Why This Is Better Than Inline Test Blocks

- **Zero manual tracking** - no `status: done` to update
- **Refactor-proof** - rename file, `enforcement.primary.class` follows
- **Can't go stale** - coverage is computed, not self-reported
- **DRY** - test file IS the source of truth
- **~70% file size reduction** - test blocks were the biggest bloat

---

## Implementation

### Step 1: Copy Template

```bash
cp templates/BUSINESS_RULES.yaml.template \
   src/contexts/{context}/BUSINESS_RULES.yaml
```

### Step 2: Claude Code Workflow

**When implementing new feature:**

```
User: "Add email validation for user registration"

Claude Code:
1. Reads BUSINESS_RULES.yaml
2. Asks: "Would a business stakeholder care about this rule?"
3. If yes → adds rule with enforcement class (~9 lines)
4. If no → tests it but skips YAML (infrastructure concern)
5. Adds to relevant flow if part of a user-facing process
```

**When looking for untested rules:**

```
User: "What rules need tests?"

Claude Code:
1. Runs `npm run rules:coverage`
2. Script matches enforcement classes to test files
3. Reports gaps: "BR-AUTH-003 has no L1 test"
4. No manual status updates needed
```

### Step 3: CI Validation

```yaml
# .github/workflows/validate-business-rules.yml
- name: Validate YAML against schema
  run: npm run rules:schema-check

- name: Lint enforcement references
  run: npm run rules:lint

- name: Lint flow references
  run: npm run rules:lint-flows

- name: Check test coverage gaps
  run: npm run rules:coverage
```

---

## Anti-Patterns

### Hardcoding business values in YAML

```yaml
# BAD - duplicates code, goes stale
on_failure:
  condition: "rounds >= 3"  # Hardcoded value!
```

**Fix:** Only reference error codes, values live in code
```yaml
# GOOD - reference only
on_failure:
  error_code: MAX_ROUNDS_EXCEEDED
  error_class: MaxRoundsExceededError
```

### Adding "next" to business rules

```yaml
# BAD - rule doesn't know context
BR-AUTH-001:
  on_success:
    next: [BR-AUTH-002]  # Wrong! Context-dependent
```

**Fix:** Use flows for orchestration
```yaml
# GOOD - flow knows sequence
flows:
  register-user:
    steps:
      - step: validate-password
        rule: BR-AUTH-001
      - step: check-email
        rule: BR-AUTH-002
```

### Including infrastructure concerns as business rules

```yaml
# BAD - not business rules
BR-AUTH-009:
  title: Repository Save
  enforcement:
    primary:
      class: UserRepository
      method: save()

BR-AUTH-010:
  title: Returns User ID
  enforcement:
    primary:
      class: RegisterUserHandler

BR-AUTH-011:
  title: Transaction Boundary
  enforcement:
    primary:
      class: TransactionalDecorator
```

**Fix:** Apply the domain expert test. These are infrastructure - test them in L2/L3, don't document as business rules.

### Putting terminality in rules instead of flows

```yaml
# BAD - rule decides terminality
BR-AUTH-001:
  on_failure:
    terminal: true         # Wrong! Rule doesn't know its execution context
    error_code: WEAK_PASSWORD
```

**Fix:** Rules provide error info. Flows decide what to do with failures.
```yaml
# GOOD - rule provides error, flow controls execution
BR-AUTH-001:
  on_failure:
    error_code: WEAK_PASSWORD
    error_class: WeakPasswordError

# Flow decides: abort (implicit), rollback, continue, retry
flows:
  register-user:
    steps:
      - step: validate-password
        rule: BR-AUTH-001
        # on_failure: abort (implicit default)
```

### Manual test tracking in YAML

```yaml
# BAD (v1) - manual, goes stale, bloats file
tests:
  L1_unit:
    - file: password-strength.spec.ts
      status: done
      coverage: 100%
  L2_integration:
    - file: register.integration.spec.ts
      status: done
```

**Fix (v2.1):** Remove verbose test blocks. Use `enforcement.primary.class` matching + CI tooling. For explicit overrides, use the slim `tests` field:
```yaml
# GOOD (v2.1) - optional, slim mapping
tests:
  L1_spec: password-strength.spec.ts
  L2_hdl: register.integration.spec.ts
```

### Event emission as separate business rules

```yaml
# BAD - mechanism, not business rule
BR-AUTH-005:
  title: UserRegisteredEvent Fired
  description: Event emitted when user registers
  enforcement:
    primary:
      class: UserIdentityAggregate
      method: create()
  on_failure: null
```

**Fix:** Document events at flow level.
```yaml
# GOOD - event is flow outcome
flows:
  register-user:
    on_success:
      emits:
        - UserRegisteredEvent
```

---

## Tooling

### Recommended Scripts

```json
{
  "scripts": {
    "rules:schema-check": "ajv validate -s schemas/business-rules.schema.json -d 'contexts/**/BUSINESS_RULES.yaml'",
    "rules:lint": "node scripts/rules-lint.ts",
    "rules:lint-flows": "node scripts/rules-lint-flows.ts",
    "rules:coverage": "node scripts/rules-coverage.ts",
    "rules:generate": "node scripts/generate-mobile-docs.ts"
  }
}
```

### Lint Scripts (Reference Integrity)

**`rules:lint`** - Validates `enforcement.primary.class` references resolve to real classes:
```
BR-SP-001 (EnableServiceProviderHandler)  → src/.../handler.ts ✅
BR-SP-004 (ServiceRadius)                → src/.../service-radius.vo.ts ✅
BR-SP-099 (DeletedSpecification)          → ❌ CLASS NOT FOUND
  Did you mean 'DeactivatedSpecification'?
```

**`rules:lint-flows`** - Validates flow references:
- Every `rule: BR-XXX` in steps → exists in `business_rules` section
- Every `handler: ClassName` → class exists in codebase
- Every `endpoint: METHOD /path` → route exists in controller decorator
- Deprecated rules referenced in flows → warning

### Coverage Script Logic

```typescript
// scripts/rules-coverage.ts (pseudocode)

// 1. Parse all BUSINESS_RULES.yaml → extract enforcement.primary.class + flow handlers/endpoints
// 2. Check rule.tests field first (explicit mapping takes priority)
// 3. Scan all *.spec.ts for imports matching enforcement classes (L1)
// 4. Scan all *.integration.spec.ts for handler class references (L2)
// 5. Scan all *.e2e.spec.ts for endpoint path references (L3)
// 6. Report gaps

const rules = parseAllBusinessRules('contexts/**/BUSINESS_RULES.yaml');
const testFiles = glob('**/*.spec.ts');

for (const rule of rules) {
  const enfClass = rule.enforcement.primary.class;
  const explicit = rule.tests?.L1_spec;
  const l1Match = explicit ?? testFiles.find(f => fileImports(f, enfClass));
  console.log(`${rule.id} (${enfClass}) → ${l1Match ?? '❌ NO TEST'}`);
}
```

---

## v1 to v2.1 Migration

### Rule Changes

| v1 | v2.1 |
|----|------|
| `outcomes.success` + `outcomes.failure` | `on_failure` (required) + optional `on_success` |
| `terminal: true` in rule | Removed (terminality is flow concern) |
| `tests:` block (30+ lines) | Optional `tests` object for explicit mapping; automated enforcement matching |
| `pyramid_complete: true` | Removed (computed by tooling) |
| `test_coverage_summary` section | Removed (output of tooling, not input) |
| `notes` section (migration status) | Removed (belongs in git/task tracker) |
| No `category` field | Required: validation/authorization/invariant/policy/guard |
| `enforcement` as string | `enforcement` as object: `primary.class` (required), `primary.layer`, `secondary` |
| No BDD support | Optional `gherkin` field (Given/When/Then) |
| Implementation-detail "rules" | Removed (domain expert test) |
| Event emission as rules | Moved to flow `on_success.emits` |
| No deprecation mechanism | Optional `deprecated`, `deprecated_reason`, `deprecated_date` |
| No schema validation | JSON Schema (`business-rules.schema.json` v2.1) |
| `on_failure` minimal | `on_failure` extended: `error_code` (can be null), `http_status`, `message`, `notes` |

### Flow Changes

| v1 | v2.1 |
|----|------|
| `execution_order` | `steps` |
| `on_failure: abort` on every step | Implicit default (don't write) |
| `possible_errors` | `errors` |
| `from_rule` | `from` (accepts BR-ID or step name) |
| No schema references | `request_schema`, `response_schema` |
| No event documentation | `on_success.emits` (array) |
| No notes on success | `on_success.notes` (optional) |
| No response docs | `on_success.response` (array of response fields) |
| No flow deprecation | Optional `deprecated` boolean |
| HTTP-only endpoints | Supports INTERNAL and CRON prefixes |

### Size Impact

| Metric | v1 | v2 |
|--------|-----|-----|
| Lines per rule | ~55 | ~9 |
| Test tracking | ~60% of file | 0 (in tooling) |
| Coverage summary | ~40 lines manual | 0 (output of CI) |
| 70-rule file | ~4600 lines | ~1400 lines |

---

## Related Patterns

- **Testing Pyramid Pattern** - Foundation for L1/L2/L3 structure
- **Specification Pattern** - How business rules are implemented (`enforcement` field)
- **CQRS Pattern** - Command/Query handlers referenced in flows
- **Domain Events Pattern** - Events documented in flow `on_success.emits`

---

## References

- **Template:** `templates/BUSINESS_RULES.yaml.template`
- **JSON Schema:** `schemas/business-rules.schema.json` (v2.1)
- **CI Validator:** `scripts/ci/validate-business-rules.js`
- **ADR:** ADR-0066 (Business Rules YAML v2)
- **Testing Pyramid:** `patterns/testing/testing-pyramid-pattern.md`
- **Specification Pattern:** `patterns/domain/specification-policy-pattern.md`

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-03-01 | v2.1: Enforcement as object (`primary`/`secondary`), `tests` mapping, `gherkin`, `on_failure` extended, flow `deprecated`/`response`, INTERNAL/CRON endpoints, CI validator | Claude Code |
| 2026-02-15 | v2: Slim structure, enforcement matching, categories, flow-level emits, schema refs | Claude Code |
| 2026-02-13 | Initial pattern creation (v1) | Claude Code |

---

## License

MIT - Part of claude-patterns repository
