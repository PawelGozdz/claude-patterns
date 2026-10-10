---
id: DEV-anz-when-gap
status: proposed
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-WHEN-GAP
first_seen: 2026-10-10
last_seen: 2026-10-10
occurrences: 1
projects:
  - ai-gateway
---

# DEV-anz-when-gap

## Occurrences

- 2026-10-10 ai-gateway (TS-AIG-075) — aig-panel stage threat-model: regex when (auth|pii|...|hop|...) nie zawiera identity/tożsamość; TS-AIG-075 przenosi strażnik tożsamości (requireIdentity) i nie trafia — potraktowane jak trafienie wg ANL-020. Propozycja: dopisać identity|tożsamo do when w .claude/blocks/aig-panel.yml
