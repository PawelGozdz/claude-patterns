---
name: threat-model
description: Interactive threat modeling workflow using STRIDE + DREAD + LINDDUN. Creates TM-{TASK-ID}.md in docs/security/threat-models/. Use before implementing any new bounded context, feature with PII processing, authentication flow, or cross-context integration.
origin: LocalHero-patterns
allowed-tools: Read, Write, Glob, Grep
model: opus
effort: high
disable-model-invocation: true
---

# Threat Modeling Workflow — STRIDE + DREAD + LINDDUN

## When to Use

Follow this decision tree to determine if a threat model is required:

| Scenario | Required? |
|----------|-----------|
| New bounded context | YES — always |
| New PII field added to database | YES — always |
| New authentication / session / OAuth / JWT endpoint | YES — always |
| New cross-context integration | YES — always |
| Automated profiling with a decision affecting the user (GDPR Art. 22) | YES — always + DPIA mandatory |
| New role or permission | YES — always |
| Refactoring existing logic without new data flows | NO |
| Bug fix with no schema or permission changes | NO |
| Documentation update | NO |

If required, continue with the steps below before writing any code.

---

## Step 1: Setup

1. Check whether `docs/security/threat-models/` exists in the project. If not, create the directory.
2. Check whether `docs/security/THREAT_MODEL_TEMPLATE.md` exists. If it does, copy it as `docs/security/threat-models/TM-{TASK-ID}.md` and work from that copy.
3. If the template does not exist, create `docs/security/threat-models/TM-{TASK-ID}.md` using the minimal structure defined in this skill (header + sections 1–9).
4. Replace `{TASK-ID}` with the actual task identifier from the current work (e.g., `TM-AUTH-003`).

---

## Step 2: Scope Definition

Help the developer fill in Section 1 of the threat model document by answering these questions:

**In scope:**
- Which aggregates, entities, or value objects are touched?
- Which endpoints (controller methods) are added or modified?
- Which data flows carry PII (from whom, to where, through what)?
- Which external systems are called or receive data?

**Actors and trust levels:**

| Actor | Trust Level |
|-------|-------------|
| Authenticated User | Medium — authenticated but not privileged |
| Anonymous User | Low — unauthenticated, access limited to public data |
| Admin / Operator | High — internal, privileged |
| External System (webhook, third-party API) | Low-Medium — depends on authentication mechanism |

Add context-specific actors as needed.

**Assets classification:**

| Classification | Examples |
|----------------|---------|
| PII Sensitive | Precise location, health data, financial data, government IDs |
| PII Standard | Email, display name, phone number |
| Confidential | API keys, JWT signing secrets, session tokens |
| Internal | Application logs, metrics, non-PII audit records |
| Public | Published content visible to anonymous users |

---

## Step 3: DFD — Data Flow Diagram

Generate a Mermaid diagram in Section 2 of the threat model. The diagram must include:

- **External entities** (users, external systems) — shown as rounded nodes `([name])`
- **Processes** (handlers, services, controllers) — shown as rectangular nodes `[name]`
- **Data stores** (database tables, Redis, cache) — shown as cylinder nodes `[(name)]`
- **Trust boundaries** — shown as `subgraph "Trust Boundary: name"` blocks
- **Data flows** — arrows labeled with the type of data they carry, highlighting PII flows

Minimal template:

```mermaid
flowchart TD
    subgraph "Trust Boundary: External (untrusted)"
        USER([Authenticated User])
        ANON([Anonymous User])
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
```

Extend with context-specific nodes and flows.

---

## Step 4: STRIDE Analysis

For each component identified in the DFD, analyze all six STRIDE categories. Only mark N/A with an explicit justification — do not leave cells blank.

**STRIDE reference:**

| Letter | Threat | Core question |
|--------|--------|--------------|
| **S** | Spoofing | Can an attacker impersonate a legitimate user or system? |
| **T** | Tampering | Can an attacker modify data in transit or at rest? |
| **R** | Repudiation | Can a user deny having performed an action? Is the action auditable? |
| **I** | Information Disclosure | Can an attacker read data they are not authorized to access? |
| **D** | Denial of Service | Can an attacker prevent legitimate users from using the system? |
| **E** | Elevation of Privilege | Can an attacker gain higher permissions than they are entitled to? |

For each component, fill in a table:

| Category | Threat | Attack Scenario | Mitigation (exists) | Gap (missing) |
|----------|--------|----------------|-------------------|--------------|
| S Spoofing | | | | |
| T Tampering | | | | |
| R Repudiation | | | | |
| I Info Disclosure | | | | |
| D DoS | | | | |
| E EoP | | | | |

Write concrete attack scenarios, not generic descriptions. Example for I (Information Disclosure): "Attacker triggers a validation error that causes the error handler to include the Zod parse result with all submitted field values in the HTTP response body."

---

## Step 5: DREAD Risk Register

For every threat identified in Step 4, calculate a DREAD score and add it to the risk register table.

**DREAD scoring:**

| Dimension | 1 — Low | 2 — Medium | 3 — High |
|-----------|---------|-----------|---------|
| **D** Damage | Minimal, no data leak | Data leak < 100 users, limited outage | Sensitive PII leak, platform down, contract loss |
| **R** Reproducibility | Hard to repeat, special conditions needed | Repeatable by skilled attacker | Fully reproducible by anyone |
| **E** Exploitability | Requires deep knowledge or physical access | Requires knowledge + available tools | Public exploit or point-and-click tool |
| **A** Affected users | < 10 users | 10–1000 users | > 1000 users |
| **D** Discoverability | Requires source code | Requires active scanning | Publicly visible via recon |

Score range: 5–15. Thresholds: **≥ 12 = Critical**, **9–11 = High**, **6–8 = Medium**, **5 = Low**.

Risk register table (sorted Critical → High → Medium → Low):

| ID | Component | Threat (STRIDE ref) | D | R | E | A | D | Score | Priority | Owner | Status |
|----|-----------|---------------------|---|---|---|---|---|-------|----------|-------|--------|
| TM-XXX-001 | | | | | | | | | | | OPEN |

---

## Step 6: LINDDUN Privacy Analysis

For each data store and data flow identified in the DFD that handles PII, fill in a LINDDUN table.

**LINDDUN reference:**

| Letter | Privacy Threat | Question |
|--------|---------------|----------|
| **L** | Linkability | Can two pseudonymized records for the same person be linked without accessing identity data? |
| **I** | Identifiability | Can the data, combined with available context, re-identify a specific individual? |
| **N** | Non-repudiation | Is the person forced to leave a trace that could be used against them? |
| **D** | Detectability | Can an attacker determine that a specific person exists in the system without seeing their data? |
| **D** | Disclosure | Can an unauthorized party read private data? |
| **U** | Unawareness | Is the person unaware their data is being processed (missing GDPR Art. 13/14 notice)? |
| **N** | Non-compliance | Does this processing violate GDPR or applicable data protection law? |

For each data store/flow:

| Threat | Applies? | Description | Mitigation (exists) | Gap |
|--------|---------|-------------|-------------------|-----|
| L Linkability | YES/NO | | | |
| I Identifiability | YES/NO | | | |
| N Non-repudiation | YES/NO | | | |
| D Detectability | YES/NO | | | |
| D Disclosure | YES/NO | | | |
| U Unawareness | YES/NO | | | |
| N Non-compliance | YES/NO | | | |

When **Non-compliance = YES** → DPIA is mandatory before deployment.

GDPR obligations triggered by LINDDUN findings:

| LINDDUN finding | GDPR obligation |
|----------------|----------------|
| I — high identifiability | Art. 25 — privacy by design, pseudonymization |
| N — forced accountability | Art. 22 — automated decision appeal workflow |
| U — unawareness | Art. 13/14 — update privacy notice |
| N — non-compliance | Art. 35 — DPIA before deployment |
| L + I at scale | Art. 35 — DPIA mandatory |

---

## Step 7: Output — TM file + task file update

### 7a. Save the TM file

Save the completed threat model file as `docs/security/threat-models/TM-{TASK-ID}.md`.

### 7b. Update the task file with a canonical reference section (MANDATORY)

Find the related task file in `project-orchestration/tasks/` (matching `{TASK-ID}` prefix). Insert this section at the top of the task body — after the frontmatter and the immediate header lines (Status/Priority/SP/Sprint/Related), before the first content `## ` heading:

```markdown
---

## 🔒 Security Pre-Analysis

**Granularity:** {Domain TM | Feature TM | Embedded}
**TM file:** [`docs/security/threat-models/TM-{TASK-ID}.md`](../../docs/security/threat-models/TM-{TASK-ID}.md)
**Status:** DRAFT — pending Tech Lead sign-off
**Date:** {YYYY-MM-DD}

**Findings summary** (z TM file):
- {N} CRITICAL threats (DREAD ≥ 12) — see TM Sekcja 5
- {M} HIGH threats (DREAD 9–11)
- Mitigations integrated into scope: {list components added/modified}
- Story points adjustment: {+X SP for security components, if any}

**PII categories:** {list — e.g., email, payment_method_id, location} or "none"
**Lawful basis (RODO Art. 6):** {contract / consent / legal obligation / legitimate interest / public task / vital interest / N/A}
**DPIA required:** {YES (Art. 35 grounds: ...) | NO (rationale)}

**Audit trail:** {Tier-1 events emitted per project's audit ADR — list events}
**Data residency:** {PL / EU / outside (with rationale)}

**Universal invariants reflected in scope:**
- {✅/⚠/❌} No `userId` in Zod schemas
- {✅/⚠/❌} `@Auth()` + permissions on every endpoint
- {✅/⚠/❌} Rate limit fail-closed
- {✅/⚠/❌} No `error.message` in HTTP responses
- {✅/⚠/❌} No PII in logger calls

---
```

The exact heading `## 🔒 Security Pre-Analysis` is **load-bearing**: hook `check-security-considerations.js` searches for this (or legacy `## Security Considerations`) to permit `status: in-progress`. Do NOT use translated headings (e.g., `## Wyniki Threat Model` in PL) — those work as a Polish-language summary section but the canonical security gate must be present too.

### 7c. Output to user

Provide a summary with four sections:

**Files updated**
- `docs/security/threat-models/TM-{TASK-ID}.md` (created/overwritten)
- `project-orchestration/tasks/{matching-task-file}.md` (added `## 🔒 Security Pre-Analysis` section)

**Critical Threats** — list all findings with DREAD score ≥ 12. Each must have an assigned task and deadline before the threat model is approved.

**Privacy Risks Requiring DPIA** — list all LINDDUN Non-compliance = YES findings with a note that deployment is blocked until DPIA is completed.

**Recommended Mitigations** — for all High and Critical findings, propose a concrete implementation approach referencing patterns from `.claude/knowledge/patterns/` where applicable.

The threat model status must remain DRAFT until all Critical findings have an assigned task. Status transitions to APPROVED after Tech Lead sign-off.

**Next steps for user:**
- Review the TM file and `## 🔒 Security Pre-Analysis` section in task
- Confirm Granularity and findings with Tech Lead
- After sign-off: status DRAFT → APPROVED in TM file frontmatter
- Task is now ready for `status: in-progress` (hook will pass)
