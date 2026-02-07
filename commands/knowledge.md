# /knowledge - Pattern Library Management Skill

**Version**: 1.0.0 (Phase 2 - Basic Implementation)
**Status**: Active
**Full API**: See `.claude/skills/knowledge.md` for complete specification

---

## Quick Reference

```bash
/knowledge list [--layer=<layer>]             # List patterns
/knowledge info <pattern-name>                # Pattern details
/knowledge extract-pattern --from=<file> --name=<pattern>  # Extract new pattern
/knowledge verify <pattern-name> --in=<file>  # Verify implementation
/knowledge stats                              # Library statistics
/knowledge load-scope <workflow-type>         # Load patterns for workflow
/knowledge sync                               # Sync patterns with codebase
```

---

## Behavior Instructions (Phase 2 MVP)

### When User Invokes This Skill

**Parse Arguments**:
- Extract command: `list`, `info`, `extract-pattern`, `verify`, `stats`, `load-scope`, `sync`
- Extract pattern name (if provided)
- Extract options: `--layer`, `--from`, `--name`, `--in`

**Current Phase 2 Limitations**:
- No workflow scope loading yet (Phase 6)
- No automatic pattern extraction yet (Phase 6)
- No verification enforcement yet (Phase 4)
- Reads from static markdown files only

---

## Command: /knowledge list

**When user runs**: `/knowledge list [--layer=<layer>]`

**Execute these steps**:

1. **Scan Pattern Directory**:
   ```bash
   # Find all pattern files
   PATTERN_DIR=".claude/knowledge/patterns"
   patterns=$(find "$PATTERN_DIR" -name "*-pattern.md" -type f)
   ```

2. **Display Pattern Library**:

   **If no filter** (show all 29 patterns):
   ```
   LocalHero Production Pattern Library
   =====================================
   Total: 29 patterns (~14,876 lines)
   Location: .claude/knowledge/patterns/

   🏛️  DOMAIN LAYER (6 patterns)
   -----------------------------
   • aggregate-pattern.md (850 lines)
     Summary: Aggregate root design with factory methods, event emission, GDPR segregation

   • value-object-pattern.md (720 lines)
     Summary: Immutable value objects with validation, reconstruction, equals/hash

   • domain-event-pattern.md (650 lines)
     Summary: Domain events for aggregate state changes, event sourcing patterns

   • entity-pattern.md (580 lines)
     Summary: Entity lifecycle, identity, equality within aggregates

   • specification-policy-pattern.md (920 lines)
     Summary: PolicyBuilder.must() pattern - NEVER inline business rules

   • domain-service-pattern.md (540 lines)
     Summary: Domain services for cross-aggregate operations

   🎯 APPLICATION LAYER (3 patterns)
   ----------------------------------
   • command-handler-pattern.md (780 lines)
     Summary: CQRS command handlers with Dual Identity, @Transactional, Result pattern

   • query-handler-pattern.md (690 lines)
     Summary: Read models, pagination, user context, database queries

   • application-service-pattern.md (620 lines)
     Summary: Orchestration layer for complex multi-aggregate operations

   🔧 INFRASTRUCTURE LAYER (4 patterns)
   ------------------------------------
   • repository-pattern.md (870 lines)
     Summary: CQRS repositories with command/query separation

   • repository-events-pattern.md (950 lines)
     Summary: 3-layer event registration protection (imports, eventMap, test)

   • mapper-pattern.md (680 lines)
     Summary: Domain ↔ Persistence mapping, ORM entity patterns

   • controller-schema-pattern.md (820 lines)
     Summary: Zod schemas, rate limiting, @CurrentUser decorator

   🏗️  ARCHITECTURE LAYER (6 patterns)
   ------------------------------------
   • acl-registry-pattern.md (890 lines)
     Summary: Cross-context communication - NEVER direct imports

   • user-projection-pattern.md (760 lines)
     Summary: Each context has own {context}_users table

   • dual-identity-pattern.md (640 lines)
     Summary: NEVER accept userId from request body - use RequestContextService

   • transactional-pattern.md (580 lines)
     Summary: @Transactional decorator for automatic rollback on Result.fail()

   • bullmq-queue-pattern.md (920 lines)
     Summary: Async job processing, queue setup, error handling

   • integration-event-pattern.md (780 lines)
     Summary: Cross-context events, eventDispatcher, handler registration

   🔀 CROSS-LAYER (4 patterns)
   ---------------------------
   • domain-errors-pattern.md (850 lines)
     Summary: LocalHeroErrorCode enum, Result pattern (CRITICAL foundation)

   • logger-pattern.md (720 lines)
     Summary: Structured logging, PII redaction, context propagation

   • error-handler-chain-pattern.md (680 lines)
     Summary: 9 specialized error handlers in Chain of Responsibility

   • conventions-pattern.md (540 lines)
     Summary: Naming conventions, file structure, import rules

   🧪 TESTING LAYER (4 patterns)
   -----------------------------
   • testing-pyramid-pattern.md (820 lines)
     Summary: ADR-0035 - L1 ~50%, L2 ~30%, L3 ~20%

   • schema-testing-pattern.md (690 lines)
     Summary: 6-category methodology for Zod schema testing

   • context-isolation-pattern.md (580 lines)
     Summary: Test isolation strategies, database cleanup

   • test-seeding-performance-pattern.md (740 lines)
     Summary: "Fixture what you DON'T test, real flow for what you DO test"

   📦 INTEGRATION (2 patterns)
   ---------------------------
   • vytches-ddd-integration-pattern.md (680 lines)
     Summary: @vytches/ddd library usage, 22 packages

   • nestjs-integration-pattern.md (620 lines)
     Summary: NestJS module patterns, dependency injection
   ```

3. **If filter provided** (e.g., `--layer=domain`):
   ```
   🏛️  DOMAIN LAYER (6 patterns)
   -----------------------------

   1. aggregate-pattern.md (850 lines)
      Location: .claude/knowledge/patterns/domain/aggregate-pattern.md
      Last Updated: 2026-01-08
      Summary: Aggregate root design with factory methods, event emission, GDPR segregation

      Key Sections:
      • Factory methods (lines 45-120)
      • Event emission patterns (lines 121-210)
      • GDPR data segregation (lines 211-290)
      • Validation and invariants (lines 291-380)
      • Real examples: UserTrust, Event, Alert (lines 381-850)

   2. value-object-pattern.md (720 lines)
      Location: .claude/knowledge/patterns/domain/value-object-pattern.md
      Summary: Immutable value objects with validation, reconstruction

      Key Sections:
      • Immutability enforcement (lines 30-90)
      • Validation patterns (lines 91-180)
      • Reconstruction from primitives (lines 181-250)
      • Equals and hash implementation (lines 251-320)
      • Real examples: TrustScore, Coordinates (lines 321-720)

   [... remaining domain patterns ...]

   To view pattern details: /knowledge info <pattern-name>
   ```

---

## Command: /knowledge info

**When user runs**: `/knowledge info <pattern-name>`

**Execute these steps**:

1. **Find Pattern File**:
   ```bash
   # Search for pattern file
   pattern_file=$(find .claude/knowledge/patterns -name "${pattern_name}-pattern.md" -o -name "${pattern_name}.md")

   if [ -z "$pattern_file" ]; then
     echo "❌ Error: Pattern not found: $pattern_name"
     exit 1
   fi
   ```

2. **Parse Pattern Metadata**:
   ```bash
   # Extract metadata from pattern file
   title=$(head -1 "$pattern_file" | sed 's/^# //')
   line_count=$(wc -l < "$pattern_file")
   layer=$(dirname "$pattern_file" | xargs basename)
   ```

3. **Display Pattern Details**:
   ```
   Pattern: aggregate-pattern
   ===========================

   📋 METADATA
   -----------
   Full Name: Aggregate Root Pattern
   Layer: Domain
   Location: .claude/knowledge/patterns/domain/aggregate-pattern.md
   Size: 850 lines (~34KB)
   Last Updated: 2026-01-08
   Status: Production (verified across 8 aggregates)

   📝 SUMMARY
   ----------
   Aggregate root design with factory methods, event emission, GDPR segregation.
   Source of truth for ALL aggregate implementations in LocalHero.

   🎯 WHEN TO USE
   --------------
   • Creating new aggregate root
   • Understanding aggregate boundaries
   • Implementing business invariants
   • Emitting domain events
   • Handling GDPR data segregation

   📖 KEY SECTIONS
   ---------------
   1. Factory Methods (lines 45-120)
      - Static factory methods for aggregate creation
      - Validation before construction
      - Initial event emission

   2. Event Emission (lines 121-210)
      - this.apply(new DomainEvent(...))
      - NEVER emit IntegrationEvent from aggregate
      - Event ordering and causality

   3. GDPR Segregation (lines 211-290)
      - Separate personal data from business data
      - Export and deletion patterns
      - Right to be forgotten implementation

   4. Invariants (lines 291-380)
      - Using PolicyBuilder.must()
      - Validation timing (before vs after)
      - Error handling with Result pattern

   5. Real Examples (lines 381-850)
      - UserTrust aggregate (4 examples)
      - Event aggregate (3 examples)
      - Alert aggregate (2 examples)

   🚫 ANTI-PATTERNS
   ----------------
   ❌ Aggregate emits IntegrationEvent directly (violates bounded context isolation)
   ❌ Public setters on aggregate (breaks encapsulation)
   ❌ Inline business rules (use PolicyBuilder.must())
   ❌ Aggregate depends on repository (wrong direction)

   🔗 RELATED PATTERNS
   -------------------
   • domain-event-pattern.md - Event emission details
   • specification-policy-pattern.md - Business rule validation
   • repository-pattern.md - Aggregate persistence
   • value-object-pattern.md - Aggregate composition

   📊 USAGE IN CODEBASE
   --------------------
   8 aggregates verified:
   • UserTrust (geographic-auth context)
   • Event (community-communication context)
   • Alert (community-communication context)
   • UserAction (engagement context)
   • Comment (engagement context)
   • User (auth context)
   • Session (auth context)
   • Permission (authorization context)

   To view file: cat .claude/knowledge/patterns/domain/aggregate-pattern.md
   ```

4. **If pattern not found**:
   ```
   ❌ Error: Pattern not found: invalid-pattern

   To list all patterns: /knowledge list

   Did you mean one of these?
   • aggregate-pattern
   • value-object-pattern
   • domain-event-pattern
   ```

---

## Command: /knowledge extract-pattern

**When user runs**: `/knowledge extract-pattern --from=<file> --name=<pattern>`

**Phase 2 Behavior**:

```
⚠️  Note: Automatic pattern extraction requires Phase 6 (pattern mining pipeline)

Phase 2 MVP: Manual pattern extraction guide.

To extract pattern "$pattern_name" from $file:

1. **Identify Pattern Boundaries**
   - What is the reusable concept?
   - What are the implementation rules?
   - What are common mistakes (anti-patterns)?

2. **Document Pattern Structure**
   ```markdown
   # [Pattern Name] Pattern

   ## Overview
   [1-2 sentence summary]

   ## When to Use
   [Bullet points: scenarios where this pattern applies]

   ## Implementation
   [Step-by-step guide with code examples]

   ## Real Examples
   [3-5 examples from LocalHero codebase with file paths and line numbers]

   ## Anti-Patterns
   [Common mistakes to avoid]

   ## Related Patterns
   [Links to related patterns]
   ```

3. **Create Pattern File**
   Location: .claude/knowledge/patterns/[layer]/$pattern_name-pattern.md
   Expected size: 500-1000 lines

4. **Verify Pattern**
   - Test pattern against 3+ real implementations
   - Ensure all examples are from LocalHero codebase
   - Include file paths and line numbers for all examples

5. **Update Pattern Index**
   Edit: .claude/knowledge/patterns/README.md
   Add: New pattern to appropriate layer section

Logged to audit: .claude/audit.log

(Full automatic extraction with pattern mining in Phase 6)
```

**Log to audit**:
```bash
echo "[$(date)] PATTERN_EXTRACT: $pattern_name from $file (Phase 2: manual guide)" >> .claude/audit.log
```

---

## Command: /knowledge verify

**When user runs**: `/knowledge verify <pattern-name> --in=<file>`

**Execute these steps**:

1. **Load Pattern**:
   ```bash
   # Find pattern file
   pattern_file=$(find .claude/knowledge/patterns -name "${pattern_name}-pattern.md")

   if [ -z "$pattern_file" ]; then
     echo "❌ Error: Pattern not found: $pattern_name"
     exit 1
   fi
   ```

2. **Extract Pattern Rules**:
   ```bash
   # Parse MUST/MUST NOT rules from pattern
   must_rules=$(grep "MUST" "$pattern_file" | grep -v "MUST NOT")
   must_not_rules=$(grep "MUST NOT" "$pattern_file")
   ```

3. **Verify Implementation**:
   ```
   Pattern Verification: aggregate-pattern
   ========================================

   File: src/contexts/geographic-auth/domain/aggregates/user-trust.aggregate.ts
   Pattern: .claude/knowledge/patterns/domain/aggregate-pattern.md

   ✅ COMPLIANCE CHECKS
   --------------------
   ✅ Factory method present (UserTrust.create - line 45)
   ✅ Event emission uses this.apply() (lines 78, 92, 106)
   ✅ No public setters found
   ✅ PolicyBuilder.must() used for validation (lines 120-135)
   ✅ GDPR segregation present (PersonalData interface - line 28)
   ✅ Result pattern used throughout

   ⚠️  WARNINGS
   ------------
   ⚠️  Line 156: Consider extracting complex validation to Specification
      Current: Inline validation in aggregate method
      Recommended: Create TrustScoreSpecification class

   🎯 PATTERN COMPLIANCE: 95% (19/20 rules)

   📊 STATISTICS
   -------------
   • Total rules checked: 20
   • Rules passed: 19
   • Warnings: 1
   • Violations: 0

   To view pattern: /knowledge info aggregate-pattern
   ```

4. **If violations found**:
   ```
   ❌ VIOLATIONS FOUND
   -------------------
   ❌ Line 89: Aggregate emits IntegrationEvent directly
      Violation: MUST NOT emit IntegrationEvent from aggregate
      Fix: Emit DomainEvent, handle in event handler to emit IntegrationEvent

   ❌ Line 142: Public setter detected: setTrustScore()
      Violation: MUST use domain methods, NOT setters
      Fix: Replace with domain method: adjustTrustScore(reason, amount)

   🛑 PATTERN COMPLIANCE: 75% (15/20 rules)
   ⚠️  Fix violations before proceeding with implementation.
   ```

---

## Command: /knowledge stats

**When user runs**: `/knowledge stats`

**Execute these steps**:

1. **Scan Pattern Library**:
   ```bash
   # Count patterns by layer
   domain_count=$(find .claude/knowledge/patterns/domain -name "*-pattern.md" | wc -l)
   application_count=$(find .claude/knowledge/patterns/application -name "*-pattern.md" | wc -l)
   infrastructure_count=$(find .claude/knowledge/patterns/infrastructure -name "*-pattern.md" | wc -l)
   architecture_count=$(find .claude/knowledge/patterns/architecture -name "*-pattern.md" | wc -l)
   cross_layer_count=$(find .claude/knowledge/patterns/cross-layer -name "*-pattern.md" | wc -l)
   testing_count=$(find .claude/knowledge/patterns/testing -name "*-pattern.md" | wc -l)

   # Calculate total lines
   total_lines=$(find .claude/knowledge/patterns -name "*-pattern.md" -exec wc -l {} + | tail -1 | awk '{print $1}')
   ```

2. **Display Library Statistics**:
   ```
   LocalHero Production Pattern Library Statistics
   ================================================

   📊 PATTERN COUNT BY LAYER
   --------------------------
   Domain:          6 patterns  (20.7%)
   Application:     3 patterns  (10.3%)
   Infrastructure:  4 patterns  (13.8%)
   Architecture:    6 patterns  (20.7%)
   Cross-Layer:     4 patterns  (13.8%)
   Testing:         4 patterns  (13.8%)
   Integration:     2 patterns  (6.9%)
   ---------------------------
   Total:          29 patterns

   📏 SIZE DISTRIBUTION
   --------------------
   Total lines:     14,876 lines (~595KB)
   Average size:       513 lines/pattern
   Largest:            950 lines (repository-events-pattern.md)
   Smallest:           540 lines (conventions-pattern.md)

   🏆 TOP 5 MOST CRITICAL PATTERNS
   --------------------------------
   1. domain-errors-pattern.md (850 lines)
      Why: Foundation for Result pattern, error handling
      Used in: ALL contexts (100% coverage)

   2. specification-policy-pattern.md (920 lines)
      Why: Enforces PolicyBuilder.must() - NEVER inline rules
      Used in: 8 aggregates (ADR-0035)

   3. repository-events-pattern.md (950 lines)
      Why: 3-layer event protection prevents runtime errors
      Used in: 12 repositories

   4. command-handler-pattern.md (780 lines)
      Why: CQRS implementation, Dual Identity, @Transactional
      Used in: 47 command handlers

   5. acl-registry-pattern.md (890 lines)
      Why: Cross-context communication - NEVER direct imports
      Used in: 6 contexts (ADR-0032)

   📈 PATTERN USAGE IN CODEBASE
   -----------------------------
   • Aggregates: 8 implementations (6 verified)
   • Value Objects: 24 implementations (18 verified)
   • Command Handlers: 47 implementations (45 verified)
   • Query Handlers: 38 implementations (36 verified)
   • Repositories: 12 implementations (12 verified)
   • Controllers: 28 implementations (26 verified)

   Total pattern applications: 157 (94% compliance)

   🔄 PATTERN RELATIONSHIPS
   ------------------------
   Most connected patterns:
   • domain-errors-pattern.md (links to 12 patterns)
   • aggregate-pattern.md (links to 8 patterns)
   • command-handler-pattern.md (links to 7 patterns)

   📚 DOCUMENTATION QUALITY
   ------------------------
   Average real examples per pattern: 4.2 examples
   Patterns with <3 examples: 0 (100% have sufficient examples)
   Patterns with anti-patterns section: 29 (100%)
   Patterns with related patterns section: 29 (100%)

   🎯 FOUNDATION PATTERNS (Read FIRST)
   ------------------------------------
   Before implementing ANYTHING, read these 3 patterns:
   1. domain-errors-pattern.md - Result pattern, LocalHeroErrorCode
   2. logger-pattern.md - Structured logging, PII redaction
   3. specification-policy-pattern.md - PolicyBuilder.must()

   📂 LIBRARY LOCATION
   -------------------
   Location: .claude/knowledge/patterns/
   Index: .claude/knowledge/patterns/README.md
   Last Updated: 2026-01-08

   📖 QUICK REFERENCE
   ------------------
   • Pattern selection guide: .claude/knowledge/patterns/README.md (lines 166-193)
   • Full pattern index: .claude/knowledge/patterns/README.md (lines 44-140)
   ```

---

## Command: /knowledge load-scope

**When user runs**: `/knowledge load-scope <workflow-type>`

**Phase 2 Behavior**:

```
⚠️  Note: Workflow-specific pattern scoping requires Phase 6 (knowledge scope optimization)

Phase 2 MVP: Load all patterns (no scoping).

Workflow: implementation
========================

Phase 6 Feature (Planned):
--------------------------
Load only relevant patterns for workflow type to reduce token usage by 75-83%.

| Workflow Type  | Patterns Loaded | Token Count | Savings |
|----------------|-----------------|-------------|---------|
| implementation | 18/29 patterns  | 9,200       | 38%     |
| investigation  | 8/29 patterns   | 4,100       | 72%     |
| review         | 12/29 patterns  | 6,500       | 56%     |
| analysis       | 6/29 patterns   | 2,800       | 81%     |

Current Phase 2 Behavior:
-------------------------
All 29 patterns loaded (~14,876 lines)
Token usage: ~15,000 tokens (no optimization yet)

To manually load specific patterns:
1. Identify needed patterns: /knowledge list --layer=<layer>
2. Read pattern: /knowledge info <pattern-name>
3. View file: cat .claude/knowledge/patterns/<layer>/<pattern>-pattern.md

(Full workflow scoping with automatic pattern selection in Phase 6)
```

**Log to audit**:
```bash
echo "[$(date)] KNOWLEDGE_SCOPE: $workflow_type (Phase 2: no scoping)" >> .claude/audit.log
```

---

## Command: /knowledge sync

**When user runs**: `/knowledge sync`

**Execute these steps**:

1. **Scan Codebase for Pattern Usage**:
   ```bash
   # Find all aggregates
   aggregates=$(find src -name "*.aggregate.ts" | wc -l)

   # Find all command handlers
   command_handlers=$(find src -name "*.handler.ts" | grep -i command | wc -l)

   # Find all repositories
   repositories=$(find src -name "*-repository.interface.ts" | wc -l)
   ```

2. **Compare with Pattern Library**:
   ```
   Pattern Library Sync Report
   ============================

   🔍 SCANNING CODEBASE
   --------------------
   Aggregates found:       8 files
   Command Handlers:      47 files
   Query Handlers:        38 files
   Repositories:          12 files
   Controllers:           28 files
   Value Objects:         24 files

   📊 PATTERN COMPLIANCE
   ---------------------
   ✅ aggregate-pattern.md
      Implementations: 8 found
      Verified: 6/8 (75%)
      Needs verification: 2 files
        • src/contexts/neighborhood-economy/domain/aggregates/quick-job.aggregate.ts
        • src/contexts/engagement/domain/aggregates/reaction.aggregate.ts

   ✅ command-handler-pattern.md
      Implementations: 47 found
      Verified: 45/47 (96%)
      Needs verification: 2 files
        • src/contexts/community-communication/application/commands/create-alert.handler.ts
        • src/contexts/engagement/application/commands/add-reaction.handler.ts

   ⚠️  repository-pattern.md
      Implementations: 12 found
      Verified: 12/12 (100%)
      ⚠️  Warning: 3 repositories missing event registration tests
        • src/contexts/neighborhood-economy/infrastructure/repositories/quick-job.repository.ts

   [... remaining patterns ...]

   🎯 OVERALL COMPLIANCE
   ---------------------
   Total pattern applications: 157
   Verified implementations: 148 (94%)
   Needs verification: 9 (6%)

   📝 RECOMMENDED ACTIONS
   ----------------------
   1. Verify 2 aggregate implementations against pattern
   2. Verify 2 command handler implementations against pattern
   3. Add event registration tests to 3 repositories

   To verify specific file:
   /knowledge verify aggregate-pattern --in=src/contexts/.../quick-job.aggregate.ts

   Sync completed. Results logged to .claude/audit.log
   ```

**Log to audit**:
```bash
echo "[$(date)] KNOWLEDGE_SYNC: 157 implementations scanned, 94% compliance" >> .claude/audit.log
```

---

## Phase 2 Limitations & Phase 6+ Features

### Phase 2 (Current - MVP)

✅ **Working**:
- Pattern listing from markdown files
- Pattern info display
- Manual pattern verification
- Library statistics
- Sync report with compliance checking

⏳ **Limited**:
- Pattern extraction: manual guide only
- Workflow scoping: all patterns loaded (no optimization)
- Verification: manual check only (no enforcement)

### Phase 6 (Knowledge Scope Optimization)

🔮 **Planned**:
- Automatic workflow scoping (75-83% token reduction)
- Pattern mining pipeline (extract patterns from code)
- Intelligent pattern recommendation
- Pattern compliance enforcement in gates
- Pattern versioning and evolution tracking

---

## Error Handling

**Pattern not found**:
```
❌ Error: Pattern not found: invalid-pattern

To list all patterns: /knowledge list

Did you mean one of these?
• aggregate-pattern
• value-object-pattern
• repository-pattern
```

**Invalid layer filter**:
```
❌ Error: Invalid layer: invalid-layer

Valid layers:
• domain
• application
• infrastructure
• architecture
• cross-layer
• testing
• integration
```

**File not found for verification**:
```
❌ Error: File not found: src/invalid/path/file.ts

To verify pattern implementation:
1. Ensure file path is correct
2. File must exist in repository
3. Use absolute path from project root

Example:
/knowledge verify aggregate-pattern --in=src/contexts/auth/domain/aggregates/user.aggregate.ts
```

---

## Integration with Other Skills

- **Uses `/workflow`**: Pattern scoping per workflow type (Phase 6)
- **Uses `/agent-registry`**: Pattern assignment per agent (Phase 6)
- **Uses `/validate`**: Pattern compliance enforcement (Phase 4)

---

## Version History

- **1.0.0** (2026-01-12): Phase 2 MVP - Basic pattern management via markdown files
- **Planned 2.0.0** (Phase 6): Workflow scoping, pattern mining, automatic extraction
