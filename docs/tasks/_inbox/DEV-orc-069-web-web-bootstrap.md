---
id: DEV-orc-069-web-web-bootstrap
status: proposed
trigger: halt
rule_ref: ORC-069
first_seen: 2026-10-01
last_seen: 2026-10-01
occurrences: 2
projects:
  - grant-flow
---

# DEV-orc-069-web-web-bootstrap

## Occurrences

- 2026-10-01 grant-flow (TS-UI-003) run `wf_1cdf1136-3b9` warstwa `web:web-bootstrap` — web:web-bootstrap: drugi przebieg z rzedu, GO z unverified_scope po 3 probach; lista niezweryfikowanych plikow inna niz w wf_b5e7727d-cfe (37 plikow w jednej warstwie, weryfikator nie pokrywa calosci)
- 2026-10-01 grant-flow (TS-UI-003) run `wf_b5e7727d-cfe` warstwa `web:web-bootstrap` — web:web-bootstrap: GO z niepustym unverified_scope po 3 probach (AuthGate, RedirectToSignIn, AppLayout, memoized-fetch(.spec), auth-provider.spec, App.spec, vitest.config, test/setup); verifier powtarzal luke zamiast ja domknac
