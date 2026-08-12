---
# ── This frontmatter is a CONTRACT with the decision index (scripts/index-decisions.mjs).
# The `decision-gate` stage reads it on every /analyze to narrow the register down to a
# few relevant entries without opening any file. These fields are not decoration — each
# one has a consumer, and each one left empty costs tokens on every single analysis.
status: proposed          # proposed | accepted | rejected | superseded | deprecated
date: YYYY-MM-DD

# Taxonomy (syntax: <stack>:<area>[:<variant>]) — this is what decision-gate filters on.
# Allowed values: the "Tag taxonomy" section in CLAUDE.md, or `taxonomy:` in runtime.yml.
# A value outside the vocabulary is an error, not a new tag: add the area to
# .claude/config/taxonomy.yml first, re-run setup, then use it here.
# Without tags an ADR is only findable by its title — which in practice means not at all.
tags: ["api:area", "api:area:variant"]

# ONE sentence, indicative mood: what was decided. This is what reaches the prompt
# instead of the whole file, so an agent judges relevance for ~150 characters
# rather than a 12 KB read.
summary: ""

# ── Fill in only when applicable ────────────────────────────────────────────
supersedes: []            # entries this one overrides, e.g. [0042]
superseded_by:            # entry that overrides this one, e.g. ADR-0106

# REQUIRED when the override is PARTIAL. One sentence stating what exactly was
# dropped and what still holds. Without it the index only knows "something changed
# here" and every reader has to reconstruct the boundary from prose — a real bug
# (ADR-0076 was read as a full override of the 15 km guardrail, while only the
# fixed 5 km cap had actually been dropped).
# An entry with `scope` is NEVER filtered out as stale — it holds within that scope.
scope: ""
---

# ADR-NNNN: Title in the indicative (what was decided, not "considerations about…")

## Status

Accepted — YYYY-MM-DD

## Context

What forced the decision: a constraint, an incident, a requirement. Facts and numbers,
not judgements.

## Decision

The ruling sentence first, rationale after. This section is where `summary` comes from.

## Consequences

What this changes — including costs and what becomes harder.

## Enforcement (optional, but highly valuable)

Where the decision lives in code: business rules (`BR-*`), constants, tests, guards.
This list is what lets a reader verify the scope of a decision **in the code** rather
than in a header — see the `lookup_order` hierarchy in runtime.yml.

## Alternatives considered

Rejected options and why. Without this the next team walks the same path again.
