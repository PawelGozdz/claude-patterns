---
id: DEV-agent_note-kontrakt-pinconsentgateservice-application-servic
status: dismissed
dismissed_reason: >
  Zgodne z ORC-042: PinConsentGateService leży w application (jednostka ne-application,
  warstwa wcześniejsza i już zweryfikowana), a weryfikator warstwy infrastructure:ne-gate
  sprawdza swój zakres. Nie jest to błąd silnika ani analizy.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-29
last_seen: 2026-10-29
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-agent_note-kontrakt-pinconsentgateservice-application-servic

## Occurrences

- 2026-10-29 juz-ide-api-2 (TS-SEC-SP-PIN-CONSENT-FEED-RECHECK-001) run `wf_16e8c29f-99f` warstwa `infrastructure:ne-gate` — Kontrakt PinConsentGateService (application/service-provider/services/pin-consent-gate.service.ts) jest poza zakresem warstwy ne-gate, weryfikator go nie sprawdził
