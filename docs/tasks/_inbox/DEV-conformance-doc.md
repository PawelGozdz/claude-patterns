---
id: DEV-conformance-doc
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: CONFORMANCE-DOC
first_seen: 2026-11-14
last_seen: 2026-11-14
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-conformance-doc

## Occurrences

- 2026-11-14 juz-ide-api-2 (TS-TOOLING-NO-THROW-ACL-ADAPTERS-001) — Karta application-handlers.md (sekcja Enforcement) opisuje bramkę tools/conformance (CH-NO-THROW/CH-NO-BULLMQ); zadanie TS-TOOLING-NO-THROW-DOMAIN-ACL-001 zanotowało jej brak w analizie, a dziś tools/conformance/check.mjs działa jako ratchet w /orchestrate. Sprawdzić, czy opis w karcie odpowiada stanowi i czy reguły adaptera ACL (no-throw) też powinny wejść do bodyRules.
