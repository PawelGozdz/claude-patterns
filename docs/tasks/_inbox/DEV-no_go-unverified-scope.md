---
id: DEV-no_go-unverified-scope
status: promoted
resolution: >
  Naprawione jako ORC-098 (2026-10-04): sonda silnika uruchamia final_gate.checks i oddaje
  wyniki bramce jako fakty; GO z lukami przy zerze naruszeń i zielonej sondzie nie jest już
  NO_GO. Rekord scalony z czterech duplikatów o różnym sformułowaniu powodu.
trigger: no_go
rule_ref: null
first_seen: 2026-10-03
last_seen: 2026-10-04
occurrences: 4
projects:
  - ai-gateway
  - iam
---

# DEV-no_go-unverified-scope

## Occurrences

- 2026-10-04 iam (TS-SSO-057) run `wf_713b3f5a-5af` — final gate NO_GO forced solely by unverified_scope (consumer copies / URL.canParse), zero own violations; 5 minor findings unfixed after final repair round
- 2026-10-04 ai-gateway (TS-AIG-069) run `wf_f4e0b434-6d9` — Bramka końcowa NO_GO wymuszona samym unverified_scope: w prompcie nie było wyników final_gate.checks (typecheck, typecheck:scripts, lint, test). Koordynator uruchomił je po fakcie: wszystkie exit 0, 946 testów zielonych.
- 2026-10-04 ai-gateway (TS-AIG-064) run `wf_96e58571-bbe` — Bramka końcowa NO_GO wymuszone samym unverified_scope: checks nie przekazane w prompcie bramki
- 2026-10-03 ai-gateway (TS-AIG-067) run `wf_5ce8f56a-e05` — Bramka końcowa NO_GO wymuszona tylko przez unverified_scope (INV-C11 ../auth, pnpm why pino); zero własnych naruszeń, pnpm check zielony
