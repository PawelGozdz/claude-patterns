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

Reads `project.yml` to detect your stack, gathers context + options + decision + consequences, writes `docs/adr/ADR-NNNN-<slug>.md`.

Stack-specific follow-up questions:
- **nestjs-ddd** — BUSINESS_RULES.yaml impact, bounded context, outbox tier (O-1/O-2/O-3/O-4)
- **flutter-clean-arch** — affected layer, Riverpod / navigation changes
- **python / python-pipeline** — module boundaries, async boundary changes
- **nextjs-app / sveltekit** — SSR/RSC tradeoffs, data fetching strategy

## Arguments

`$ARGUMENTS` — optional title. If empty, skill asks interactively.
