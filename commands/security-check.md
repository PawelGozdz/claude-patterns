---
name: security-check
description: |
  Quick ad-hoc security audit on isolated code changes. Lighter than full
  /security-review — use when reviewing a small diff, single function, or
  one PR file without need for full STRIDE/DREAD/LINDDUN pass.

  Examples:
    /security-check src/contexts/auth/guards/rate-limit.guard.ts
    /security-check git diff
    /security-check changes in last commit

  Usage: /security-check <path or scope>

tools: Read, Glob, Grep, Bash, Skill
disallowedTools: Write, Edit, MultiEdit, NotebookEdit
---

# /security-check — Quick Security Audit

Thin wrapper that invokes the `security-check` skill from
`skills/security/security-check/`. Runs a focused audit covering the
universal NestJS-DDD security invariants:

1. No `userId` in Zod request body schemas (extract from auth context)
2. Every controller endpoint has explicit `@Auth()` or `@Public()`
3. Rate-limit guards fail-closed (503) on backend unavailability
4. No raw `error.message` in HTTP responses
5. No PII in logger calls (email, coordinates, IPs, IDs)

Plus quick checks: input validation, XSS/CSRF, SQL injection, secret
storage in env vars.

## When to use

- Quick sanity check before commit
- Reviewing one file in a PR
- Checking a refactor doesn't introduce regressions

## When NOT to use

- New feature → use `/threat-model` (planning) + `/security-review` (post-impl)
- Full PR review with auth/PII changes → use `/security-review` (heavier, more thorough)
- Active incident → use `/incident`

## Related

- `/security-review` — full STRIDE/DREAD/LINDDUN pass
- `/threat-model` — pre-implementation threat modeling
- `cross-layer/security-invariants-pattern.md` — the 5 universal invariants this skill checks
- Skill source: `skills/security/security-check/SKILL.md`

---

Invoke skill: `security-check`
