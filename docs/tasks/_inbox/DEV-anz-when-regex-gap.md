---
id: DEV-anz-when-regex-gap
status: promoted
resolution: >
  Blok nestjs ma parametr threat_model_when_extra (2026-10-29, mechanizm when_extra z
  ANL-043); juz-ide-api-1 wpisał blokad|blokow|zablokowa|stalk|anty-stalk|molest|harass w
  project.yml (block_params.nestjs) i zmaterializował runtime.yml. Słownictwo domenowe nie
  trafia do bloku centralnego, bo "block" dałby fałszywe trafienia w każdym projekcie NestJS.
  Dotyczy też bliźniaków api-2/3/4 po scaleniu project.yml.
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-WHEN-REGEX-GAP
first_seen: 2026-10-29
last_seen: 2026-10-29
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-anz-when-regex-gap

## Occurrences

- 2026-10-29 juz-ide-api-1 (TS-SEC-USER-BLOCK-001) — runtime.yml analyze.panel stage threat-model: when: nie dopasował taska TS-SEC-USER-BLOCK-001 (blokowanie użytkowników, anty-stalking, wymagany ADDENDUM do TM) - brak słów auth/token/pii/cross-context; ta sama luka zgłoszona w analizie TS-SEC-BLOCK-CACHE-001 (propozycja: dodać blokad|block|stalk|anty-stalk), nadal nienaprawiona; stage uruchomiony ręcznie jako trafienie (ANL-020)
