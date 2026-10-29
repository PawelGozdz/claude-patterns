---
id: DEV-orc-099-testing-l1-new
status: dismissed
dismissed_reason: >
  Nieodtwarzalne 2026-10-29: src/shared/geo w juz-ide-api-4 daje 15 plików i 225 testów
  zielonych; czerwień guardianów pochodziła ze stanu drzewa (ten sam objaw w api-2:
  DEV-orc-062-testing-test-cc). ORC-082/099 odraczają tylko czerwień wyłącznie z późniejszych
  jednostek i są zachowawcze przy mieszanej czerwieni oraz pliku bez właściciela; poluzowanie
  bez drugiego przypadku z innej przyczyny osłabiłoby halt.
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ORC-099
first_seen: 2026-10-29
last_seen: 2026-10-29
occurrences: 1
projects:
  - juz-ide-api-4
---

# DEV-orc-099-testing-l1-new

## Occurrences

- 2026-10-29 juz-ide-api-4 (TS-GEO-ADDRESS-LOOKUP-001) run `wf_edd86ee6-df9` warstwa `testing:l1-new` — Warstwa testowa stanęła na mieszanej czerwieni (typecheck+test) pochodzącej z plików późniejszych jednostek oraz pliku bez właściciela (src/shared/geo guardiany, czerwone na develop); ORC-082/099 nie odraczają przy mieszanej czerwieni ani przy pliku bez właściciela. Obejście: layers.<id>.checks tylko typecheck na pośrednich warstwach testowych + jednostka repair dla guardianów.
