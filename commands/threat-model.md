---
name: threat-model
description: |
  Interactive threat modeling using STRIDE + DREAD + LINDDUN. Generates
  TM-{TASK-ID}.md in docs/security/threat-models/ when a feature touches
  authentication, PII, cross-context integration, or new bounded contexts.

  Examples:
    /threat-model new SMS verification flow
    /threat-model TM for civic-audience cross-context integration
    /threat-model assess PII exposure in geographic-auth feature

  Usage: /threat-model <feature or task description>

tools: Read, Write, Edit, Glob, Grep, Bash, Skill
disallowedTools: MultiEdit, NotebookEdit
---

# /threat-model — STRIDE + DREAD + LINDDUN Workflow

Thin wrapper that invokes the `threat-model` skill from
`skills/security/threat-model/`. The skill:

1. Reads the task file or feature description
2. Walks through STRIDE categories (Spoofing, Tampering, Repudiation,
   Info disclosure, DoS, Elevation)
3. Computes DREAD risk score for each finding
4. Runs LINDDUN privacy analysis when PII is touched
5. Outputs `TM-{TASK-ID}.md` in `docs/security/threat-models/`
6. Updates task file's `## Security Considerations` section with summary

## What this command may write — closed list

The limit is this list, not a missing tool:

1. `docs/security/threat-models/TM-{TASK-ID}.md` — the threat model itself;
2. the **threat-model registry** (`docs/security/threat-models/index.md` or the
   project equivalent) — one row per TM, plus the counter in its heading;
3. the `## 🔒 Security Pre-Analysis` section in the matching task file under
   `project-orchestration/tasks/`.

Nothing else — no file under `src/`, no ADR, no new task, no commit. `Bash` is
for read-only recon (`grep`, `sed -n`, `ls`, `git diff`); it is not a write path.

> **Why `Edit` and `Bash` are allowed (change 2026-08-14).** They were denied,
> and the denial blocked the skill's own mandatory steps: 7a' (add the row to the
> registry) and 7b (insert `## 🔒 Security Pre-Analysis` into the task file) are
> both edits to existing files. `Write` stayed open the whole time, so the gate
> protected nothing — it only forced a choice between overwriting a registry
> wholesale and skipping it, which is precisely the silent drift
> `patterns/cross-layer/registry-drift-guard-pattern.md` describes. The real
> guard is the closed list above plus `check-delegation` on source files.

## When to use

Use BEFORE implementing any feature that:
- Adds or modifies an authentication / session flow
- Processes new categories of PII (email, location, payment, government IDs)
- Crosses bounded context boundaries (cross-context integration)
- Adds a public-facing API endpoint
- Touches data retention / anonymization

## When NOT to use

- Pure refactor with no new attack surface
- Internal-only utility changes
- Test-only changes

## Related

- `/security-review` — full STRIDE/DREAD/LINDDUN review of existing code (post-impl)
- `/security-check` — quick ad-hoc audit on specific code
- `/incident` — incident triage for already-deployed CRITICAL findings
- Skill source: `skills/security/threat-model/SKILL.md`

---

Invoke skill: `threat-model`
