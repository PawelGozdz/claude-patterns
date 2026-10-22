---
id: DEV-orc-066-domain
status: promoted
resolution: >
  Sprzeczność była realna (2026-10-22): IBusinessPolicy.check() z @vytches/ddd-policies zawsze zwraca
  Promise<Result<T, PolicyViolation>>, a DS5/N2 zakazywały async w domain service, DS6 kazał składać politykę
  w serwisie. Karta domain-service-pattern_summary.md: DS5/N2 dopuszczają jedyny await na policy.check()
  (metoda async, zwraca Promise<Result>), szkielet poprawiony; te same przykłady poprawione w
  domain-service-pattern.md i specification-policy-pattern.md (sync check()/result.passed nie istnieje w
  bibliotece, jest isFailure/error).
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-066
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-066-domain

## Occurrences

- 2026-10-22 juz-ide-api-2 (TS-GEO-HOME-POINT-001) run `wf_4fd27c1a-9bf` warstwa `domain` — Reguły DS5 (domain-service) i NP2 (named-policy) przeczą sobie dla PolicyBuilder.check() (async) w serwisie domenowym sync
