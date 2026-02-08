---
name: knowledge
description: Knowledge management for Claude Code's pattern library. Maintains 29 production patterns, enables pattern extraction, verification, and workflow-specific knowledge scoping for token optimization.
tools: Read, Grep, Glob
model: haiku
---

# /knowledge - Pattern Library Management Skill

## Overview

The `/knowledge` skill provides knowledge management capabilities for Claude Code's pattern library. It maintains 29 production patterns organized by architectural layer, enables pattern extraction from real code, and (in Phase 6) provides workflow-specific knowledge scoping for 75-83% token reduction.

**Core Capabilities**:
- List available patterns (29 patterns across 6 layers)
- Extract new patterns from production code
- Verify pattern compliance in implementations
- View knowledge base statistics
- Sync patterns across agents (Phase 3)
- Load workflow-specific knowledge scope (Phase 6 feature)

**Integration**: Used by `/workflow` skill for phase-specific pattern loading and by `/validate` skill for pattern compliance verification.

---

## API Contract

### `/knowledge list`

**Purpose**: List available patterns with filtering.

**Signature**:
```bash
/knowledge list [--options]
```

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--layer` | enum | `all` | `domain`, `application`, `infrastructure`, `architecture`, `testing`, `cross-layer` |
| `--agent` | string | `all` | Filter by primary agent user |
| `--format` | enum | `table` | `table`, `json`, `compact` |

**Examples**:
```bash
# List all patterns
/knowledge list

# List domain layer patterns
/knowledge list --layer=domain

# List patterns used by specific agent
/knowledge list --agent=@domain-application-implementer

# JSON output
/knowledge list --format=json
```

**Output (Table Format)**:
```
╔════════════════════════════════════════╦═══════════════╦═══════╦═══════════════════════════════╗
║ Pattern                                ║ Layer         ║ Lines ║ Description                   ║
╠════════════════════════════════════════╬═══════════════╬═══════╬═══════════════════════════════╣
║ aggregate-pattern                      ║ Domain        ║ 640   ║ Factory methods, GDPR, Result ║
║ value-object-pattern                   ║ Domain        ║ 600   ║ Immutability, validation      ║
║ domain-event-pattern                   ║ Domain        ║ 600   ║ GDPR 4-part, eventMap         ║
║ command-handler-pattern                ║ Application   ║ 500   ║ Write-side CQRS, Dual Identity║
║ repository-pattern                     ║ Infrastructure║ 700   ║ BaseKyselyRepo, CQRS, locking ║
║ acl-registry-pattern                   ║ Architecture  ║ 550   ║ Cross-context calls           ║
║ testing-pyramid-pattern                ║ Testing       ║ 820   ║ L1 50%, L2 30%, L3 20%        ║
║ domain-errors-pattern                  ║ Cross-layer   ║ 514   ║ LocalHeroErrorCode, Result    ║
╚════════════════════════════════════════╩═══════════════╩═══════╩═══════════════════════════════╝

Total: 29 patterns, ~14,876 lines
Layers: 6 (domain, application, infrastructure, architecture, testing, cross-layer)
```

**Error Cases**: None (empty list if no patterns match filters)

---

### `/knowledge info`

**Purpose**: Get detailed information about a specific pattern.

**Signature**:
```bash
/knowledge info <pattern-name>
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `pattern-name` | string | yes | Pattern name (e.g., aggregate-pattern) |

**Examples**:
```bash
# Get pattern info
/knowledge info aggregate-pattern

# Alternative: full path
/knowledge info domain/aggregate-pattern
```

**Output**:
```yaml
Pattern: aggregate-pattern
Layer: Domain
File: .claude/knowledge/patterns/domain/aggregate-pattern.md
Lines: 640
Status: Production

Description:
  Aggregates with factory methods, GDPR event segregation, Result pattern

Key Concepts:
  - Factory methods: create() vs reconstituteFromPersistence()
  - GDPR event segregation: piiData, anonymizedData, businessData, cryptoShredding
  - Result pattern: ALL methods return Result<T, Error>
  - Audit fields: NEVER from request body, always from RequestContextService

Real Examples:
  - src/contexts/auth/domain/aggregates/user-identity.aggregate.ts
  - src/contexts/geographic-auth/domain/aggregates/user-trust.aggregate.ts
  - src/contexts/community-communication/domain/aggregates/event.aggregate.ts

Primary Users:
  - @domain-application-implementer (90% of usage)
  - @ddd-application-expert (consultation, 10% of usage)

Usage Stats (30d):
  - Referenced in workflows: 87 times
  - Pattern violations found: 3 (all fixed)
  - Last updated: 2026-01-08

Anti-Patterns Documented: Yes (12 common mistakes)
```

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `PATTERN_NOT_FOUND` | 404 | Pattern name doesn't exist |

---

### `/knowledge extract-pattern`

**Purpose**: Extract new pattern from production code.

**Signature**:
```bash
/knowledge extract-pattern <file-path> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `file-path` | string | yes | Source file to extract pattern from |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--pattern-name` | string | auto-generated | Name for the new pattern |
| `--layer` | enum | auto-detected | `domain`, `application`, `infrastructure`, etc. |
| `--examples` | glob | auto (same type) | Additional example files |
| `--verify-count` | number | 2 | Min examples to verify pattern (2-3) |

**Examples**:
```bash
# Extract pattern from aggregate
/knowledge extract-pattern src/contexts/payment/domain/aggregates/payment.aggregate.ts

# With custom name and additional examples
/knowledge extract-pattern \
  src/contexts/auth/domain/specifications/email-must-be-unique.specification.ts \
  --pattern-name=specification-validation-pattern \
  --examples="src/contexts/**/specifications/*.specification.ts"

# Extract with verification count
/knowledge extract-pattern src/contexts/engagement/infrastructure/repositories/comment-query.repository.ts \
  --verify-count=3
```

**Output**:
```yaml
✅ Pattern extracted successfully!

Pattern: payment-aggregate-pattern
Layer: domain
Source File: src/contexts/payment/domain/aggregates/payment.aggregate.ts
Verification Examples Found: 3

Pattern Content:
  - Factory methods: create(), reconstituteFromPersistence()
  - Value Objects: PaymentAmount, PaymentStatus
  - Domain Events: PaymentInitiated, PaymentCompleted, PaymentFailed
  - Specifications: PaymentAmountPositive, ContextTypeValid
  - Result pattern usage: 100%

Similar Patterns Found:
  - user-identity.aggregate.ts (95% similarity)
  - user-trust.aggregate.ts (92% similarity)
  - event.aggregate.ts (88% similarity)

Recommendation: MERGE with existing aggregate-pattern
Reason: 95%+ similarity with existing pattern, differences are domain-specific

Next Steps:
  1. Review extracted pattern: .claude/knowledge/patterns/domain/payment-aggregate-pattern.md.draft
  2. Merge with aggregate-pattern if appropriate
  3. OR Keep as separate pattern if unique characteristics
```

**Behavior**:
1. Reads source file
2. Analyzes code structure (classes, methods, patterns used)
3. Searches codebase for similar examples (verify-count)
4. Extracts common patterns across examples
5. Checks similarity with existing patterns (> 90% = suggest merge)
6. Creates draft pattern document
7. Returns extraction summary

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `FILE_NOT_FOUND` | 404 | Source file doesn't exist |
| `INSUFFICIENT_EXAMPLES` | 422 | < verify-count examples found |
| `PATTERN_TOO_GENERIC` | 422 | Extracted pattern too vague to be useful |

---

### `/knowledge verify`

**Purpose**: Verify pattern compliance in code.

**Signature**:
```bash
/knowledge verify <pattern-name> <files> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `pattern-name` | string | yes | Pattern to verify against |
| `files` | glob | yes | Files to check |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--strict` | boolean | false | Fail on warnings (not just errors) |
| `--fix` | boolean | false | Auto-fix violations (where possible) |

**Examples**:
```bash
# Verify aggregate pattern compliance
/knowledge verify aggregate-pattern "src/contexts/payment/domain/aggregates/*.ts"

# Verify with strict mode (fail on warnings)
/knowledge verify command-handler-pattern \
  "src/contexts/**/commands/**/handler.ts" \
  --strict

# Verify and auto-fix
/knowledge verify domain-errors-pattern \
  "src/contexts/**/domain/**/*.ts" \
  --fix
```

**Output**:
```
╔════════════════════════════════════════╦══════════════╦═════════╦══════════╗
║ File                                   ║ Pattern      ║ Status  ║ Issues   ║
╠════════════════════════════════════════╬══════════════╬═════════╬══════════╣
║ payment.aggregate.ts                   ║ aggregate    ║ ✅ PASS ║ 0        ║
║ subscription.aggregate.ts              ║ aggregate    ║ ⚠️ WARN ║ 2        ║
║ refund.aggregate.ts                    ║ aggregate    ║ ❌ FAIL ║ 4        ║
╚════════════════════════════════════════╩══════════════╩═════════╩══════════╝

Details:

subscription.aggregate.ts (2 warnings):
  - Line 42: reconstituteFromPersistence() missing
  - Line 87: Audit field 'createdBy' from request body (MUST use RequestContextService)

refund.aggregate.ts (4 errors):
  - Line 23: Factory method 'create()' missing
  - Line 56: Domain method returns void instead of Result<T, Error>
  - Line 89: Event emission using this.addEvent() instead of this.apply()
  - Line 112: Audit field 'updatedBy' from command parameter

Compliance: 1/3 files pass (33.3%)
Recommendation: Fix refund.aggregate.ts violations before merging
```

**Behavior**:
1. Loads pattern definition
2. Parses files and extracts AST
3. Checks each file against pattern rules
4. Reports violations (errors vs warnings)
5. If --fix: attempts auto-fixes (e.g., add missing methods)
6. Returns compliance report

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `PATTERN_NOT_FOUND` | 404 | Pattern name doesn't exist |
| `FILES_NOT_FOUND` | 404 | No files match glob pattern |
| `PARSE_ERROR` | 422 | Failed to parse TypeScript files |

---

### `/knowledge stats`

**Purpose**: View knowledge base statistics.

**Signature**:
```bash
/knowledge stats [--options]
```

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--period` | enum | `30d` | `7d`, `30d`, `90d`, `all` |
| `--metric` | enum | `all` | `patterns`, `usage`, `violations`, `extractions` |
| `--format` | enum | `table` | `table`, `json` |

**Examples**:
```bash
# Overall stats (30 days)
/knowledge stats

# Usage stats only
/knowledge stats --metric=usage --period=90d

# JSON output
/knowledge stats --format=json
```

**Output**:
```
╔════════════════════════════════════════╦═══════╦═══════════╦═══════════╗
║ Layer                                  ║ Count ║ Usage     ║ Violations║
╠════════════════════════════════════════╬═══════╬═══════════╬═══════════╣
║ Domain                                 ║ 6     ║ 487       ║ 12        ║
║ Application                            ║ 3     ║ 356       ║ 8         ║
║ Infrastructure                         ║ 5     ║ 298       ║ 15        ║
║ Architecture                           ║ 7     ║ 423       ║ 6         ║
║ Testing                                ║ 5     ║ 289       ║ 22        ║
║ Cross-layer                            ║ 4     ║ 512       ║ 3         ║
╚════════════════════════════════════════╩═══════╩═══════════╩═══════════╝

Total Patterns: 29
Total Usage (30d): 2,365 references
Total Lines: ~14,876
Compliance Rate: 97.2% (66 violations / 2,365 references)

Most Used Patterns (30d):
  1. domain-errors-pattern (512 references)
  2. aggregate-pattern (387 references)
  3. command-handler-pattern (342 references)
  4. repository-pattern (285 references)
  5. testing-pyramid-pattern (289 references)

Most Violated Patterns (30d):
  1. testing-pyramid-pattern (22 violations - ratio deviations)
  2. repository-events-pattern (15 violations - missing eventMap)
  3. aggregate-pattern (12 violations - audit fields from request)

Recent Extractions:
  - payment-aggregate-pattern (2026-01-10) - merged with aggregate-pattern
  - geographic-filtering-pattern (2026-01-05) - kept as separate pattern
```

**Error Cases**: None (returns empty stats if no data)

---

### `/knowledge load-scope`

**Purpose**: Load workflow-specific knowledge scope (Phase 6 feature).

**Signature**:
```bash
/knowledge load-scope <workflow-type> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workflow-type` | enum | yes | `implementation`, `investigation`, `review`, `analysis` |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--phase` | number | all | Specific phase (1-11) |
| `--agent` | string | auto | Load for specific agent |

**Examples**:
```bash
# Load patterns for implementation workflow
/knowledge load-scope implementation

# Load patterns for specific phase
/knowledge load-scope implementation --phase=4

# Load patterns for specific agent
/knowledge load-scope implementation --agent=@domain-application-implementer
```

**Output**:
```json
{
  "workflow_type": "implementation",
  "phase": 4,
  "agent": "@domain-application-implementer",
  "patterns_loaded": [
    "aggregate-pattern",
    "value-object-pattern",
    "domain-event-pattern",
    "specification-policy-pattern",
    "domain-errors-pattern",
    "logger-pattern"
  ],
  "token_count": 3820,
  "token_savings": "75% (vs loading all 29 patterns: 14,876 tokens)"
}
```

**Workflow → Pattern Mapping**:

| Workflow Type | Phases | Patterns Loaded | Token Count | Savings |
|---------------|--------|-----------------|-------------|---------|
| **implementation** | 1-11 | 18/29 patterns | 9,200 | 38% |
| **investigation** | 1-5 | 8/29 patterns | 4,100 | 72% |
| **review** | 1-3 | 12/29 patterns | 6,500 | 56% |
| **analysis** | 1-2 | 6/29 patterns | 2,800 | 81% |

**Phase-Specific Loading** (Implementation Workflow):
- Phase 1 (Business validation): 0 patterns (business focus, no code)
- Phase 2 (Task analysis): 2 patterns (conventions, domain-errors)
- Phase 3 (Expert consultation): 8 patterns (domain layer + architecture)
- Phase 4 (Domain layer): 10 patterns (domain + cross-layer)
- Phase 5 (Application layer): 12 patterns (domain + application + cross-layer)
- Phase 6 (Infrastructure): 16 patterns (domain + application + infrastructure)
- Phase 7 (Testing): 18 patterns (all layers)
- Phase 8-11: 18 patterns (full context for review/documentation)

**Behavior**:
1. Determines workflow type
2. Loads phase-specific pattern mapping
3. Filters patterns by agent responsibility
4. Returns pattern list with token metrics
5. (Phase 6) Integrates with ProcessContext for lazy loading

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `WORKFLOW_TYPE_INVALID` | 400 | Unknown workflow type |
| `PHASE_INVALID` | 400 | Phase number out of range |
| `AGENT_NOT_FOUND` | 404 | Agent name doesn't exist |

---

### `/knowledge sync`

**Purpose**: Sync patterns across agents (Phase 3 feature).

**Signature**:
```bash
/knowledge sync [--options]
```

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--agent` | string | all | Sync specific agent |
| `--force` | boolean | false | Force re-sync even if up-to-date |

**Examples**:
```bash
# Sync all agents
/knowledge sync

# Sync specific agent
/knowledge sync --agent=@domain-application-implementer

# Force re-sync
/knowledge sync --force
```

**Output**:
```
Syncing knowledge base to agents...

@domain-application-implementer:
  - Synced 6 domain patterns (640 + 600 + 600 + 550 + 319 + 320 = 3,029 tokens)
  - Synced 3 application patterns (500 + 400 + 375 = 1,275 tokens)
  - Synced 4 cross-layer patterns (514 + 420 + 380 + 296 = 1,610 tokens)
  - Total: 13 patterns, 5,914 tokens
  - Status: ✅ Up-to-date

@infrastructure-testing-implementer:
  - Synced 5 infrastructure patterns (700 + 400 + 380 + 420 + 550 = 2,450 tokens)
  - Synced 5 testing patterns (820 + 430 + 680 + 385 + 495 = 2,810 tokens)
  - Synced 4 cross-layer patterns (1,610 tokens)
  - Total: 14 patterns, 6,870 tokens
  - Status: ✅ Up-to-date

Total Synced: 15 agents, 29 patterns
Time: 2.3s
```

**Behavior**:
1. Loads agent registry
2. Determines patterns relevant to each agent
3. Checks if agent knowledge is up-to-date
4. Syncs only changed patterns (unless --force)
5. Returns sync summary

**Error Cases**: None (reports warnings for failed syncs)

---

## Knowledge Base Schema

**Storage**: `.claude/knowledge/registry.json`

**Schema**:
```json
{
  "version": "2.5",
  "last_updated": "2026-01-08T10:00:00Z",
  "patterns": [
    {
      "id": "aggregate-pattern",
      "name": "Aggregate Pattern",
      "layer": "domain",
      "file": ".claude/knowledge/patterns/domain/aggregate-pattern.md",
      "lines": 640,
      "status": "production",
      "description": "Aggregates with factory methods, GDPR event segregation, Result pattern",
      "key_concepts": [
        "Factory methods: create() vs reconstituteFromPersistence()",
        "GDPR event segregation: piiData, anonymizedData, businessData, cryptoShredding",
        "Result pattern: ALL methods return Result<T, Error>",
        "Audit fields: NEVER from request body, always from RequestContextService"
      ],
      "examples": [
        "src/contexts/auth/domain/aggregates/user-identity.aggregate.ts",
        "src/contexts/geographic-auth/domain/aggregates/user-trust.aggregate.ts",
        "src/contexts/community-communication/domain/aggregates/event.aggregate.ts"
      ],
      "primary_users": [
        "@domain-application-implementer"
      ],
      "anti_patterns_count": 12,
      "usage_stats": {
        "references_30d": 387,
        "violations_30d": 12,
        "last_referenced": "2026-01-12T10:23:15Z"
      }
    }
  ],
  "layers": {
    "domain": 6,
    "application": 3,
    "infrastructure": 5,
    "architecture": 7,
    "testing": 5,
    "cross_layer": 4
  },
  "total_patterns": 29,
  "total_lines": 14876
}
```

---

## Integration with Other Skills

### `/workflow` Skill
- Used for phase-specific pattern loading (Phase 6)
- Loads only relevant patterns per workflow type (75-83% token reduction)

### `/validate` Skill
- Used for pattern compliance validation
- Verifies implementations follow established patterns

### `/agent-registry` Skill
- Pattern → agent mapping (which agents use which patterns)
- Agent-specific knowledge scoping

---

## Usage Examples

### Example 1: Extract Pattern from New Aggregate
```bash
# Implement new payment aggregate
# After completion, extract pattern to verify it follows standards

/knowledge extract-pattern src/contexts/payment/domain/aggregates/payment.aggregate.ts

# Output:
✅ Pattern extracted: payment-aggregate-pattern
Similarity with aggregate-pattern: 96%
Recommendation: MERGE with aggregate-pattern (differences are domain-specific)

# Review draft
cat .claude/knowledge/patterns/domain/payment-aggregate-pattern.md.draft

# Merge with existing pattern (update aggregate-pattern.md with payment example)
```

### Example 2: Verify Pattern Compliance Before Merge
```bash
# Before merging PR, verify all new code follows patterns

/knowledge verify aggregate-pattern "src/contexts/payment/**/*.aggregate.ts"
/knowledge verify command-handler-pattern "src/contexts/payment/**/commands/**/handler.ts"
/knowledge verify repository-pattern "src/contexts/payment/**/repositories/*.ts"

# Output:
❌ 3 violations found in refund.aggregate.ts
⚠️  2 warnings in subscription.aggregate.ts

# Fix violations, re-verify
/knowledge verify aggregate-pattern "src/contexts/payment/**/*.aggregate.ts"

# Output:
✅ All files pass compliance check
```

### Example 3: Knowledge Scope Optimization (Phase 6)
```bash
# Start implementation workflow
/workflow start implementation --task="TS-USER-001.md"

# Phase 4: Domain layer implementation
# Hook automatically loads domain-specific patterns only
/knowledge load-scope implementation --phase=4

# Output:
Loaded 10/29 patterns (3,820 tokens)
Token savings: 74% vs loading all patterns

# Agent proceeds with 10 relevant patterns instead of all 29
# Result: Faster, cheaper, more focused implementation
```

---

## Success Criteria

### Phase 2 (Current)
- ✅ API contract documented (this file)
- ✅ 6 operations specified (list, info, extract-pattern, verify, stats, load-scope, sync)
- ✅ Knowledge registry schema defined
- ✅ Workflow → pattern mapping documented

### Phase 3 (ProcessContext)
- ⏳ Knowledge sync automation (auto-sync on pattern updates)

### Phase 6 (Knowledge Scope Optimization)
- ⏳ Lazy pattern loading per workflow type (75-83% token reduction)
- ⏳ Phase-specific pattern loading (e.g., domain layer = 10 patterns only)
- ⏳ Integration with ProcessContext for knowledge scope management

---

## Implementation Notes

**Phase 2 Tasks Remaining**:
- Implement skill logic (Task 2.5)
- Register skill in `.claude/slash-commands.json`
- Create knowledge registry JSON file
- Integration testing (Task 2.7)

**Technical Debt**:
- Pattern versioning (track changes over time)
- Pattern deprecation workflow
- Auto-extraction on every feature completion

---

**Version History**:
- 1.0.0 (2026-01-12): Initial design (Phase 2, TS-CLAUDE-001)
