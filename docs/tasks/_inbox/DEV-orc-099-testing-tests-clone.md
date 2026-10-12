---
id: DEV-orc-099-testing-tests-clone
status: proposed
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-099
first_seen: 2026-10-10
last_seen: 2026-10-10
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-099-testing-tests-clone

## Occurrences

- 2026-10-10 grant-flow (TS-SIM-002B) warstwa `testing:tests-clone` — TS-SIM-002B testing:tests-clone: BLOCKED_BY_PRIOR przez flake wydajnosciowy (<10ms) w email-verification.schemas.spec.ts poza zakresem; plik osobno 35/35 zielony, ale PKGROOT='.' (monorepo) wylaczyl rerun ORC-103 i testsRedIsLaterLayers; obejscie: --overrides layers.testing:tests-clone.tests=false
