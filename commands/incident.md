---
name: incident
description: |
  Incident response triage workflow. Use ONLY when verification finds a
  CRITICAL severity issue affecting deployed code (post-deployment incident),
  not for pre-merge review.

  Examples:
    /incident PII leak in logs detected in production
    /incident rate limit bypass observed in monitoring
    /incident triage finding from security-e2e-verifier (DREAD ≥ 12)

  Usage: /incident <description of finding or symptom>

tools: Read, Glob, Grep, Bash, Skill
disallowedTools: Write, Edit, MultiEdit, NotebookEdit
---

# /incident — Security Incident Triage

Thin wrapper that invokes the `incident` skill from
`skills/security/incident/`. The skill walks through:

1. **Severity classification** — CRITICAL / HIGH / MEDIUM / LOW based on
   blast radius, exploitability, and data exposure
2. **Containment** — immediate actions to stop bleeding (rate limit, IP
   block, feature flag off, rollback)
3. **Investigation** — timeline reconstruction, log review, scope assessment
4. **Notification** — internal stakeholders (engineering, legal, comms)
   and regulatory notification timing (GDPR Art. 33: 72h to DPA for
   personal data breach)
5. **Postmortem** — root cause, timeline, action items
6. **Long-term fix** — code change, monitoring, prevention pattern
   (candidate for a new entry in `patterns/cross-layer/security-invariants-pattern.md`)

## When to use

- DREAD score ≥ 12 finding from `security-e2e-verifier` AND code is
  already in production
- Real-time security symptom in monitoring (PII leak, auth bypass,
  rate-limit failure observed)
- Disclosure from external party (security researcher, bug bounty)
- Regulator inquiry

## When NOT to use

- Pre-merge security finding → use `/security-review` instead
- Hypothetical / threat-modeling exercise → use `/threat-model`
- Quick code audit → use `/security-check`

## Related

- `docs/security/INCIDENT_RESPONSE_RUNBOOK.md` (project-level operational
  runbook with escalation contacts, must be filled in per project)
- `/security-review` — pre-merge security validation
- `/threat-model` — pre-implementation analysis
- Skill source: `skills/security/incident/SKILL.md`

---

Invoke skill: `incident`
