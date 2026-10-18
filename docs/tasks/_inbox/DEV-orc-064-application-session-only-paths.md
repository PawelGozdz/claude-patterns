---
id: DEV-orc-064-application-session-only-paths
status: dismissed
dismissed_reason: >
  Zgodnie z projektem: kolejność warstw i jednostek wynika z runtime.yml, a analiza przypisuje
  jednostce warstwę (units[].layer). Handler zależny od symboli shared/auth powinien mieć layer:
  infrastructure albo trafić do wcześniejszej jednostki; to przypisanie w analizie marketing-hub
  TS-MH-019, nie błąd silnika. --overrides celowo nie zmienia kolejności warstw.
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-064
first_seen: 2026-10-12
last_seen: 2026-10-12
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-064-application-session-only-paths

## Occurrences

- 2026-10-12 marketing-hub (TS-MH-019) run `wf_b66da844-d27` warstwa `application:session-only-paths` — units[] z layer: application biegnie przed jednostkami infrastructure niezależnie od kolejności w analizie (expandUnits wstawia wg runtime.yml); handler application zależy od symboli z infrastructure (shared/auth, ExecutionActor) → typecheck czerwony, BLOCKED_BY_PRIOR. --overrides nie umie zmienić kolejności warstw.
