---
id: DEV-orc-014-modules-parser
status: promoted
resolution: >
  ORC-151 (2026-11-03): prompt sondy mapował wynik komendy na pole po nazwie (lint, tsc, mypy,
  test…), a `ruff check` nie pasował do żadnego, więc sonda oddawała skipped dla wszystkich
  checks mimo EXIT:0. Mapowanie nazywa teraz linter i runner testów, a wykonana komenda nie
  dostaje skipped. Przebiegu sondy nie odtworzyłem, wniosek z lektury mapowania;
  materializacja w pcu wykonana.
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: ORC-014
first_seen: 2026-11-02
last_seen: 2026-11-02
occurrences: 1
projects:
  - pcu
---

# DEV-orc-014-modules-parser

## Occurrences

- 2026-11-02 pcu (TASK-062) warstwa `modules:parser` — sonda ślepa: dla warstw modules:parser, modules:service, interfaces:api, interfaces:cli sonda zgłosiła wszystkie checks jako skipped (checks to złożona komenda git ls-files | grep | xargs ruff), choć ruff w bramce końcowej działa (EXIT:0)
