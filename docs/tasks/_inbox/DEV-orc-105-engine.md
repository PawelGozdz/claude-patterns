---
id: DEV-orc-105-engine
status: dismissed
dismissed_reason: >
  Zachowanie zamierzone przy podziale na jednostki: testy audit_sink i audit_reader należą do
  jednostki testing, więc sonda testów warstwy engine jest pomijana, a pokrycie 80% i kryteria
  akceptacji sprawdza jednostka testing i bramka końcowa. Ta sama klasa co notatki aegis-flow TS-003
  zamknięte wcześniej.
trigger: agent_note
category: test
sources:
  - orchestrate
rule_ref: ORC-105
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-105-engine

## Occurrences

- 2026-10-20 aegis-flow (TS-017) run `wf_d74fa55a-214` warstwa `engine` — Weryfikator warstwy engine zgłosił brak testów dla nowych modułów (audit_sink, audit_reader) i checks.tests=skipped; testy należą do jednostki testing, więc nie jest to naruszenie warstwy, ale kryterium akceptacji i pokrycie 80% były przez całą warstwę niezweryfikowane, a sonda testów dla warstwy kodu jest pomijana.
