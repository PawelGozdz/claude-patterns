---
id: DEV-orc-062-testing-guardians
status: promoted
resolution: >
  ANL-053, uzupełnienie (2026-10-30): reguła obejmuje usunięcie i przemianowanie pola DTO,
  modelu odczytu lub schematu. Grep po nazwie pola, każdy trafiony plik ma właściciela w
  jednostce, domain i application przed infrastructure (api-3 TS-GEO-DISTANCE-BUCKETS-001:
  martwe distanceMeters w group.dto.ts i i-neighborhood-group.repository.ts nie miało
  jednostki, guardian no-metric-distance czerwony, ORC-062 zatrzymał przebieg poprawnie).
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-29
last_seen: 2026-10-29
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-062-testing-guardians

## Occurrences

- 2026-10-29 juz-ide-api-3 (TS-GEO-DISTANCE-BUCKETS-001) run `wf_0fa06f59-dbd` warstwa `testing:guardians` — BLOCKED_BY_PRIOR na testing:guardians: group.dto.ts:112 (application) i i-neighborhood-group.repository.ts:132 (domain) w community-communication niosa martwe distanceMeters (D10), a unit groups obejmuje tylko src/app/api/groups/ i groups-schemas.ts; guardian no-metric-distance czerwony
