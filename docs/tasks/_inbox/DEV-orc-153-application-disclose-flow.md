---
id: DEV-orc-153-application-disclose-flow
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-153
first_seen: 2026-11-08
last_seen: 2026-11-08
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-153-application-disclose-flow

## Occurrences

- 2026-11-08 juz-ide-api-2 (TS-QJ-CONTACT-DISCLOSURE-001) warstwa `application:disclose-flow` — Handler komendy wstrzykuje porty QUERY (JOB_OFFER_QUERY_REPOSITORY, JOB_REQUEST_QUERY_REPOSITORY) zamiast repo komend; metody ujawnienia wg D6 leżą w portach query, precedens create-job-request i submit-job-offer; karta command-handler nie rozstrzyga
