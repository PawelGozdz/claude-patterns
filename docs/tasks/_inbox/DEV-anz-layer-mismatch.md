---
id: DEV-anz-layer-mismatch
status: proposed
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-12
last_seen: 2026-10-12
occurrences: 1
projects:
  - ai-gateway
---

# DEV-anz-layer-mismatch

## Occurrences

- 2026-10-12 ai-gateway (TS-AIG-094) — aig-panel: when: slotów threat-model i ai-specialist zawiera 'budget', ale nie polską formę 'budżet'; task TS-AIG-094 (budżet) trafił tylko przez 'LLM'/'cost' — regex do uzupełnienia o 'budżet|koszt'
