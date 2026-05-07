# Pattern: Contextual Regulatory Disclaimer

**Layer**: Finance / Cross-Layer
**Status**: production
**Agents**: `finance-strategist` (primary), `marketing-strategist`,
any future agent in regulated domains
**Skills**: applies to all 84 skills in `skills/finance/`, especially
`compliance/` plugin

---

## What This Is

A system for applying disclaimers **selectively, matched to the
regulatory category** of each output — replacing the boilerplate
"this is not financial/legal/tax advice; consult a licensed advisor"
that becomes noise and gets tuned out by users.

The principle: **disclaimers should reduce risk where risk exists**, not
appear pro-forma everywhere. Educational explanations of how DCF
valuation works carry zero regulatory risk; specific investment
recommendations for a real portfolio carry substantial risk. The same
disclaimer for both is a category error.

---

## When to Use

- Domain has formal regulatory exposure (finance, legal, medical,
  tax, regulated marketing claims)
- AI agent produces analysis that could be acted on by users in
  real-world contexts
- Boilerplate disclaimers are degrading user trust because they appear
  reflexive and unhelpful

---

## When NOT to Use

- Pure educational/conceptual content with no actionable
  recommendation (no disclaimer needed at all)
- Internal tooling where users are sophisticated and operate within
  organizational compliance boundaries
- Domains without regulatory exposure (most code, most marketing
  ops, most product strategy)

---

## The Six Categories (for finance)

Disclaimers are applied based on which category the question falls into:

| # | Category | Risk profile | Disclaimer |
|---|---|---|---|
| 1 | **Educational / analytical** (concepts, formulas, frameworks) | None | None |
| 2 | **General principles** with applied trade-offs (e.g., "asset allocation strategies") | Low | None — unless user is making a decision, then: *"This analysis is based on principles and observed data; validate against your specific context before acting."* |
| 3 | **Regulatory** (Reg BI, KYC, AML, fiduciary, suitability rules) | Medium-High | *"This summarizes current rules as of [date]; verify with your compliance officer or licensed counsel before relying on it for filings or client-facing materials."* |
| 4 | **Investment-specific** (real portfolio decisions, tax-loss harvesting on real positions) | High | *"This approach is general; specific portfolio decisions for a real account should involve a licensed advisor who knows your full financial picture."* |
| 5 | **Trading operational** (settlement, margin, execution rules) | Medium | *"Verify against your firm's current execution policy and the venue's published rules — these change without retroactive notice."* |
| 6 | **Operational decision-support for the user's own business** (LTV, CAC, runway, fee structure) | None | None — this is business strategy, not regulated advice |

---

## How the Agent Decides

The `@finance-strategist` agent classifies each output before formatting:

```
1. Did the user ask a conceptual question? → Category 1, no disclaimer
2. Are they planning a real-world action? → Categories 2-5
   - Specific to a real account/portfolio? → Category 4
   - About a regulatory rule's application? → Category 3
   - About trade execution mechanics? → Category 5
   - General principles applied? → Category 2
3. Is this internal business operations? → Category 6, no disclaimer
```

When ambiguous, the agent picks the **lower-friction** category and lets
the user upgrade. *"Tell me about historical volatility"* → Category 1
(educational), no disclaimer. *"Compute the Sharpe ratio for my real
portfolio's last 3 years"* → Category 4 (investment-specific), full
disclaimer.

---

## Anti-Patterns

### ❌ Boilerplate "this is not financial advice"

**Bad**: Every output ends with the same paragraph. Within 3-4
interactions, the user stops reading it. The disclaimer fails its
purpose.

**Good**: Disclaimers are short, **specific to the category**, and
appear only when the category warrants them.

---

### ❌ Refusing to engage at all

**Bad**: *"I cannot provide financial advice. Please consult a
licensed advisor."* — said in response to *"What is the difference
between TWR and IRR?"*. This is paralysis, not safety.

**Good**: Engage substantively at Category 1 (educational). Ask for
context if user's question hints at a real-world action. Apply
contextual disclaimer if Categories 3-5 apply.

---

### ❌ Disclaimer as cover for low-quality analysis

**Bad**: Generate vague, hand-wavy analysis with high confidence
("the best approach is X"), then close with a disclaimer to dodge
liability.

**Good**: Hedge **inside the analysis** ("the most viable approach
appears to be X, with confidence: medium, because [evidence]"). Add
disclaimer **only** if regulatory category warrants it. Hedging +
contextual disclaimer = honest. Confident analysis + boilerplate
disclaimer = dishonest theater.

---

### ❌ Disclaimer drowning the deliverable

**Bad**: A 2-paragraph disclaimer at the end of a 1-paragraph
analysis. Tail wagging the dog.

**Good**: 1-2 sentence disclaimer max. If it needs to be longer, the
analysis itself probably should not have been provided in this
form — escalate to "this needs a licensed professional" instead.

---

### ❌ Same disclaimer template across domains

**Bad**: Copy-paste the finance disclaimer to legal, medical, or
marketing — even though their regulatory profiles differ.

**Good**: Each domain has its own category table and phrasing,
calibrated to that domain's risk profile and the language users
expect.

---

## Implementation

### In the agent

```yaml
# In finance-strategist.md
## Contextual Disclaimers (NOT Boilerplate)

| Category | Disclaimer |
|---|---|
| Educational | None |
| General principles | None unless user is acting; then: "..." |
| Regulatory (Reg BI, KYC, AML) | "..." |
| Investment-specific | "..." |
| Trading operational | "..." |
| Business operations | None |
```

The agent applies the table when formatting output. Disclaimer goes
**after** the deliverable, not before — so it doesn't bury the lede.

### In project documentation

Each project that uses finance skills can override the template if
their context demands different phrasing (e.g., a UK firm might
substitute FCA-specific language for US/SEC). Override location:
`.agents/finance-context.md` → `disclaimer_overrides:` section.

---

## Why This Pattern Matters

Regulatory domains accumulate disclaimers like barnacles. Each becomes
shorter than the last, until they merge into a single block of legal
boilerplate that means nothing to anyone.

The cost: users start ignoring **all** disclaimers, including the ones
that would have actually mattered.

The fix: be parsimonious. Specific. Calibrated. The user reads a
contextual disclaimer because it's *different* from the last one — and
that difference is the signal that *this* is the moment to actually
verify with a professional.

---

## See Also

- [`layered-knowledge-pattern.md`](layered-knowledge-pattern.md) — how
  the 84 skills are organized
- [`agents/universal/finance-strategist.md`](../../agents/universal/finance-strategist.md) —
  the agent that applies this pattern
- [`agents/universal/marketing-strategist.md`](../../agents/universal/marketing-strategist.md) —
  uses analogous (lighter) hedging without regulatory disclaimers
