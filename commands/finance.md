---
name: finance
description: |
  Entry point for finance tasks. Routes the request to the right skill in
  skills/finance/ via the @finance-strategist agent.

  Examples:
    /finance compute TWR vs IRR for our model portfolio
    /finance build asset allocation for a 35yo, 25y horizon, moderate risk
    /finance what does Reg BI require for fee disclosure?
    /finance LTV/CAC threshold for our SaaS pricing tiers
    /finance design quarterly client review prep flow

  Usage: /finance <task description>
  Alias: /fin <task description>

tools: Task, Read, Glob, Grep
disallowedTools: Write, Edit, MultiEdit, Bash, NotebookEdit
---

# /finance — Finance Task Router

**ZERO IMPLEMENTATION** — coordinates finance analysis through the
`@finance-strategist` agent and the 84 skills in `skills/finance/`.

> **Narzędzia**: ten koordynator sam nie uruchamia niczego w powłoce — stąd `Bash`
> w `disallowedTools`. Zakaz dotyczy WYŁĄCZNIE tej komendy i **nie propaguje się do
> subagentów**: `@finance-strategist` ma własny zestaw narzędzi ze swojej definicji, `Bash`
> włącznie, i to on uruchamia zvendorowane skrypty `scripts/*.py`. Nie usuwaj `Bash`
> z agenta „dla spójności" — złamiesz obliczenia numpy/scipy w skillach finansowych.

## What This Does

1. Reads the project finance context — `.agents/finance-context.md`, a w drugiej
   kolejności `docs/finance/finance-context.md` (per-project finance context: business
   model, regulated jurisdiction, advisor scope) when present.
2. Delegates to `@finance-strategist` with the user's task.
3. The strategist picks the right plugin + skill, runs vendored Python
   scripts when computation is needed, and produces a structured deliverable
   with hedged recommendations and contextual disclaimer (if applicable).

## Steps

1. **Pre-flight check**
   - Look for `.agents/finance-context.md`, then `docs/finance/finance-context.md` — pass
     to strategist if found
   - Verify which finance plugins are enabled in `project.yml` (e.g.,
     `finance/core`, `finance/compliance`); flag missing dependencies

2. **Delegate to @finance-strategist**
   - Spawn the agent with the user's full request and any context found
   - The agent classifies → picks plugin + skill → reads `SKILL.md` →
     optionally runs `scripts/*.py` → produces hedged output

3. **Surface the result**
   - Show the strategist's recommendations + "What I'd want to validate" +
     "Next step" + "Disclaimer (if applicable)" sections
   - Do NOT post-process or summarize — the strategist already produces
     properly-structured output

## Cost

- ~$0.05–0.30 per call (Sonnet agent + occasional Python script execution)
- Slightly higher than `/marketing` because finance answers often need
  numerical computation

## When NOT to use this command

- Code generation tasks → use `/orchestrate` or implementer agents
- Architecture decisions for non-finance systems → use `@project-orchestrator` (routes to the stack's architecture agent)
- Project planning → use `/pulse`, `/sprint`, `@tech-lead`, `@product-owner`
- Marketing/CRO/copy/SEO/growth → use `/marketing`
- Direct skill invocation when you already know which skill you want →
  `/<skill-name>` (e.g., `/return-calculations`, `/historical-risk`)

## Plugin Coverage

| Plugin | Skills | Use cases |
|---|---|---|
| `core` | 3 | Math/stats foundations — implicitly used by everything |
| `wealth-management` | 32 | Investment, portfolio, personal finance, behavioral |
| `compliance` | 16 | SEC/FINRA, KYC, AML, Reg BI, fiduciary, suitability |
| `advisory-practice` | 12 | Client onboarding, CRM, advisor workflows |
| `trading-operations` | 9 | Order lifecycle, execution, settlement |
| `client-operations` | 8 | Account lifecycle, transfers, reconciliation |
| `data-integration` | 4 | Reference data, market data, data quality |

See [`skills/finance/PLUGINS.md`](../skills/finance/PLUGINS.md) for the
dependency graph.

## Communication Style

`@finance-strategist` is calibrated to give **data-driven, hedged
recommendations** — *"Based on [evidence], the most viable approach
appears to be X. Trade-offs: [...]. Confidence: medium."* — not
boilerplate "consult an advisor" deflections.

Disclaimers are **contextual** (applied only when the question is
investment-specific, regulatory, or trading-operational), not pro-forma.
