---
id: DEV-orc-062-domain
status: promoted
resolution: >
  Naprawione jako ORC-082 (2026-09-30): sonda typecheck odracza czerwień, której wszystkie
  błędy TS leżą w dirs późniejszych warstw (mechanicznie, w CORE szablonu); błędy we własnym
  zakresie, w wcześniejszych warstwach i bez ścieżki nadal blokują. 2026-10-24 juz-ide-api-4
  (TS-MAP-MARKER-PRIVACY-001): sonda typecheck (tsc --noEmit na całym repo) kończyła się OOM,
  EXIT 134, bez błędu TS, a silnik liczył to jako czerwień kodu. ORC-134: prompt sondy każe
  zacząć tail od EXIT:<kod>, a probeCrashed kończy warstwę od razu jako ESCALATE cause=machine
  z podpowiedzią NODE_OPTIONS=--max-old-space-size w checks przez --overrides.
trigger: blocked_by_prior
category: typecheck
rule_ref: ORC-062
first_seen: 2026-09-30
last_seen: 2026-10-24
occurrences: 2
projects:
  - juz-ide-api-1
  - juz-ide-api-4
sources:
  - orchestrate
reopened_at: 2026-10-24
reopened_from_status: promoted
---

# DEV-orc-062-domain

## Occurrences

- 2026-10-24 juz-ide-api-4 (TS-MAP-MARKER-PRIVACY-001) run `wf_25c4d6d1-b57` warstwa `domain` — Sonda typecheck (npm run typecheck = tsc --noEmit na całym repo) kończy się OOM (EXIT 134, heap ~4 GB) bez żadnego error TS; warstwa domain dostała BLOCKED_BY_PRIOR z awarii maszyny. Obejście: --overrides z NODE_OPTIONS=--max-old-space-size=8192 w checks.
- 2026-09-30 juz-ide-api-1 (TS-REP-PROJECTION-FRESHNESS-001) run `wf_0dfc8c0b-427` warstwa `domain` — Warstwa domain dodała metodę do portu repozytorium; typecheck czerwony, bo implementacja w infrastructure (późniejsza warstwa) jeszcze nie istnieje. Sonda typecheck warstwy domain nie toleruje portu bez implementacji; implementer 'brak zmian' uruchomił BLOCKED_BY_PRIOR.
