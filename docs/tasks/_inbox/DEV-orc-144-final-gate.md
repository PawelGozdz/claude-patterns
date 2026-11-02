---
id: DEV-orc-144-final-gate
status: dismissed
dismissed_reason: >
  Błąd planu w analizie projektu (3.1): D15 pkt 1 (backfill disclosed_point przez
  address_disclosed_points ⋈ user_residences) niewykonalny w SQL, bo tabele nie mają wspólnego
  klucza. Bramka końcowa wykryła to zgodnie z zadaniem; decyzję poprawia człowiek. ORC-144
  skierował poprawki do warstw. 2026-11-02.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-144
first_seen: 2026-11-02
last_seen: 2026-11-02
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-144-final-gate

## Occurrences

- 2026-11-02 juz-ide-api-3 (TS-GEO-HOME-POINT-CONTRACT-001) run `wf_96d04dc9-ee0` warstwa `final-gate` — D15 pkt 1 (backfill disclosed_point w 357 przez address_disclosed_points ⋈ user_residences) niewykonalny w SQL: address_disclosed_points kluczowane address_key_hash, którego user_residences nie ma
