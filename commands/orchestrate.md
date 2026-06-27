---
name: orchestrate
description: |
  Stack-aware orchestration skill — auto-detects project stack from project.yml
  and routes to correct agents per stack profile. Always grounds implementation
  and verification in canonical patterns from .claude/knowledge/patterns/.

  Modes: implement, validate, search, analyze, review

  CRITICAL: This skill NEVER implements code. ONLY delegates to agents.
  CRITICAL: ALWAYS reads project.yml first to determine stack_profile.
  CRITICAL: ALWAYS runs Pattern Discovery (Phase 0.5) before implementation or verification.

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

All implementer and verifier prompts MUST include explicit pattern paths from
`.claude/knowledge/patterns/`. Agents are not trusted to find patterns on their
own — the orchestrator hands them the exact file list.

## Boundary: code work, not strategy

This skill is for **code implementation**, **validation**, **review**, and
**stack-specific analysis**. Do NOT invoke `@marketing-strategist`,
`@finance-strategist`, or `@legal-strategist` from `/orchestrate` —
they are summoned by `@product-owner`, `/sprint`, `/pulse`,
`/reprioritize`, or directly via `/marketing`, `/finance`, `/legal`.

If the user invokes `/orchestrate` for a request that's actually strategic
(e.g., *"orchestrate our Q3 GTM"* or *"orchestrate GDPR audit of our data
flows"*), redirect them to `/sprint`, `/finance`, `/marketing`, or `/legal`
rather than coordinating code agents on a non-code question.

---

## Step 0: MANDATORY — Detect Stack Profile

**BEFORE any other action**, read the project config:

```
Read(".claude/config/project.yml")
```

Extract `project.stack_profile` value. This determines which agents to use AND
which pattern directories are canonical for this project.

If no `project.yml` exists, ask the user which stack they're using.

---

## Step 0a: MANDATORY — Security pre-flight check

Before any implementation work, verify the task's security posture:

1. **Identify the task file** — if user invoked `/orchestrate implement TS-XXX`,
   read `project-orchestration/tasks/TS-XXX*.md`. If no task ID provided, ask
   user which task is being implemented.

2. **Read the task's labels and title** from frontmatter.

3. **Check for security-relevant signals** by matching against
   `claude-patterns/templates/canonical-labels.yml` security groups:
   - `auth`, `pii`, `cross_context`, `public_api`, `accessibility`, `b2g`
   - Match: direct label / substring in label / title keyword

4. **Inspect `## 🔒 Security Pre-Analysis`** section in task file:
   - Missing → recommend `/threat-model {TASK-ID}` first
   - Empty / placeholder → same recommendation
   - Filled with TM ref or STRIDE table → proceed

5. **Decision tree:**

   | Security-relevant? | Pre-analysis status | Action |
   |---|---|---|
   | No | any | Proceed to Step 0.5 (pattern discovery) |
   | Yes | OK / filled | Proceed to Step 0.5 |
   | Yes | missing / empty / placeholder | **PAUSE**. Ask user: "This task is security-relevant ({matched groups}). Recommend running `/threat-model {TASK-ID}` first. Continue anyway?" |

6. **If user confirms continue without threat-model**, log the decision in
   `## 🔒 Security Pre-Analysis` section as a comment:
   ```
   <!-- Security pre-flight skipped by user at {timestamp}. Justification: {user input} -->
   ```
   Then proceed.

7. **If user opts to run threat-model first**, exit `/orchestrate` and recommend:
   ```
   /threat-model {TASK-ID}
   ```
   User invokes that, fills section, returns to `/orchestrate implement {TASK-ID}`.

The PostToolUse hook `check-security-considerations.js` will already have
warned at task creation. This Step 0a is the second checkpoint specifically
for orchestrated implementation flows. Together they prevent security work
slipping through the cracks.

---

## Step 0.5: MANDATORY — Pattern Discovery

**BEFORE Phase 1 (implement mode) or any verification call**, discover the
canonical patterns relevant to the task.

### Step 0.5a — Read the pattern index

```
Read(".claude/knowledge/patterns/README.md")
```

This is the index of ~68 patterns grouped by layer (domain, application,
infrastructure, architecture, testing, cross-layer, orchestration).

### Step 0.5a' — Read stack defaults (`_stack-defaults/<stack>.yml`)

```
Read(".claude/knowledge/patterns/_stack-defaults/{stack_profile}.yml")
```

This file declares **always-include patterns** for the stack (e.g.,
`security-invariants-pattern.md`, `safe-error-propagation-pattern.md`) plus
**trigger-based includes** (extra patterns when task keywords match).

If the file does not exist for the current `stack_profile`, skip this step
and rely on Step 0.5b/0.5c heuristics. Stacks without `_stack-defaults`
yaml are valid — only `nestjs-ddd` ships one today; others may follow.

**Schema** (verify by reading the file):
```yaml
stack_profile: nestjs-ddd
always_include:
  - cross-layer/conventions-pattern.md
  - cross-layer/security-invariants-pattern.md
  # ...
trigger_includes:
  - keywords: [auth, permission, login]
    include: [cross-layer/security-invariants-pattern.md]
  - keywords: [aggregate, entity, value object]
    include: [domain/aggregate-pattern.md, domain/value-object-pattern.md]
```

**How to use the parsed file**:

1. **Always-include**: every path in `always_include` goes into `{PATTERNS}`
   regardless of task description. Translate paths:
   `cross-layer/foo.md` → `.claude/knowledge/patterns/cross-layer/foo.md`.

2. **Trigger-include**: lowercase the user's request. For each entry in
   `trigger_includes`, if any keyword in `keywords` is a substring of the
   request, add every path in `include` to `{PATTERNS}`.

3. **Deduplicate**: a pattern appearing in both `always_include` and a
   matched trigger should appear once in the final `{PATTERNS}` list.

**Why this exists**: declaring per-stack defaults in a YAML file (instead
of hard-coding them in this skill) lets each stack evolve independently
and lets project-specific security/compliance patterns become first-class
without modifying the orchestrator. See `docs/ARCHITECTURE.md` for the
extension model.

### Step 0.5b — Build a scoped pattern list (augment with keyword heuristics)

The stack-defaults YAML covers the common cases. Step 0.5b adds **task-scoped**
patterns based on keyword analysis — these complement (do not replace) the
always-include list.

From the user's request, identify which **layers** are touched:

| User request keywords | Layers to include |
|---|---|
| aggregate, entity, VO, domain event, specification, policy, domain service | `domain/` |
| handler, command, query, saga, CQRS | `application/` |
| repository, controller, mapper, migration, schema | `infrastructure/` |
| transactional, cross-context, event emission, integration event | `architecture/` |
| test, fixture, mock, coverage, pyramid, E2E | `testing/` |
| error, logger, naming, conventions, safe propagation | `cross-layer/` |
| task, sprint, kanban, PM, milestone | `orchestration/` |

Always include `cross-layer/conventions-pattern.md` (it governs file naming
across every task).

### Step 0.5c — Enumerate pattern paths per stack profile

| Stack Profile | Canonical pattern root | Notes |
|---|---|---|
| nestjs-ddd | `.claude/knowledge/patterns/` (all 7 layers) | Full DDD coverage |
| flutter-clean-arch | `.claude/knowledge/patterns/flutter/` + `cross-layer/` + `testing/` | Clean Architecture specific |
| nextjs-app | `.claude/knowledge/patterns/nextjs/` + `cross-layer/` + `testing/` | App Router, RSC |
| python | `.claude/knowledge/patterns/python/` + `cross-layer/` + `testing/` | Modular monolith |
| sveltekit | `.claude/knowledge/patterns/sveltekit/` + `cross-layer/` + `testing/` | Svelte 5 runes |
| typescript-library | `.claude/knowledge/patterns/typescript-library/` + `testing/` | Public API focused |

If the project has a local `patterns/` mirror (e.g., via symlink), both roots
apply — check local first, canonical second.

### Step 0.5d — REQUIRED visible output

**You MUST print this to the user before invoking ANY other agent.** Skipping
this step is the #1 cause of implementer agents ignoring patterns. Make the
list **explicit, file-by-file, with full paths**:

```
📚 Pattern Discovery — stack: {stack_profile}, layers touched: {layers}

Sources combined:
  • _stack-defaults/{stack_profile}.yml: N always-include + M trigger-matched
  • keyword heuristics (Step 0.5b): K layer-scoped
  • project-local patterns scan: P project-specific

Canonical patterns I will pass to every sub-agent:
  1. .claude/knowledge/patterns/cross-layer/conventions-pattern.md           [stack-default: always]
  2. .claude/knowledge/patterns/cross-layer/security-invariants-pattern.md   [stack-default: always]
  3. .claude/knowledge/patterns/cross-layer/safe-error-propagation-pattern.md [stack-default: always]
  4. .claude/knowledge/patterns/cross-layer/domain-errors-pattern.md         [stack-default: always]
  5. .claude/knowledge/patterns/cross-layer/logger-pattern.md                [stack-default: always]
  6. .claude/knowledge/patterns/domain/aggregate-pattern.md                  [trigger: aggregate]
  7. .claude/knowledge/patterns/testing/testing-pyramid-pattern.md           [keyword: test]
  ...
Total: N patterns

➡️ Each agent prompt below will include the **literal list above** (full
   paths). I will NOT use abstract references like "the patterns".
```

The `[source]` annotation in brackets is informational only — it helps the
user understand *why* a pattern is in scope. The agent prompts get only
the bare path list.

**Reasons this output is mandatory**:
- User sees what patterns are in scope before any code is written.
- Agents downstream get concrete file paths to Read, not vague "patterns".
- A `PreToolUse` hook (`hooks/check-patterns-read.js`) blocks Write/Edit on
  source files (.ts/.tsx/.dart/.py/.svelte) if no pattern was Read recently.
  If you skip Step 0.5, the hook will fire on every implementer Write.

### Step 0.5e — Substitution rule for downstream prompts

In every prompt template below, the placeholder `{PATTERNS}` is **shorthand
for the literal list from Step 0.5d**. When you actually invoke an agent,
substitute `{PATTERNS}` with the bullet list verbatim. Example:

```
# Template (in this skill file):
prompt='... apply these patterns: {PATTERNS} ...'

# What you actually send to the agent (after substitution):
prompt='... apply these patterns:
  - .claude/knowledge/patterns/cross-layer/domain-errors-pattern.md
  - .claude/knowledge/patterns/domain/aggregate-pattern.md
  - .claude/knowledge/patterns/testing/testing-pyramid-pattern.md
...'
```

**No abstract references.** "Use the relevant patterns" → ❌. Full paths → ✅.

### Step 0.5f — Load Rule Cards (inject CONTENT, not just paths)

Passing file paths is **not enough** — implementers have historically ignored
patterns they were merely *pointed at* (the #1 cause of pattern drift). For
every pattern in `{PATTERNS}` that has a `*_summary.md` sibling — a **Rule
Card**: the enforceable MUST / MUST NOT rules with stable IDs — **Read that Rule
Card and concatenate its full content** into `{PATTERN_RULE_CARDS}`.

```
Read(".claude/knowledge/patterns/domain/aggregate-pattern_summary.md")
Read(".claude/knowledge/patterns/application/command-handler-pattern_summary.md")
# … one Read per in-scope pattern that has a _summary sibling
```

Rules:
- A Rule Card is ~80-120 lines of hard, ID'd rules — cheap to inject, and it
  puts the rules in the agent's context from its **first token** instead of
  hoping it clicks Read. This is the single highest-leverage fix for drift.
- 14 patterns currently ship Rule Cards (all routed DDD patterns: aggregate,
  value-object, entity, domain-event, domain-service, specification-policy,
  command-handler, query-handler, audit-handler, application-service,
  repository, mapper, acl-registry, controller-schema).
- If a pattern has **no** `_summary.md` sibling, keep only its full path in
  `{PATTERNS}` — the agent must Read the full pattern.
- Format `{PATTERN_RULE_CARDS}` as each Rule Card under a heading like
  `===== RULE CARD: domain/aggregate-pattern (BINDING) =====`.
- Rule IDs (e.g. `A3`, `N6`, `CH4`) are the **shared vocabulary** the verifier
  cites when it VETOes — keep them intact end-to-end.

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

Implementers live in `{project}/.claude/agents/` (flat — no `implementers/` subdirectory).

| Stack Profile | Layer 1 (domain/app — run first) | Layer 2 (infra/testing — run second) |
|---|---|---|
| nestjs-ddd | `domain-application-implementer` | `infrastructure-testing-implementer` |
| flutter* | `flutter-implementer` | — |
| python* | `python-implementer` | — |
| sveltekit* | `sveltekit-implementer` | — |
| nextjs* | `nextjs-implementer` | — |
| typescript-library | `library-implementer` | — |
| node-ts-claude-api | `ts-implementer` | — |
| astro-static | `astro-implementer` | — |

If no match in the table: check if a file named `*-implementer.md` exists in `.claude/agents/`, then fall back to `general-purpose`.

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

**Pre-flight (MANDATORY):**
- Step 0 — Detect stack profile ✓
- Step 0.5 — Pattern Discovery ✓ (output list `{PATTERNS}`)

### Phase 1: Read the Task File

**ONLY read the task file** — do NOT explore the codebase yourself. The
implementer has its own 2-phase discovery protocol and will explore the
codebase in its own context. Orchestrator exploration is wasted work.

```
Read("project-orchestration/tasks/{TASK-ID}*.md")
```

Extract from the task file:
- Feature summary (1-2 sentences)
- Acceptance criteria / scope
- Any context or constraints already documented

Pass this summary (not the raw file) as `{TASK_SUMMARY}` to Phase 3.

**If no task file exists**: ask the user to describe the feature in 2-3
sentences, use that as `{TASK_SUMMARY}`.

### Phase 2: Analysis & Modeling

**2A. Business Validation** (new features only):
```
Agent(subagent_type='product-owner',
      prompt='Validate business value for [feature]. Check customer segment,
              mobile implications.',
      description='Business validation')
```

If VETO → STOP, report to user.

**2B. Architecture / Domain Modeling** (complex decisions):
```
Agent(subagent_type='{ARCHITECTURE_EXPERT}',
      prompt='Model architecture for [feature]. Define boundaries, components,
              patterns. You MUST read the following canonical patterns before
              modeling and cite each rule you apply:
              {PATTERNS}
              If any decision conflicts with a canonical pattern, flag it
              explicitly and propose reconciliation.',
      description='Architecture modeling')
```

Use the architecture expert from the Agent Mapping table above.

**2C. Technology Decisions** (when relevant — async/sync, performance):
```
Agent(subagent_type='backend-technology-expert',
      prompt='Analyze technology decision for [feature].',
      description='Tech analysis')
```

### Phase 3: Implementation

Use the Implementers table from the Agent Mapping section above to resolve agent names for the detected `stack_profile`.

**Implementer prompt template** (use for every implementer call, substituting layer-specific scope):
```
Implement [feature / layer scope] following these canonical patterns verbatim.

BINDING RULE CARDS — the enforceable MUST / MUST NOT rules, already in your
context. Apply EVERY rule by ID; they are cited by ID when your code is VETOed:
{PATTERN_RULE_CARDS}

Full patterns (read for deeper context/examples, and for any pattern below that
has only a path and no Rule Card above):
{PATTERNS}

Task summary:
{TASK_SUMMARY}

Decisions from Phase 2 (architecture):
{PHASE_2_DECISIONS}

Rules:
1. The Rule Cards above are ALREADY in your context — apply every MUST / MUST NOT
   rule. For any pattern that has only a path (no Rule Card), Read the full
   pattern BEFORE writing the file it governs.
2. Use your own 2-phase discovery (Explore agent) to find existing code
   — DO NOT wait for the orchestrator to provide file paths.
3. If a rule conflicts with existing code, follow the pattern
   (existing code may be legacy).
4. Enforcement is real: a SubagentStop hook blocks you from finishing if you
   edited a pattern file without reading its pattern, and the quality verifier
   checks every Rule Card rule by ID. Code written from training data instead
   of these rules WILL be VETOed — there is no benefit to skipping them.
5. When finished, list each file you created/modified and name the Rule Card
   rule IDs that governed it (e.g. "user.aggregate.ts → A1,A3,A5,N1,N6").
```

**For nestjs-ddd — MANDATORY two-step sequence:**

**Step 3A — Domain/Application layer** (`domain-application-implementer`):
```
Agent(subagent_type='domain-application-implementer',
      prompt='Implement domain + application layer for [feature].\n' + TEMPLATE,
      description='Domain/app implementation')
```
Capture output as `{DOMAIN_LAYER_OUTPUT}`.

**Step 3B — Infrastructure/Testing layer** (`infrastructure-testing-implementer`):
```
Agent(subagent_type='infrastructure-testing-implementer',
      prompt='Implement infrastructure + tests for [feature].\n' + TEMPLATE +
             '\nDomain layer already implemented:\n{DOMAIN_LAYER_OUTPUT}',
      description='Infra/testing implementation')
```

Do NOT run 3B before 3A completes — infra depends on domain interfaces.

**For other stacks** — single implementer call using the agent from the table.

**If no stack-specific implementer exists** — use `general-purpose` with the template above.

### Phase 4: Verification (MANDATORY — NEVER SKIP)

**4A. Quality Verification (VETO GATE)**:
```
Agent(subagent_type='{QUALITY_VERIFIER}',
      prompt='Verify code quality for [scope]. Your verification checklist is
              the Rule Cards below — check EVERY rule by its ID, do not
              spot-check:
              {PATTERN_RULE_CARDS}

              Full patterns (consult when a Rule Card is insufficient):
              {PATTERNS}

              For each file changed, go rule-by-rule through the governing Rule
              Card:
              - List which Rule Card(s) govern this file.
              - For EACH rule ID (A1, N6, CH4, …): mark followed / violated.
              - A violation MUST cite file:line + the rule ID + the rule text.
              - Auto-VETO if the implementer output lacks per-file Rule Card rule
                IDs (means code came from training data, not the rules).

              Produce a per-file report: { file, rules_checked: [IDs],
              violations: [{ id, file_line, detail }], verdict: PASS|WARN|VETO }.',
      description='Quality verification')
```

**4B. Security / Final Verification (VETO GATE)**:
```
Agent(subagent_type='{SECURITY_VERIFIER}',
      prompt='Final security and integration verification for [scope]. You
              MUST apply these canonical patterns:
              {PATTERNS}
              (especially cross-layer/safe-error-propagation-pattern.md if
              present — error leakage is a CRITICAL block).',
      description='Security verification')
```

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

---

## 🛑 Completion Gate (HARD — ENFORCES Phase 4)

**Before reporting task as complete, the orchestrator MUST print the following
checklist and mark every box. If ANY box is unchecked, the task is NOT
complete — report the gap to the user and stop.**

```
Completion Gate
───────────────
[ ] Step 0    — Stack profile detected: {profile}
[ ] Step 0.5  — Patterns discovered and listed: {count} patterns
[ ] Phase 1   — Task file read, {TASK_SUMMARY} extracted
[ ] Phase 2B  — Architecture expert consulted OR explicitly N/A (why?)
[ ] Phase 3   — Implementation done by {implementer_name}
[ ] Phase 3*  — Implementer cited the patterns it applied per file
[ ] Phase 4A  — Quality verifier invoked AND returned PASS (NOT skipped)
[ ] Phase 4B  — Security verifier invoked AND returned PASS (NOT skipped)
[ ] Phase 5   — Stack-specific final checks done
```

**"Too simple to verify" is NOT a valid reason to skip Phase 4.** If the
change is truly trivial (e.g., comment fix) and the user has explicitly opted
out of verification, the orchestrator must say so in writing and move those
boxes to `N/A — user opt-out`. Otherwise, verification is mandatory.

---

## Mode: validate

Delegate to the quality verifier for the detected stack. Always run Pattern
Discovery first and embed the pattern list:

```
Agent(subagent_type='{QUALITY_VERIFIER}',
      prompt='Validate [aspect] for [scope] against these patterns:
              {PATTERNS}
              Produce a per-file report with verdict PASS | WARN | VETO.',
      description='Validation')
```

For security-specific validation:
```
Agent(subagent_type='{SECURITY_VERIFIER}',
      prompt='Security audit for [scope]. Apply patterns:
              {PATTERNS}',
      description='Security validation')
```

For full validation, run both sequentially.

---

## Mode: search

Delegate ALL searches to Explore agent (Haiku — 60x cheaper):

```
Agent(subagent_type='Explore',
      prompt='[user search query]',
      description='Codebase search')
```

Return results to user. Never search directly. Pattern discovery is NOT
required for search mode.

---

## Mode: analyze

Run Pattern Discovery first so analysis can reference canonical rules.

Route to appropriate expert based on topic AND stack:

| Topic | Agent |
|---|---|
| Domain/architecture/patterns | {ARCHITECTURE_EXPERT} for current stack |
| Tech/async/performance | backend-technology-expert |
| Security/auth/OWASP | {SECURITY_VERIFIER} for current stack |
| Business value/priority | product-owner |
| Task health/blockers | tech-lead |
| General/multi-topic | Multiple experts sequentially |

Prompt template:
```
Analyze [topic] in [scope]. Ground your analysis in these canonical patterns:
{PATTERNS}
Name the specific rules from those patterns that apply to each finding.
```

---

## Mode: review

Run Pattern Discovery first.

Two-step code review using stack-appropriate agents:

**Step 1: Quality Review**
```
Agent(subagent_type='{QUALITY_VERIFIER}',
      prompt='Review code quality for [scope]. Canonical patterns:
              {PATTERNS}
              Report per-file verdict with patterns cited.',
      description='Code review')
```

**Step 2: Security Review**
```
Agent(subagent_type='{SECURITY_VERIFIER}',
      prompt='Security review for [scope]. Canonical patterns:
              {PATTERNS}',
      description='Security review')
```

Report combined findings.

---

## Critical Rules

1. **ALWAYS read project.yml first** — never assume stack
2. **ALWAYS run Pattern Discovery (Step 0.5)** before implement/validate/analyze/review
3. **NEVER implement code** — this skill has NO Write/Edit tools
4. **Sequential delegation** in implement mode
5. **NEVER skip Phase 4** — quality + security verification is mandatory
6. **ALWAYS print the Completion Gate** checklist before reporting done
7. **EMBED the pattern list in every agent prompt** — don't trust agents to find patterns on their own
8. **Respect VETO power** — STOP on VETO, report to user
9. **Use Explore for searches** — never search directly
10. **Use project-local implementers** when available
11. **{PLACEHOLDER}** notation means: substitute the agent name from the Agent Mapping table for the detected stack_profile. **{PATTERNS}** means: substitute the pattern list built in Step 0.5.

---

**Version**: 3.1 (pattern-grounded + completion gate)
**Breaking change (v3.0 → v3.1)**:
  - New MANDATORY Step 0.5 (Pattern Discovery)
  - All agent prompts must embed {PATTERNS} list
  - New HARD Completion Gate enforces Phase 4
