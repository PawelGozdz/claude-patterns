---
id: DEV-orc-056-final-gate
status: dismissed
dismissed_reason: >
  Bramka zadziałała poprawnie: NO_GO cause=code za realne ustalenie (hopToken w logowalnych
  obiektach, TM-082-02). Czerwony typecheck w gateway.deadline.test.ts po rundzie naprawczej był
  jednorazową regresją poza zakresem warstw; poprawki bez właściciela warstwy obsługuje ORC-101,
  a rundę naprawczą bez efektu w drzewie ORC-103. Ostatnie wystąpienie 2026-10-04.
trigger: no_go
rule_ref: ORC-056
first_seen: 2026-10-04
last_seen: 2026-10-04
occurrences: 1
projects:
  - ai-gateway
---

# DEV-orc-056-final-gate

## Occurrences

- 2026-10-04 ai-gateway (TS-AIG-082) run `wf_9cf92adc-988` warstwa `final-gate` — cause=code: bramka końcowa NO_GO (hopToken w logowalnych obiektach, TM-082-02); runda naprawcza zostawiła typecheck czerwony w gateway.deadline.test.ts (poza zakresem warstw).
