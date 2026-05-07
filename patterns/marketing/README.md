# Marketing Patterns

Architectural patterns specific to marketing workflows. These describe **how
marketing skills are structured, composed, and shared across projects** —
not the tactical content of the skills themselves (which lives in
[`skills/marketing/`](../../skills/marketing/)).

## Patterns

| Pattern | Status | Description |
|---|---|---|
| [product-marketing-context-pattern.md](product-marketing-context-pattern.md) | Production | Foundational `.agents/product-marketing-context.md` document — single source of truth for positioning, ICP, audience. Every marketing skill reads this before asking the user any questions. |

## Why a Separate Layer

Marketing tasks are different from code tasks:

- They produce **prose, copy, and recommendations** rather than executable code
- They need **shared context** (positioning, ICP, voice) that doesn't change
  per-task — same way DDD projects need `BUSINESS_RULES.yaml`
- They span **many small skills** (41+) that all need to stay coherent

The patterns here capture the architectural decisions that make a 41-skill
marketing system actually work without producing inconsistent, fluffy output.

## Related

- Skills: [`skills/marketing/`](../../skills/marketing/) — 41 vendored skills
- Agent: [`agents/universal/marketing-strategist.md`](../../agents/universal/marketing-strategist.md)
- Command: [`commands/marketing.md`](../../commands/marketing.md)
- Template: [`templates/product-marketing-context.md`](../../templates/product-marketing-context.md)
- Tools: [`tools/marketing/`](../../tools/marketing/)
