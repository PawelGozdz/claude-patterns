---
name: security-review
description: |
  Complete STRIDE + DREAD + LINDDUN security review for NestJS-DDD code.
  Use before PR merge or when implementing auth, PII handling, cross-context
  integration, or new API endpoints.

  Examples:
    /security-review src/contexts/auth/
    /security-review TS-AUTH-003 implementation
    /security-review PR #142 changes

  Usage: /security-review <path or task or PR reference>

tools: Read, Glob, Grep, Bash, Skill
disallowedTools: Write, Edit, MultiEdit, NotebookEdit
---

# /security-review — Full Security Review

Thin wrapper that invokes the `security-review` skill from
`skills/security/security-review/`. The skill performs:

- **OWASP Top 10 compliance** check on touched code paths
- **STRIDE** threat analysis (Spoofing, Tampering, Repudiation, Info
  disclosure, DoS, Elevation)
- **DREAD** risk scoring for each finding (verdict thresholds: 12+ VETO
  Critical, 9-11 VETO High, 6-8 WARN Medium, ≤5 PASS with note)
- **LINDDUN** privacy analysis when data flow touches PII (Linkability,
  Identifiability, Non-repudiation, Detectability, Disclosure,
  Unawareness, Non-compliance)
- **Code-level pattern checks**: input validation (Zod), auth decorators,
  error mapper, rate limit fail-closed, PII in logs, SQL injection
  prevention, XSS, CSRF

## When to use

- Before PR merge (auth/permission/PII changes)
- After implementing a new bounded context
- After adding cross-context integration
- After a new public-facing endpoint
- Periodic (quarterly) review of critical paths

## When NOT to use

- Initial threat modeling — use `/threat-model` instead (planning-time)
- Quick audit of one function — use `/security-check` (lighter)
- Active incident response — use `/incident` (operational)

## Related

- `/threat-model` — planning-time STRIDE for new features
- `/security-check` — ad-hoc audit on isolated code
- `/incident` — post-deployment incident triage
- Skill source: `skills/security/security-review/SKILL.md`

---

Invoke skill: `security-review`
