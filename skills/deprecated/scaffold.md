---
name: scaffold
description: |
  Haiku template generator - fast, cheap boilerplate generation from LocalHero patterns.
  Generates scaffolds for DTOs, events, handlers, value objects, specifications, and tests.
tools: Task, Read
model: haiku
temperature: 0.3
---

# /scaffold - Haiku Template Generator

**Model**: Haiku (60x cheaper than Opus)
**Purpose**: Generate scaffolds from LocalHero patterns

---

## Pattern Routing (Single-Source-of-Truth)

| Type | Pattern File |
|------|--------------|
| `dto` | `patterns/application/command-handler-pattern.md` |
| `query-dto` | `patterns/application/query-handler-pattern.md` |
| `event` | `patterns/domain/domain-event-pattern.md` |
| `integration-event` | `patterns/architecture/integration-event-pattern.md` |
| `value-object` | `patterns/domain/value-object-pattern.md` |
| `specification` | `patterns/domain/specification-policy-pattern.md` |
| `handler` | `patterns/application/command-handler-pattern.md` |
| `query-handler` | `patterns/application/query-handler-pattern.md` |
| `test` | `patterns/testing/schema-testing-pattern.md` |

**Base path**: `.claude/knowledge/`

---

## Usage

```bash
/scaffold <type> <name> [context]

# Examples:
/scaffold dto CreateUserProfile auth
/scaffold event UserRegistered auth
/scaffold integration-event TrustDelta geographic-auth
/scaffold value-object CommentContent engagement
/scaffold specification AddressCooldown geographic-auth
/scaffold handler CreateUser auth
/scaffold test UserProfile auth
```

---

## Workflow

When user requests scaffold:

### Step 1: Validate Input

Check if:
- Type is in routing table
- Name is provided
- Context is provided (optional but recommended)

### Step 2: Determine Pattern File

Map type → pattern file path from routing table.

### Step 3: Read Pattern File

```typescript
Read(.claude/knowledge/${patternPath})
```

### Step 4: Generate Scaffold

Delegate to general-purpose agent (Haiku for cost efficiency):

```typescript
Task(
  subagent_type='general-purpose',
  model='haiku',
  prompt=`Generate ${type} scaffold for ${name} in ${context}.

CRITICAL: First READ the pattern file:
.claude/knowledge/${patternPath}

Then generate scaffold:
1. Use EXACT imports from pattern
2. Use EXACT base classes from pattern
3. Use EXACT method signatures from pattern
4. Use EXACT decorators from pattern
5. Add TODO comments for domain-specific logic

Replace placeholders:
- {{Name}} = ${PascalCaseName}
- {{name}} = ${camelCaseName}
- {{Context}} = ${PascalCaseContext}
- {{context}} = ${kebab-case-context}

Return ONLY the generated code with TODO markers for:
- Business logic
- Validation rules
- Domain-specific fields
- Test assertions

Do NOT invent domain logic.`,
  description='Generating ${type} scaffold'
)
```

### Step 5: Return Scaffold

Return generated code to user with instructions:
```
Generated ${type} scaffold for ${name}.

Next steps:
1. Review generated structure
2. Fill in TODO sections with domain logic
3. Update imports if needed
4. Run tests: npm test
```

---

## Coverage Estimates

| Type | Coverage | Why |
|------|----------|-----|
| `dto` | 80-90% | Standard structure |
| `query-dto` | 80-90% | Standard structure |
| `event` | 70-80% | GDPR structure fixed |
| `integration-event` | 70-80% | GDPR + Security fixed |
| `value-object` | 75-85% | BaseValueObject pattern |
| `specification` | 55-65% | Logic varies |
| `handler` | 40-50% | Orchestration varies |
| `query-handler` | 50-60% | Queries vary |
| `test` | 60-70% | 6-category fixed |

---

## ROI

- **Time saved**: 5-15 minutes per scaffold
- **Cost**: ~$0.01 per scaffold (Haiku)
- **Quality**: Pattern-compliant, consistent structure
- **Coverage**: 50-90% depending on type

---

## Notes

- Uses Haiku exclusively (60x cheaper than Opus)
- Reads patterns as single source of truth
- Does NOT invent domain logic (leaves TODOs)
- Safe to regenerate (idempotent)
- Helpful for rapid prototyping and ensuring pattern compliance
