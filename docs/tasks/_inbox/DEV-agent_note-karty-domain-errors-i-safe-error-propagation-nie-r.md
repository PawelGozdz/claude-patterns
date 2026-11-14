---
id: DEV-agent_note-karty-domain-errors-i-safe-error-propagation-nie-r
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - juz-ide-api
---

# DEV-agent_note-karty-domain-errors-i-safe-error-propagation-nie-r

## Occurrences

- 2026-11-13 juz-ide-api (TS-TOOLING-NO-THROW-DOMAIN-ACL-001) run `wf_d10d6f54-63d` warstwa `final-gate` — Karty domain-errors i safe-error-propagation nie rozstrzygają, że przy zamianie throw→Result.fail klasa błędu (status i kod HTTP) ma pozostać ta sama; dwa przepakowania w SocialAuthError zmieniły 400 i błąd infra na 401. Reguła „nie zamieniaj Result.fail na wyjątek” jest tylko w rules/nestjs-ddd/result-pattern.md.
