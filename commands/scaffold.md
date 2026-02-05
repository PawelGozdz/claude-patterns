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

```
1. READ pattern file from routing table
2. EXTRACT: imports, base class, decorators, required methods, MUST/MUST NOT rules
3. REPLACE placeholders:
   - {{Name}} = PascalCase name
   - {{name}} = camelCase name
   - {{Context}} = PascalCase context
   - {{context}} = kebab-case context
4. RETURN scaffold with TODO comments for domain-specific parts
```

---

## Task Delegation

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
4. Add TODO comments for domain-specific logic

Replace: {{Name}}=${name}, {{Context}}=${context}

Return ONLY the generated code.`
)
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

| Monthly (265 scaffolds) | Without | With Haiku | Savings |
|-------------------------|---------|------------|---------|
| Total | $12.30 | $0.29 | **$12.01/mo** |

*~97.6% cost reduction on scaffold work*

---

**Version**: 3.1.0
**Last Updated**: 2026-01-14
**Maintainer**: @localhero-project-orchestrator

**v3.1**: Minimized to ~95 lines (was 641). Patterns are single-source-of-truth.
**v3.0**: Added integration-event, value-object, specification types.
**v2.0**: Switched from inline templates to pattern references.
