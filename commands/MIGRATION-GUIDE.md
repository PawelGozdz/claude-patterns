# Command Migration Guide: Legacy → Skills

**Version**: 1.0.0 (TS-CLAUDE-001 Phase 2)
**Created**: 2026-01-12
**Status**: Active

This guide maps legacy `/hero-*` commands to the new skill-based commands introduced in Phase 2.

---

## Migration Overview

| Legacy Command | New Skill Command | Status |
|---------------|-------------------|--------|
| `/hero-validate-ddd` | `/validate ddd-compliance` | Migrated |
| `/hero-security-audit` | `/validate security` | Migrated |
| `/hero-quality-gates` | `/validate quality-gate` | Migrated |
| `/hero-agent-sync` | `/knowledge sync` | Migrated |
| `/hero-agent-status` | `/agent-registry list` + `/agent-registry stats` | Migrated |
| `/hero-context-report` | `/workflow status` + `/knowledge stats` | Migrated |
| `/hero-analyze-context` | `/validate ddd-compliance --in=<context>` | Migrated |
| `/hero-create-feature` | `/workflow start implementation --task=<task>` | Migrated |
| `/hero-implement-task` | `/workflow start implementation --task=<task>` | Migrated |
| `/hero-compile-agents` | (Remains - infrastructure script) | Unchanged |
| `/hero-orchestrate` | (Remains - primary routing command) | Unchanged |

---

## Detailed Migration Mappings

### 1. DDD Validation

**Legacy**:
```bash
/hero-validate-ddd
```

**New**:
```bash
# Validate specific file
/validate ddd-compliance --in=src/contexts/auth/domain/aggregates/user.aggregate.ts

# Validate entire context
/validate ddd-compliance --in=src/contexts/geographic-auth
```

**New Features**:
- Pattern-specific compliance checking
- Line-by-line violation reporting
- Integration with `/knowledge` for pattern rules

---

### 2. Security Audit

**Legacy**:
```bash
/hero-security-audit
```

**New**:
```bash
# Audit specific scope
/validate security --scope=src/contexts/community-communication/**/*.ts

# Audit entire context
/validate security --scope=src/contexts/auth
```

**New Features**:
- OWASP Top 10 systematic checks
- Severity-based reporting (CRITICAL/HIGH/MEDIUM/LOW)
- PII exposure detection
- Integration with @security-e2e-verifier

---

### 3. Quality Gates

**Legacy**:
```bash
/hero-quality-gates
```

**New**:
```bash
# Check test pyramid
/validate test-pyramid

# Check specific context
/validate test-pyramid --context=geographic-auth

# Full quality gate (Phase 9 workflow)
/validate quality-gate --workflow=wf-2026-01-12-143022-a3f9
```

**New Features**:
- ADR-0035 test pyramid validation
- Per-context breakdown
- Trend analysis
- Integration with workflow gates

---

### 4. Agent Sync

**Legacy**:
```bash
/hero-agent-sync
```

**New**:
```bash
# Sync patterns with codebase
/knowledge sync

# Check pattern compliance
/knowledge stats
```

**New Features**:
- Pattern compliance percentage
- Verification status per pattern
- Recommended actions for non-compliant files

---

### 5. Agent Status

**Legacy**:
```bash
/hero-agent-status
```

**New**:
```bash
# List all agents
/agent-registry list

# Filter by role
/agent-registry list --filter=implementers

# Get specific agent info
/agent-registry info domain-application-implementer

# Get statistics
/agent-registry stats
```

**New Features**:
- Model cost breakdown
- VETO power tracking
- Tool usage statistics
- Per-agent detail view

---

### 6. Context Report

**Legacy**:
```bash
/hero-context-report
```

**New**:
```bash
# Check active workflows
/workflow status

# Check knowledge library stats
/knowledge stats

# Combined report (use both)
/workflow status && /knowledge stats
```

**New Features**:
- Workflow phase tracking
- Pattern usage statistics
- Token budget awareness (Phase 3)

---

### 7. Analyze Context

**Legacy**:
```bash
/hero-analyze-context
```

**New**:
```bash
# Validate DDD compliance for context
/validate ddd-compliance --in=src/contexts/geographic-auth

# Check pattern compliance
/knowledge verify aggregate-pattern --in=src/contexts/geographic-auth/domain/aggregates

# Full analysis workflow
/workflow start analysis --task=TS-CONTEXT-ANALYSIS
```

**New Features**:
- Pattern-based analysis
- Structured compliance reports
- Integration with analysis workflow

---

### 8. Create Feature / Implement Task

**Legacy**:
```bash
/hero-create-feature
/hero-implement-task
```

**New**:
```bash
# Start implementation workflow (11 phases)
/workflow start implementation --task=TS-GEO-006.md

# Start investigation workflow (5 phases)
/workflow start investigation --issue="Bug in trust scoring"

# Start review workflow (3 phases)
/workflow start review --files=src/contexts/auth/**/*.ts

# Start analysis workflow (2 phases)
/workflow start analysis --task=TS-GEO-006.md
```

**New Features**:
- 4 workflow types with appropriate phases
- VETO gates at critical points
- Workflow ID tracking
- Pause/resume capability
- Checkpoint support (Phase 3)

---

## Commands That Remain Unchanged

### `/hero-orchestrate` (Primary Routing Command)

Remains as the main entry point for intelligent routing. The new skills enhance its capabilities:

```bash
# These still work via /hero-orchestrate
/hero-orchestrate Zaimplementuj UserProfile aggregate
# → Internally uses: /workflow start implementation

/hero-orchestrate Oceń jakość kodu w auth context
# → Internally uses: /validate ddd-compliance

/hero-orchestrate Znajdź wszystkie aggregaty
# → Delegates to: @codebase-explorer (no skill change)
```

### `/hero-compile-agents` (Infrastructure Script)

Remains as bash script for recompiling agent configurations from YAML:

```bash
/hero-compile-agents
# Outputs to: .claude/agents/implementers/, .claude/agents/verifiers/
```

This is an infrastructure operation, not a skill. Kept separate.

---

## Backward Compatibility

**Phase 2 (Current)**:
- Legacy commands still work
- Display deprecation notice with migration guidance
- Both old and new commands route to same functionality

**Phase 3+ (Planned)**:
- Legacy commands display warning
- Automatic redirect to new skill commands
- Eventual removal of legacy commands

---

## Example Deprecation Notice

When user runs legacy command:
```
⚠️  DEPRECATION NOTICE: /hero-validate-ddd

This command is deprecated and will be removed in Phase 4.

Please use the new skill command:
  /validate ddd-compliance --in=<file-or-directory>

Migration guide: .claude/commands/MIGRATION-GUIDE.md

Proceeding with legacy behavior...
```

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────────────┐
│                    SKILL COMMANDS QUICK REFERENCE                │
├──────────────────────────────────────────────────────────────────┤
│ WORKFLOW MANAGEMENT                                              │
│   /workflow start implementation --task=TS-XXX.md                │
│   /workflow start investigation --issue="..."                    │
│   /workflow start review --files=src/contexts/auth/**/*.ts       │
│   /workflow start analysis --task=TS-XXX.md                      │
│   /workflow status [<workflow-id>]                               │
│   /workflow checkpoint [--message="..."]                         │
│   /workflow pause [--message="..."]                              │
│   /workflow resume <workflow-id>                                 │
│   /workflow close <workflow-id>                                  │
├──────────────────────────────────────────────────────────────────┤
│ AGENT REGISTRY                                                   │
│   /agent-registry list [--filter=<role>]                         │
│   /agent-registry info <agent-name>                              │
│   /agent-registry assign <agent> --task=<id>                     │
│   /agent-registry reassign-model <agent> --model=<opus|sonnet>   │
│   /agent-registry grant-veto <agent> --reason="..."              │
│   /agent-registry revoke-veto <agent>                            │
│   /agent-registry stats                                          │
├──────────────────────────────────────────────────────────────────┤
│ KNOWLEDGE (PATTERN LIBRARY)                                      │
│   /knowledge list [--layer=<layer>]                              │
│   /knowledge info <pattern-name>                                 │
│   /knowledge extract-pattern --from=<file> --name=<pattern>      │
│   /knowledge verify <pattern-name> --in=<file>                   │
│   /knowledge stats                                               │
│   /knowledge load-scope <workflow-type>                          │
│   /knowledge sync                                                │
├──────────────────────────────────────────────────────────────────┤
│ VALIDATION & GATES                                               │
│   /validate ddd-compliance --in=<file>                           │
│   /validate test-pyramid [--context=<context>]                   │
│   /validate security --scope=<files>                             │
│   /validate business-gate --task=<task-id>                       │
│   /validate quality-gate --workflow=<workflow-id>                │
│   /validate pre-execution --agent=<agent> --action=<action>      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Version History

- **1.0.0** (2026-01-12): Initial migration guide for Phase 2
