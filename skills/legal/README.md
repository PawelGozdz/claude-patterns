# Legal Skills (vendored, MIT/Apache 2.0)

**12 legal skills** for AI agents — contract review, NDA triage, GDPR/CCPA
compliance, risk assessment, legal templates, meeting briefings, plus
office document processing tools commonly needed in legal workflows.

## Why a smaller catalog than marketing/finance

The legal skill ecosystem is **license-fragmented**:
- Specialized prawnicze skills (NDA-jamie-tso, GDPR-EU, French legal,
  mediation, statute-analysis…) are predominantly **AGPL-3.0** —
  copyleft license incompatible with claude-patterns' MIT model.
- Some Anthropic-authored skills are proprietary ("All rights reserved").
- Only **Apache 2.0** and **MIT** are safe to vendor.

The result: 12 vendorable skills (vs 41 marketing, 84 finance). For the
remaining 30 legal skills (mostly AGPL), see [`EXTERNAL.md`](EXTERNAL.md)
— catalog with install instructions and per-license commercial-use warnings.

## Vendored Skills (12)

### Legal-domain skills (7)

| Skill | License | Author | What it does |
|---|---|---|---|
| `contract-review/` | MIT | Christopher Sheehan (evolsb) | CUAD-based contract review (41 risk categories) + market benchmarks + lawyer-ready redlines |
| `contract-review-anthropic/` | Apache 2.0 | Anthropic | Playbook-based review, deviation flagging, redline suggestions |
| `nda-triage-anthropic/` | Apache 2.0 | Anthropic | Triage NDAs into RED / YELLOW / GREEN classification |
| `compliance-anthropic/` | Apache 2.0 | Anthropic | GDPR / CCPA review, DPAs, data subject requests |
| `legal-risk-assessment-anthropic/` | Apache 2.0 | Anthropic | Severity-by-likelihood framework with escalation criteria |
| `canned-responses-anthropic/` | Apache 2.0 | Anthropic | Templated responses for routine legal inquiries |
| `meeting-briefing-anthropic/` | Apache 2.0 | Anthropic | Structured briefings for meetings with legal relevance |

### Document tools (4) — for legal workflows

| Skill | License | What it does |
|---|---|---|
| `docx-processing-openai/` | Apache 2.0 | Read/edit/create Word docs with quality control |
| `pdf-processing-openai/` | Apache 2.0 | Read/review/create PDF docs |
| `xlsx-processing-openai/` | Apache 2.0 | Read/edit/create Excel spreadsheets |
| `security-review-openai/` | Apache 2.0 | Language-specific security best-practice review |

### Meta-skill (1)

| Skill | License | What it does |
|---|---|---|
| `skill-creator-openai/` | Apache 2.0 | Guide for creating new skills (e.g. for jurisdiction-specific use cases like Polish KSH or Kodeks Pracy) |

## How These Skills Are Used

The legal system has **3 access modes** (same as marketing/finance):

1. **Through `@product-owner` (strategic)** — when work touches GDPR,
   privacy, contracts, NDAs, ToS, IP, employment law, or compliance,
   `@product-owner` automatically consults `@legal-strategist` for the
   regulatory/jurisdiction lens.

2. **Standalone via `@legal-strategist`** — invoke directly for focused
   legal analysis with proper jurisdiction-aware disclaimers.

3. **On demand via `/legal`** — slash command for ad-hoc legal tasks.

Power users can call any skill directly with `/<skill-name>` —
e.g., `/contract-review`, `/nda-triage-anthropic`, `/compliance-anthropic`.

## Disclaimer

These skills produce **educational analysis based on legal principles
and the authors' interpretations of relevant law** (mostly EU/US/CC).
They are **not legal advice for a specific situation in a specific
jurisdiction**.

`@legal-strategist` is calibrated to communicate with **data-driven,
hedged recommendations** — e.g., *"Based on [GDPR Art. X] and the case
law in [recent ruling], the most defensible interpretation appears to
be Y. Trade-offs: Z. Confidence: medium — strong on the rule, less
certain on jurisdictional application."* — rather than refusing to
engage.

Disclaimers are **contextual**, not boilerplate (see
[`patterns/legal/jurisdiction-aware-disclaimer-pattern.md`](../../patterns/legal/jurisdiction-aware-disclaimer-pattern.md)).

## Skill Frontmatter

Standard Agent Skills format. Both vendor sources use the same spec:

```yaml
---
name: contract-review
description: "Review legal contracts, NDAs, employment agreements..."
metadata:
  author: ...
  license: MIT | Apache-2.0
  version: ...
---
```

## Related Resources

- **External skills catalog**: [`EXTERNAL.md`](EXTERNAL.md) — 30 AGPL/proprietary
  skills as install-yourself reference (with license warnings)
- **Agent**: [`agents/universal/legal-strategist.md`](../../agents/universal/legal-strategist.md)
- **Slash command**: [`commands/legal.md`](../../commands/legal.md)
- **Patterns**: [`patterns/legal/`](../../patterns/legal/) — jurisdiction-aware disclaimers + external catalog management
- **Sync script**: [`scripts/sync-legal-skills.sh`](../../scripts/sync-legal-skills.sh) — refreshes both upstream sources, verifies licenses

## License

- **`contract-review/`** — MIT (see `contract-review/LICENSE.upstream`)
- **All other skills** — Apache 2.0 (see each skill's `LICENSE.txt`)

When syncing updates, the `sync-legal-skills.sh` script **re-verifies
each skill's license per its `metadata.license` field** before
overwriting. AGPL-licensed skills are explicitly excluded from sync.
