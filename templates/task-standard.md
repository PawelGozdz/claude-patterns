---
id: TS-{ID}
title: '{Title}'
type: task
status: planned
priority: P{N}
story_points: {SP}
created_date: {YYYY-MM-DD}
updated_date: {YYYY-MM-DD}
assignee: '@unassigned'
labels: []
---

# TS-{ID} — {Title}

## 🎯 Goal

<!-- 2-3 sentences: what changes, who is affected, why now -->

---

## 🔒 Security Pre-Analysis (embedded — Level 2)

<!--
Embedded analysis — no separate TM file. Use this template for single
security group match (auth OR pii OR public_api OR accessibility) and
single bounded context.

Run /threat-model {TASK-ID} --embedded to populate, OR fill manually below.

For multi-context, payment, B2G, or new bounded context: use
templates/task-security-first.md (Level 3, full Feature TM file) instead.
-->

**Scope:** <!-- 1-2 sentences: what is touched -->
**Lawful basis (if PII):** <!-- RODO Art. 6 ground or "no PII" -->

**STRIDE quick check:**

| | Concern | Mitigation |
|---|---|---|
| **S** Spoofing | | |
| **T** Tampering | | |
| **R** Repudiation | | |
| **I** Info Disclosure | | |
| **D** DoS | | |
| **E** Elevation of Privilege | | |

**Universal invariants reflected in scope:**
- [ ] No `userId` in Zod request body schemas (extract from auth context)
- [ ] `@Auth()` / `@Public()` on every controller method
- [ ] Rate limit fail-closed (503 when backend down)
- [ ] No `error.message` / `error.stack` in HTTP responses
- [ ] No PII in logger calls

**Findings summary:** <!-- 0-2 sentences, e.g., "no critical issues; 1 medium (rate limit not currently fail-closed — fix in scope)" -->

---

## 🏗️ Implementation Notes

<!-- Brief: which files, key decisions. Detailed design only for Level 3 tasks. -->

### Files touched
- `src/...`

### Key decisions

---

## ✅ Acceptance Criteria

- [ ] <!-- functional criterion -->
- [ ] All checklist items in Security Pre-Analysis verified
- [ ] Tests pass at L1 (unit) and L2 (integration)

---

## 🔗 Related

<!-- ADRs, related tasks, BUSINESS_RULES sections -->
