---
id: DEV-no_go-unverified-scope
status: promoted
resolution: >
  ORC-098 (2026-10-04): sonda silnika uruchamia final_gate.checks, a GO z lukami przy zerze
  naruszeń i zielonej sondzie nie jest NO_GO. Otwarte ponownie 2026-10-22 (grant-flow
  TS-UI-009, marketing-hub TS-MH-026): ORC-123 dopisuje stan sondy do komunikatu NO_GO i do
  raportu (report.finalProbe), a po udanej rundzie naprawczej sonda bramki biegnie ponownie i
  ocenia luki jak ORC-098. Przyczyna w grant-flow niepotwierdzona (brak dziennika przebiegu);
  jeśli halt wróci przy zielonej sondzie, rekord otworzyć z tym dowodem.
trigger: no_go
rule_ref: null
first_seen: 2026-10-03
last_seen: 2026-10-22
occurrences: 6
projects:
  - ai-gateway
  - iam
  - marketing-hub
  - grant-flow
sources:
  - orchestrate
category: verifier
reopened_at: 2026-10-22
reopened_from_status: promoted
---

# DEV-no_go-unverified-scope

## Occurrences

- 2026-10-22 grant-flow (TS-UI-009) run `wf_dbfdcd1a-768` warstwa `final-gate` — Bramka końcowa NO_GO (cause machine) wymuszona samym unverified_scope (Playwright smoke nie uruchomiony, TM niepodpisany, warunki wdrożenia poza przebiegiem); zero własnych naruszeń, sonda zielona
- 2026-10-22 marketing-hub (TS-MH-026) run `wf_5fc73b06-5a8` — bramka końcowa TS-MH-026: NO_GO wymuszone tylko przez unverified_scope (cause machine); agent bramki i implementer campaigns-write bez StructuredOutput po nudge
- 2026-10-04 iam (TS-SSO-057) run `wf_713b3f5a-5af` — final gate NO_GO forced solely by unverified_scope (consumer copies / URL.canParse), zero own violations; 5 minor findings unfixed after final repair round
- 2026-10-04 ai-gateway (TS-AIG-069) run `wf_f4e0b434-6d9` — Bramka końcowa NO_GO wymuszona samym unverified_scope: w prompcie nie było wyników final_gate.checks (typecheck, typecheck:scripts, lint, test). Koordynator uruchomił je po fakcie: wszystkie exit 0, 946 testów zielonych.
- 2026-10-04 ai-gateway (TS-AIG-064) run `wf_96e58571-bbe` — Bramka końcowa NO_GO wymuszone samym unverified_scope: checks nie przekazane w prompcie bramki
- 2026-10-03 ai-gateway (TS-AIG-067) run `wf_5ce8f56a-e05` — Bramka końcowa NO_GO wymuszona tylko przez unverified_scope (INV-C11 ../auth, pnpm why pino); zero własnych naruszeń, pnpm check zielony
