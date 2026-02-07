---
name: orchestrate
description: Manually delegate to project orchestrator (backup for auto-delegation)
invocable: user
tools: Task
model: sonnet
---

# Orchestrate Skill - Manual Orchestrator Delegation

**IMMEDIATE ACTION REQUIRED**: You MUST invoke the Task tool with these EXACT parameters:

```typescript
Task(
  subagent_type: 'localhero-project-orchestrator',
  prompt: '{user request without /orchestrate prefix}',
  description: 'Manual orchestrator delegation'
)
```

## Critical Rules

1. ✅ **DO**: Invoke Task tool IMMEDIATELY - before any text response
2. ✅ **DO**: Pass the user's FULL request (without `/orchestrate` prefix)
3. ✅ **DO**: Use subagent_type='localhero-project-orchestrator' (exact string)
4. ❌ **DON'T**: Respond with explanatory text first
5. ❌ **DON'T**: Ask questions before invoking
6. ❌ **DON'T**: Analyze or validate - just delegate

## Example

**User types**:
```
/orchestrate Dodaj user profile feature
```

**You MUST immediately invoke**:
```typescript
Task(
  subagent_type: 'localhero-project-orchestrator',
  prompt: 'Dodaj user profile feature',
  description: 'Manual orchestrator delegation'
)
```

**Do NOT output text like**:
- ❌ "I'll delegate this to the orchestrator..."
- ❌ "Let me route this to @localhero-project-orchestrator..."
- ❌ "I'm going to use the Task tool..."

**Just invoke the tool. Period.**

---

## When to Use This Skill

This skill is a **BACKUP** for the automatic delegation system. Use it when:

1. Auto-delegation fails for some reason
2. You want to explicitly force orchestration
3. Hook is temporarily disabled
4. Testing orchestrator behavior

**Normally, you DON'T need this skill** - the user-prompt-submit hook automatically delegates implementation requests.

---

## How Auto-Delegation Normally Works

```
User: "Dodaj feature X"
  ↓
Hook: Detects keyword → adds @localhero-project-orchestrator
  ↓
CLAUDE.md: Sees @agent-name → invokes Task tool
  ↓
Orchestrator: Executes workflow
```

This skill provides manual override when needed.

---

**Version**: 1.0
**Created**: 2026-01-03
**Purpose**: Backup manual delegation mechanism
