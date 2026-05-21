---
name: adr
description: "Create an Architecture Decision Record for a decision just made"
origin: claude-patterns
allowed-tools: Read, Write, Glob, Bash
effort: low
---

# /adr — Architecture Decision Record

Document an architectural decision before it gets lost in commit history or chat.

## When to Use

- After choosing between two approaches (sync vs async, SQL vs NoSQL, etc.)
- After settling a naming/URL convention debate
- After making a domain modeling decision (aggregate boundaries, outbox tiers)
- Any decision you'd have to re-explain in code review

## Steps

### 1. Read stack context

Read `project.yml` → extract `stack_profile`. If missing, treat as `universal`.

### 2. Auto-number

```bash
ls docs/adr/ 2>/dev/null | grep -E '^ADR-[0-9]+' | sort | tail -1
```

Next = last number + 1, zero-padded to 4 digits. If `docs/adr/` doesn't exist, `mkdir -p docs/adr/` and start at `ADR-0001`.

### 3. Gather content (conversationally)

Ask for, one at a time if not provided via `$ARGUMENTS`:

- **Title** — short noun phrase ("outbox tier classification", "sync vs async for payment confirmation")
- **Status** — proposed | accepted | deprecated | superseded  
- **Context** — what forced this decision? what constraints existed?
- **Options considered** — at least 2; what else was on the table and why it was rejected
- **Decision** — what was chosen + one-sentence reason
- **Consequences** — what improves, what gets harder

### 4. Stack-specific prompts

After gathering the core 6, ask targeted follow-ups based on `stack_profile`:

**nestjs-ddd**
- Does this affect `BUSINESS_RULES.yaml`? Which section?
- Which bounded context(s) does this live in?
- Does this change outbox tier classification (O-1 Compliance-critical / O-2 Business-critical / O-3 Operational / O-4 Best-effort)?
- Does this affect cross-context communication (ACL, domain events)?

**flutter-clean-arch**
- Which layer is primarily affected (domain / application / infrastructure / presentation)?
- Does this affect state management (Riverpod providers, notifiers)?
- Does this affect navigation or routing?

**python / python-pipeline**
- Does this affect module boundaries or import rules?
- Does this introduce or remove an async boundary?

**nextjs-app / sveltekit**
- Client vs server rendering tradeoff?
- Does this affect data fetching strategy (SSR, RSC, SWR)?

**universal** — no additional prompts.

### 5. Write the ADR

Create `docs/adr/ADR-NNNN-<kebab-slug>.md`:

```markdown
# ADR-NNNN: {Title}

**Status**: {status}
**Date**: {YYYY-MM-DD}
**Stack**: {stack_profile}

## Context

{context}

## Options Considered

### Option A: {name}
{description + pros/cons}

### Option B: {name}
{description + pros/cons}

## Decision

{chosen option} — {one-sentence reason}

## Consequences

**Better**: {what improves}
**Watch**: {what gets harder or needs monitoring}
```

Add stack-specific sections below `Consequences` if applicable:

```markdown
## nestjs-ddd Impact

**Context**: {bounded context}
**BUSINESS_RULES.yaml**: {section to update, or "no change"}
**Outbox tier**: {O-1/O-2/O-3/O-4 or "not applicable"}
**Cross-context**: {ACL / domain event change, or "none"}
```

### 6. Report

```
ADR written: docs/adr/ADR-0042-outbox-tier-classification.md
Status: accepted

⚠ nestjs-ddd: update BUSINESS_RULES.yaml → outbox_tiers section
```

Only flag BUSINESS_RULES.yaml if it was confirmed as affected.
