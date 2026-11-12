---
id: DEV-orc-042-infrastructure-shared-code
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

# DEV-orc-042-infrastructure-shared-code

## Occurrences

- 2026-11-12 juz-ide-api-1 (TS-SEC-107) run `wf_201d11ab-d57` warstwa `infrastructure:shared-code` — [plan] infrastructure:shared-code: analiza traktowała 4 testy w shared/security/__tests__ jako edytowane, a wszystkie testują wyłącznie usuwany RateLimitGuard/EndpointRateLimit, więc trafiły do deleted_files; lista testów BDR-148 do skorygowania
