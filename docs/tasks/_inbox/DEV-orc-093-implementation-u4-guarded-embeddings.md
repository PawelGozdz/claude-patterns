---
id: DEV-orc-093-implementation-u4-guarded-embeddings
status: promoted
resolution: >
  Naprawione jako ORC-098b (2026-10-04): wpis dirs będący plikiem ma właściciela (dokładne
  dopasowanie, najwyższa ranga), remis samych późniejszych warstw odracza czerwień.
trigger: blocked_by_prior
rule_ref: ORC-093
first_seen: 2026-10-04
last_seen: 2026-10-04
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-093-implementation-u4-guarded-embeddings

## Occurrences

- 2026-10-04 ai-os-bot (BOT-025) run `wf_eb9af99a-179` warstwa `implementation:u4-guarded-embeddings` — layerMatchScore pomija dirs będące plikami (regex rozszerzenia), więc ownerLayerOf zwraca null i typecheckRedIsLaterLayers nie odracza czerwieni od późniejszej warstwy (u5a/u5b mają ten sam plik wikiIndexer.ts w dirs → też remis). Override layers.<u4>.checks=[lint] nie usunął czerwonego typecheck w bramce deterministycznej.
