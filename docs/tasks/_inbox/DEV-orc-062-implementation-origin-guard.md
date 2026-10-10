---
id: DEV-orc-062-implementation-origin-guard
status: proposed
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-10-09
last_seen: 2026-10-09
occurrences: 1
projects:
  - ai-gateway
---

# DEV-orc-062-implementation-origin-guard

## Occurrences

- 2026-10-09 ai-gateway (TS-AIG-073) run `wf_4facde5d-58b` warstwa `implementation:origin-guard` — Warstwa implementation z checks [typecheck,lint,test] dostała GO mimo czerwonego src/architecture.test.ts (BANNED_IDS: allowedHosts w transport-guards.ts); wznowienie z --overrides nie wymusiło naprawy, testing BLOCKED_BY_PRIOR drugi raz

## Analiza (2026-10-10)

Dziennik `wf_4facde5d-58b` to tylko przebieg końcowy (wznowienie): implementation i docs-card pominięte z `layers_done`, testing GO po 2 próbach, bramka końcowa GO z lukami. Pierwszych przebiegów brak w dzienniku. Warstwa implementation miała `checks: [typecheck, lint]` bez `test`, więc czerwony `architecture.test.ts` był dla niej niewidoczny (zgodnie z projektem: testy należą do testing). ORC-103 dopisał do komunikatu BLOCKED_BY_PRIOR wskazanie wcześniejszej warstwy-właściciela i podpowiedź o `layers_done`. Otwarte: czy silnik ma sam otwierać wcześniejszą warstwę po BLOCKED_BY_PRIOR (zmiana kontraktu, decyzja człowieka).
