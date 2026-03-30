---
name: orchestrate
description: |
  Unified orchestration skill with modes:
  - implement: Full delegation workflow with VETO gates
  - validate: Quality/DDD/security checks
  - search: Delegate to @codebase-explorer (Haiku)
  - analyze: Multi-expert investigation
  - review: Code quality + security review

  CRITICAL: This skill NEVER implements code. ONLY delegates to agents.

  Usage: /orchestrate <task-or-question>
  Alias: /o <task-or-question>

  Examples:
    /o Implement UserProfile aggregate
    /o validate ddd-compliance src/contexts/auth/
    /o find all aggregates
    /o analyze TS-GEO-005.md
    /o review auth context handlers
tools: Task, Read, TodoWrite
disallowedTools: Bash, Grep, Glob, Write, Edit, MultiEdit, NotebookEdit
model: sonnet
---

# /orchestrate - Unified Orchestration Skill

**ZERO IMPLEMENTATION** - coordinates task execution through specialized agents.

---

## Mode Detection

Analyze the user's request and route to the appropriate mode:

| Keywords | Mode | Action |
|----------|------|--------|
| implement, create, add, build, fix, refactor | **implement** | Full 5-phase workflow |
| validate, check, verify, compliance, audit | **validate** | Delegate to verifiers |
| find, search, where, show files, list | **search** | Delegate to @codebase-explorer |
| analyze, investigate, debug, why, how | **analyze** | Delegate to expert(s) |
| review, quality, assess, evaluate | **review** | Code quality + security review |

**Polish keywords**: zaimplementuj/stwórz/dodaj → implement, znajdź/szukaj → search, przeanalizuj/zbadaj → analyze, sprawdź/zwaliduj → validate, oceń/przejrzyj → review

If ambiguous, default to **analyze** mode.

---

## Mode: implement

Full delegation workflow (Phases 1-5). Sequential, never parallel.

### Phase 1: Context Discovery

```
Task(subagent_type='Explore', prompt='Find existing implementations related to [scope]. Return file paths only.', description='Context discovery')
```

### Phase 2: Analysis & Modeling

**2A. Business Validation** (new features only):
```
Task(subagent_type='customer-value-guardian', prompt='Validate business value for [feature]. VETO if no value.', description='Business validation')
```

If VETO: STOP, report to user.

**2B. DDD Modeling** (complex domain decisions):
```
Task(subagent_type='ddd-application-expert', prompt='Model domain for [feature]: aggregate boundaries, VOs, events, invariants.', description='DDD modeling')
```

**2C. Technology Decisions** (async/sync, performance):
```
Task(subagent_type='backend-technology-expert', prompt='Analyze technology decision for [feature].', description='Tech analysis')
```

### Phase 3: Implementation

**3A. Domain + Application**:
```
Task(subagent_type='domain-application-implementer', prompt='Implement domain and application layers. Update BUSINESS_RULES.yaml.', description='Domain+App implementation')
```

**3B. Infrastructure + Testing**:
```
Task(subagent_type='infrastructure-testing-implementer', prompt='Implement infrastructure, API, and tests. L1 ~50%, L2 ~30%, L3 ~20%.', description='Infra+Testing implementation')
```

### Phase 4: Verification

**4A. Code Quality**:
```
Task(subagent_type='code-quality-verifier', prompt='Verify code quality, DDD patterns, test pyramid.', description='Code quality verification')
```

**4B. Security + E2E (VETO GATE)**:
```
Task(subagent_type='security-e2e-verifier', prompt='Final security and E2E verification. VETO if issues.', description='Security verification')
```

If VETO: STOP, report blocking issues.

### Phase 5: Schema Testing (if Zod schemas created)

```
Task(subagent_type='Explore', model='haiku', prompt='Generate schema tests for created Zod schemas.', description='Schema testing')
```

### Progress Tracking

After EACH phase, report status to user with checkmarks.

---

## Mode: validate

Delegate validation to appropriate verifier(s).

| Sub-command | Agent | Description |
|-------------|-------|-------------|
| ddd-compliance | code-quality-verifier | DDD pattern validation |
| test-pyramid | code-quality-verifier | L1/L2/L3 ratio check |
| security | security-e2e-verifier | OWASP compliance |
| business-rules | code-quality-verifier | BUSINESS_RULES.yaml sync |
| all | Both verifiers | Full validation suite |

```
Task(subagent_type='code-quality-verifier', prompt='Validate [aspect] for [scope].', description='Validation')
```

---

## Mode: search

Delegate ALL searches to @codebase-explorer (Haiku - 60x cheaper).

```
Task(subagent_type='Explore', prompt='[user search query]', description='Codebase search')
```

Return results to user. Never search directly.

---

## Mode: analyze

Route to appropriate expert(s) based on topic:

| Topic | Agent |
|-------|-------|
| Domain/DDD/aggregates | ddd-application-expert |
| Tech/async/performance | backend-technology-expert |
| Security/auth/OWASP | security-e2e-verifier |
| General/multi-topic | Multiple experts sequentially |

```
Task(subagent_type='[expert]', prompt='Analyze [topic]: [user question]', description='Expert analysis')
```

---

## Mode: review

Two-step code review:

**Step 1: Code Quality**
```
Task(subagent_type='code-quality-verifier', prompt='Review code quality for [scope].', description='Code review')
```

**Step 2: Security**
```
Task(subagent_type='security-e2e-verifier', prompt='Security review for [scope].', description='Security review')
```

Report combined findings.

---

## Agent Quick Reference

| Agent | Model | Purpose |
|-------|-------|---------|
| codebase-explorer | Haiku | Search, file discovery |
| customer-value-guardian | Sonnet | Business value VETO |
| ddd-application-expert | Sonnet | Domain modeling |
| backend-technology-expert | Opus | Tech decisions |
| domain-application-implementer | Sonnet | Domain+App code |
| infrastructure-testing-implementer | Sonnet | Infra+Tests |
| code-quality-verifier | Sonnet | Quality gates |
| security-e2e-verifier | Opus | Security VETO |

---

## Critical Rules

1. **NEVER implement code** - this skill has NO Write/Edit tools
2. **Sequential delegation** in implement mode (except Phase 2 sub-phases)
3. **Respect VETO power** - STOP on VETO, report to user
4. **Always verify BUSINESS_RULES.yaml** is updated after implementation
5. **Use Haiku for searches** - never search directly

---

**Version**: 2.0 (Phase A consolidation)
**Merged from**: orchestrate.md, validate.md, workflow.md, knowledge.md, agent-registry.md
