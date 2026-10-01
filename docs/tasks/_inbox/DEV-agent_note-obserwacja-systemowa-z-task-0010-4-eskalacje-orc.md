---
id: DEV-agent_note-obserwacja-systemowa-z-task-0010-4-eskalacje-orc
status: promoted
resolution: >
  Naprawione 2026-09-27 jako ORC-072 (docs/decisions/orchestrate-rule-history.md#orc-072):
  buildFinalGatePrompt() renderuje teraz a.task.decisions (istniejący kanał, dotąd nie
  wyrenderowany tutaj) tym samym formatem co buildImplPrompt(). Człowiek może teraz dopisać
  decyzję adresującą trywialną pozycję unverified_scope do decisions: w analizie; kolejny
  resume tego taska ją zobaczy na bramce końcowej. Sugestia z tego zgłoszenia (kanał
  analogiczny do layer.scope.reason) zrealizowana dokładnie tak, jak zaproponowano.
trigger: agent_note
rule_ref: null
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - feature-flags
---

# DEV-agent_note-obserwacja-systemowa-z-task-0010-4-eskalacje-orc

## Occurrences

- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `final-gate` — Obserwacja systemowa z TASK-0010 (4 eskalacje ORC-069 w jednym przebiegu, 2 na bramce końcowej): dla warstwy per-jednostkę istnieje mechanizm wstrzyknięcia kontekstu zadania do promptu weryfikatora (units[].reason z artefaktu analizy -> layer.scope.reason -> scopeBlock() w orchestrate.template.mjs) — dopisanie tam jawnej decyzji ('to jest N/A, nie unverified_scope') realnie odblokowuje kolejną próbę. Dla bramki końcowej (buildFinalGatePrompt) TAKIEGO mechanizmu NIE MA: prompt dostaje tylko checks/changedFiles/dirtyAtStart/a.patterns (karty wzorców), nigdy decisions[] ani żadną notatkę specyficzną dla zadania. Skutek: gdy finalGate agent (jednorazowy, bez retry, GO+unverified_scope wymuszone na NO_GO) trafi na coś trywialnego (README.md, .gitignore, sam plik analizy), NIE ma sposobu, żeby operator /orchestrate to naprawił inaczej niż ręczną interwencją człowieka na końcu — w przeciwieństwie do warstw, gdzie ta sama klasa problemu ma wbudowaną ścieżkę naprawy. Sugestia do rozważenia: dodać do buildFinalGatePrompt analogiczny kanał (np. a.task.finalGateNotes z artefaktu analizy) albo złagodzić 'GO+unverified_scope zawsze NO_GO' na bramce końcowej dla pozycji jawnie oznaczonych jako dotyczące plików niefunkcjonalnych/dokumentacyjnych.
