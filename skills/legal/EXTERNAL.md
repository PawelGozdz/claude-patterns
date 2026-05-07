# External Legal Skills (NOT Vendored)

This file catalogs **30 legal skills NOT vendored** into claude-patterns
because of license incompatibility. They live upstream and projects can
opt-in install them per their own license terms.

## ⚠️ License Categories — Read Before Installing

### AGPL-3.0 (25 skills)

The **GNU Affero General Public License** is **copyleft**:
- If you use the skill in a commercial project, the **entire project's
  source code** must be made available under AGPL-3.0 to all users
  (including network-use).
- Mixing AGPL with MIT/Apache code creates a derived work bound by AGPL.
- **For closed-source commercial projects**: do NOT install AGPL skills
  unless you understand the implications. Consult counsel.
- **For open-source projects**: AGPL is fine. Make sure your project's
  license is AGPL-compatible (AGPL itself, GPL-3.0+, etc.).

### Anthropic-proprietary (5 skills)

Marked `metadata.license: Proprietary. See LICENSE.txt`. Anthropic's
LICENSE.txt grants limited use within their platform. **Read LICENSE
before installing for use outside claude.ai.**

### Manus-proprietary (1 skill)

Marked `metadata.license: Proprietary`. Single skill. Same caveat as
Anthropic-proprietary.

---

## How to Install (per skill)

Pick a skill from the tables below. Then in your project:

```bash
# 1. Read the upstream LICENSE — make sure it's compatible with your project
# 2. Clone or copy the skill folder into your project's local skills dir:
mkdir -p .claude/skills/legal-external
git clone https://github.com/lawvable/awesome-legal-skills /tmp/awesome
cp -r /tmp/awesome/skills/<SKILL-NAME>/ .claude/skills/legal-external/
rm -rf /tmp/awesome

# 3. The skill becomes available via /<skill-name> in this project ONLY.
# 4. claude-patterns is NOT contaminated by AGPL — it stays MIT.
```

For AGPL skills used in commercial projects: **prefer reading the
SKILL.md as inspiration** to author your own MIT-licensed equivalent
inside your project, rather than installing the AGPL version. This
avoids license contamination.

---

## AGPL-3.0 Catalog (25 skills)

### GDPR / Privacy (3) — EU jurisdiction
| Skill | Author | What it does |
|---|---|---|
| `gdpr-privacy-notice-eu-oliver-schmidt-prietz` | Oliver Schmidt-Prietz | EU GDPR privacy notice generator |
| `gdpr-breach-sentinel-oliver-schmidt-prietz` | Oliver Schmidt-Prietz | GDPR breach assessment + 72h notification readiness |
| `dpia-sentinel-oliver-schmidt-prietz` | Oliver Schmidt-Prietz | Data Protection Impact Assessment (DPIA) walkthrough |

### Contract Review / Negotiation (3)
| Skill | Author | What it does |
|---|---|---|
| `nda-review-jamie-tso` | Jamie Tso | Jurisdiction-agnostic incoming unilateral NDA review |
| `tech-contract-negotiation-patrick-munro` | Patrick Munro | Tech services agreements, MSAs, SaaS contracts negotiation |
| `nil-contract-analysis-samir-patel` | Samir Patel | NIL (Name/Image/Likeness) contracts for NCAA student-athletes |

### Risk Assessment (2)
| Skill | Author | What it does |
|---|---|---|
| `legal-risk-assessment-zacharie-laik` | Zacharie Laik | Legal research + risk analysis via GoodLegal MCP tools |
| `vendor-due-diligence-patrick-munro` | Patrick Munro | IT/tech vendor + 3rd-party DD framework |

### French Legal Workflows (4) — FR jurisdiction
| Skill | Author | What it does |
|---|---|---|
| `assignation-refere-communication-associe-selim-brihi` | Selim Brihi | FR: Référé pour communication d'actes |
| `assignation-refere-recouvrement-creance-selim-brihi` | Selim Brihi | FR: Référé recouvrement de créance |
| `notification-licenciement-selim-brihi` | Selim Brihi | FR: Notification de licenciement (employment) |
| `requete-cph-licenciement-faute-grave-selim-brihi` | Selim Brihi | FR: Requête CPH licenciement faute grave |

### French Privacy Policies (3) — FR jurisdiction
| Skill | Author | What it does |
|---|---|---|
| `politique-confidentialite-malik-taiar` | Malik Taiar | FR: Politique de confidentialité GDPR + CNIL 2020 |
| `politique-cookies-malik-taiar` | Malik Taiar | FR: Politique de cookies GDPR + ePrivacy + CNIL |
| `politique-lanceur-alerte-malik-taiar` | Malik Taiar | FR: Audit / drafting whistleblower system |

### Mediation / Disputes (1)
| Skill | Author | What it does |
|---|---|---|
| `mediation-dispute-analysis-jinzhe-tan` | Jinzhe Tan | Dispute analysis for mediation purposes |

### Statute Analysis (1)
| Skill | Author | What it does |
|---|---|---|
| `statute-analysis-rafal-fryc` | Rafał Fryc | Reading + interpreting + applying statutes/regulations |

### Document Tools — AGPL versions (3)
| Skill | Author | What it does |
|---|---|---|
| `docx-processing-lawvable` | Lawvable | DOCX edit with live preview + track changes (VS Code) |
| `docx-processing-superdoc` | SuperDoc | DOCX search/replace/read |
| `outlook-emails-lawvable` | Lawvable | Read/search/download Outlook emails via OAuth2 |

### Verification / Optimization (3)
| Skill | Author | What it does |
|---|---|---|
| `red-team-verifier-patrick-munro` | Patrick Munro | Adversarial verification + fact-checking for AI legal content |
| `legal-simulation-patrick-munro` | Patrick Munro | Framework for AI capability demos in legal contexts |
| `skill-optimizer-lawvable` | Lawvable | Analyze work session, propose skill improvements |

### Tabular Review (1)
| Skill | Author | What it does |
|---|---|---|
| `tabular-review-lawvable` | Lawvable | Multi-doc analysis (PDF/DOCX) against user-defined columns |

### Tooling (1)
| Skill | Author | What it does |
|---|---|---|
| `vscode-extension-builder-lawvable` | Lawvable | Build VS Code extensions (legal/non-legal) |

---

## Anthropic-Proprietary Catalog (5 skills)

`metadata.license: Proprietary. See LICENSE.txt` — read upstream LICENSE
before installing.

| Skill | What it does |
|---|---|
| `docx-processing-anthropic` | Word document creation/edit/manipulation |
| `pdf-processing-anthropic` | PDF read/extract/manipulate |
| `pptx-processing-anthropic` | PowerPoint creation/edit |
| `xlsx-processing-anthropic` | Spreadsheet read/edit (any task involving xlsx) |
| `skill-creator-anthropic` | Guide for creating effective skills |

**Note**: We vendor the OpenAI Apache-2.0 equivalents of docx/pdf/xlsx
processing. The Anthropic versions may be more polished — check both,
pick what fits your license requirements.

---

## Manus-Proprietary Catalog (1 skill)

| Skill | What it does |
|---|---|
| `xlsx-processing-manus` | Excel processing (Manus's variant) |

---

## How `@legal-strategist` Uses This Catalog

When a user asks something that **maps to a non-vendored skill** (e.g.,
*"Help me draft a French employment dismissal letter"* → maps to
`notification-licenciement-selim-brihi`), the agent:

1. Identifies the closest vendored skill (if any) — e.g., none for
   French employment law
2. Surfaces the upstream skill from EXTERNAL.md with its license
   warning
3. Offers two paths to the user:
   - **Install upstream skill in your project** (read AGPL implications first)
   - **Author MIT-licensed equivalent in your project** (using
     vendored `skill-creator-openai` as scaffolding) — recommended
     for closed-source commercial work

The agent **never silently fabricates** content from non-vendored skills'
domains. If we don't have the skill, the user knows.

---

## Re-verification

Run `./scripts/sync-legal-skills.sh --verify-licenses` periodically to:
1. Re-read each upstream skill's `metadata.license` field
2. Flag if any vendored skill's license has changed (would require
   removal)
3. Flag if any external skill's license is now compatible (could be
   vendored)

This protects against silent license drift in upstream repos.
