---
id: DEV-orc-044-final-gate
status: promoted
resolution: >
  Karta repository-pattern_summary RP3 (2026-10-28) mówi teraz, że w BaseKyselyRepository
  juz-ide dispatch następuje przed UPDATE wiersza (super.save() przed persistAggregateData,
  base-kysely.repository.ts:228-232), więc pole zmienione przez agregat musi jechać w
  payloadzie zdarzenia. Odtworzone na obecnym kodzie juz-ide-api-1.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-044
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-044-final-gate

## Occurrences

- 2026-10-25 juz-ide-api-1 (TS-SEC-SP-LOCATION-001) run `wf_60c8fe8d-ac3` warstwa `final-gate` — Karty repository-pattern RP3 i transactional-outbox OB1 mowia tylko, ze dispatch jest przed COMMIT. W tym repo BaseKyselyRepository.save wysyla zdarzenia nawet przed UPDATE wiersza (super.save() przed persistAggregateData, base-kysely.repository.ts:228-232): handler zdarzenia czyta stan sprzed zmiany (stad stary expiresAt markera). Zadne z kart nie ostrzega, ze kazde pole zmienione przez agregat w tym samym wywolaniu musi jechac w zdarzeniu.
