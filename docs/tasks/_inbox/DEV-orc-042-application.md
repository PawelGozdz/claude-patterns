---
id: DEV-orc-042-application
status: promoted
resolution: >
  CH10 (command-handler-pattern_summary.md, 2026-10-22): plik *.module.ts leży poza application/ —
  gdy zakres warstwy go nie obejmuje, agent go nie edytuje (ORC-042), wpisuje w raporcie, że rejestracja
  czeka na warstwę z modułem w zakresie, a weryfikator liczy to jako lukę (unverified_scope), nie jako
  naruszenie CH10. Drugi wątek (port backfill w application/interfaces bez implementacji) to zwykły podział
  na warstwy: implementację dostarcza infrastructure.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-042-application

## Occurrences

- 2026-10-22 juz-ide-api-2 (TS-GEO-HOME-POINT-001) run `wf_4fd27c1a-9bf` warstwa `application` — CH10 wymaga rejestracji handlera w providers modułu poza dirs warstwy application; port backfill w application/interfaces bez implementacji do infra
