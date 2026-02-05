# Fresh Context Pattern

> **Category**: Architecture
> **Layer**: Cross-Agent Coordination
> **Version**: 1.0.0
> **Status**: Production
> **Inspired By**: GSD (get-shit-done) context engineering
> **Last Updated**: 2026-01-15

---

## Intent

Maintain optimal context efficiency across multi-agent conversations by ensuring orchestrator context stays lean (~15%) while subagents receive fresh, focused context (~100% relevant).

---

## Problem

**Context Rot Symptoms**:
- Orchestrator context bloated with implementation details (>50% tokens)
- Subagents receive stale or irrelevant patterns from parent context
- Token costs escalate due to unnecessary context pollution
- Agents lose focus due to mixed concerns (strategic + tactical)

**Example Scenario**:
```
Session start: Orchestrator at 15% context usage
After 3 delegations: Orchestrator at 60% context usage
After 5 delegations: Orchestrator at 85% context usage (⚠️ CRITICAL)

Problem: Each delegation adds implementation details to orchestrator,
even though orchestrator should only coordinate, not implement.
```

---

## Solution

**Two-Tier Context Strategy**:

### Tier 1: Lean Orchestrator (~15% context)
- **Role**: Coordination, routing, decision-making
- **Context**: Business rules, agent matrix, delegation patterns
- **NO implementation details**: Code snippets, test results, detailed logs

### Tier 2: Fresh Subagents (~100% relevant context)
- **Role**: Implementation, verification, specialized tasks
- **Context**: Specific patterns for their layer, relevant examples
- **Reset between tasks**: Each delegation starts with clean context

---

## Implementation

### Orchestrator Context Budget

**MUST maintain**:
```
System instructions:        ~15-20% (CLAUDE.md, orchestrator prompt)
Task analysis:              ~10-15% (current task understanding)
Agent routing:              ~5-10%  (delegation decisions)
Recent decisions:           ~5-10%  (STATE.md, last 3-5 decisions)
Reserved for responses:     ~50%    (space for reasoning and output)
────────────────────────────────────
Total context used:         ~15-20% at start of delegation
                            ~30-40% after delegation (includes subagent response)
```

**MUST NOT accumulate**:
- ❌ Implementation code from subagents
- ❌ Detailed test results
- ❌ Full pattern files (reference paths only)
- ❌ Debugging logs
- ❌ Multiple iterations of same code

### Subagent Context Budget

**Fresh context per delegation**:
```
System instructions:        ~20-25% (agent-specific prompt)
Relevant patterns:          ~15-20% (ONLY patterns for their layer)
Task scope:                 ~10-15% (specific implementation request)
Examples:                   ~10-15% (reference implementations)
Reserved for work:          ~40%    (implementation + response)
────────────────────────────────────
Total context used:         ~100% focused on task
```

**Pattern loading strategy**:
```
Domain layer agent → ONLY load domain patterns
Application layer agent → ONLY load application patterns
Infrastructure agent → ONLY load infrastructure patterns

DON'T: Load all 29 patterns (~14,876 lines) for every agent
DO: Load 4-6 relevant patterns (~3,000 lines) per agent
```

---

## When to Use

### Use Fresh Context Pattern When:

✅ **Orchestrator context exceeds 30%**
- Symptom: Orchestrator spending >30% tokens before delegation
- Action: Use `/compact` or `/clear` between tasks
- Prevention: Don't include implementation details in orchestrator responses

✅ **Subagent receives irrelevant context**
- Symptom: Domain agent sees infrastructure patterns
- Action: Scope pattern loading to agent's layer
- Prevention: Use Task tool's context scoping (future: Phase 6)

✅ **Token costs escalate unexpectedly**
- Symptom: Simple coordination tasks cost >5K tokens
- Action: Review what's in orchestrator context
- Prevention: Archive completed tasks, use STATE.md for continuity

✅ **Multiple related tasks in sequence**
- Symptom: Task 1 context pollutes Task 2
- Action: Use continuation agents vs clean agents
- Decision: See "Continuation vs Resume" below

---

## Continuation vs Resume Pattern

### When to Use Continuation Agent (Preserve Context)

**Scenario**: Sequential phases of SAME feature
**Example**: Domain → Application → Infrastructure for UserProfile

```
Task 1: Create UserProfile aggregate (Domain Agent)
Task 2: Create CreateUserProfile handler (Application Agent)
         ↓ Needs to know about UserProfile from Task 1
         
Decision: Use SAME Application Agent (continuation)
Benefit: Agent remembers UserProfile structure
Cost: Context accumulates (acceptable for related work)
```

**Indicators**:
- Tasks are tightly coupled (same feature)
- Later task needs knowledge from earlier task
- Total sequence <5 tasks (context manageable)
- Completing within same session

### When to Use Resume/Fresh Agent (Reset Context)

**Scenario**: Different features OR context rot
**Example**: UserProfile complete → now implement NotificationPreferences

```
Task 1: UserProfile feature (COMPLETED)
Task 2: NotificationPreferences feature (NEW)
         ↓ Unrelated to UserProfile
         
Decision: Use FRESH Domain Agent (resume)
Benefit: Clean context, no UserProfile pollution
Cost: None (previous context not needed)
```

**Indicators**:
- Tasks are independent features
- Context from previous task not needed
- Orchestrator context >40% before new task
- Starting new session after break

---

## Anti-Patterns

### Anti-Pattern 1: Orchestrator as Implementation Agent

**Problem**:
```
User: "Create UserProfile aggregate"
Orchestrator: [Writes aggregate code directly]
            [Includes full code in response]
            [Context now 40% → 60%]
```

**Solution**:
```
User: "Create UserProfile aggregate"
Orchestrator: "Delegating to @domain-application-implementer"
              [Invokes Task tool]
              [Receives summary only, NOT full code]
              [Context stays 15% → 20%]
```

**Why It Matters**: Orchestrator should coordinate, not implement. Implementation details should stay in subagent context only.

### Anti-Pattern 2: Full Pattern Loading

**Problem**:
```
Domain Agent receives:
- All 29 patterns (14,876 lines)
- Including infrastructure patterns (not relevant)
- Including testing patterns (agent doesn't test)
Result: 40% context wasted on irrelevant patterns
```

**Solution**:
```
Domain Agent receives:
- Domain patterns only (6 patterns, ~3,500 lines)
- Maybe architecture patterns (4 patterns, ~2,800 lines)
- NO infrastructure, testing, or cross-layer patterns
Result: 15% context for patterns, 85% for work
```

**Why It Matters**: Pattern loading is biggest context consumer. Scope aggressively.

### Anti-Pattern 3: Context Accumulation Without Checkpoints

**Problem**:
```
Session: 10 sequential tasks without /clear
Task 1: Context 15% → 30%
Task 2: Context 30% → 45%
Task 3: Context 45% → 60%
Task 4: Context 60% → 75%
Task 5: Context 75% → 90% (⚠️ CRITICAL)
```

**Solution**:
```
Task 1: Context 15% → 30%
[Update STATE.md, /clear]
Task 2: Context 15% → 30% (FRESH START)
[Update STATE.md, /clear]
Task 3: Context 15% → 30%
```

**Why It Matters**: STATE.md provides continuity without context pollution. Use `/clear` liberally between tasks.

### Anti-Pattern 4: Subagent Context Inheritance

**Problem**:
```
Orchestrator (at 50% context):
  ↓ Delegates to Domain Agent
Domain Agent receives:
  - All 50% of orchestrator context (includes previous tasks)
  - Plus 30% for agent-specific prompt
  - Plus 20% for patterns
  = 100% context BEFORE starting work (❌ NO ROOM TO WORK)
```

**Solution**:
```
Orchestrator (at 50% context):
  ↓ Delegates with scoped prompt
Domain Agent receives:
  - ONLY task description (10%)
  - Agent-specific prompt (20%)
  - Relevant patterns (15%)
  = 45% context, 55% reserved for work (✅ GOOD)
```

**Why It Matters**: Task tool should scope context to task only, not inherit full parent context.

---

## Context Rot Detection

### Automated Detection (Future: Phase 6)

```bash
# .claude/analytics/context-health-check.sh
#!/bin/bash

ORCHESTRATOR_CONTEXT=$(measure_context "orchestrator")

if [ $ORCHESTRATOR_CONTEXT -gt 40 ]; then
  echo "⚠️ WARNING: Orchestrator context at ${ORCHESTRATOR_CONTEXT}%"
  echo "Recommendation: Use /compact or /clear before next delegation"
fi

if [ $ORCHESTRATOR_CONTEXT -gt 60 ]; then
  echo "❌ CRITICAL: Orchestrator context at ${ORCHESTRATOR_CONTEXT}%"
  echo "MANDATORY: Use /clear and update STATE.md NOW"
  exit 1
fi
```

### Manual Detection (Current)

**Check orchestrator context**:
1. Use `/context` command in Claude Code
2. If >40% → Use `/compact` to compress
3. If >60% → Use `/clear` and update STATE.md

**Symptoms of context rot**:
- Orchestrator responses include implementation details
- Subagent responses are slow or incomplete
- Token costs higher than expected for simple tasks
- Agents seem "confused" or lose focus

---

## Best Practices

### DO ✅

**Orchestrator**:
- Maintain lean context (~15-20%)
- Reference files by path, don't include full content
- Use STATE.md for cross-session continuity
- Use `/clear` between unrelated tasks
- Use `/compact` when context >40%

**Subagents**:
- Load only relevant patterns for their layer
- Complete task and return summary only
- Don't accumulate context across tasks (unless continuation)
- Use Task tool's context scoping (future)

**Both**:
- Update STATE.md instead of keeping details in context
- Archive completed tasks to files
- Use debug files for investigations, not context
- Monitor token usage with efficiency tracker

### DON'T ❌

**Orchestrator**:
- Include full implementation code in responses
- Load all patterns "just in case"
- Keep implementation details in context
- Chain >5 tasks without `/clear`

**Subagents**:
- Inherit full orchestrator context
- Load patterns for other layers
- Return full code in summary (return file paths)
- Keep context between unrelated tasks

**Both**:
- Ignore context percentage warnings
- Skip STATE.md updates to save time
- Assume context will "work itself out"
- Mix strategic and tactical concerns in same context

---

## Workflow Integration

### Standard Task Workflow with Fresh Context

```
┌─────────────────────────────────────────────────────┐
│ 1. Orchestrator: Analyze task (15% → 20%)          │
│    - Read task file                                 │
│    - Identify patterns needed                       │
│    - Route to appropriate agent                     │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 2. Delegate with scoped context                     │
│    Task(                                            │
│      subagent_type='domain-application-implementer',│
│      prompt='Create UserProfile with email, bio',   │
│      context_scope=['domain-patterns'],  ← Future   │
│    )                                                │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 3. Subagent: Fresh context (~45%)                   │
│    - Agent prompt (20%)                             │
│    - Domain patterns (15%)                          │
│    - Task description (10%)                         │
│    - Work (55% reserved)                            │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 4. Subagent: Return summary (NOT full code)         │
│    "✅ Created UserProfile aggregate                │
│     - Files: src/contexts/auth/domain/aggregates/   │
│     - Tests: 3 L1-Spec tests passing                │
│     - Patterns used: PolicyBuilder, Result pattern" │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 5. Orchestrator: Update STATE.md (20% → 25%)       │
│    - Add to Recent Decisions                        │
│    - Update Current Position                        │
│    - File paths in Quick Reference                  │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 6. Next task: /clear if unrelated, continue if not │
│    - Unrelated: /clear → back to 15%                │
│    - Related: Continue → stay at 25%                │
└─────────────────────────────────────────────────────┘
```

---

## Metrics & Monitoring

### Target Metrics

| Role | Context Budget | Warning | Critical |
|------|----------------|---------|----------|
| Orchestrator (start) | 15-20% | >30% | >60% |
| Orchestrator (post-delegation) | 20-30% | >40% | >70% |
| Subagent (start) | 40-50% | >60% | >80% |
| Subagent (working) | 50-70% | >80% | >90% |

### Efficiency Tracking

**Use token efficiency tracker**:
```bash
# Take snapshot before major workflow
.claude/analytics/token-efficiency-tracker.sh snapshot

# After workflow
.claude/analytics/token-efficiency-tracker.sh compare

# Check if context management is working
# Target: Haiku >15%, Sonnet ~55%, Opus <30%
```

**Context efficiency formula**:
```
Efficiency = (Relevant Context / Total Context) × 100%

Target: >70% relevant context
Warning: <60% relevant context
Critical: <40% relevant context (mostly pollution)
```

---

## Examples

### Example 1: Single Task with Fresh Context

**Scenario**: Create UserProfile aggregate

```
Orchestrator (15%):
  Task analysis: "Domain layer, needs aggregate pattern"
  Delegation: @domain-application-implementer
  ↓
Domain Agent (40%):
  Load: domain/aggregate-pattern.md (15%)
  Load: domain/value-object-pattern.md (10%)
  Load: domain/specification-policy-pattern.md (10%)
  Task: Create UserProfile (5%)
  Work: (60% reserved)
  ↓
Implementation Complete
  ↓
Orchestrator (20%):
  Update STATE.md: UserProfile created
  Next: Delegate to Application Agent
```

**Context efficiency**: 75% (mostly relevant)
**Token cost**: ~4K tokens (optimal)

### Example 2: Multi-Task with Continuation

**Scenario**: UserProfile aggregate → CreateUserProfile handler

```
Task 1: Domain Layer
─────────────────────
Orchestrator (15%) → Domain Agent (40%)
  Creates: UserProfile aggregate
  Returns: Summary + file paths
Orchestrator (20%)

Task 2: Application Layer (CONTINUATION)
─────────────────────────────────────────
Orchestrator (20%) → Application Agent (45%)
  Context includes: UserProfile structure from Task 1 ✅
  Creates: CreateUserProfileHandler
  Returns: Summary + file paths
Orchestrator (25%)

Decision: NO /clear between tasks (related work)
```

**Context efficiency**: 70% (acceptable for related work)
**Token cost**: ~8K tokens (2 tasks)

### Example 3: Multi-Task with Fresh Reset

**Scenario**: UserProfile feature → NotificationPreferences feature

```
Task 1: UserProfile (COMPLETED)
─────────────────────────────────
Orchestrator (15% → 30%)
  ↓
STATE.md updated: UserProfile complete
/clear
  ↓
Orchestrator (15%) ← FRESH START

Task 2: NotificationPreferences (NEW)
───────────────────────────────────────
Orchestrator (15%) → Domain Agent (40%)
  NO UserProfile context ✅ (not needed)
  Creates: NotificationPreferences aggregate
Orchestrator (20%)

Decision: /clear between tasks (unrelated features)
```

**Context efficiency**: 80% (excellent - no pollution)
**Token cost**: ~6K tokens total (optimal for 2 separate features)

---

## Related Patterns

- **STATE.md Pattern**: Cross-session continuity without context
- **Debug Files Pattern**: Investigation without context pollution
- **Token Efficiency Pattern**: Cost optimization strategies
- **Agent Delegation Pattern**: When to use continuation vs fresh agents

---

## References

**Inspired By**:
- GSD (get-shit-done) - Context engineering approach
- LocalHero orchestration experience - Real-world context rot scenarios

**Documentation**:
- `.claude/STATE.md` - Cross-session memory
- `.claude/debug/README.md` - Debug persistence
- `.claude/analytics/token-efficiency-tracker.sh` - Metrics

**Related ADRs**:
- ADR-0035 - Specification-first testing (context scoping)
- Future ADR - Context management strategy (Phase 6)

---

**Version**: 1.0.0
**Status**: Production
**Maintainers**: @localhero-project-orchestrator + all agents
**Review Cycle**: Monthly (adjust based on metrics)
