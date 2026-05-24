## Document Conventions

### File Naming
- Markdown: `kebab-case.md`
- YAML: `kebab-case.yaml`
- Folders: `kebab-case/`

### Required Frontmatter (ALL .md files)

```yaml
---
title: "Page Title"
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: "@dri-X" | "@founder"
tags: ["tag1", "tag2"]
sensitivity: "public" | "internal" | "confidential"
---
```

Missing `sensitivity` = CI fail (enforced by pre-commit hook when configured).

### Sensitivity Classification

| Level | Who can see it | Examples |
|-------|---------------|---------|
| `public` | Anyone | Public policies, blog posts |
| `internal` | Team members | Team configs, procedures, wiki |
| `confidential` | Restricted access | Finance, contracts, PII references |

### Content Quality Rules

- Every claim needs a source or date
- Decisions must include rationale (why, not just what)
- AI-legible structure: consistent headers, explicit metadata, no ambiguous pronouns
- No inline secrets — reference Azure Key Vault paths instead

---

## What NOT to Edit Manually

Some folders or branches may be auto-managed by external systems. Check `README.md` before editing:

- Branches marked `AUTO-MANAGED`: never edit directly
- Folders with `WARNING: never edit manually` comments: route edits through the owning system (Wiki.js GraphQL, CI, etc.)

---

## Commit Messages

```
chore: repo maintenance
docs: documentation update
feat(section): new policy / config / persona
fix(section): correction to existing content
```

Never amend or force-push commits from auto-managed branches.
