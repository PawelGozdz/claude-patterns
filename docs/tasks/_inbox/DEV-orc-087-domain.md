---
id: DEV-orc-087-domain
status: promoted
resolution: >
  Zebrane w TASK-ORCH-IMPLEMENTER-FILE-DELETE-001 (2026-10-18) razem z DEV-orc-062-application: domain-application-implementer ma disallowedTools: Bash (świadomie), więc nie usuwa plików i zostawia tombstone `export {}`. Zadanie ma trzy hipotezy (wąski Bash dla git rm, pole deleted_files z mechanicznym krokiem, wykrywanie tombstone) i kryteria ukończenia.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-087
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-087-domain

## Occurrences

- 2026-10-18 juz-ide-api-1 (TS-SEC-BLOCK-CACHE-001) run `wf_87219140-ded` warstwa `domain` — Implementer nie ma narzędzia do usuwania plików: zostawia tombstone 'export {}' (block-cache.port.ts, block-cache-write-through.handler.ts + 2 specy); orkiestrator domyka git rm po przebiegu. Pusty spec vitest = 'No test suite found'.
