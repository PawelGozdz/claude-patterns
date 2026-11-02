---
id: DEV-agent_note-baza-listy-plikow-bramki-koncowej-head-4a7d63d96
status: promoted
resolution: >
  ORC-147 (prepare ostrzega o commitach taska w historii i podaje git diff --name-only; baza
  zostaje HEAD, bo od niej liczą się commity agentów i baseline konformancji) oraz ORC-145
  (plik testowy w remisie dirs idzie do warstwy testowej, więc poprawka testu po bramce
  końcowej nie trafia do warstwy bez praw do testów). 2026-10-31.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-30
last_seen: 2026-10-30
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-agent_note-baza-listy-plikow-bramki-koncowej-head-4a7d63d96

## Occurrences

- 2026-10-30 juz-ide-api-3 (TS-GEO-DISTANCE-BUCKETS-001) run `wf_6a791027-041` warstwa `final-gate` — Baza listy plików bramki końcowej = HEAD 4a7d63d96, czyli pierwszy commit tego samego taska; czerwone testy Tablicy z tego commitu wyszły dopiero z raportu. Baza powinna być punktem rozgałęzienia taska. Dodatkowo runda naprawcza kieruje poprawki testów do warstwy bez uprawnień do testów (infrastructure:profile-api), a nie do warstwy testing.
