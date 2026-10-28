---
id: DEV-orc-064-infrastructure-anchor-residence-application
status: dismissed
dismissed_reason: >
  Treść analizy (3.1): właściciel przepięcia buildera koła w D7/D12 jest decyzją projektu
  juz-ide-api-4, silnik nie ma jak go wskazać. Do rozstrzygnięcia w analizie
  TS-MAP-MARKER-PRIVACY-001.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-064
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - juz-ide-api-4
---

# DEV-orc-064-infrastructure-anchor-residence-application

## Occurrences

- 2026-10-25 juz-ide-api-4 (TS-MAP-MARKER-PRIVACY-001) run `wf_e3c23a53-dd6` warstwa `infrastructure:anchor-residence-application` — D7/D12: target_area w tabelach treści nadal budowane wokół dokładnego adresu (create-job-request handler:930-944); właściciel przepięcia builder-a koła nieustalony w analizie; EventLocation.fromTargetArea bez residenceId
