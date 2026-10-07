---
id: DEV-orc-093-implementation-usage-priced
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
  - ai-gateway
---

# DEV-orc-093-implementation-usage-priced

## Occurrences

- 2026-10-04 ai-gateway (TS-AIG-068) run `wf_5f97a101-751` warstwa `implementation:usage-priced` — ownerLayerOf/layerMatchScore pomija scope.dirs będące plikami; w płaskim serwisie (dirs src/) remis 3 warstw = brak właściciela, ORC-082 nie odracza czerwieni testów późniejszej jednostki
