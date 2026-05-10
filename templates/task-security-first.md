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

<!-- 2-3 sentences: what business outcome, who is affected, why now -->

---

## 🔒 Security Pre-Analysis

<!--
This section MUST be completed before status: in-progress (hook enforces this
for security-relevant tasks based on labels).

Three options:
  1. Run /threat-model {TASK-ID}  ← recommended for auth/PII/cross-context
  2. Reference existing Domain TM: docs/security/threat-models/TM-CONTEXT-{name}.md
  3. Embedded: fill in this section directly (for simple tasks)
-->

**Granularity decision:**
- [ ] Domain TM (new bounded context) → see `docs/security/threat-models/TM-CONTEXT-{name}.md`
- [ ] Feature TM (cross-context) → see `docs/security/threat-models/TM-{TASK-ID}.md`
- [ ] Embedded (single context, simple feature) → fill below

**STRIDE assessment** (when embedded):

| Category | Concern? | Mitigation |
|----------|----------|------------|
| **S**poofing | | |
| **T**ampering | | |
| **R**epudiation | | |
| **I**nfo disclosure | | |
| **D**oS | | |
| **E**levation | | |

**Data touched:**
- PII categories: <!-- email, phone, location, payment, gov-id (PESEL/NIP), ... or "none" -->
- Lawful basis (RODO Art. 6): <!-- contract / consent / legal obligation / legitimate interest / public task / vital interest / N/A -->
- DPIA required: <!-- yes (Art. 35 high-risk grounds: ...) / no (rationale) -->

**External surface:**
- New endpoint(s): <!-- list or "none" -->
- Cross-context calls: <!-- list ACL Registry uses or "none" -->
- Rate limit tier: <!-- e.g., "100 req/min per user" or "N/A" -->

**B2G readiness check (always):**
- Audit event tier: <!-- Tier 1 (mandatory) / Tier 2 / Tier 3 / N/A -->
- Data residency: <!-- PL / EU / outside (with rationale) -->
- KSC tier impact: <!-- essential / important / N/A -->

---

## 🏗️ Domain Model

<!--
Filled AFTER security pre-analysis — domain decisions should reflect threat
model findings (e.g., if pseudonymization is a mitigation, VOs reflect that).
-->

### Bounded context
<!-- which existing context, or "new context: <name>" -->

### Aggregates
<!-- list with brief description -->

### Value Objects
<!-- list — note any privacy-preserving designs (HashedEmail, PseudonymizedId, ...) -->

### Domain Events
<!-- list — note Tier-1 audit events (with @AuditTrail decorator or equivalent) -->

### Specifications / Policies
<!-- list — including authorization policies (PolicyBuilder.must) -->

---

## 📋 Implementation Checklist

<!--
Auto-augmented by hook based on labels. The hook reads canonical-labels.yml
and dorzuca relevant checklist files (universal.md, auth.md, pii.md, etc.)
to this section.

DO NOT delete the "Universal" section — it's always present.
Sections below "Universal" are added based on label matches.

To opt out of auto-augmentation: add `# security: skip` at top of task file.
-->

### Universal (always — claude-patterns/security-checklists/universal.md)

#### 5 NestJS-DDD invariants
- [ ] No `userId` in Zod request body schemas
- [ ] Every controller method has `@Auth()` or `@Public()`
- [ ] Rate-limit guards fail-closed (503 when backend down)
- [ ] No `error.message` / `error.stack` in HTTP responses
- [ ] No PII in logger calls

#### B2G-readiness (always-on)
- [ ] Audit trail emitted (Tier-1 event, correlation_id)
- [ ] Data sovereignty confirmed (PL/EU storage)
- [ ] DPIA awareness (linked or rationale why N/A)
- [ ] Polish regulatory check (PESEL/NIP/REGON normalized if used)

<!-- Augmented sections will be inserted below by hook based on labels -->

### Project (juz-ide-api LH-specific)

<!-- Loaded from .claude/knowledge/patterns/security/lh-checklist.md -->
- [ ] BUSINESS_RULES.yaml updated (if domain rule added/changed)
- [ ] ADR-0027 audit event emitted for sensitive operations
- [ ] DPIA referenced in `## 🔒 Security Pre-Analysis` (if PII)

### Task-specific

<!-- Generated from /threat-model output, or filled manually -->
- [ ] ...

---

## ✅ Acceptance Criteria

- [ ] <!-- functional criterion -->
- [ ] <!-- functional criterion -->
- [ ] All checklist items above checked
- [ ] /security-review src/contexts/{context}/ run with PASS verdict (no VETO)
- [ ] Tests pass at L1 (unit), L2 (integration), L3 (E2E)

---

## 🔗 Related

<!-- ADRs, threat models, related tasks, BUSINESS_RULES sections -->
- ADR-XXXX: ...
- TM: ...
- Blocks: TS-...
- Blocked by: TS-...
