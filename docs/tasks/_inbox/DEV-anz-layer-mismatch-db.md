---
id: DEV-anz-layer-mismatch-db
status: proposed
trigger: analyze_note
category: plan
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-15
last_seen: 2026-10-15
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-anz-layer-mismatch-db

## Occurrences

- 2026-10-15 framework-polityczny (FP-003) warstwa `db` — FP-003 (szkielet monorepo): runtime.yml orchestrate.layers nie ma warstwy na korzeń repo (package.json, tsconfig, eslint, depcruise), scripts/ ani docs/; warstwa testing ma dirs test/ i __tests__/, a testy tego taska leżą w scripts/ i obok kodu pakietów; lint nie jest w żadnej bramce (layers.checks ani final_gate). Obejście: units z tooling podpiętym do warstwy db (pierwsza w kolejności).
