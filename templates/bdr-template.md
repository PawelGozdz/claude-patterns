---
# ── Business Decision Record. Same contract with the decision index as an ADR
# (scripts/index-decisions.mjs reads both directories), different subject: product
# parameters, pricing, scope, priorities, positioning, dates. Technical decisions
# go to ADRs; a decision with both sides gets a BDR that links to its ADR.
status: accepted          # accepted | proposed | rejected | superseded | deprecated
                          # Polish equivalents are accepted too (podjęta, wdrażana,
                          # wdrożona, uchylona, odrzucona) — the indexer normalises them.
                          # A status outside both vocabularies keeps the entry AND reports it.
date: YYYY-MM-DD          # when the decision was made, not when it was written down

tags: ["api:economy"]     # from the project vocabulary — CLAUDE.md "Tag taxonomy"
summary: ""               # ONE indicative sentence: what was decided

supersedes: []            # BDR numbers this one overrides
superseded_by:            # set when a later entry overrides this one
scope: ""                 # REQUIRED when the override is PARTIAL: what exactly fell,
                          # and what still holds
---

# BDR-NNN: Title stating the decision, not the topic

## Decision

The ruling sentence, with the numbers that matter (old value → new value). This is where
`summary` comes from.

## Context

What forced it. Keep it short — the reasoning that led here, not a transcript.

## Documents to update

**This is a checklist, and it must be produced with grep — never from memory.**

The decision is not `closed` until every box is ticked. A partially propagated decision is
worse than an unrecorded one: half the documents now state the old value with the authority
of the canon.

| Document / location | What changes | Done |
|---|---|---|
| `docs/product/x.md` | value A → B | ☐ |
| `src/...` (constant, migration, seed) | ☐ |

Grep for the **old value**, not the topic: an outdated ceiling of `L4` hides in files whose
names say nothing about ceilings. This is not theory — running this rule on a pricing decision
in juz-ide surfaced a production row (`feature_reach_policy`, QUICK_JOB/L4 still
`is_available: true`) two weeks after the decision. The registry entry found a live code↔canon
drift, not a documentation gap.

## Links

- ADR-NNNN (technical side of the same decision), if any
- The open question this closes (`docs/decisions/open-questions.md`)
