---
id: DEV-aud-runtime-stale
status: dismissed
dismissed_reason: >
  Nieodtwarzalne 2026-10-17: audit-projects.mjs --all nie zgłasza nieaktualnego runtime.yml dla
  juz-ide-api-1, -2 ani -4 (ponowny setup/materializacja).
trigger: setup_drift
sources:
  - audit
rule_ref: AUD-RUNTIME-STALE
first_seen: 2026-10-10
last_seen: 2026-10-16
occurrences: 3
projects:
  - juz-ide-api-4
  - juz-ide-api-2
  - juz-ide-api-1
category: config
---

# DEV-aud-runtime-stale

## Occurrences

- 2026-10-16 juz-ide-api-1 — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-14 juz-ide-api-2 — runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)
- 2026-10-10 juz-ide-api-4 — runtime.yml nieaktualny (brak inputs_hash — rozróżnienie po następnym setupie)
