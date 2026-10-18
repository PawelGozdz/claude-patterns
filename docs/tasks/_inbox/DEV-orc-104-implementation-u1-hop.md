---
id: DEV-orc-104-implementation-u1-hop
status: promoted
resolution: >
  Naprawione w części jako ORC-105 (2026-10-17): kotwica korzenia repo przypisuje `_root=$(git rev-parse --show-toplevel) || exit 1` i dopiero potem cd, więc poza repo git sonda kończy się exit 1 zamiast biec w cwd (eval: probe-root-anchor-fails-outside-git-repo). NIEZWERYFIKOWANE i nienaprawione: zarzut, że resumeFromRunId po naprawie cwd zwraca wynik z cache (prompt sondy bez zmian, 6 ms). Jeśli wróci na działającym przebiegu, zgłoszenie otworzy się ponownie.
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-104
first_seen: 2026-10-15
last_seen: 2026-10-15
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-104-implementation-u1-hop

## Occurrences

- 2026-10-15 ai-os-bot (BOT-030) warstwa `implementation:u1-hop` — Sonda warstwy: gdy cwd sesji nie jest repo git, 'cd "$(git rev-parse --show-toplevel)"' daje cd "" i sonda biegnie w cwd; typecheck/lint padają na braku package.json, a halt dostaje cause=code zamiast machine. Dodatkowo resumeFromRunId po naprawie cwd zwraca wynik z cache (prompt sondy bez zmian, 6 ms) i nie weryfikuje niczego.
