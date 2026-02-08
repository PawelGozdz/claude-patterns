# Show Agent Tasks Command

Display current task assignments and agent activity across the project.

---

## Usage

This command helps you:
- See which agents are working on what
- Track task distribution
- Identify bottlenecks
- Review recent agent activity

**Syntax:**
```
/show-agent-tasks
```

---

## What This Command Shows

### 1. Active Tasks by Agent

Shows current task assignments from task history:

```
🤖 Agent Task Overview
═══════════════════════════════════════════════════

ACTIVE IMPLEMENTATIONS
─────────────────────────────────────────────────

@domain-layer-implementer
  📋 TS-USER-003: User preferences aggregate
     Status: In Progress
     Started: 2025-10-11 14:30
     Files: 3 created, 1 modified

@application-layer-implementer
  📋 TS-AUTH-045: Refresh token rotation
     Status: Verification Pending
     Started: 2025-10-11 13:15
     Files: 5 created

@infrastructure-api-implementer
  📋 TS-API-012: Rate limiting middleware
     Status: Testing
     Started: 2025-10-11 15:00
     Files: 2 created, 3 modified

@testing-implementer
  ✅ Idle - Available for delegation

VERIFICATION QUEUE
─────────────────────────────────────────────────

@domain-verifier
  🔍 TS-USER-003: Awaiting implementation completion

@application-verifier
  🔍 TS-AUTH-045: Ready for verification
     Waiting: 15 minutes

@security-verifier
  🔍 TS-AUTH-045: Queued
  🔍 TS-API-012: Queued

@e2e-verifier (VETO POWER)
  ✅ Idle - Available for verification
```

---

### 2. Recent Activity

Shows last 10 agent actions from audit log:

```
RECENT ACTIVITY (Last 10 Actions)
─────────────────────────────────────────────────

[15:45] domain-verifier ✅ APPROVED TS-USER-002
[15:30] testing-implementer 📝 COMPLETED TS-USER-002
[15:15] infrastructure-api-implementer 📝 COMPLETED TS-USER-002
[14:50] application-verifier ✅ APPROVED TS-AUTH-045
[14:35] application-layer-implementer 📝 COMPLETED TS-AUTH-045
[14:20] security-verifier ⚠️  CONDITIONAL TS-AUTH-044
[14:05] e2e-verifier 🚫 VETOED TS-AUTH-044 (missing tests)
[13:50] domain-verifier ✅ APPROVED TS-AUTH-044
[13:30] domain-layer-implementer 📝 COMPLETED TS-AUTH-044
[13:15] orchestrator 🎯 DELEGATED TS-AUTH-045
```

---

### 3. Agent Statistics

Shows productivity metrics:

```
AGENT STATISTICS (Last 7 Days)
─────────────────────────────────────────────────

Implementers:
  @domain-layer-implementer
    Tasks: 12 completed
    Avg time: 45 min
    Patterns discovered: 3

  @application-layer-implementer
    Tasks: 15 completed
    Avg time: 38 min
    Patterns discovered: 5

  @infrastructure-api-implementer
    Tasks: 10 completed
    Avg time: 52 min
    Patterns discovered: 2

  @testing-implementer
    Tasks: 18 completed (all delegated)
    Avg time: 35 min
    Coverage: 87% average

Verifiers:
  @domain-verifier
    Verifications: 12
    Approved: 11 (91.7%)
    Rejected: 1 (8.3%)

  @application-verifier
    Verifications: 15
    Approved: 14 (93.3%)
    Rejected: 1 (6.7%)

  @security-verifier
    Verifications: 10
    Approved: 8 (80%)
    Conditional: 2 (20%)

  @e2e-verifier (VETO POWER)
    Verifications: 18
    Approved: 15 (83.3%)
    Conditional: 2 (11.1%)
    Vetoed: 1 (5.6%)

Overall Success Rate: 94.2% ✅
```

---

### 4. Bottleneck Detection

Identifies potential issues:

```
⚠️  POTENTIAL BOTTLENECKS
─────────────────────────────────────────────────

1. Verification Queue: 3 tasks waiting
   → @security-verifier has 2 tasks queued
   → Consider running verifications in parallel

2. Long-running task detected
   → TS-API-012 in progress for 2h 15min
   → @infrastructure-api-implementer may need help

3. High rejection rate
   → @security-verifier rejected 20% last week
   → Review security patterns with team
```

---

## Implementation Details

This command aggregates data from:

```bash
# 1. Task history (active tasks)
ls -lt .claude/memory/task-history/2025-10/*.md | head -10

# 2. Audit log (recent activity)
tail -20 .claude/audit.log

# 3. Agent knowledge (pattern counts)
grep "Pattern Count" .claude/memory/agent-knowledge/*.md

# 4. Context optimization (timing data)
cat .claude/memory/context-optimization/token-usage-log.json
```

---

## Manual Commands for Detailed Views

### See specific agent's tasks:
```bash
grep "domain-layer-implementer" .claude/audit.log | tail -10
```

### Check verification status:
```bash
grep "VERIFIED\|APPROVED\|VETOED" .claude/audit.log | tail -20
```

### View task completion times:
```bash
jq -r '.task + " " + .tokens + " tokens"' \
  .claude/memory/context-optimization/token-usage-log.json
```

### List tasks by month:
```bash
ls -lh .claude/memory/task-history/2025-10/
```

---

## When to Use This Command

**Daily standup:**
- See what each agent completed yesterday
- Identify tasks in progress
- Plan today's delegations

**Sprint planning:**
- Review agent productivity
- Identify bottlenecks
- Balance workload

**Debugging:**
- Find stuck tasks
- Check verification queues
- Investigate rejections

**Retrospectives:**
- Analyze success rates
- Review patterns discovered
- Identify improvement areas

---

## Example Output Interpretation

### Healthy Project:
```
✅ All agents active
✅ No verification queue backup
✅ >90% approval rate
✅ Average task time <1 hour
```

### Needs Attention:
```
⚠️  3+ tasks queued for verification
⚠️  Task running >2 hours
⚠️  <80% approval rate
⚠️  Multiple VETOs this week
```

### Critical Issues:
```
🚫 Agent idle for >24 hours
🚫 Verification queue >10 tasks
🚫 Multiple tasks VETOED
🚫 Success rate <70%
```

---

## Pro Tips

1. **Check daily** to catch bottlenecks early
2. **Monitor VETO patterns** - repeated VETOs indicate process issues
3. **Track approval rates** - declining rates suggest pattern drift
4. **Balance delegation** - distribute work evenly across agents
5. **Review pattern discovery** - ensure agents are learning
