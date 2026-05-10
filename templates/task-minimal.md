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

<!-- 1-2 sentences: what changes, why -->

## ✅ Acceptance Criteria

- [ ] <!-- criterion -->
- [ ] Tests pass

---

<!--
This is the MINIMAL task template (Level 1) — for typos, doc updates,
comment changes, pure refactor without logic changes, label-only edits.

If the task touches authentication, PII, payment, cross-context, public
API, or new bounded context, use templates/task-standard.md (Level 2)
or templates/task-security-first.md (Level 3) instead.

Hook check-security-considerations.js auto-detects level from labels +
title. To force minimal level on a task that hook would otherwise classify
as security-relevant, add this as the first line of the task file:

  # security-level: minimal
-->
