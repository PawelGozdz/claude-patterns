---
id: DEV-orc-062-site-model
status: dismissed
dismissed_reason: >
  Konfiguracja projektu (3.1), nie silnik. Lint: eslint.config.js w juz-ide-blog dostał override
  no-console off dla scripts/** (2026-10-20, eslint . kończy się kodem 0; wcześniej 35 błędów
  poza zakresem warstwy). Build: node_modules/.vite/deps jest root-owned po dev-serwerze w
  kontenerze, naprawa po stronie projektu (sudo chown -R dev:dev node_modules/.vite, kontener
  może założyć katalog jako root od nowa).
trigger: blocked_by_prior
category: lint
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - juz-ide-blog
---

# DEV-orc-062-site-model

## Occurrences

- 2026-10-20 juz-ide-blog (BLOG-GUIDES-001) run `wf_2c9d353e-1e6` warstwa `site:model` — sonda lint (eslint . z korzenia) czerwona od bazowego stanu repo: 35 błędów no-console w scripts/ poza zakresem warstwy; warstwa implementuje poprawnie, ale nie ma jak zazielenić sondy ani bramki końcowej. Dodatkowo build: EACCES na node_modules/.vite/deps (root-owned przez dev-serwer w kontenerze).
