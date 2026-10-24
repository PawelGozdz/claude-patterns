---
id: DEV-anz-agent-missing
status: proposed
trigger: analyze_gate
category: config
sources:
  - analyze
rule_ref: ANZ-AGENT-MISSING
first_seen: 2026-10-14
last_seen: 2026-10-23
occurrences: 4
projects:
  - ai-os-bot
  - aegis-flow
  - juz-ide-api-2
---

# DEV-anz-agent-missing

## Occurrences

- 2026-10-23 juz-ide-api-2 (TS-SEC-EVENT-GEOFILTER-ORACLE-001) — slot decision-gate (state-reader/haiku) w /analyze TS-SEC-EVENT-GEOFILTER-ORACLE-001 wyczerpal limit 8 tur bez raportu (wynik dopiero po SendMessage); bramka blokujaca nie zwrocila wyniku za pierwszym razem
- 2026-10-17 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) — slot decision-gate (agent state-reader) nie ma Bash: nie przeczytal BDR-081..084 z origin/develop (git show), oddal raport czesciowy; prowadzacy uzupelnil recznie
- 2026-10-15 aegis-flow (TS-005) — sloty red-team-review (red-team-bypass-analyst) i abuse-case-threat-model (abuse-case-threat-modeler), oba model opus: odpowiedź/zapis zatrzymał filtr bezpieczeństwa, brak RT-TS-005.md i TM-TS-005-abuse.md; prompty z wyliczaniem klas obejść/ataków do przeformułowania
- 2026-10-14 ai-os-bot (BOT-030) — stage threat-model (agent /threat-model): skill zwrócił tylko opis komendy-wrappera, bez treści skills/security/threat-model/SKILL.md ani przebiegu STRIDE; TM-BOT-030 napisał koordynator ręcznie wg TM-BOT-025

## Przegląd

- 2026-10-18, wystąpienie juz-ide-api-2: nie jest brakiem agenta ani błędem slotu. `state-reader` bez Bash to założenie (tylko odczyt, tani model), a prompt `decision-gate` dostaje `brief[]` zbudowany skryptem (ANL-012, ANL-017). Agent chciał `git show origin/develop:…` tylko dlatego, że gałąź była za bazą i indeks nie miał BDR-081..084. Przyczyna naprawiona w DEV-anz-gate-input-missing (ostrzeżenie w `index-decisions.mjs`). Bash dla tego slotu nie jest potrzebny.
- Rekord zostaje `proposed` z powodu dwóch starszych wystąpień: filtr bezpieczeństwa na slotach red-team-review i abuse-case-threat-model (aegis-flow TS-005, do przeformułowania promptów) oraz skill threat-model zwracający opis wrappera (ai-os-bot BOT-030, niezweryfikowane).
