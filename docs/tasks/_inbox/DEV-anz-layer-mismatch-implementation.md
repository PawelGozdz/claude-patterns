---
id: DEV-anz-layer-mismatch-implementation
status: dismissed
dismissed_reason: >
  Brak osobnej warstwy na pracę dokumentacyjną to decyzja bloku/projektu (jak w DEV-anz-layer-mismatch-engine). Jednostka docs idzie do warstwy implementation z dirs poza src/ (units, ANL-038) i tak działa w ai-gateway TS-AIG-102 (docs-annex).
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - ai-gateway
---

# DEV-anz-layer-mismatch-implementation

## Occurrences

- 2026-10-21 ai-gateway (TS-AIG-081a) warstwa `implementation` — Brak warstwy na pracę dokumentacyjną (aneks ADR, TM, karta INV, KANBAN): runtime.yml ma implementation (dirs: src/) i testing; jednostka docs idzie do implementation z dirs poza src/
