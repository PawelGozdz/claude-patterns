---
id: DEV-agent_note-ws2-refine-spa-web-security-invariants-pattern-md
status: promoted
resolution: >
  Karta refine-spa/web-security-invariants (WS2): dowodem odrzucenia mutacji bez uprawnienia
  jest L3 przeciw realnemu API/bramie albo test guarda po stronie API; L3 na mocku bramki
  dowodzi tylko, że UI nie omija bramy i pokazuje odmowę. Zadanie wyłącznie webowe wskazuje
  test API (plik/zadanie), a brak odesłania to luka unverified_scope, nie naruszenie.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - marketing-hub
---

# DEV-agent_note-ws2-refine-spa-web-security-invariants-pattern-md

## Occurrences

- 2026-10-22 marketing-hub (TS-MH-026) run `wf_5fc73b06-5a8` warstwa `final` — WS2 refine-spa/web-security-invariants-pattern.md nie rozstrzyga, czy L3 web na mocku bramki spełnia 'API odrzuca mutację bez uprawnienia' ani czy dowód żyje w tasku web czy API
