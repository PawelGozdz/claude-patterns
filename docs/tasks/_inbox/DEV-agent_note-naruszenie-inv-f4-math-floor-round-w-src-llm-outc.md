---
id: DEV-agent_note-naruszenie-inv-f4-math-floor-round-w-src-llm-outc
status: dismissed
dismissed_reason: >
  Config analizy (3.1): jednostka llm-signals w TS-AIG-104 nie ma w checks straży
  architektury, a src/llm/outcome-series.ts nie leży w dirs jednostki t-arch. Straż biegnie
  tam, gdzie analiza ją wpisze.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-naruszenie-inv-f4-math-floor-round-w-src-llm-outc

## Occurrences

- 2026-10-28 ai-gateway (TS-AIG-104) warstwa `testing:t-arch` — Naruszenie INV-F4 (Math.floor/round w src/llm/outcome-series.ts) wyszło dopiero w warstwie t-arch, bo warstwa llm-signals nie uruchamia straży architektury; plik był poza zakresem t-arch.
