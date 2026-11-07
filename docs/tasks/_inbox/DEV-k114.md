---
id: DEV-k114
status: proposed
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: K114
first_seen: 2026-11-07
last_seen: 2026-11-07
occurrences: 1
projects:
  - claude-patterns
---

# DEV-k114

## Occurrences

- 2026-11-07 claude-patterns (TASK-KAIZEN-002) — Seeding wzorców nie wie nic o blokach: `reseed-patterns.sh` nie taguje chunków polem `blocks`, `retrieve_patterns` nie ma parametru `blocks:`, `knowledge.json` nie dostaje `stack_blocks` (sprawdzone na develop 2026-11-07, w `mcp-server/knowledge-retriever/src` nie ma ani jednego odwołania do bloków poza komentarzem o taksonomii). Problem nr 5 z ADR 0008 zostaje otwarty: projekt na TypeORM może dostać wzorce Kysely. Zakres: odwrotny indeks `blocks/*.yml` → tag `blocks: []` na chunkach z walidacją wiszących ścieżek; parametr `blocks:` w `retrieve_patterns` (boost albo filtr — pytanie OQ2 z ADR 0008); `setup-project.sh` dopisuje `stack_blocks` do `knowledge.json`. Odbiór: zapytanie z projektu TypeORM nie zwraca wzorców Kysely. Wymaga reseedu kolekcji, więc nie na przy okazji. Pochodzenie: F5 zamkniętego TASK-BLOCKS-001.
