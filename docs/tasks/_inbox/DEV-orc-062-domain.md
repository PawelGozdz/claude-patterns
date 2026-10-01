---
id: DEV-orc-062-domain
status: promoted
resolution: >
  Naprawione jako ORC-082 (2026-09-30): sonda typecheck odracza czerwień, której wszystkie
  błędy TS leżą w dirs późniejszych warstw (mechanicznie, w CORE szablonu); błędy we własnym
  zakresie, w wcześniejszych warstwach i bez ścieżki nadal blokują.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-30
last_seen: 2026-09-30
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-062-domain

## Occurrences

- 2026-09-30 juz-ide-api-1 (TS-REP-PROJECTION-FRESHNESS-001) run `wf_0dfc8c0b-427` warstwa `domain` — Warstwa domain dodała metodę do portu repozytorium; typecheck czerwony, bo implementacja w infrastructure (późniejsza warstwa) jeszcze nie istnieje. Sonda typecheck warstwy domain nie toleruje portu bez implementacji; implementer 'brak zmian' uruchomił BLOCKED_BY_PRIOR.
