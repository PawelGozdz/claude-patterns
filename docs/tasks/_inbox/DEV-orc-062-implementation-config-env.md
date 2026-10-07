---
id: DEV-orc-062-implementation-config-env
status: promoted
resolution: >
  Naprawione jako ORC-098b (dirs-pliki, remis późniejszych warstw) i ORC-099 (odroczenie czerwonych testów do późniejszych warstw), 2026-10-04.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-10-04
last_seen: 2026-10-04
occurrences: 1
projects:
  - ai-gateway
---

# DEV-orc-062-implementation-config-env

## Occurrences

- 2026-10-04 ai-gateway (TS-AIG-082) run `wf_ac6d228b-319` warstwa `implementation:config-env` — Jednostki config-env i registry/testing wzajemnie zależne (zmiana Config z D1 psuje registry.ts, a potem ~36 testów w 15 plikach); ORC-082/093 nie odracza czerwieni w obrębie tej samej warstwy ani dirs będących plikami; 2 halty z rzędu (typecheck, potem testy).
