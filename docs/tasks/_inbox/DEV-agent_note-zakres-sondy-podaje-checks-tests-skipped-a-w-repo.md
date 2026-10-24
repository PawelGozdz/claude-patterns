---
id: DEV-agent_note-zakres-sondy-podaje-checks-tests-skipped-a-w-repo
status: dismissed
dismissed_reason: >
  Zamknięte w aegis-flow: app/__main__.py, app/settings.py i Dockerfile istnieją po warstwie
  API (TS-020 done, merge 1a4671e). Luka dotyczyła kolejności warstw w jednym tasku, nie
  silnika.
trigger: agent_note
category: test
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-zakres-sondy-podaje-checks-tests-skipped-a-w-repo

## Occurrences

- 2026-10-18 aegis-flow (TS-020) run `wf_26f33140-1c4` warstwa `workers:container` — Zakres sondy podaje checks.tests=skipped, a w repo nie ma jeszcze app/__main__.py ani app/settings (CMD obrazu `python -m app` i marker /etc/aegis/allow-public-bind nie mają odbiorcy), więc zgodność kodu z Dockerfile jest niezweryfikowana. Zakres leży w warstwie API.
