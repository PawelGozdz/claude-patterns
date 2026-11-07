---
id: DEV-anz-agent-missing
status: proposed
resolution: >
  2026-10-24: wystąpienie juz-ide-api-2 (decision-gate bez raportu po 8 turach)
  to limit maxTurns: 8 w state-reader.md, który wygrywa z budżetem 12 wywołań
  slotu decision-gate. Podniesione do 14. Otwarte zostają starsze wystąpienia:
  filtr bezpieczeństwa na slotach red-team-review i abuse-case-threat-model
  (aegis-flow TS-005) oraz skill threat-model (ai-os-bot BOT-030).
trigger: analyze_gate
category: config
sources:
  - analyze
rule_ref: ANZ-AGENT-MISSING
first_seen: 2026-10-14
last_seen: 2026-11-07
occurrences: 8
projects:
  - ai-os-bot
  - aegis-flow
  - juz-ide-api-2
  - juz-ide-api-1
  - juz-ide-api-4
  - vytches-ddd
  - juz-ide-api-7
---

# DEV-anz-agent-missing

## Occurrences

- 2026-11-07 juz-ide-api-7 (TS-ARCH-OUTBOX-ERASE-FIELDS-001) — decision-gate (state-reader/haiku, budget 12 wywołań, bez Bash) dwukrotnie zwrócił wynik częściowy na decisions-index.json 240 KB; blokująca bramka nie domknęła kontroli (BDR-093, ADR-0123/0124, scope, open-questions)
- 2026-11-04 vytches-ddd (VF-043) — slot api-surface-analysis: agent library-api-guardian (i library-quality-verifier) istnieje w agents/stacks/typescript-library/, ale nie jest podlinkowany do ~/.claude/agents/ ani dostepny dla narzedzia Agent; uruchomiono przez general-purpose z definicja roli
- 2026-10-31 juz-ide-api-4 (TS-GEO-RESIDENCE-SWITCH-AUDIT-001) — slot decision-gate (state-reader haiku, budget 12) dwukrotnie zwrócił wynik częściowy przy zadaniu wymagającym przeglądu ~10 BDR + ADR + open-questions; budżet nie wystarcza na korpus decyzji
- 2026-10-29 juz-ide-api-1 (TS-SEC-USER-BLOCK-001) — stage decision-gate (state-reader haiku, budgets.decision-gate max_tool_calls: 12, on_limit emit-partial) zwrócił wynik częściowy dla taska z 7 otwartymi pytaniami produktowymi: nie sprawdził B96, B43, BDR-044, KANON §2, ADR-0027; ANL-051 - braki uzupełnione ręcznie przez głównego agenta; budżet 12 za mały dla taska dotykającego wielu BDR
- 2026-10-23 juz-ide-api-2 (TS-SEC-EVENT-GEOFILTER-ORACLE-001) — slot decision-gate (state-reader/haiku) w /analyze TS-SEC-EVENT-GEOFILTER-ORACLE-001 wyczerpal limit 8 tur bez raportu (wynik dopiero po SendMessage); bramka blokujaca nie zwrocila wyniku za pierwszym razem
- 2026-10-17 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) — slot decision-gate (agent state-reader) nie ma Bash: nie przeczytal BDR-081..084 z origin/develop (git show), oddal raport czesciowy; prowadzacy uzupelnil recznie
- 2026-10-15 aegis-flow (TS-005) — sloty red-team-review (red-team-bypass-analyst) i abuse-case-threat-model (abuse-case-threat-modeler), oba model opus: odpowiedź/zapis zatrzymał filtr bezpieczeństwa, brak RT-TS-005.md i TM-TS-005-abuse.md; prompty z wyliczaniem klas obejść/ataków do przeformułowania
- 2026-10-14 ai-os-bot (BOT-030) — stage threat-model (agent /threat-model): skill zwrócił tylko opis komendy-wrappera, bez treści skills/security/threat-model/SKILL.md ani przebiegu STRIDE; TM-BOT-030 napisał koordynator ręcznie wg TM-BOT-025

## Przegląd

- 2026-10-18, wystąpienie juz-ide-api-2: nie jest brakiem agenta ani błędem slotu. `state-reader` bez Bash to założenie (tylko odczyt, tani model), a prompt `decision-gate` dostaje `brief[]` zbudowany skryptem (ANL-012, ANL-017). Agent chciał `git show origin/develop:…` tylko dlatego, że gałąź była za bazą i indeks nie miał BDR-081..084. Przyczyna naprawiona w DEV-anz-gate-input-missing (ostrzeżenie w `index-decisions.mjs`). Bash dla tego slotu nie jest potrzebny.
- Rekord zostaje `proposed` z powodu dwóch starszych wystąpień: filtr bezpieczeństwa na slotach red-team-review i abuse-case-threat-model (aegis-flow TS-005, do przeformułowania promptów) oraz skill threat-model zwracający opis wrappera (ai-os-bot BOT-030, niezweryfikowane).
