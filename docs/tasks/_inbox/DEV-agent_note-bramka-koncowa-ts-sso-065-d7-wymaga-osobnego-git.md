---
id: DEV-agent_note-bramka-koncowa-ts-sso-065-d7-wymaga-osobnego-git
status: dismissed
dismissed_reason: >
  Nie błąd silnika: analiza TS-SSO-065 sama ostrzegała (Ryzyka: praca nad kodem nie powinna
  ruszać z drzewa /opt/projects/iam, jeśli ma tam stać develop, bo Caddy bind-mountuje
  platform/). /orchestrate działa w katalogu, z którego go uruchomiono, więc człowiek odpala
  go z osobnego `git worktree` albo trzyma zmianę Caddyfile poza przebiegiem. Silnik nie wie,
  które drzewo jest bind-mountowane. Przy powtórzeniu rekord otworzy się sam.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - iam
---

# DEV-agent_note-bramka-koncowa-ts-sso-065-d7-wymaga-osobnego-git

## Occurrences

- 2026-10-22 iam (TS-SSO-065-admin-allowlist-sciezek) run `wf_462a8f01-6e5` warstwa `final-gate` — Bramka końcowa TS-SSO-065: D7 wymaga osobnego git worktree dla zmiany platform/Caddyfile, ale /orchestrate działa w jedynym worktree, które Caddy bind-mountuje; niezmergowana zmiana bramy leży w żywym drzewie
