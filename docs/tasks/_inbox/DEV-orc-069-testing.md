---
id: DEV-orc-069-testing
status: proposed
trigger: no_go
rule_ref: ORC-069
first_seen: 2026-10-01
last_seen: 2026-10-01
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-069-testing

## Occurrences

- 2026-10-01 ai-os-bot (BOT-W4-012) run `wf_81697f4b-7d7` warstwa `testing` — Bramka końcowa NO_GO (cause=machine): GO z niepustym unverified_scope — nie uruchomiono test:integration (brak żywego Postgresa/TEST_POSTGRES_URL), weryfikator przeczytał tylko linie 1-130 ragRetriever.integration.test.ts i ragRetriever.test.ts tylko grepem. Jednorazowa bramka bez retry.
