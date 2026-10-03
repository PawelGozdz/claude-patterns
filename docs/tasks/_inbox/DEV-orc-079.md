---
id: DEV-orc-079
status: promoted
resolution: >
  Naprawione jako ORC-089 (2026-10-02): filterOwnTaskArtifacts dopasowuje też po samej nazwie pliku.
trigger: no_go
rule_ref: ORC-079
first_seen: 2026-10-02
last_seen: 2026-10-02
occurrences: 1
projects:
  - ai-gateway
---

# DEV-orc-079

## Occurrences

- 2026-10-02 ai-gateway (TS-AIG-043) run `wf_1dd26808-11c` — Bramka końcowa NO_GO (cause machine) wyłącznie z unverified_scope: pozycja o nieprzeczytanym pliku analizy TS-AIG-043.analysis.md (podana samą nazwą pliku, nie ścieżką), więc filtr ścieżki artefaktów zadania jej nie złapał
