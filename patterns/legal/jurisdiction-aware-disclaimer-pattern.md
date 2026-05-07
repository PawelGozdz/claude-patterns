# Pattern: Jurisdiction-Aware Contextual Disclaimer

**Layer**: Legal / Cross-Layer
**Status**: production
**Sister patterns**: `finance/regulatory-disclaimer-pattern.md` (6-category
finance disclaimers), `marketing/product-marketing-context-pattern.md`
(no disclaimers, just hedged voice)
**Agent**: `legal-strategist` (agents/universal/)

---

## What This Is

A 4-category disclaimer system **calibrated to jurisdiction**, replacing
boilerplate "this is not legal advice; consult a lawyer" deflections.
Builds on the same principle as `finance/regulatory-disclaimer-pattern.md`
but adds a **jurisdiction layer** because the same legal advice can be
correct in EU and wrong in US (or vice versa).

The principle: **disclaimers should reduce risk where jurisdiction-specific
risk exists**, not appear pro-forma everywhere. Educational explanations
of GDPR concepts carry zero risk; jurisdiction-specific contract drafts
carry substantial risk.

---

## When to Use

- Domain has formal jurisdiction-bound rules (legal, regulated finance,
  medical, regulated marketing claims)
- Recommendations vary based on user's stated jurisdiction
- Boilerplate disclaimers are degrading user trust because they appear
  reflexive and unhelpful

---

## When NOT to Use

- Pure conceptual content with no actionable recommendation
- Internal tooling for sophisticated users (legal team) — they can read
  the disclaimer once and assume it applies to everything
- Domains without jurisdiction variance (most code, most product strategy)

---

## The Four Categories

| # | Category | Risk profile | Disclaimer |
|---|---|---|---|
| 1 | **Educational / conceptual** (explaining doctrine, comparing legal frameworks) | None | None |
| 2 | **GDPR / privacy / data protection** | Medium-High | *"Analysis based on GDPR/CCPA text and current authority guidance (CNIL/ICO/EDPB) as of [vendored skill date]; verify with your DPO or privacy counsel before relying on it for regulator-facing materials. Jurisdiction-specific application varies."* |
| 3 | **Contract drafting** (NDA, MSA, SaaS, employment) | High | *"This is an AI-generated draft based on common patterns and industry benchmarks. **Must be reviewed by qualified counsel before signing or sending.** Jurisdiction: [stated or unknown — confirm]."* |
| 4 | **Litigation / dispute / regulatory enforcement** | Highest | *"This is general analysis, not litigation advice. Specific dispute strategy must involve licensed counsel admitted in [your jurisdiction] who can review the full record. Time-sensitive deadlines are likely involved — do not delay seeking representation."* |

### Jurisdiction layer (multiplier on top of category)

For categories 2-4, the disclaimer **always** includes a jurisdiction
flag. The flag is sourced from:

1. **`.agents/legal-context.md`** — explicitly stated jurisdiction
2. **User message** — if they said "for our EU operations", that's
   jurisdiction context
3. **Fallback**: "general principles; jurisdiction-specific application
   may differ"

The jurisdiction flag is what differentiates this from finance's pattern.
A GDPR disclaimer for a stated EU client doesn't say "verify with EU
counsel" — it says "verify with your DPO" (already EU-context). For an
unstated client, it says "verify with privacy counsel admitted in your
jurisdiction".

---

## How the Agent Decides

The `@legal-strategist` agent classifies each output:

```
1. Did the user ask a conceptual question? → Category 1, no disclaimer
2. Are they making an actual decision? → Categories 2-4
   - Privacy/data-protection question? → Category 2
   - Contract draft for them to sign/send? → Category 3
   - Active dispute, regulator action, deadline-bound? → Category 4
3. Layer in jurisdiction flag for categories 2-4
```

When ambiguous, the agent picks the **lower-friction** category. *"Tell
me about Reg BI"* → Category 1 (educational). *"Apply Reg BI to our
fee structure for our real client base"* → Category 2 or 3 with jurisdiction
flag (US in this case).

---

## Anti-Patterns

### ❌ Boilerplate "this is not legal advice"

**Bad**: Every output ends with the same paragraph. Within 3-4
interactions, the user stops reading it. The disclaimer fails its
purpose.

**Good**: Disclaimers are short, **specific to category and
jurisdiction**, and appear only when warranted.

---

### ❌ Single global jurisdiction assumption

**Bad**: Agent assumes US law (training-data heavy bias) and gives
US-specific advice for an EU client without flagging.

**Good**: Read `.agents/legal-context.md` first. If missing, ask
explicitly before non-conceptual analysis: *"For this question,
which jurisdiction's rules should I apply? PL/EU/US/UK/...?"*

---

### ❌ Refusing to engage at all

**Bad**: *"I cannot provide legal advice. Please consult a licensed
attorney in your jurisdiction."* — said in response to *"What's the
difference between GDPR and CCPA?"*. Paralysis, not safety.

**Good**: Engage substantively at Category 1 (educational). Apply
jurisdiction-aware Category 2-4 disclaimer when the user crosses into
actionable territory.

---

### ❌ Disclaimer as cover for low-quality analysis

**Bad**: Generate vague analysis with overconfident phrasing
("the answer is X"), then close with disclaimer to dodge liability.

**Good**: **Hedge inside the analysis** ("the most defensible
interpretation appears to be X, with confidence: medium, because [authority]").
Add disclaimer **only** if jurisdiction-specific risk warrants. Hedging +
contextual disclaimer = honest. Confident analysis + boilerplate
disclaimer = dishonest theater.

---

### ❌ Disclaimer drowning the deliverable

**Bad**: A 3-paragraph disclaimer at the end of a 1-paragraph analysis.
Tail wagging the dog.

**Good**: 1-2 sentence disclaimer max. If it would need more, the
analysis itself probably should have been escalated to "you need an
attorney" instead of provided in this form.

---

### ❌ Wrong disclaimer for the right situation

**Bad**: Applying Category 4 (litigation) disclaimer to Category 2
(GDPR audit) — drowns user in unnecessary urgency.

**Good**: Match disclaimer to actual category. GDPR audit gets DPO
verification reminder, not litigation deadline alarm.

---

## Implementation

### In the agent

```yaml
# In legal-strategist.md
## Contextual Disclaimers — 4 Categories

| Category | Disclaimer |
|---|---|
| Educational | None |
| GDPR / privacy | "Verify with DPO ... [jurisdiction flag]" |
| Contract drafting | "AI draft — counsel must review before signing ... [jurisdiction flag]" |
| Litigation/dispute | "Engage licensed counsel admitted in [jurisdiction] ... time-sensitive" |
```

The agent applies the table when formatting output. Disclaimer goes
**after** the recommendation, never before.

### In project documentation

Each project that uses legal skills can override the template if their
jurisdiction needs different phrasing. Override location:
`.agents/legal-context.md` → `disclaimer_overrides:` section.

Example for a Polish project:

```yaml
# .agents/legal-context.md
jurisdiction: PL (with EU GDPR overlay)
business_form: Sp. z o.o.
regulated_industry: no
internal_counsel: no

disclaimer_overrides:
  privacy_authority: UODO  # default would be EDPB/CNIL
  contract_counsel_phrasing: "radca prawny lub adwokat"  # PL-specific
  litigation_court: "sąd właściwy dla miejsca świadczenia usług"
```

Agent picks up these overrides when generating disclaimers.

---

## Why This Pattern Matters

Legal advice without jurisdiction context is **worse than no advice** —
it can give users false confidence in a position that's wrong in their
court. A blanket "this is not legal advice" footer doesn't fix this; it
just signals the agent didn't engage with the jurisdiction question.

Jurisdiction-aware disclaimers force the agent to **either know** (via
`legal-context.md` or explicit user statement) **or ask**. The forcing
function produces better analysis as a byproduct — agents that ask for
jurisdiction also tend to cite jurisdiction-specific authority correctly.

The same principle applies to finance (where Reg BI is US-only, MiFID II
is EU, ASIC is Australia). The legal pattern's jurisdiction layer is a
generalization that finance can borrow when it needs to handle
multi-jurisdictional clients.

---

## See Also

- [`external-skills-catalog-pattern.md`](external-skills-catalog-pattern.md) —
  how to manage license-fragmented legal skill ecosystems
- [`finance/regulatory-disclaimer-pattern.md`](../finance/regulatory-disclaimer-pattern.md) —
  6-category finance variant
- [`agents/universal/legal-strategist.md`](../../agents/universal/legal-strategist.md) —
  the agent that applies this pattern
