---
id: DEV-orc-042-domain-auth-chain
status: proposed
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-11-12
last_seen: 2026-11-12
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-042-domain-auth-chain

## Occurrences

- 2026-11-12 juz-ide-api-1 (TS-SEC-107) run `wf_201d11ab-d57` warstwa `domain:auth-chain` — [plan] domain:auth-chain: auth-rate-limiting.service.ts leży w domain/, a zawiera importy @nestjs/common, logging, klienta Redis i metody async (serwis infrastrukturalny w warstwie domenowej); weryfikator wskazał throw w domenie, poprawka nie obejmowała przeniesienia — analiza nie przewidziała tego jako zakresu
