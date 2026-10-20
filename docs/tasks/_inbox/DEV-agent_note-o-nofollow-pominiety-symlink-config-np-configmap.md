---
id: DEV-agent_note-o-nofollow-pominiety-symlink-config-np-configmap
status: dismissed
dismissed_reason: >
  Uwaga agenta o kodzie loadera aegis-flow (TS-005, engine:loader): zakaz symlinków i
  walidacja IP to decyzja projektu, nie błąd claude-patterns. Notatka wskazuje sprawę do
  osobnej decyzji człowieka w tamtym repo.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-17
last_seen: 2026-10-17
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-o-nofollow-pominiety-symlink-config-np-configmap

## Occurrences

- 2026-10-17 aegis-flow (TS-005) run `wf_a86615ba-78c` warstwa `engine:loader` — O_NOFOLLOW pominięty (symlink-config np. ConfigMap K8s); zakaz symlinków do osobnej decyzji człowieka. Walidacja IP wąsko: unspecified i multicast dla exact IP.
