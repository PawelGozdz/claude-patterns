---
id: DEV-agent_note-weryfikator-bramki-uruchomi-kroki-ci-spoza-listy
status: promoted
resolution: >
  Ten sam root cause co DEV-orc-056 — naprawione 2026-09-26: format:check/validate:br:api/
  build dodane do final_gate.checks w marketing-hub/.claude/blocks/layers-monorepo.yml.
trigger: agent_note
rule_ref: null
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-agent_note-weryfikator-bramki-uruchomi-kroki-ci-spoza-listy

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_83d565e9-cc8` warstwa `final_gate` — Weryfikator bramki uruchomił kroki CI spoza listy (format:check, validate:br, build) — finalGate.checks z runtime.yml nie pokrywa CI; tymczasowy spec-sonda utworzony i usunięty w drzewie.
