---
id: DEV-cs11
status: promoted
resolution: >
  Karty controller-schema_summary (CS11) i zod-schema-validation_summary (ZOD6) dostały zastrzeżenie
  zakresu (2026-10-28): reguła dotyczy repo ze współdzielonym authorSnapshotSchema (obecnie juz-ide-api-*),
  jak CS12 dla Idempotency-Key. Odtworzone: authorSnapshotSchema występuje tylko w juz-ide-api-1..4;
  marketing-hub trzyma płaskie decidedBy, bo subject z iam jest nieprzezroczysty.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: CS11
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - marketing-hub
---

# DEV-cs11

## Occurrences

- 2026-10-28 marketing-hub (TS-MH-028) — Karty CS11 (controller-schema) i ZOD6 wymagają zagnieżdżonego authorSnapshotSchema dla danych autora; marketing-hub nie ma takiego schematu ani nazw wyświetlanych (subject z iam jest nieprzezroczysty), precedens to płaskie decidedBy w evaluation.schema.ts. Karta potrzebuje zastrzeżenia o zakresie dla repozytoriów bez authorSnapshotSchema.
