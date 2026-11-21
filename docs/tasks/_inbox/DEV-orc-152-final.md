---
id: DEV-orc-152-final
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: ORC-152
first_seen: 2026-11-20
last_seen: 2026-11-20
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-152-final

## Occurrences

- 2026-11-20 juz-ide-api-3 (TS-ARCH-REQUIRE-USERID-NE-001) run `wf_c60aa525-04a` warstwa `final` — Plik kart reguł bramki końcowej (cards-__all.md, 1288 linii, ok. 39,9 tys. tokenów) przekracza limit 25 tys. tokenów narzędzia Read; polecenie jednego Read bez offset/limit jest niewykonalne, drugie wywołanie zjada budżet 20 wywołań bramki. Rozważyć podział kart na pliki poniżej limitu albo dopuścić dwa Read.
