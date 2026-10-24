---
id: DEV-agent_note-setup-project-nie-ignoruje-installed-yml
status: promoted
resolution: >
  Naprawione od ręki (2026-10-17, TASK-PANEL-NODE-ADVISOR-001): wpis
  .claude/config/installed.yml w templates/gitignore-claude.template, który setup-project.sh
  (krok 5c) dopisuje do .gitignore projektu.
trigger: agent_note
category: config
rule_ref: null
first_seen: 2026-10-13
last_seen: 2026-10-13
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-agent_note-setup-project-nie-ignoruje-installed-yml

## Occurrences

- 2026-10-13 framework-polityczny (setup claude-patterns, przegląd `.claude/`) — `installed.yml` ma komentarz „NIE commituj”, ale `setup-project.sh` nie dopisuje go do generowanego `.gitignore` (stan po setupie: plik widoczny jako untracked); dopisane ręcznie. Powiązane: `claude_patterns_dirty: true` w manifeście, gdy centrala ma niezacommitowane zmiany
