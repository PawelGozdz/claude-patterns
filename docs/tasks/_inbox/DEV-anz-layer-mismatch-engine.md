---
id: DEV-anz-layer-mismatch-engine
status: dismissed
dismissed_reason: >
  Zgodne z projektem silnika: dokumentacja nie ma własnej warstwy. Drobne poprawki docs wykonuje ORC-101 (jedno przejście przed bramką końcową), a większe pliki docs wpisuje się do layers_scope najbliższej warstwy, jak zrobiono w TS-017. Osobna warstwa docs w aegis-flow wymagałaby własnego weryfikatora (domyślny python-quality-verifier nie pasuje do markdownu) i jest decyzją właściciela aegis-flow.
trigger: analyze_note
category: plan
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - aegis-flow
---

# DEV-anz-layer-mismatch-engine

## Occurrences

- 2026-10-20 aegis-flow (TS-017) warstwa `engine` — Task dotyczy też dokumentacji (spec 4D, docs/AUTHORIZATION.md, docs/adr/), a runtime.yml orchestrate.layers nie ma warstwy na docs/; obejście: dopisanie plików docs do layers_scope warstwy engine
