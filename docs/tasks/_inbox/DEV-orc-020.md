---
id: DEV-orc-020
status: promoted
resolution: >
  Naprawione od ręki jako ORC-113: create_when jest regexem po haystacku taska i analizy.
  Bloki astro-content (site, content) i library-layers (api-surface) przepisane na regex,
  README bloków i schemat opisują kontrakt, orchestrate-prepare ostrzega przed opisem prozą
  (docs/decisions/orchestrate-rule-history.md#orc-113). clean-arch (application) warunkuje
  warstwę polem strukturalnym i wymaga decyzji autora bloku.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-020
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - juz-ide-blog
---

# DEV-orc-020

## Occurrences

- 2026-10-20 juz-ide-blog (BLOG-GUIDES-001) run `wf_2c9d353e-1e6` — orchestrate-prepare.mjs:644 traktuje create_when jako regex (new RegExp(create_when,'i').test(haystack)), a blok astro-content definiuje je jako zdanie po polsku; wszystkie warstwy optional dostają createWhenHits=false i są SKIPPED, bramka końcowa ocenia puste drzewo (NO_GO). Obejście: --overrides createWhenHits.
