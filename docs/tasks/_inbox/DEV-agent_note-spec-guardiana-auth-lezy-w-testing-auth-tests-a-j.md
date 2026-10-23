---
id: DEV-agent_note-spec-guardiana-auth-lezy-w-testing-auth-tests-a-j
status: dismissed
dismissed_reason: >
  Luka zakresu analizy TS-SEC-D0-FOLLOWUPS-001, nie silnika: spec guardiana leży w jednostce
  testing:auth-tests, a jednostka auth-mapper wymaga wywołania findDuplicateErrorClassNames.
  ANL-038 każe dopisać do dirs jednostki pliki towarzyszące spoza katalogu; tu trzeba było
  dodać spec do auth-mapper albo uporządkować kolejność. Do poprawy w analizie przez
  człowieka.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-agent_note-spec-guardiana-auth-lezy-w-testing-auth-tests-a-j

## Occurrences

- 2026-10-22 juz-ide-api-1 (TS-SEC-D0-FOLLOWUPS-001) run `wf_25230deb-cc6` warstwa `infrastructure:auth-mapper` — Spec guardiana auth leży w testing:auth-tests, a jednostka mappera wymaga wywołania findDuplicateErrorClassNames — zależność międzywarstwowa bez właściciela.
