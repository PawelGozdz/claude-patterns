---
id: DEV-orc-069-infrastructure-infrastructure-persistence
status: promoted
resolution: >
  Naprawione 2026-09-27 jako dodatek do ORC-071 (docs/decisions/orchestrate-rule-history.md#orc-071):
  "owned by domain unit" nie łapało się na wąski regexp "owned by (another|a different)" z
  pierwszej wersji ORC-071 — poszerzone do dowolnej nazwanej jednostki/warstwy przed
  unit/layer/warstw…. Trzecie wystąpienie tego samego kształtu na jednym tasku (grant-flow
  TS-RATE-003) — jeśli pojawi się CZWARTE z inną frazą, następny krok to dopasowanie po
  rzeczywistych id warstw z allLayers, nie kolejny wariant regexu (patrz dodatek w rule-history).
trigger: halt
rule_ref: ORC-069
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-069-infrastructure-infrastructure-persistence

## Occurrences

- 2026-09-27 grant-flow (TS-RATE-003) run `wf_077891da-9ab` warstwa `infrastructure:infrastructure-persistence` — Layer infrastructure:infrastructure-persistence ESCALATE_AND_HALT after 3 attempts (same recurring pattern as domain:domain earlier in this task): attempt 2 was a real, correctly-caught NO_GO (missing RP9 event-map verification test, kysely-rate-card.repository.event-map.spec.ts, per existing repo convention for other Kysely repositories in the same context) — fixed in attempt 3. Attempt 3 verifier then returned GO with unverified_scope listing only items genuinely out of this unit's dirs by design (VO files owned by domain unit, aggregate/entity internals owned by domain unit, cross-checked only via public API surface as expected for an infrastructure-persistence unit). ORC-069 consumed the last retry on this non-issue and escalated. Confirmed on disk: the RP9 test file exists (6000 bytes). Marked infrastructure:infrastructure-persistence as done via layers_done. Third occurrence of this exact ORC-069 shape on this single task — recommend promoting the fix (dirs explicitly owned by another named unit in the same units[] list should not count as unverified_scope for GO purposes) out of 'tylko prompt' into orchestrate.template.mjs's decideVerdict.
