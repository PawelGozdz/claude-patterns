---
id: DEV-orc-065
status: promoted
resolution: >
  Naprawione od ręki jako ORC-114: --emit-script wskazuje katalog scratchpad sesji, poza repo,
  więc eslint . w korzeniu projektu nie linituje wyemitowanego skryptu
  (docs/decisions/orchestrate-rule-history.md#orc-114).
trigger: agent_note
category: lint
sources:
  - orchestrate
rule_ref: ORC-065
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - juz-ide-blog
---

# DEV-orc-065

## Occurrences

- 2026-10-20 juz-ide-blog (BLOG-GUIDES-001) run `wf_29c827ad-247` — --emit-script do .claude/run-state/ w repo z eslint . w korzeniu: wygenerowany skrypt silnika (top-level return) jest linitowany jak kod projektu i daje 'Parsing error: return outside of function', czerwieniąc sondę lint i bramkę końcową. Obejście: emisja do katalogu poza repo.
