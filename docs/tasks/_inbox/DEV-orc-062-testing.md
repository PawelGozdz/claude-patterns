---
id: DEV-orc-062-testing
status: proposed
resolution: >
  Drugie wystąpienie (grant-flow TS-UI-008: czerwony test PESEL zależny od daty, poza zakresem)
  to zachowanie zgodne z ORC-062: czerwień spoza zakresu warstwy zatrzymuje przebieg
  (BLOCKED_BY_PRIOR), bo kolejne warstwy trafiłyby na to samo; sondę bazową odrzucono "na razie"
  (orchestrate-rule-history.md#orc-062). Przyczyna leży w projekcie: test zależny od bieżącej
  daty trzeba odciąć od zegara. Do sondy bazowej wrócić, gdy takich haltów będzie więcej.
  Pierwsze wystąpienie (juz-ide-api-1, no-op warstwa testing pomija sondę) pozostaje otwarte.
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-10
last_seen: 2026-10-21
occurrences: 2
projects:
  - juz-ide-api-1
  - grant-flow
---

# DEV-orc-062-testing

## Occurrences

- 2026-10-21 grant-flow (TS-UI-008) run `wf_33254675-68d` warstwa `testing` — Sonda warstwy testing czerwona przez test PESEL zależny od daty (poza zakresem, nieśledzony przez zadanie); implementer słusznie zgłosił brak pracy w zakresie, silnik zatrzymał się jako BLOCKED_BY_PRIOR zamiast odroczyć czerwień testów spoza zakresu (ORC-099 odracza tylko pliki późniejszych warstw).
- 2026-10-10 juz-ide-api-1 (TS-AUTH-SMS-ERROR-MAPPING-001) run `wf_5ac31260-676` warstwa `testing` — Warstwa testing w gałęzi no-op (testy już w drzewie) pomija sondę checks, więc weryfikator nie ma dowodu uruchomienia; unverified_scope x3 bez drogi do GO_WITH_GAPS (probeHasGreenEvidence wymaga sondy) -> ESCALATE machine
