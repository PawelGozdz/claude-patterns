---
id: DEV-orc-062-domain-tier-projector
status: promoted
resolution: >
  Naprawione jako ORC-082 (2026-09-30): sonda typecheck odracza czerwień, której wszystkie
  błędy TS leżą w dirs późniejszych warstw (mechanicznie, w CORE szablonu); błędy we własnym
  zakresie, w wcześniejszych warstwach i bez ścieżki nadal blokują.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-29
last_seen: 2026-09-29
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-062-domain-tier-projector

## Occurrences

- 2026-09-29 juz-ide-api-1 (TS-REP-DISCLOSURE-POLICY-001) run `wf_1c64744d-058` warstwa `domain:tier-projector` — Sonda typecheck (pełny repo) czerwona na TS2420 w infrastructure/ (brak findPolicyProjectionForSubjects), bo port rozszerzony w warstwie domain:tier-projector, a implementacja należy do późniejszej warstwy infrastructure. Implementer słusznie zgłosił no-op w swoim zakresie -> BLOCKED_BY_PRIOR. Problem kolejności warstw: zmiana portu w domenie łamie globalny typecheck do czasu warstwy infra.
