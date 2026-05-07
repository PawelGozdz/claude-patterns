# Legal Patterns

Architectural patterns specific to legal workflows. These describe **how
legal skills are organized, jurisdiction-routed, and license-managed** —
not the tactical content of the skills themselves (which lives in
[`skills/legal/`](../../skills/legal/)).

## Patterns

| Pattern | Status | Description |
|---|---|---|
| [jurisdiction-aware-disclaimer-pattern.md](jurisdiction-aware-disclaimer-pattern.md) | Production | 4-category contextual disclaimer system (educational, GDPR/privacy, contract drafting, litigation/dispute) calibrated to jurisdiction. Sister pattern to `finance/regulatory-disclaimer-pattern.md` but with jurisdiction layer. |
| [external-skills-catalog-pattern.md](external-skills-catalog-pattern.md) | Production | How to maintain a license-fragmented skill ecosystem: vendor what's compatible (MIT/Apache), catalog the rest (AGPL/proprietary) with install-yourself instructions and per-license commercial-use warnings. |

## Why a Separate Layer

Legal tasks have constraints other domains don't:

- **Jurisdiction-bound rules**: GDPR ≠ CCPA ≠ UK GDPR (post-Brexit). PL
  KSH ≠ DE GmbHG. The same advice can be right in EU and wrong in US.
- **License fragmentation**: legal skill ecosystem is largely AGPL-3.0.
  A blanket "vendor everything" strategy contaminates an MIT codebase.
- **Authority-cited reasoning**: legal recommendations should cite
  statute/regulation/case-law when known, not hand-wave from training data.
- **Time-sensitive obligations**: notice periods, consent renewals, GDPR
  72h breach notification — legal advice carries deadline implications
  that financial advice rarely does.

The patterns here capture the architectural decisions that make a
small-but-meaningful legal system work without producing dangerous
blanket-advice.

## Related

- Skills: [`skills/legal/`](../../skills/legal/) — 12 vendored skills
  (1 MIT + 11 Apache 2.0)
- External catalog: [`skills/legal/EXTERNAL.md`](../../skills/legal/EXTERNAL.md) —
  30 non-vendored skills (mostly AGPL)
- Agent: [`agents/universal/legal-strategist.md`](../../agents/universal/legal-strategist.md)
- Command: [`commands/legal.md`](../../commands/legal.md)

## Sister Patterns (other domains)

- [`patterns/finance/regulatory-disclaimer-pattern.md`](../finance/regulatory-disclaimer-pattern.md) —
  finance-specific 6-category disclaimers (educational, general, regulatory,
  investment-specific, trading, business)
- [`patterns/marketing/product-marketing-context-pattern.md`](../marketing/product-marketing-context-pattern.md) —
  marketing's foundational context doc
