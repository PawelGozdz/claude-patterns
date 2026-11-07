---
id: DEV-orc-088-domain-session-failure
status: proposed
trigger: halt
category: config
sources:
  - orchestrate
rule_ref: ORC-088
first_seen: 2026-11-07
last_seen: 2026-11-07
occurrences: 1
projects:
  - juz-ide-mobile-app
---

# DEV-orc-088-domain-session-failure

## Occurrences

- 2026-11-07 juz-ide-mobile-app (MOBILE-API-ALIGN-001) run `wf_9c64ca01-2c4` warstwa `domain:session-failure` — flutter analyze na całym repo (2296 uwag info/warning poza zakresem) dawał czerwoną sondę, tsErrors puste (parser zna tylko tsc), więc odroczenie ORC-082 niemożliwe i BLOCKED_BY_PRIOR cause=machine na pierwszej warstwie; obejście: --overrides checks z --no-fatal-infos --no-fatal-warnings i flutter test na katalogach
