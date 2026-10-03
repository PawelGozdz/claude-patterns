---
id: DEV-agent_note-deviation-note-implementera-karta-aig-invariants
status: dismissed
dismissed_reason: >
  Dwie rzeczy po stronie ai-gateway, nie silnika: (1) karta edytowana w trakcie przebiegu — prepare czyta karty raz na starcie, to nieuniknione, nowy przebieg widzi nową wersję; (2) brak aig-invariants_summary.md — prepare już ostrzega, projekt ma napisać kartę streszczenia. Do obserwacji, jeśli powtórzy się rozjazd bez edycji w trakcie przebiegu.
trigger: agent_note
rule_ref: null
first_seen: 2026-10-02
last_seen: 2026-10-02
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-deviation-note-implementera-karta-aig-invariants

## Occurrences

- 2026-10-02 ai-gateway (TS-AIG-060) run `wf_ded380db-f10` warstwa `implementation` — deviation_note implementera: karta aig-invariants.md wstrzyknięta do promptu była starszą wersją niż plik na dysku (INV-C11, D8, E9, R1 dopisane w trakcie przebiegu); karta nie ma wersji _summary.md, więc idzie pełny plik 13,9 KB (ostrzeżenie orchestrate-prepare).
