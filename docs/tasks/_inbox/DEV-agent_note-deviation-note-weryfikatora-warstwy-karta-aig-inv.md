---
id: DEV-agent_note-deviation-note-weryfikatora-warstwy-karta-aig-inv
status: dismissed
dismissed_reason: >
  Kolejność jednostek w jednym przebiegu (ai-gateway TS-AIG-092): karta aig-invariants.md i
  healthcheck.compose.test.ts należały do innych jednostek, więc w chwili weryfikacji danej
  warstwy ich nie było. Bramka końcowa dała GO; cudze zakresy obsługują ORC-070 i ORC-093.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-15
last_seen: 2026-10-15
occurrences: 4
projects:
  - ai-gateway
---

# DEV-agent_note-deviation-note-weryfikatora-warstwy-karta-aig-inv

## Occurrences

- 2026-10-15 ai-gateway (TS-AIG-092) warstwa `testing:tests-healthcheck` — deviation_note weryfikatora warstwy: karta aig-invariants.md i plik healthcheck.compose.test.ts należą do innych jednostek tego samego przebiegu, więc w chwili weryfikacji tej warstwy jeszcze ich nie było (kolejność jednostek, nie wada kodu); bramka końcowa dała GO
- 2026-10-15 ai-gateway (TS-AIG-092) warstwa `testing:tests-host` — deviation_note weryfikatora warstwy: karta aig-invariants.md i plik healthcheck.compose.test.ts należą do innych jednostek tego samego przebiegu, więc w chwili weryfikacji tej warstwy jeszcze ich nie było (kolejność jednostek, nie wada kodu); bramka końcowa dała GO
- 2026-10-15 ai-gateway (TS-AIG-092) warstwa `implementation:docs-card` — deviation_note weryfikatora warstwy: karta aig-invariants.md i plik healthcheck.compose.test.ts należą do innych jednostek tego samego przebiegu, więc w chwili weryfikacji tej warstwy jeszcze ich nie było (kolejność jednostek, nie wada kodu); bramka końcowa dała GO
- 2026-10-15 ai-gateway (TS-AIG-092) warstwa `implementation:host-list` — deviation_note weryfikatora warstwy: karta aig-invariants.md i plik healthcheck.compose.test.ts należą do innych jednostek tego samego przebiegu, więc w chwili weryfikacji tej warstwy jeszcze ich nie było (kolejność jednostek, nie wada kodu); bramka końcowa dała GO
