---
id: DEV-orc-139
status: proposed
dismissed_reason: >
  Nieodtworzone 2026-11-02: polecenie sondy hasha (także z wykluczeniami
  silnika) zwraca poprawny hash na repo ai-os-bot, a orchestrate-tree-hash
  --check po przebiegu też działał. Przyczyna pustego tree_hash w 17 wywołaniach
  BOT-045 nieznana (hipotezy: odmowa narzędzia dla podagenta, sandbox). Sonda
  zwraca teraz `error` z powodem (ORC-150); kolejne wystąpienie otworzy rekord z
  przyczyną.
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: ORC-139
first_seen: 2026-11-01
last_seen: 2026-11-09
occurrences: 2
projects:
  - ai-os-bot
  - juz-ide-api-7
reopened_at: 2026-11-09
reopened_from_status: dismissed
---

# DEV-orc-139

## Occurrences

- 2026-11-09 juz-ide-api-7 (TS-GEO-LOCATION-INVENTORY-JSONB-001) — hook stop:format-typecheck (ecc) formatuje pliki po końcu tury agenta i unieważnia hash drzewa po weryfikacji (3 razy w jednym przebiegu: warstwy 1,2,3)
- 2026-11-01 ai-os-bot (BOT-045) run `wf_617071c6-9ef` — Sonda hasha drzewa zwróciła pusty tree_hash ("") w KAŻDYM wywołaniu (17 askErrors, 0 bound / 9 unbound): wiązanie werdyktu z kodem niedostępne w całym przebiegu
