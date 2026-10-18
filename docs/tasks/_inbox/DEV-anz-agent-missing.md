---
id: DEV-anz-agent-missing
status: proposed
trigger: analyze_gate
category: config
sources:
  - analyze
rule_ref: ANZ-AGENT-MISSING
first_seen: 2026-10-14
last_seen: 2026-10-15
occurrences: 2
projects:
  - ai-os-bot
  - aegis-flow
---

# DEV-anz-agent-missing

## Occurrences

- 2026-10-15 aegis-flow (TS-005) — sloty red-team-review (red-team-bypass-analyst) i abuse-case-threat-model (abuse-case-threat-modeler), oba model opus: odpowiedź/zapis zatrzymał filtr bezpieczeństwa, brak RT-TS-005.md i TM-TS-005-abuse.md; prompty z wyliczaniem klas obejść/ataków do przeformułowania
- 2026-10-14 ai-os-bot (BOT-030) — stage threat-model (agent /threat-model): skill zwrócił tylko opis komendy-wrappera, bez treści skills/security/threat-model/SKILL.md ani przebiegu STRIDE; TM-BOT-030 napisał koordynator ręcznie wg TM-BOT-025
