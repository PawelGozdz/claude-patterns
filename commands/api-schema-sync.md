---
name: api-schema-sync
description: |
  On-demand OpenAPI schema-drift check between a backend and its consumer
  repos (mobile/web). Reports concretely what changed and which files in
  each consumer repo need updating. Never edits consumer repos.

  Examples:
    /api-schema-sync

  Usage: /api-schema-sync

tools: Read, Glob, Grep, Bash, WebFetch, Skill
disallowedTools: Write, Edit, MultiEdit, NotebookEdit
---

# /api-schema-sync — Cross-Repo API Contract Sync

Thin wrapper that invokes the `api-contract-sync` skill from
`skills/architecture/api-contract-sync/`. The skill performs:

- Resolves the backend's current OpenAPI document (file, URL, or generation command)
- Diffs it against the last snapshot: added/removed endpoints, changed fields/types/required/enums
- Greps every configured consumer repo (mobile/web) for usages of what changed
- Reports one concrete action item per affected file — never edits consumer repos automatically
- Tags the report with a task-id if the current branch matches the configured convention, so
  coordinated backend + mobile + web changes can be tracked under the same identifier

**Prerequisite**: `.claude/rules/api-clients-context.md` in the backend repo (scaffold at
`templates/api-clients-context.md`).

## When to use

- Before or during a backend API change, to see its blast radius across mobile/web before
  splitting the work across repos
- After pulling latest on a backend branch, to check whether consumers need matching updates

## When NOT to use

- As a CI/merge gate — this is an on-demand developer tool, not automated contract testing
- If you don't have separate consumer repos to check against (single-repo/monorepo projects
  don't need this)

## Related

- Skill source: `skills/architecture/api-contract-sync/SKILL.md`
- Config scaffold: `templates/api-clients-context.md`
- Pattern: `patterns/architecture/api-contract-sync-pattern.md`,
  `patterns/cross-layer/snapshot-incremental-review-pattern.md`

---

