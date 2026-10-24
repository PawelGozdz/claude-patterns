---
id: DEV-orc-062-application-center-resolution
status: promoted
resolution: >
  ORC-133: przy twierdzeniu „brak zmian” silnik mierzy drzewo; pliki w zakresie warstwy, które
  nie są brudne przed startem ani pracą zamkniętej warstwy, przenoszą warstwę w
  verify-existing z sondą (jak po cichej śmierci implementera), więc ORC-084/100/126 działają.
  Test noop-claim-with-layer-work-already-in-tree-goes-to-verify-existing.
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-062-application-center-resolution

## Occurrences

- 2026-10-24 juz-ide-api-3 (TS-GROUP-REACH-CENTER-001) run `wf_ba525dfb-3ef` warstwa `application:center-resolution` — Wznowienie po halcie: praca warstwy już w drzewie, implementer zgłasza 'brak zmian', gałąź no-op (orchestrate.template.mjs ~1596-1636) puszcza verify-noop z probe=null i w 3. próbie robi ESCALATE cause=machine; ORC-084/ORC-100/ORC-126 nie wykonują się bez sondy. Warstwa nigdy nie dostała sondy w tym przebiegu.
