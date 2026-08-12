---
description: Create an Architecture Decision Record for a decision just made
---

# ADR Command

Document an architectural decision before it gets lost.

## Usage

`/adr [title or brief description]`

## Examples

```
/adr outbox tier classification for financial operations
/adr sync vs async for payment confirmation
/adr API URL convention /my vs /user prefix
/adr
```

## What It Does

Reads `project.yml` to detect your stack, gathers context + options + decision + consequences, writes `docs/adr/NNNN-<slug>.md`.

## Frontmatter is mandatory (contract with the decision index)

Every ADR this command writes **must** open with the frontmatter below. It is not
decoration: `scripts/index-decisions.mjs` parses it, and the `decision-gate` stage of
`/analyze` uses it to narrow the register to a few relevant entries without opening
files. An ADR without `tags` and `summary` is effectively invisible — findable only by
its title, which in a directory of 100+ files means not at all.

```yaml
---
status: accepted          # accepted | proposed | rejected | superseded | deprecated
date: YYYY-MM-DD
tags: ["api:platform", "api:app"]
summary: "One indicative sentence: what was decided."
supersedes: []            # only when applicable
superseded_by:            # only when applicable
scope: ""                 # REQUIRED when the override is PARTIAL
---
```

Rules for filling it in:

- **`tags` come from the project vocabulary, never invented.** Read the allowed values
  from `.claude/config/runtime.yml` (`taxonomy:` section) or the "Tag taxonomy" table in
  `CLAUDE.md`. Syntax `<stack>:<area>[:<variant>]`, always quoted. If no area fits, say
  so and stop — adding one is a deliberate two-step (`.claude/config/taxonomy.yml`, then
  re-run setup), not something to improvise inside an ADR.
- **`summary` is written from the Decision section**, in the indicative, one sentence.
- **`scope` is required whenever this ADR partially overrides another one** — state what
  exactly was dropped and what still holds, and add `superseded_by` to the older entry.
  A header saying "partially superseded" without a scope has already caused a real
  misreading (ADR-0076/0106: the 15 km guardrail was assumed dead; only the 5 km cap was).
- After writing, run `node <claude-patterns>/scripts/index-decisions.mjs <project>` and
  fix anything it reports as an invalid tag.

Full field-by-field template: `claude-patterns/templates/adr-template.md`.
Project-level convention and worked example: `docs/adr/README.md`.

Stack-specific follow-up questions:
- **nestjs-ddd** — BUSINESS_RULES.yaml impact, bounded context, outbox tier (O-1/O-2/O-3/O-4)
- **flutter-clean-arch** — affected layer, Riverpod / navigation changes
- **python / python-pipeline** — module boundaries, async boundary changes
- **nextjs-app / sveltekit** — SSR/RSC tradeoffs, data fetching strategy

## Arguments

`$ARGUMENTS` — optional title. If empty, skill asks interactively.
