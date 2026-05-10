# Threat Model Template
> Copy this file to `docs/security/threat-models/TM-{TASK-ID}.md` and fill it in.
> Trigger: see decision tree in the `/threat-model` skill.
> Skill: `/threat-model` guides you through this file interactively.

---

## Header

| Field | Value |
|-------|-------|
| **TM-ID** | TM-{TASK-ID} (e.g., TM-AUTH-003) |
| **Title** | |
| **Author** | |
| **Date** | |
| **Related task** | TASK-XXX-YYY |
| **Bounded context / feature** | |
| **Status** | DRAFT / IN-REVIEW / APPROVED |
| **Reviewer** | Tech Lead sign-off |

---

## Section 1 — Scope

### In scope
> Which components, endpoints, aggregates, and data flows are we analyzing?

- Aggregate / entity:
- Endpoints:
- Data flows:
- External integrations:

### Out of scope
> What are we explicitly not analyzing, and why?

-

### Actors (who interacts with the system)

| Actor | Trust Level | Description |
|-------|------------|-------------|
| Authenticated User | Medium | Logged-in user with verified identity |
| Anonymous User | Low | Unauthenticated user, access limited to public data |
| Admin / Operator | High | Internal privileged user |
| External System | Low-Medium | External provider (webhook, third-party API) |
| *Add context-specific actors* | | |

### Protected assets (what we are protecting)

| Asset | Classification | Why critical |
|-------|---------------|-------------|
| | PII Sensitive / PII Standard / Confidential / Internal / Public | |

> Classification:
> - **PII Sensitive** — precise location, health, financial, government IDs
> - **PII Standard** — email, display name, phone number
> - **Confidential** — API keys, signing secrets, session tokens
> - **Internal** — logs, metrics, non-PII audit records
> - **Public** — content visible to anonymous users

---

## Section 2 — Data Flow Diagram (DFD)

> Draw data flows in Mermaid. Mark trust boundaries as `subgraph` blocks.
> Required elements: External Entities (users, external systems), Processes (handlers, services),
> Data Stores (database, Redis, cache), Trust Boundaries (subgraphs), Data Flows (labeled arrows).

```mermaid
flowchart TD
    subgraph "Trust Boundary: External (untrusted)"
        USER([Authenticated User])
        ANON([Anonymous User])
        EXT([External System])
    end

    subgraph "Trust Boundary: Application (trusted)"
        CTRL[Controller\n@Auth + @RequirePermissions]
        HANDLER[CommandHandler\n@Transactional]
        DOMAIN[Aggregate / Domain Service]
    end

    subgraph "Trust Boundary: Data Layer (high trust)"
        DB[(PostgreSQL\nPII at rest)]
        REDIS[(Redis\nrate limit / sessions)]
    end

    USER -->|HTTPS — DTO without userId| CTRL
    CTRL -->|Zod-validated DTO| HANDLER
    HANDLER -->|Result<T>| DOMAIN
    DOMAIN -->|Repository.save| DB
    HANDLER -->|Rate limit check| REDIS
    EXT -->|Webhook / callback| CTRL
```

> Add trust boundaries as subgraphs; label flows carrying PII; mark encrypted data stores.

---

## Section 3 — STRIDE Analysis

> For each component or trust boundary in the DFD, analyze STRIDE threats.
> Only mark N/A with explicit justification — do not leave cells blank.

### How to use STRIDE

| Letter | Threat | Question to ask |
|--------|--------|----------------|
| **S** | Spoofing | Can an attacker impersonate a legitimate user or system? |
| **T** | Tampering | Can an attacker modify data in transit or at rest? |
| **R** | Repudiation | Can a user deny an action? Is the action auditable? |
| **I** | Information Disclosure | Can an attacker read data they are not authorized to access? |
| **D** | Denial of Service | Can an attacker prevent legitimate users from using the system? |
| **E** | Elevation of Privilege | Can an attacker gain higher permissions than entitled? |

---

### STRIDE per component

#### Component: [name — e.g., CreateUserHandler]

| Category | Threat | Attack Scenario | Mitigation (exists) | Gap (missing) |
|----------|--------|----------------|-------------------|--------------|
| **S** Spoofing | | | | |
| **T** Tampering | | | | |
| **R** Repudiation | | | | |
| **I** Info Disclosure | | | | |
| **D** DoS | | | | |
| **E** EoP | | | | |

#### Component: [name — e.g., UserProfile table]

| Category | Threat | Attack Scenario | Mitigation (exists) | Gap (missing) |
|----------|--------|----------------|-------------------|--------------|
| **S** | | | | |
| **T** | | | | |
| **R** | | | | |
| **I** | | | | |
| **D** | | | | |
| **E** | | | | |

> Add one block per component or trust boundary in scope.

---

## Section 4 — DREAD Risk Scoring

> For each threat identified in STRIDE, calculate a DREAD score.
> Score = D + R + E + A + D (range 5–15).
> Thresholds: **≥ 12 = Critical**, **9–11 = High**, **6–8 = Medium**, **5 = Low**.

### How to use DREAD

| Letter | Dimension | 1 — Low | 2 — Medium | 3 — High |
|--------|-----------|---------|-----------|---------|
| **D** | Damage | Minimal, no data leak | Data leak < 100 users, limited outage | Sensitive PII leak, platform down, contract loss |
| **R** | Reproducibility | Hard to repeat, special conditions | Repeatable by skilled attacker | Fully reproducible by anyone |
| **E** | Exploitability | Requires deep knowledge / physical access | Requires knowledge + available tools | Public exploit or point-and-click tool |
| **A** | Affected users | < 10 users | 10–1000 users | > 1000 users |
| **D** | Discoverability | Requires source code | Requires active scanning | Publicly visible via recon |

---

### DREAD Risk Register

| TM-ID | Component | Threat (STRIDE ref) | D | R | E | A | D | **Score** | Priority | Owner | Status |
|-------|-----------|---------------------|---|---|---|---|---|-----------|----------|-------|--------|
| TM-XXX-001 | | S: Session spoofing | | | | | | | | | OPEN |
| TM-XXX-002 | | I: PII in error response | | | | | | | | | OPEN |
| TM-XXX-003 | | E: Missing rate limit | | | | | | | | | MITIGATED |

> **Status**: OPEN / IN-PROGRESS / MITIGATED / ACCEPTED (with justification)
> **Priority**: Critical (≥12) / High (9–11) / Medium (6–8) / Low (5)

---

## Section 5 — LINDDUN Privacy Analysis

> LINDDUN complements STRIDE with a privacy dimension — essential for GDPR, DPIA, and data processing reviews.
> Analyze per **data flow** and **data store** from the DFD.
> Mark N/A only with justification; do not skip without reasoning.

### How to use LINDDUN

| Letter | Privacy Threat | Question to ask |
|--------|---------------|----------------|
| **L** | Linkability | Can two pseudonymized records for the same person be linked without identity data? |
| **I** | Identifiability | Can the data, combined with context, re-identify a specific individual? |
| **N** | Non-repudiation | Is the person forced to leave a trace that could be used against them? |
| **D** | Detectability | Can an attacker determine that a specific person exists in the system, even without seeing their data? |
| **D** | Disclosure of information | Can an unauthorized party access private data? |
| **U** | Unawareness | Is the person unaware their data is being processed (missing GDPR Art. 13/14 notice)? |
| **N** | Non-compliance | Does this processing violate GDPR or applicable data protection regulation? |

---

### LINDDUN per data flow / data store

#### Flow/Store: [name — e.g., `user_profiles` table]

| Threat | Applies? | Description | Mitigation (exists) | Gap |
|--------|---------|-------------|-------------------|-----|
| **L** Linkability | YES/NO | | | |
| **I** Identifiability | YES/NO | | | |
| **N** Non-repudiation | YES/NO | | | |
| **D** Detectability | YES/NO | | | |
| **D** Disclosure | YES/NO | | | |
| **U** Unawareness | YES/NO | | | |
| **N** Non-compliance | YES/NO | | | |

#### Flow/Store: [name — e.g., `audit_log data flow`]

| Threat | Applies? | Description | Mitigation (exists) | Gap |
|--------|---------|-------------|-------------------|-----|
| **L** Linkability | | | | |
| **I** Identifiability | | | | |
| **N** Non-repudiation | | | | |
| **D** Detectability | | | | |
| **D** Disclosure | | | | |
| **U** Unawareness | | | | |
| **N** Non-compliance | | | | |

> Add one block per data store and per data flow that handles PII.

### LINDDUN — GDPR obligations triggered

| LINDDUN finding | GDPR obligation | Action |
|----------------|----------------|--------|
| I — high identifiability | Art. 25 — privacy by design | Pseudonymization / data minimization |
| N — forced accountability | Art. 22 — automated decisions | Appeal workflow |
| U — unawareness | Art. 13/14 — transparency | Update privacy notice |
| N — non-compliance | Art. 35 — DPIA | Conduct DPIA before deployment |
| L + I at scale | Art. 35 — DPIA | DPIA mandatory |

---

## Section 6 — Consolidated Risk Register

> Single list of all threats from STRIDE + LINDDUN with priority and status.
> This is the single source of truth — update after every change.

| ID | Methodology | Component | Threat | DREAD Score | Priority | Mitigation | Status | Deadline |
|----|------------|-----------|--------|-------------|----------|-----------|--------|----------|
| TM-XXX-001 | STRIDE-S | | | | Critical | | OPEN | |
| TM-XXX-002 | LINDDUN-I | | | n/a (privacy) | High | | OPEN | |
| TM-XXX-003 | STRIDE-D | | | | Medium | | MITIGATED | |

---

## Section 7 — Mitigations and Implementation Plan

> For every OPEN threat with Critical or High priority — a concrete plan.

### Critical (score ≥ 12 or LINDDUN Non-compliance)

| Threat ID | What to implement | Pattern / ADR | Task | Deadline |
|-----------|------------------|--------------|------|----------|
| TM-XXX-001 | | | | |

### High (score 9–11)

| Threat ID | What to implement | Task | Deadline |
|-----------|------------------|------|----------|
| | | | |

### Accepted risks (ACCEPTED)

> Risks consciously accepted with justification and re-review date.

| Threat ID | Reason for acceptance | Re-review date | Accepted by |
|-----------|----------------------|---------------|------------|
| | | | Tech Lead |

---

## Section 8 — Compliance Checklist (required before APPROVED)

All items must be checked before the threat model moves to APPROVED status.

**STRIDE:**
- [ ] Every component in the DFD has at least 3 STRIDE categories filled in (not just N/A without justification)
- [ ] Every identified threat has a DREAD score
- [ ] No Critical threats remain OPEN without an assigned task and deadline

**LINDDUN:**
- [ ] Every PII data store has a filled-in LINDDUN block
- [ ] Every PII data flow has a filled-in LINDDUN block
- [ ] Non-compliance (N) = YES → DPIA is triggered, or justification for exemption is documented
- [ ] Unawareness (U) = YES → Privacy notice update is scheduled or completed

**GDPR:**
- [ ] Legal basis for processing identified (GDPR Art. 6 / Art. 9)
- [ ] Data retention period and deletion mechanism defined (crypto-shredding or anonymization)
- [ ] If automated decision-making with significant impact → Art. 22 appeal workflow exists or is in task list

**Code:**
- [ ] Identity never accepted from request body (Dual Identity pattern)
- [ ] Rate limiting is fail-closed (returns 503 when backing store is unavailable)
- [ ] Error handling uses safe propagation pattern (infrastructure details do not reach HTTP response)
- [ ] Tier-1 audit event emitted for operations that modify another user's PII or change permissions

---

## Section 9 — Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| TM Author | | | |
| Tech Lead (review) | | | |
| Security Owner / CISO | | | Required if feature involves automated profiling or large-scale PII |

---

## Appendix — Patterns to read before filling in

Before analyzing, read the patterns that govern the area under review. The paths below assume a NestJS/DDD project — adjust to match your project's pattern library location.

| Pattern | Path | When critical |
|---------|------|--------------|
| Dual Identity | `patterns/architecture/dual-identity-pattern.md` | Any handler that receives a userId |
| Golden Rule Endpoints | `patterns/architecture/golden-rule-endpoints.md` | Every new controller |
| Safe Error Propagation | `patterns/cross-layer/safe-error-propagation-pattern.md` | Every error path |
| ACL Registry | `patterns/architecture/acl-registry-pattern.md` | Cross-context calls |
| Domain Errors | `patterns/cross-layer/domain-errors-pattern.md` | Result<T> failure paths |
| Transactional | `patterns/architecture/transactional-pattern.md` | @Transactional handlers |
