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

tools: Read, Write, Glob, Grep, Skill
disallowedTools: Bash, Edit, MultiEdit, NotebookEdit
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
