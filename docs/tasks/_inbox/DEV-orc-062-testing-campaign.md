---
id: DEV-orc-062-testing-campaign
status: dismissed
dismissed_reason: >
  Zbadane 2026-09-27 — ta konkretna warstwa (testing:campaign) to NIE jest przypadek ORC-073
  (gubienie błędu w tail): implementer poprawnie zidentyfikował naruszenia jako preexisting i
  poza zakresem (git status --short pusty dla tych plików) — no-op prawdziwy, ORC-062 zadziałał
  zgodnie z projektem. To DRUGA warstwa tego samego taska (testing:knowledge,
  DEV-orc-062-testing-knowledge.md) faktycznie ujawniła błąd silnika — tu working as intended.
  Decyzja właściciela warstwy shared/security nadal potrzebna w marketing-hub, poza zakresem
  claude-patterns.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-testing-campaign

## Occurrences

- 2026-09-27 marketing-hub (TS-MH-006) run `wf_d18e2e0e-4a0` warstwa `testing:campaign` — Sonda testing:campaign na czerwono (lint:check:api ERR_PNPM, 7 błędów), implementer twierdzi że wszystkie naruszenia leżą w plikach spoza zakresu warstwy (apps/api/src/shared/response|security|validation/*, apps/api/test/shared/*) i są preexisting (git status --short pusty dla tych plików). Zgodnie z ORC-062 nie weryfikowano twierdzenia no-op — przebieg zatrzymany, decyzja właściciela warstwy shared/security potrzebna.
