---
id: DEV-orc-044-testing-scenarios
status: dismissed
dismissed_reason: >
  Luka wiedzy projektu, nie silnika: karty wzorców dobiera się po tagach i keywordach, a marketing-hub nie
  ma karty dla testów mutacyjnych bramy Caddy ani dla vendorowanych fixtur (stub, Caddyfile). Weryfikator
  ocenił te pliki na ogólnej jakości, zgodnie z założeniem. Karta ma sens dopiero przy drugim takim
  zadaniu; wtedy patterns-local/ projektu albo wzorzec testing/ (Scope: project-specific).
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-044
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-044-testing-scenarios

## Occurrences

- 2026-10-22 marketing-hub (TS-MH-022) run `wf_a9e9656e-280` warstwa `testing:scenarios` — Zestaw kart wstrzyknięty dla warstwy testing (testy L3 bramy Caddy) jest niemal w całości DDD/domain/application/web; brak kart dla testów mutacyjnych bramy i vendorowanych fixtur (stub, Caddyfile) — oceniane na ogólnej jakości
