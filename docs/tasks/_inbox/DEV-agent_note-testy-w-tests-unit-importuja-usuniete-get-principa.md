---
id: DEV-agent_note-testy-w-tests-unit-importuja-usuniete-get-principa
status: dismissed
dismissed_reason: >
  Zachowanie zamierzone: stare testy importują symbole usuwane w tej zmianie, a przepisuje je jednostka testing:auth-tests (kolejna w planie TS-003). Uruchomienie testów w warstwie api-wiring nie miało sensu przed tą jednostką; sprawdza je jednostka testing i bramka końcowa.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-testy-w-tests-unit-importuja-usuniete-get-principa

## Occurrences

- 2026-10-20 aegis-flow (TS-003) run `wf_0a0766cf-6dd` warstwa `api:auth-wiring` — Testy w tests/unit importują usunięte get_principal/LOCAL_ACTOR_ID/websockets.manager; przepisuje je testing:auth-tests; uruchomienie testów w tej warstwie niezweryfikowane.
