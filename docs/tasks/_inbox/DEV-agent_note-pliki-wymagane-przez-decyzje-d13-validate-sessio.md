---
id: DEV-agent_note-pliki-wymagane-przez-decyzje-d13-validate-sessio
status: promoted
resolution: >
  ORC-128: orchestrate-prepare ostrzega o plikach kodu wskazanych w decyzjach
  (choice/rationale), które istnieją w repo, a nie leżą w dirs ani layers_scope żadnej
  uruchamianej warstwy lub jednostki.
trigger: agent_note
category: verifier
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-23
last_seen: 2026-10-23
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-agent_note-pliki-wymagane-przez-decyzje-d13-validate-sessio

## Occurrences

- 2026-10-23 juz-ide-api-1 (TS-SEC-D0-FOLLOWUPS-001) run `wf_55e719bb-e5a` warstwa `application:sessions-svc` — Pliki wymagane przez decyzję (D13: validate-session/handler.ts, security.config.ts; D4: stała Retry-After w guardzie i mapperze) nie miały właściciela w analizie; wyszło dopiero z bramki końcowej i weryfikatorów, kosztem 2 dodatkowych przebiegów. Prepare nie ostrzega o plikach z decyzji bez jednostki
