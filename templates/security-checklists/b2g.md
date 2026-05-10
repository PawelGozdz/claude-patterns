# B2G checklist — augment when task touches B2G/government surface

> Appended to task when canonical-labels matches `b2g` group (b2g, government,
> civic, public-service, ministry, urzad, samorzad, gmina, kbnr, ksc).
> Inherits universal items + auth + pii + cross-context + accessibility
> (whichever else match).
>
> This is the strictest checklist — applies when serving a government
> entity (urząd, ministerstwo, samorząd) or processing data on their behalf.

## Polish regulatory landscape

- [ ] **KSC (Krajowy System Cyberbezpieczeństwa)** — verify which tier:
  KSC essential vs important. Document in `BUSINESS_RULES.yaml`. Tier
  determines incident notification timing (24h vs 72h)
- [ ] **DZ.U. compliance** — relevant `Dziennik Ustaw` entries for the
  service domain (e.g., DZ.U. 2018 poz. 1668 dla KSC). Linked in task
- [ ] **MC NIST mapping** — if applicable, MC's National Cybersecurity
  Framework references documented
- [ ] **eIDAS** — if e-signing/identity, eIDAS Trust Service requirements
  apply (qualified signatures, qualified certificates)
- [ ] **WCAG dyrektywa** — Dyrektywa Parlamentu Europejskiego 2016/2102
  o dostępności stron i aplikacji mobilnych — verify section 508 / EN
  301 549 mapping

## Audit & retention

- [ ] **Tier-1 audit events for ALL operations** — read access logged
  too (not just write); retained ≥ 5 years
- [ ] **Immutable audit log** — append-only storage; tamper-evident
  (e.g., signed entries or merkle tree)
- [ ] **Audit log access controlled** — separate from operational logs;
  RBAC enforces who can read
- [ ] **Regulator audit interface** — endpoint or export mechanism for
  regulator inspections (UODO, NIK, MC)

## Data sovereignty & processing

- [ ] **Data centers in PL/EU only** — Postgres, Redis, S3, log
  retention all in PL or EU region. No US/non-EU processors without
  Schrems II adequacy + SCCs
- [ ] **Subprocessors disclosed** — list of subprocessors in DPA;
  notification requirement for changes (typical 30 days)
- [ ] **Encryption keys in PL/EU** — KMS region matches data region;
  no cross-border key escrow
- [ ] **No data leaving EU at any point** — including backups,
  analytics, support tools (Datadog/Sentry/etc. configured for EU
  region)

## Identity & access (B2G stricter than B2C)

- [ ] **MFA required for ALL elevated roles** — admin, audyt,
  urzędnik. Not optional
- [ ] **Profil Zaufany / mObywatel integration** — if citizen-facing,
  support PZ as primary auth method (or document why exempt)
- [ ] **Network segmentation** — admin operations from internal
  network only (VPN/IP whitelist), not public internet
- [ ] **Privileged access logging** — every admin/elevated action
  logged with separate severity, alerted in real-time

## Incident response

- [ ] **Incident response plan tested** — link to runbook (e.g.,
  `docs/security/INCIDENT_RESPONSE_RUNBOOK.md`); runbook has been
  exercised in last 6 months
- [ ] **Notification timeline documented** — KSC tier dictates
  timing; UODO notification within 72h for personal data breach
  (RODO Art. 33); regulator (relevant ministry) per service contract
- [ ] **Forensic readiness** — log retention + access patterns
  enable post-incident forensics without alerting attacker

## Documentation deliverables (B2G entry-criteria)

- [ ] **DPIA completed and signed off** — for any processing
  involving personal data
- [ ] **Threat model** — `docs/security/threat-models/TM-{TASK-ID}.md`
  or Domain-level TM, current within last 12 months
- [ ] **Pen-test report** — third-party annually for B2G, plus on
  major architecture changes
- [ ] **Data classification** — every PII field tagged with sensitivity
  + lawful basis + retention; auditable from `BUSINESS_RULES.yaml`

## When to escalate

If you find any item here cannot be satisfied with current architecture,
**stop the task** and raise with security-privacy-architect agent or
real legal counsel. B2G non-compliance carries:
- Service termination from public registry
- UODO fines (up to 2% global revenue or €10M)
- KSC findings → mandatory remediation plan
- Reputational damage with future B2G clients

Better to redesign than to retrofit.
