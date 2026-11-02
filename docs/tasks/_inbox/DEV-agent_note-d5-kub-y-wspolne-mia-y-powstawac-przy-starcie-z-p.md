---
id: DEV-agent_note-d5-kub-y-wspolne-mia-y-powstawac-przy-starcie-z-p
status: dismissed
dismissed_reason: >
  Bramka końcowa wykryła rozjazd decyzji D5 z kodem (kubły wspólne leniwie, z maxGlobalBuckets
  i odmową saturated, zamiast przy starcie z polityki). To jej zadanie: człowiek rozstrzyga,
  czy poprawić kod, czy decyzję. Silnik działa poprawnie. 2026-10-31.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-31
last_seen: 2026-10-31
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-d5-kub-y-wspolne-mia-y-powstawac-przy-starcie-z-p

## Occurrences

- 2026-10-31 ai-gateway (TS-AIG-112) run `wf_58338cfa-689` warstwa `final-gate` — D5: kubły wspólne miały powstawać przy starcie z polityki, a kod tworzy je leniwie z limitem maxGlobalBuckets i odmową saturated
