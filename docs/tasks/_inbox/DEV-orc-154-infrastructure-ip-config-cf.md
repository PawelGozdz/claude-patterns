---
id: DEV-orc-154-infrastructure-ip-config-cf
status: dismissed
dismissed_reason: "2026-11-09: ORC-154 zadziałał zgodnie z założeniem (krok ręczny trafił do raportu jako otwarte); do wykonania przez operatora juz-ide-api-8: sprawdzić TRUSTED_PROXY_ACCEPT_CF_CONNECTING_IP w .env* i Azure. Brak defektu silnika"
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: ORC-154
first_seen: 2026-11-08
last_seen: 2026-11-08
occurrences: 1
projects:
  - juz-ide-api-8
---

# DEV-orc-154-infrastructure-ip-config-cf

## Occurrences

- 2026-11-08 juz-ide-api-8 (TS-INFRA-TRUST-PROXY-RAW-XFF-001) warstwa `infrastructure:ip-config-cf` — Krok reczny po przebiegu: sprawdzic TRUSTED_PROXY_ACCEPT_CF_CONNECTING_IP w .env* i Azure (agent nie czyta .env*, schemat nie jest strict)
