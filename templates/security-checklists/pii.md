# PII checklist — augment when task processes personal/sensitive data

> Appended to task when canonical-labels matches `pii` group (PII, GDPR/RODO,
> geo, payment, email, address, government IDs, etc.). Inherits all universal
> items (`security-checklists/universal.md`).

## Lawful basis & DPIA

- [ ] **Lawful basis identified** — RODO Art. 6 (and Art. 9 for special
  categories): contract / consent / legal obligation / legitimate interest /
  vital interest / public task. Documented in task or BUSINESS_RULES.yaml
- [ ] **DPIA assessment** — if processing is "high risk" (Art. 35: large
  scale, sensitive categories, vulnerable subjects, novel tech) →
  DPIA required BEFORE implementation. Otherwise note "no DPIA required
  because [Art. 35 ground]"
- [ ] **Subject rights covered** — Art. 15-22 (access, rectification,
  erasure, restriction, portability, objection) — check that
  implementation supports each (or document why not applicable)

## Data minimization

- [ ] **Only fields needed are collected** — Zod schema declares
  exactly what's needed; no spreading client object
- [ ] **PII not duplicated across contexts** — single source of truth
  per PII field; cross-context lookups via ACL Registry, not data
  duplication
- [ ] **Anonymization on archival** — archived/old records have PII
  replaced with hash or removed entirely (not soft-delete with
  PII intact)

## Storage & retention

- [ ] **Retention policy declared** — `BUSINESS_RULES.yaml` (or
  equivalent) declares: purpose, lawful basis, retention period,
  deletion mechanism
- [ ] **Encryption at rest** — sensitive PII (SSN/PESEL/NIP, payment,
  health) encrypted at column or row level (not just disk-level)
- [ ] **Pseudonymization for analytics** — if PII flows to analytics
  / metrics / logs, it's hashed (HMAC with secret salt) or
  pseudonymized

## Logging & telemetry

- [ ] **No raw PII in logger** — verified by `cross-layer/logger-pattern.md`:
  email → emailHash, IP → first 2 octets, coords → city-level, names → omit
- [ ] **No PII in error messages** — domain errors use opaque codes;
  user-facing messages don't echo input ("Invalid email" not "Invalid
  email john@example.com")
- [ ] **No PII in URLs / query params** — that's logged everywhere
  (proxy, CDN, browser history). Use POST body or path with opaque ID

## Polish-specific (RODO/UODO)

- [ ] **TERYT raw input scrubbed** — only normalized
  municipality_id persisted, raw "Warszawa, ul. ..." discarded
- [ ] **PESEL handled properly** — last digit (control) not used for
  validation by default (privacy attack vector); full PESEL only
  where legally required
- [ ] **NIP/REGON normalized** — strip spaces/dashes before storage
  for consistent matching
- [ ] **GDPR notice covers this processing** — Art. 13/14 — verify
  privacy policy mentions purpose + recipients + retention

## B2G additions (when labels include `b2g`)

- [ ] **Right to access** — implementation supports DSAR (Data Subject
  Access Request) within 30 days (RODO Art. 12); verify export endpoint
- [ ] **Cross-border transfer check** — Schrems II adequacy if any
  processor outside EEA; SCCs in DPA if needed
- [ ] **DPO notification** — DPO informed of new processing activity
  (Art. 39 — DPO maintains record)
