---
id: DEV-orc-082-application
status: promoted
resolution: >
  Naprawione jako ORC-090 (2026-10-03): layerOwnsPath dopasowuje ścieżki
  względne pakietu i pełne dirs późniejszych warstw.
trigger: blocked_by_prior
rule_ref: ORC-082
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 2
projects:
  - grant-flow
reopened_at: 2026-10-03
reopened_from_status: promoted
resolution_2: >
  Drugie wystąpienie (grant-flow TS-TIME-READALL-001) naprawione jako ORC-093 (2026-10-03): właściciel pliku po specyficzności dopasowania, katch-all w domain nie przejmuje cudzych plików.
---

# DEV-orc-082-application

## Occurrences

- 2026-10-03 grant-flow (TS-TIME-READALL-001) run `wf_5ef0c74e-e85` warstwa `application` — ORC-082 nie odroczył czerwonego typechecku: warstwa application BLOCKED_BY_PRIOR, bo błędy leżą w infrastructure (późniejsza warstwa). Wcześniej domain: ENOENT w sondzie + szerokie dirs 'apps/api/src/' (layerOwnsPath).
- 2026-10-03 grant-flow (TS-UI-004) run `wf_2d364675-d1f` warstwa `application` — typecheckRedIsLaterLayers: tsc zwraca sciezki wzgledem pakietu (src/app/api/...), a dirs warstw maja prefiks apps/api/ — layerTouches (indexOf) nie trafia, wiec odroczenie czerwieni do pozniejszej warstwy nie dziala w monorepo; obejscie: dopisac wariant wzgledny do dirs
