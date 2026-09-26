---
id: DEV-orc-056
status: promoted
resolution: >
  VETO-2/3 naprawione 2026-09-26: format:check/validate:br:api/build dodane do
  final_gate.checks w marketing-hub/.claude/blocks/layers-monorepo.yml (root package.json
  dostał alias validate:br:api). VETO-1 (brak karty na efekty uboczne komend z guarda +
  wyścig współbieżnego dopisywania do łańcucha) to realna luka w bibliotece wzorców, nie
  błąd silnika ani config — przeniesiona do docs/tasks/TASK-ORCH-PATTERN-GAPS-001.md razem
  z innymi znaleziskami kart wzorców z tego samego przebiegu.
trigger: no_go
rule_ref: ORC-056
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-056

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_83d565e9-cc8` — Bramka końcowa: VETO-1 krytyczny (JIT z guarda dispatchuje komendę na każde żądanie → wpis audytu + wyścig SELECT..FOR UPDATE na głowie łańcucha, 500 przy równoległych) przeszedł przez 15 GO warstw; brak karty na efekty uboczne komend z guarda i współbieżne dopisywanie do łańcucha. VETO-2/3: validate:br i format:check są w CI, a nie w checks warstw.
