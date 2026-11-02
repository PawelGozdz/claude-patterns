---
id: DEV-orc-144-final
status: dismissed
dismissed_reason: >
  Błąd planu w analizie projektu (3.1): D7 nie wskazywała, o który guardrail chodzi
  (BR-GEO-AREA-002 czy BR-GEO-LISTING-001), implementer zastosował P do obu, co łamie BDR-096
  pkt 9. Bramka końcowa to wychwyciła. Pojedyncze wystąpienie; reguła „nazywaj guardrail po id
  BR" wróci, gdy powtórzy się w innym projekcie. 2026-11-02.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-144
first_seen: 2026-11-02
last_seen: 2026-11-02
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-144-final

## Occurrences

- 2026-11-02 juz-ide-api-3 (TS-GEO-HOME-POINT-CONTRACT-001) run `wf_d045d476-9ed` warstwa `final` — Plan D7 ('guardrail i resolveReachGeometry dostają P') nie wskazuje, o który guardrail chodzi (BR-GEO-AREA-002 vs BR-GEO-LISTING-001); implementer zastosował P do obu, co łamie BDR-096 pkt 9. Analiza powinna nazywać każdy guardrail po id BR.
