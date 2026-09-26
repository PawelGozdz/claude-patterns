---
id: DEV-no_go-final-gate-no-go-l2-spec-049-rate-cards-constrain
status: proposed
trigger: no_go
rule_ref: null
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - grant-flow
---

# DEV-no_go-final-gate-no-go-l2-spec-049-rate-cards-constrain

## Occurrences

- 2026-09-26 grant-flow (TS-RATE-003-rate-card-per-role) run `wf_67a3ef00-81f` — Final gate NO_GO: L2 spec 049-rate-cards-constraints.integration.spec.ts seeds two companies with the same fixed test NIP, so the per-company-not-per-tenant assertion (D11) never runs (unique NIP constraint fires first, deterministic). Also flagged: missing composite FK tying rate_card_entries to rate_cards (tenant_id+company_id), and domain layer only delivered VOs/errors/shared temporal kernel — RateCard aggregate, RateCardEntry entity, domain events and repository ports were never implemented, so application/infrastructure-acl/authorization-catalog units could not proceed.
