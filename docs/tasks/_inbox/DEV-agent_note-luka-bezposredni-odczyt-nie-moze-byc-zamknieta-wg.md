---
id: DEV-agent_note-luka-bezposredni-odczyt-nie-moze-byc-zamknieta-wg
status: dismissed
dismissed_reason: "2026-11-09: sprzeczność D7/D9 to decyzja analizy TS-INFRA-TRUST-PROXY-RAW-XFF-001 w juz-ide-api-8 (zawężono zamiast usunąć) — poprawka po stronie projektu, nie silnika; pojedyncze wystąpienie, brak wzorca"
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-08
last_seen: 2026-11-08
occurrences: 1
projects:
  - juz-ide-api-8
---

# DEV-agent_note-luka-bezposredni-odczyt-nie-moze-byc-zamknieta-wg

## Occurrences

- 2026-11-08 juz-ide-api-8 (TS-INFRA-TRUST-PROXY-RAW-XFF-001) warstwa `infrastructure:ip-docs` — Luka bezposredni-odczyt nie moze byc zamknieta wg D9: D7 wylacza geo-platform-public.controller.ts (XFF l.162,392; klucz limitu anonimowego w generate-city-referral). D9 zalozylo zamkniecie obu luk; zawezono zamiast usunac
