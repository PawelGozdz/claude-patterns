---
id: DEV-orc-092-content-screens-data
status: promoted
resolution: >
  content-reviewer (agents/stacks/astro-static) miał maxTurns 30 wobec budżetu skryptu do 50; ORC-092 podniósł do 60 12 weryfikatorów, ale tego agenta pominął (nie był na liście). Teraz maxTurns 60, wpis w Changelog agenta. Symlink w juz-ide-blog bierze zmianę od razu.
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-092
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - juz-ide-blog
---

# DEV-orc-092-content-screens-data

## Occurrences

- 2026-10-21 juz-ide-blog (BLOG-HOWTO-001) run `wf_3465b4ee-00a` warstwa `content:screens-data` — ESCALATE_AND_HALT cause=machine: GO z unverified_scope po 3 probach (5 plikow public/screens/*.html nigdy nie sprawdzonych); content-reviewer ma maxTurns 30 (symlink do claude-patterns) < budzet skryptu do 50
