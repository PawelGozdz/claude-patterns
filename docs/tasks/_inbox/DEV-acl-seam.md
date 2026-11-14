---
id: DEV-acl-seam
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ACL-SEAM
first_seen: 2026-11-14
last_seen: 2026-11-14
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-acl-seam

## Occurrences

- 2026-11-14 juz-ide-api-2 (TS-TOOLING-NO-THROW-ACL-ADAPTERS-001) — Karta acl-registry.md (N4) zabrania throw z metody adaptera, ale milczy o szwie frameworka: executeCore w @vytches/ddd-acl łapie wyjątki z *ExternalAPI/*Translator i zwraca Result.fail(ACLError), a execute() w kontrakcie to Promise<TResult>. Potrzebny zapis wyjątku (znacznik LINT-EXCEPTION(acl-no-throw) z powodem; precedens: juz-ide-api-2 ADR-0143) oraz wyjątek dla rejestru ACL (błąd konfiguracji przy starcie).
