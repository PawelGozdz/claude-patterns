---
name: orchestrate
description: |
  Stack-aware orchestration skill — auto-detects project stack from project.yml
  and routes to correct agents per stack profile.

  Modes: implement, validate, search, analyze, review

  CRITICAL: This skill NEVER implements code. ONLY delegates to agents.
  CRITICAL: ALWAYS reads project.yml first to determine stack_profile.

  Usage: /orchestrate <task-or-question>
  Alias: /o <task-or-question>

  Examples:
    /o Implement UserProfile aggregate
    /o validate code-quality src/contexts/auth/
    /o find all aggregates
    /o analyze TS-GEO-005.md
    /o review auth context handlers
tools: Task, Read
disallowedTools: Bash, Grep, Glob, Write, Edit, MultiEdit, NotebookEdit
---

# /orchestrate — Stack-Aware Unified Orchestration

**ZERO IMPLEMENTATION** — coordinates task execution through specialized agents.

---

## Step 0: MANDATORY — Detect Stack Profile

**BEFORE any other action**, read the project config:

```
Read(".claude/config/project.yml")
```

Extract `project.stack_profile` value. This determines which agents to use.

If no project.yml exists, ask the user which stack they're using.

---

## Agent Mapping per Stack Profile

Use this table to resolve agent names. `—` means role not available for that stack (skip phase).

### Architecture / Modeling Expert

| Stack Profile | Agent Name |
|---|---|
| nestjs-ddd | ddd-application-expert |
| flutter* | flutter-architecture-expert |
| python* | python-architecture-expert |
| sveltekit* | sveltekit-architecture-expert |
| nextjs* | nextjs-architecture-expert |
| typescript-library | library-api-guardian |

### Quality Verifier (VETO GATE)

| Stack Profile | Agent Name |
|---|---|
| nestjs-ddd | code-quality-verifier |
| flutter* | flutter-quality-verifier |
| python* | python-quality-verifier |
| sveltekit* | sveltekit-quality-verifier |
| nextjs* | nextjs-quality-verifier |
| typescript-library | library-quality-verifier |

### Security / E2E Verifier (VETO GATE)

| Stack Profile | Agent Name |
|---|---|
| nestjs-ddd | security-e2e-verifier |
| flutter* | flutter-ui-verifier |
| All others | security-privacy-architect (universal) |

### Implementers

Implementers are **project-local** — they live in `{project}/.claude/agents/implementers/`.

```
Read(".claude/agents/implementers/")
```

If the directory exists, list files and use those agent names.
If it doesn't exist, use `general-purpose` agent (Sonnet) for implementation.

### Universal Agents (all stacks)

| Agent | When to use |
|---|---|
| backend-technology-expert | Sync/async decisions, performance, technology trade-offs |
| technical-architecture-lead | Cross-cutting architecture decisions |
| product-owner | Business value validation (replaces customer-value-guardian) |
| tech-lead | Task health, blocked work, dependency analysis |

---

## Mode Detection

Analyze the user's request and route to the appropriate mode:

| Keywords | Mode |
|---|---|
| implement, create, add, build, fix, refactor | **implement** |
| validate, check, verify, compliance, audit | **validate** |
| find, search, where, show files, list | **search** |
| analyze, investigate, debug, why, how | **analyze** |
| review, quality, assess, evaluate | **review** |

**Polish keywords**: zaimplementuj/stwórz/dodaj → implement, znajdź/szukaj → search, przeanalizuj/zbadaj → analyze, sprawdź/zwaliduj → validate, oceń/przejrzyj → review

If ambiguous, default to **analyze** mode.

---

## Mode: implement

Full delegation workflow. Sequential, never parallel.

### Phase 1: Context Discovery

```
Agent(subagent_type='Explore', prompt='Find existing implementations related to [scope]. Return file paths, class names, and patterns used.', description='Context discovery')
```

### Phase 2: Analysis & Modeling

**2A. Business Validation** (new features only):
```
Agent(subagent_type='product-owner', prompt='Validate business value for [feature]. Check customer segment, mobile implications.', description='Business validation')
```

If VETO → STOP, report to user.

**2B. Architecture / Domain Modeling** (complex decisions):
```
Agent(subagent_type='{ARCHITECTURE_EXPERT}', prompt='Model architecture for [feature]. Define boundaries, components, patterns.', description='Architecture modeling')
```

Use the architecture expert from the Agent Mapping table above.

**2C. Technology Decisions** (when relevant — async/sync, performance):
```
Agent(subagent_type='backend-technology-expert', prompt='Analyze technology decision for [feature].', description='Tech analysis')
```

### Phase 3: Implementation

Check for project-local implementers first:
```
Read(".claude/agents/implementers/")
```

**If implementers exist** — delegate to them in the order that makes sense:
- Domain/core layer first, infrastructure/UI second
- Each implementer gets the context from Phase 1-2

**If no implementers** — use general-purpose agent:
```
Agent(prompt='Implement [feature] following patterns found in Phase 1. [Include all context from Phase 1-2 analysis].', description='Implementation')
```

### Phase 4: Verification (MANDATORY — NEVER SKIP)

**4A. Quality Verification (VETO GATE)**:
```
Agent(subagent_type='{QUALITY_VERIFIER}', prompt='Verify code quality and patterns for [scope].', description='Quality verification')
```

Use the quality verifier from the Agent Mapping table above.

**4B. Security / Final Verification (VETO GATE)**:
```
Agent(subagent_type='{SECURITY_VERIFIER}', prompt='Final security and integration verification for [scope].', description='Security verification')
```

Use the security verifier from the Agent Mapping table above.

If VETO → STOP, report blocking issues. DO NOT mark task as complete.

### Phase 5: Stack-specific final checks

| Stack Profile | Final Check |
|---|---|
| nestjs-ddd | Verify BUSINESS_RULES.yaml is updated, Zod schema tests |
| flutter* | Verify localization keys, widget tests |
| python* | Verify type annotations, pytest coverage |
| sveltekit* | Verify Svelte 5 runes usage, SvelteKit conventions |
| nextjs* | Verify Server/Client component boundaries |
| typescript-library | Verify public API backward compatibility |

### Progress Tracking

After EACH phase, report status with checkmarks:
```
Phase 1: Context Discovery ✓
Phase 2A: Business Validation ✓
Phase 2B: Architecture Modeling ✓
Phase 3: Implementation ✓
Phase 4A: Quality Verification ✓  ← NEVER skip this
Phase 4B: Security Verification ✓
Phase 5: Final Checks ✓
```

---

## Mode: validate

Delegate to the quality verifier for the detected stack:

```
Agent(subagent_type='{QUALITY_VERIFIER}', prompt='Validate [aspect] for [scope].', description='Validation')
```

For security-specific validation:
```
Agent(subagent_type='{SECURITY_VERIFIER}', prompt='Security audit for [scope].', description='Security validation')
```

For full validation, run both sequentially.

---

## Mode: search

Delegate ALL searches to Explore agent (Haiku — 60x cheaper):

```
Agent(subagent_type='Explore', prompt='[user search query]', description='Codebase search')
```

Return results to user. Never search directly.

---

## Mode: analyze

Route to appropriate expert based on topic AND stack:

| Topic | Agent |
|---|---|
| Domain/architecture/patterns | {ARCHITECTURE_EXPERT} for current stack |
| Tech/async/performance | backend-technology-expert |
| Security/auth/OWASP | {SECURITY_VERIFIER} for current stack |
| Business value/priority | product-owner |
| Task health/blockers | tech-lead |
| General/multi-topic | Multiple experts sequentially |

---

## Mode: review

Two-step code review using stack-appropriate agents:

**Step 1: Quality Review**
```
Agent(subagent_type='{QUALITY_VERIFIER}', prompt='Review code quality for [scope].', description='Code review')
```

**Step 2: Security Review**
```
Agent(subagent_type='{SECURITY_VERIFIER}', prompt='Security review for [scope].', description='Security review')
```

Report combined findings.

---

## Critical Rules

1. **ALWAYS read project.yml first** — never assume stack
2. **NEVER implement code** — this skill has NO Write/Edit tools
3. **Sequential delegation** in implement mode
4. **NEVER skip Phase 4** — quality + security verification is mandatory
5. **Respect VETO power** — STOP on VETO, report to user
6. **Use Explore for searches** — never search directly
7. **Use project-local implementers** when available
8. **{PLACEHOLDER}** notation means: substitute the agent name from the Agent Mapping table for the detected stack_profile

---

**Version**: 3.0 (stack-aware)
**Breaking change**: Agent names are now dynamic — resolved from stack_profile, not hardcoded
