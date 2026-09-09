---
name: adr
description: "Create an Architecture Decision Record for a decision just made"
origin: claude-patterns
allowed-tools: Read, Write, Edit, Glob, Bash, Skill
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

### 1. Read stack context and the ADR directory

Read `.claude/config/runtime.yml`:

- `stack_blocks:` — the block composition (ADR 0008). This is what selects the
  follow-up questions in step 4. `stack_profile` in `project.yml` is only a
  CLAUDE.md template selector; fall back to it only when `runtime.yml` is absent,
  and treat "nothing matched" as `universal`.
- `params."decision-registry".adr_dir` — where ADRs actually live in this project.
  If the `decision-registry` block isn't composed, default to `docs/adr/`.

The `decision-registry` block is what makes an ADR findable later: `/analyze` runs
`scripts/index-decisions.mjs` on every pass, which reads the header of every file in
`adr_dir` (+ `bdr_dir`) and writes `.claude/config/decisions-index.json`. Its
`decision-gate` stage is **blocking** — a task resting on a parameter that is still
open, or on an ADR that was overridden, stops there. Everything step 5 asks you to
write is that index's input contract, not decoration.

### 2. Auto-number

```bash
ls "$ADR_DIR" 2>/dev/null | grep -E '^(ADR-)?[0-9]{4}' | sort | tail -1
```

Next = last number + 1, zero-padded to 4 digits. If the directory doesn't exist,
`mkdir -p "$ADR_DIR"` and start at `0001`. Keep whatever filename convention the
directory already uses (`NNNN-slug.md` or `ADR-NNNN-slug.md`) — the indexer reads
both, but a directory that mixes them is unreadable to a human.

### 3. Gather content (conversationally)

Ask for, one at a time if not provided via `$ARGUMENTS`:

- **Title** — short noun phrase ("outbox tier classification", "sync vs async for payment confirmation")
- **Status** — proposed | accepted | deprecated | superseded  
- **Context** — what forced this decision? what constraints existed?
- **Options considered** — at least 2; what else was on the table and why it was rejected
- **Decision** — what was chosen + one-sentence reason
- **Consequences** — what improves, what gets harder

### 4. Stack-specific prompts

After gathering the core 6, ask targeted follow-ups based on the composed blocks:

**`nestjs` / `node` / any `ddd/*`**
- Does this affect `BUSINESS_RULES.yaml`? Which section?
- Which bounded context(s) does this live in?
- Does this change outbox tier classification (O-1 Compliance-critical / O-2 Business-critical / O-3 Operational / O-4 Best-effort)?
- Does this affect cross-context communication (ACL, domain events)?

**`flutter` / `clean-arch`**
- Which layer is primarily affected (domain / application / infrastructure / presentation)?
- Does this affect state management (Riverpod providers, notifiers)?
- Does this affect navigation or routing?

**`python` / `ml-pipeline`**
- Does this affect module boundaries or import rules?
- Does this introduce or remove an async boundary?

**`nextjs` / `sveltekit`**
- Client vs server rendering tradeoff?
- Does this affect data fetching strategy (SSR, RSC, SWR)?

**`ts-library` / `library-layers`**
- Does this change the public API surface? Is it a breaking change?
- Does it need a deprecation window before the old shape goes away?

**(nothing matched / universal)** — no additional prompts.

### 4.5. Humanize before writing

Run `Skill(humanizer)` on the prose you gathered — Context / Options Considered / Decision /
Consequences — before composing the file. Strips AI-writing tells (em dashes, signposting,
hedge-padding) without changing the actual decision or reasoning. Skip it for `Status`/`Date`/
`Stack` — those stay as plain values.

### 5. Write the ADR

Create `{adr_dir}/NNNN-<kebab-slug>.md`. **The YAML frontmatter is mandatory** — it is
the contract with `scripts/index-decisions.mjs`. An ADR without `tags` and `summary` is
findable only by its title, which in a directory of 100+ files means not findable at all.

```markdown
---
status: accepted          # accepted | proposed | rejected | superseded | deprecated
date: YYYY-MM-DD
tags: ["api:platform"]    # from the project vocabulary — see the rules below
summary: "One indicative sentence: what was decided."
supersedes: []            # only when applicable
superseded_by: []         # only when applicable
scope: ""                 # REQUIRED when this ADR only PARTIALLY overrides another
---

# ADR-NNNN: {Title}

**Status**: {status}
**Date**: {YYYY-MM-DD}
**Stack blocks**: {stack_blocks}

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

Rules for the frontmatter fields:

- **`tags` come from the project vocabulary, never invented.** Allowed values live in
  `.claude/config/runtime.yml` under `taxonomy:`. Syntax `<stack>:<area>[:<variant>]`,
  always quoted; the indexer rejects an unknown stack or area by name. If no area fits,
  say so and stop — adding one is a deliberate two-step (`.claude/config/taxonomy.yml`,
  then re-run setup), not something to improvise inside an ADR.
- **`summary` is written from the Decision section**, indicative mood, one sentence.
- **`scope` is required whenever this ADR only partially overrides another one.** State
  what exactly was dropped and what still holds, and add `superseded_by` to the older
  entry (that is an `Edit` of an existing file). A header saying "partially superseded"
  with no scope has already caused a real misreading — ADR-0076/0106, where the 15 km
  guardrail was assumed dead when only the 5 km cap had been dropped. Any entry carrying
  a `scope` is flagged `needs_scope_check` and is never filtered out as stale.

Add stack-specific sections below `Consequences` if applicable:

```markdown
## DDD Impact

**Context**: {bounded context}
**BUSINESS_RULES.yaml**: {section to update, or "no change"}
**Outbox tier**: {O-1/O-2/O-3/O-4 or "not applicable"}
**Cross-context**: {ACL / domain event change, or "none"}
```

### 6. Re-index the register

```bash
node <claude-patterns>/scripts/index-decisions.mjs <project-dir>
```

Fix whatever it reports — an invalid tag, a missing status, a duplicate number. Skip
this step and the new ADR stays invisible to the `decision-gate` stage of `/analyze`
until somebody else happens to run an analysis.

If the project doesn't compose the `decision-registry` block, say so instead of running
the script: the ADR is written, but nothing indexes it, and `/analyze` will not see it.

### 7. Report

```
ADR written: {adr_dir}/0042-outbox-tier-classification.md
Status: accepted | Tags: {tags}
Index: {N} entries, {N} problems

⚠ ddd: update BUSINESS_RULES.yaml → outbox_tiers section
```

Only flag BUSINESS_RULES.yaml if it was confirmed as affected.
