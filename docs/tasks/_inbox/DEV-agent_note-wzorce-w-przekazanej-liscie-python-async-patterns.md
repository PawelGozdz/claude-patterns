---
id: DEV-agent_note-wzorce-w-przekazanej-liscie-python-async-patterns
status: dismissed
dismissed_reason: >
  Zamknięte w aegis-flow: Settings, dependencies i Dockerfile istnieją, engine/log.py odwołuje
  się do Settings.audit_log_path (TS-020 done). Brak checklisty dla plików konfiguracyjnych w
  karcie scope-invariants to uwaga do wzorca projektu, nie błąd silnika.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-wzorce-w-przekazanej-liscie-python-async-patterns

## Occurrences

- 2026-10-18 aegis-flow (TS-020) run `wf_26f33140-1c4` warstwa `config:project-config` — Wzorce w przekazanej liście (python/async-patterns.md, fastapi-patterns.md, layered-architecture-pattern.md, testing-pattern.md) nie dotyczą warstwy samej konfiguracji (YAML, Makefile, requirements), a karta scope-invariants nie ma checklisty dla plików konfiguracyjnych. Poza zakresem, do zgłoszenia: engine/log.py:9 nadal wskazuje workspace/audit_log.jsonl, a app/settings.py, app/dependencies.py i Dockerfile jeszcze nie istnieją, choć Makefile już się do nich odwołuje (coverage --fail-under i init-audit-volume).
