---
id: DEV-aud-setup-incomplete
status: proposed
dismissed_reason: >
  2026-11-03: vytches-ddd nadal niekompletny (brak agentów library-api-guardian
  i library-quality-verifier); wymaga decyzji właściciela. 2026-11-02:
  juz-ide-api-3 naprawione (materialize-runtime: kanon wskazywał BDR-122 sprzed
  przenumerowania). vytches-ddd nadal niekompletny (brak agentów
  library-api-guardian i library-quality-verifier w .claude/agents); wymaga
  decyzji właściciela, bo projekt ma niezacommitowane zmiany w blokach.
  Nieodtwarzalne 2026-10-17: audit-projects.mjs --all nie zgłasza niekompletnego
  setupu w juz-ide-mobile-app. 2026-10-24: setup niekompletny juz-ide-api-1
  ustąpił po materialize-runtime; audit-projects bez błędów.
trigger: setup_drift
category: config
sources:
  - audit
rule_ref: AUD-SETUP-INCOMPLETE
first_seen: 2026-10-14
last_seen: 2026-11-04
occurrences: 6
projects:
  - juz-ide-mobile-app
  - juz-ide-api-1
  - juz-ide-api-3
  - vytches-ddd
reopened_at: 2026-11-04
reopened_from_status: dismissed
---

# DEV-aud-setup-incomplete

## Occurrences

- 2026-11-04 vytches-ddd — verify-project-setup: setup niekompletny (✗ setup niekompletny)
- 2026-11-03 vytches-ddd — verify-project-setup: setup niekompletny (✗ setup niekompletny)
- 2026-11-02 vytches-ddd — verify-project-setup: setup niekompletny (✗ setup niekompletny)
- 2026-11-02 juz-ide-api-3 — verify-project-setup: setup niekompletny (✗ setup niekompletny)
- 2026-10-22 juz-ide-api-1 — verify-project-setup: setup niekompletny (✗ setup niekompletny)
- 2026-10-14 juz-ide-mobile-app — verify-project-setup: setup niekompletny (✗ setup niekompletny)
