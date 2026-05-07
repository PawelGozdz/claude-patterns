# Finance Skills (vendored)

**84 specialized finance skills** for AI agents — investment management,
regulatory compliance, advisory workflows, trading operations, client
operations, data integration, plus mathematical/statistical foundations.

## Origin & Attribution

Vendored from
[**JoelLewis/finance_skills**](https://github.com/JoelLewis/finance_skills)
by Joel Lewis (joel@eleazar.dev), MIT license.

These skills follow the standard Agent Skills specification and are
compatible with Claude Code, Cursor, and other AI coding agents.

The version currently vendored is recorded in [`UPSTREAM_VERSION`](./UPSTREAM_VERSION)
(written by `scripts/sync-finance-skills.sh`).

```bash
./scripts/sync-finance-skills.sh             # interactive — diff + confirm
./scripts/sync-finance-skills.sh --diff      # show diff, no changes
./scripts/sync-finance-skills.sh --ref v1.0.0  # pin to a tag
```

## Disclaimer

These skills provide **educational analysis based on financial principles**
and the author's interpretation of US regulatory frameworks (SEC/FINRA).
They are **not personalized financial, legal, or tax advice**.

`@finance-strategist` (the coordinator agent) is calibrated to communicate
with **data-driven, hedged recommendations** — e.g., *"Based on [evidence]
and [observed trend], the most viable approach appears to be X. Trade-offs:
[...]. Confidence: medium."* — rather than refusing to engage.

Disclaimers are **contextual**, not boilerplate:
- Educational/analytical: "Analysis based on principles; validate against
  your specific context."
- Regulatory (Reg BI, KYC, AML, fiduciary): "Summarizes current rules as
  of [vendored date]; verify with compliance officer before acting."
- Investment-specific or tax-specific: "General approach; specific
  portfolio/tax decisions require a licensed advisor."
- Trading operational: "Verify against your firm's execution policy and
  current settlement rules."

## How These Skills Are Used

The finance system has **3 access modes**:

1. **Through `@product-owner` (strategic)** — when you're doing roadmap,
   sprint planning, milestone reviews, or strategic analysis,
   `@product-owner` automatically consults `@finance-strategist` for unit
   economics, runway, pricing, and capital efficiency lens.

2. **Standalone via `@finance-strategist`** — invoke the agent directly
   for focused finance analysis.

3. **On-demand via `/finance`** — slash command for ad-hoc finance tasks.

Power users can call any skill directly with `/<skill-name>` — e.g.,
`/return-calculations`, `/historical-risk`, `/suitability-and-best-interest`.

## Plugin Structure

Skills are organized into 7 plugins with explicit dependency graph
(see [`PLUGINS.md`](PLUGINS.md) for the full map):

```
finance/
├── core/                    (3 skills)  — math/stats foundations, REQUIRED
├── wealth-management/       (32 skills) — investment, portfolio, personal
├── compliance/              (16 skills) — SEC/FINRA regulatory
├── advisory-practice/       (12 skills) — advisor workflows
├── trading-operations/      (9 skills)  — order/execution/settlement
├── client-operations/       (8 skills)  — account lifecycle
└── data-integration/        (4 skills)  — reference/market data
```

Each skill folder follows this layout:

```
<skill-name>/
├── SKILL.md          # main workflow (required)
└── scripts/          # Python implementations (optional, mostly in core/ + wealth-management/)
    └── *.py          # numpy/scipy reference code, runnable
```

## Skill Frontmatter

Standard Agent Skills format:

```yaml
---
name: return-calculations
description: "Compute and compare investment return metrics including TWR, MWR/IRR, CAGR..."
---
```

Each `SKILL.md` body declares:
- `## Layer N — <name>` (knowledge depth: 0=foundations → 7=top)
- `## Direction` (retrospective | prospective | both)
- Workflow, formulas, examples

## Python Scripts

29 of the 84 skills include `scripts/*.py` — runnable reference
implementations using `numpy` (and occasionally `scipy`). The skill
prompts Claude to invoke these scripts when computation is needed,
rather than doing math from scratch.

To run them locally:

```bash
cd skills/finance/core/return-calculations
python scripts/return_calculations.py
# (uses uv-style inline dep declarations: # /// script, dependencies = [...])
```

## Eval Framework

Companion eval framework lives at [`tests/finance-evals/`](../../tests/finance-evals/) —
vendored from `finance-skills-workspace/` upstream. It includes
`grade_responses.py` and two iterations of test cases.

## Related Resources

- **Plugin map**: [`PLUGINS.md`](PLUGINS.md) — dependency graph, layer architecture
- **Agent**: [`agents/universal/finance-strategist.md`](../../agents/universal/finance-strategist.md)
- **Slash command**: [`commands/finance.md`](../../commands/finance.md)
- **Patterns**:
  - [`patterns/finance/layered-knowledge-pattern.md`](../../patterns/finance/layered-knowledge-pattern.md)
  - [`patterns/finance/regulatory-disclaimer-pattern.md`](../../patterns/finance/regulatory-disclaimer-pattern.md)
- **Tests**: [`tests/finance-evals/`](../../tests/finance-evals/)
- **Sync script**: [`scripts/sync-finance-skills.sh`](../../scripts/sync-finance-skills.sh)

## License

These vendored skills are MIT-licensed — see upstream
[LICENSE](https://github.com/JoelLewis/finance_skills/blob/main/LICENSE).
