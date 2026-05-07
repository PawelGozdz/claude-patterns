---
name: legal
description: |
  Entry point for legal tasks. Routes the request to the right skill in
  skills/legal/ via the @legal-strategist agent (jurisdiction-aware).

  Examples:
    /legal review this SaaS agreement for unfavorable terms
    /legal triage NDA — RED/YELLOW/GREEN classification
    /legal GDPR audit our data flows
    /legal draft a privacy policy for our SaaS (jurisdiction: PL, EU)
    /legal what's the regulatory exposure of feature X in EU?

  Usage: /legal <task description>
  Alias: /lex <task description>

tools: Task, Read, Glob, Grep
disallowedTools: Write, Edit, MultiEdit, Bash, NotebookEdit
---

# /legal — Legal Task Router

**ZERO IMPLEMENTATION** — coordinates legal analysis through the
`@legal-strategist` agent and the 12 vendored skills in `skills/legal/`.

## What This Does

1. Reads `.agents/legal-context.md` (jurisdiction, business form, regulated
   industry, internal counsel) when present.
2. Delegates to `@legal-strategist` with the user's task.
3. The strategist picks the right skill, applies jurisdiction-aware
   analysis, and produces a structured deliverable with **contextual
   disclaimer** (4 categories, not boilerplate).

## Steps

1. **Pre-flight check**
   - Look for `.agents/legal-context.md` in the current project
   - If missing, surface this to the user before deep analysis:
     > "No legal context found. Strongly recommend creating
     > `.agents/legal-context.md` with at minimum:
     > - **Jurisdiction**: PL/EU/US/FR/UK/...
     > - **Business form**: Sp. z o.o. / LLC / GmbH / ...
     > - **Regulated industry**: yes (which?) / no
     > - **Internal counsel**: yes / no
     >
     > Want to set it up now, or proceed with the task assuming general
     > EU + universal-principles defaults?"

2. **Delegate to @legal-strategist**
   - Spawn agent with full request and any context found
   - Agent classifies → picks vendored skill (or surfaces external skill
     from EXTERNAL.md with license warning) → applies
     jurisdiction-aware analysis → produces hedged output

3. **Surface the result**
   - Show recommendation + jurisdiction context + validate-with-user
     section + suggested next step + (if applicable) contextual disclaimer
   - Do NOT post-process or summarize

## Cost

- ~$0.05–0.20 per call (Sonnet agent + occasional skill workflow read)

## When NOT to use

- Code generation tasks → use `/orchestrate` or implementer agents
- Marketing/CRO/copy/SEO → use `/marketing`
- Finance/unit economics/portfolio → use `/finance`
- Project planning → use `/pulse`, `/sprint`, `@tech-lead`, `@product-owner`
- Direct skill invocation when you know which skill you want →
  `/<skill-name>` (e.g., `/contract-review`, `/nda-triage-anthropic`,
  `/compliance-anthropic`)

## Vendored Coverage (12 skills)

| Domain | Skills available |
|---|---|
| Contract review | `contract-review` (CUAD), `contract-review-anthropic` (playbook) |
| NDA triage | `nda-triage-anthropic` |
| GDPR / CCPA / DSAR | `compliance-anthropic` |
| Risk assessment | `legal-risk-assessment-anthropic` |
| Templates | `canned-responses-anthropic`, `meeting-briefing-anthropic` |
| Document tools | `docx/pdf/xlsx-processing-openai`, `security-review-openai` |
| Skill creation | `skill-creator-openai` (for authoring custom MIT skills) |

For specialized domains we DON'T have vendored — French legal workflows,
Polish-specific privacy, mediation, statute analysis, etc. — see
[`skills/legal/EXTERNAL.md`](../skills/legal/EXTERNAL.md) for upstream
catalog with license-aware install instructions.

## Communication Style

`@legal-strategist` is calibrated to give **data-driven, hedged
recommendations** with **jurisdiction context**:

> *"Under [GDPR Art. 6(1)(b)] and the recent CNIL guidance on
> [topic], the most defensible position appears to be X. Trade-offs:
> [...]. Confidence: medium — rule is clear, application to your
> specific context less settled. Jurisdiction: EU general; PL-specific
> UODO interpretation may differ."*

Not: *"I cannot give legal advice; consult a lawyer."*

Disclaimers are **contextual** (4 categories: educational, GDPR/privacy,
contract drafting, litigation/dispute) — never boilerplate.
