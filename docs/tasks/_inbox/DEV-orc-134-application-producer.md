---
id: DEV-orc-134-application-producer
status: dismissed
dismissed_reason: >
  Dwie części. (1) Typecheck padł z braku pamięci (EXIT:134) przy gołym tsc --noEmit:
  obsługuje to ORC-134 (probeCrashed → ESCALATE cause=machine z podpowiedzią NODE_OPTIONS w
  --overrides), obejście zadziałało; limit pamięci to konfiguracja checks projektu (3.1). (2)
  Zakres application importuje kontrakt z infrastructure, którego plik powstaje w późniejszej
  warstwie: błąd kolejności w analizie projektu (kontrakt powinien mieć właściciela przed
  konsumentem). 2026-11-02.
trigger: halt
category: infra
sources:
  - orchestrate
rule_ref: ORC-134
first_seen: 2026-11-01
last_seen: 2026-11-01
occurrences: 1
projects:
  - juz-ide-api-4
---

# DEV-orc-134-application-producer

## Occurrences

- 2026-11-01 juz-ide-api-4 (TS-GEO-RESIDENCE-SWITCH-AUDIT-001) warstwa `application:producer` — typecheck OOM (EXIT:134) przy gołym tsc --noEmit; dodatkowo zakres application importuje kontrakt z infrastructure, którego plik powstaje w późniejszej warstwie. Obejście: --overrides checks (NODE_OPTIONS + conformance-only).
