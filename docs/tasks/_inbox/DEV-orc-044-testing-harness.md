---
id: DEV-orc-044-testing-harness
status: promoted
resolution: >
  Przyczyna w zakresie analizy, nie silnika: decyzja D10(b) przenosiła plik, a importerzy leżeli poza dirs
  jednostki, więc agent (ORC-042) importował w miejscu, a przeniesienie wyszło dopiero w rundzie po
  bramce. ANL-038 (commands/analyze.md, 2026-10-22): decyzja przenosząca/przemianowująca/usuwająca eksport
  pliku wymaga w dirs jednostki także importerów. Skutek uboczny (czerwony lint po naprawie) — ORC-121.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-044
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-044-testing-harness

## Occurrences

- 2026-10-22 marketing-hub (TS-MH-022) run `wf_a9e9656e-280` warstwa `testing:harness` — Karta reguł kazała przenieść test/e2e/authorization-fixtures.ts do test/shared (D10 b), ale importerzy w test/e2e/*.e2e.spec.ts leżeli poza zakresem warstwy; implementer zaimportował w miejscu, przeniesienie zrobiła dopiero runda po bramce końcowej i wywołała czerwony lint
