---
id: DEV-agent_note-brak-prettier-config-js-w-korzeniu-prettier-z-kor
status: promoted
resolution: >
  Część silnika: hook post-edit-typecheck zapisuje marker i .tsbuildinfo w <katalog
  tsconfig>/.claude/run-state/, a szablon .gitignore ignorował tylko korzeń; dodano
  `**/.claude/run-state/` (templates/gitignore-claude.template, setup-project.sh dopisuje go
  do projektów) i wpis w .gitignore grant-flow. Brak prettier.config.js w korzeniu to decyzja
  projektu: root prettier (lint-staged) działa na domyślnych ustawieniach, a styl ma tylko
  apps/api/prettier.config.js. Wymaga wyboru stylu dla apps/web i packages/contracts po
  stronie grant-flow.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-brak-prettier-config-js-w-korzeniu-prettier-z-kor

## Occurrences

- 2026-10-22 grant-flow (TS-UI-009) run `wf_dbfdcd1a-768` warstwa `infrastructure` — Brak prettier.config.js w korzeniu (prettier z korzenia kończy się błędem konfiguracji); packages/contracts/.claude/run-state nie jest w .gitignore
