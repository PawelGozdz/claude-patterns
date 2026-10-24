---
id: DEV-orc-084-domain-u1-domain
status: proposed
resolution: >
  ORC-126: typecheck odroczony do późniejszych warstw (deferred, ORC-082) liczy
  się jako dowód zielonej sondy dla GO_WITH_GAPS; warstwa domenowa z tests:
  skipped nie miała inaczej żadnego pass. Wniosek z kodu, bez dziennika
  przebiegu wf_c48daa31-31c; przy powtórzeniu rekord otworzyć z wynikiem sondy.
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-084
first_seen: 2026-10-23
last_seen: 2026-10-23
occurrences: 2
projects:
  - marketing-hub
reopened_at: 2026-10-23
reopened_from_status: promoted
---

# DEV-orc-084-domain-u1-domain

## Occurrences

- 2026-10-23 marketing-hub (TS-MH-027) run `wf_c48daa31-31c` warstwa `domain:u1-domain` — domain:u1-domain halt nr 3 po wznowieniach z --overrides (budżet verify 40, checks tylko lint): unverified_scope zmienił się na 'validate:br:api nie uruchamiałem'; implementer odnotował, że pliki domenowe były brudne przed startem (ORC-042) po ponownym prepare, więc dirtyAtStart z wcześniejszych prób mógł zaburzyć zakres.
- 2026-10-23 marketing-hub (TS-MH-027) run `wf_c48daa31-31c` warstwa `domain:u1-domain` — domain:u1-domain: dwa przebiegi (budżet verify 15 i 40) kończą GO bez naruszeń, ale z unverified_scope (2-3 pliki spec w dirs warstwy). Sonda typecheck czerwona tylko przez TS2322 w application/.../transition-to-scheduled/handler.ts (późniejsza warstwa), więc layerGapsAcceptable/probeHasGreenEvidence odrzuca GO_WITH_GAPS, a ORC-082 nie odracza czerwieni; weryfikator nie otwiera specs mimo większego budżetu.
