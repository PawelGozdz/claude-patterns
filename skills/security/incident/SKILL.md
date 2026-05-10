---
name: incident
description: Incident response classifier and playbook navigator. Classifies security incidents as P0/P1/P2, routes to the appropriate playbook steps, and generates incident log. Use when a potential security issue is detected in production or staging.
origin: LocalHero-patterns
allowed-tools: Read, Write
effort: low
disable-model-invocation: true
---

# Incident Response — Classifier and Playbook

## Step 1: Classify the Incident

Answer each question. Stop at the first YES — that is the incident priority.

| Question | If YES → |
|----------|---------|
| Could PII of more than 100 people have been exposed or exfiltrated? | **P0** |
| Is the platform or a critical service channel currently unavailable? | **P0** |
| Is there confirmed privilege escalation in production? | **P0** |
| Is there a suspected exploit or data leak affecting fewer than 100 people, without confirmation? | **P1** |
| Is there a high-severity CVE in a production dependency without active exploitation? | **P2** |
| Is there a compliance gap or misconfiguration discovered without active exploitation? | **P2** |

If none of the above apply, re-examine the issue — it may be a non-incident bug or a medium security finding that belongs in the backlog.

---

## P0 Playbook — Critical Incident

**P0 = Confirmed or likely data breach, platform outage, or confirmed privilege escalation in production.**

### T+0 to T+10 min — CONFIRM

- Verify this is a real incident, not a false positive from monitoring
- Identify the initial indicator: alert, user report, anomalous log entry
- Name an Incident Commander (IC) — the single person coordinating response
- Do not attempt to fix anything yet — contain first

### T+10 to T+15 min — DECLARE

- Notify Tech Lead and Founders immediately (call or instant message, not email)
- Open a dedicated incident channel (e.g., `#inc-YYYYMMDD-slug` on Slack/Discord)
- Record the declaration time in the incident log
- Assign roles: IC, comms lead (external communication), technical lead (investigation)

### T+15 to T+45 min — CONTAIN

- Block the affected account, endpoint, or service — whichever stops active exploitation
- Take a snapshot of logs to immutable storage before any remediation (logs may be overwritten)
- If the vector is an endpoint: add a circuit breaker or temporary 503 response
- If credentials were exposed: rotate them immediately, then investigate
- Do not delete evidence — snapshot, then act

### T+45 min to T+3h — ASSESS

- Determine the scope: how many users affected, what data, what time window?
- Query audit logs for the affected user IDs and time range
- Determine whether the attack is ongoing or contained
- Document findings in the incident log in real time

### By T+72h — NOTIFY DATA PROTECTION AUTHORITY (if GDPR breach)

- If personal data of EU residents was involved and the breach meets the Art. 33 GDPR threshold (likely to result in risk to rights and freedoms), notify the relevant data protection authority within 72 hours of becoming aware
- Prepare the notification: nature of breach, categories and approximate number of data subjects, likely consequences, measures taken
- Consult legal counsel before submitting if time permits

### T+3h to T+24h — ERADICATE

- Deploy the fix: patch, configuration change, or permission revocation
- Write a regression test that would have caught the issue
- Deploy to staging, verify the fix, then deploy to production
- Confirm the attack vector is closed

### T+24h to T+48h — RECOVER

- Restore any affected data from backups if needed
- Lift emergency blocks applied during CONTAIN
- Monitor for recurrence over the next 24 hours
- Communicate resolution to affected users if required

### T+14 days — POSTMORTEM

- Blameless postmortem with the full team
- Five-whys root cause analysis
- Corrective actions with owners and deadlines
- Update runbooks and threat models based on findings
- Save postmortem as `docs/security/incidents/INC-{YYYYMMDD}-{slug}-postmortem.md`

---

## P1 Playbook — High Severity

**P1 = Suspected exploit or small-scope data exposure, unconfirmed. No evidence of ongoing mass breach.**

| Step | Target Time | Action |
|------|------------|--------|
| ASSESS | T+30 min | Investigate the indicator; determine if exploit is confirmed or suspected |
| CONTAIN | T+4h | If confirmed, apply targeted block; if unconfirmed, add monitoring |
| FIX | T+24h | Patch the vulnerability; write regression test; deploy |
| REVIEW | T+7 days | Lightweight postmortem; update threat model if applicable |

---

## P2 Playbook — Medium Severity

**P2 = CVE without active exploitation, misconfiguration, or compliance gap discovered.**

| Step | Action |
|------|--------|
| DOCUMENT | Record the finding in `docs/security/` with CVE ID or description |
| SCHEDULE | Add a task to the next sprint backlog with the finding as context |
| FIX | Implement the fix in the scheduled sprint |
| VERIFY | Confirm the fix with `pnpm audit --prod` or a specific test |

---

## Step 2: Generate Incident Log

Create the incident log file at:

```
docs/security/incidents/INC-{YYYYMMDD}-{slug}.md
```

Use this structure:

```markdown
# INC-{YYYYMMDD}-{slug}

| Field | Value |
|-------|-------|
| Date | {YYYY-MM-DD} |
| Classification | P0 / P1 / P2 |
| Incident Commander | {name} |
| Status | ACTIVE / CONTAINED / RESOLVED |
| Summary | One sentence describing the incident |

## Timeline

| Time | Step | Action | By |
|------|------|--------|----|
| {HH:MM} | CONFIRM | | |
| {HH:MM} | DECLARE | | |
| {HH:MM} | CONTAIN | | |
| {HH:MM} | ASSESS | | |
| {HH:MM} | ERADICATE | | |
| {HH:MM} | RECOVER | | |

## Scope

- Users affected: {number or unknown}
- Data categories: {list PII categories if applicable}
- Time window: {start} to {end}
- Systems involved: {list}

## Root Cause

> To be filled in during postmortem

## Corrective Actions

| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| | | | OPEN |

## GDPR Notification

- Art. 33 threshold met: YES / NO / UNDER ASSESSMENT
- DPA notification submitted: YES / NO / N/A
- Notification date: {date or N/A}
- Users notified (Art. 34): YES / NO / N/A
```
