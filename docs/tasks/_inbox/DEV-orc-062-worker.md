---
id: DEV-orc-062-worker
status: promoted
resolution: >
  Naprawione 2026-10-20 w wytycznych analizy (ANL-038, commands/analyze.md): wspólny plik, który
  rozszerza więcej niż jedna jednostka (barrel index.ts, rejestr, moduł DI), trafia do dirs KAŻDEJ
  takiej jednostki. Silnik to dopuszcza, remis własności rozstrzyga ORC-112. Tu luka była w units[]
  analizy FP-005 (barrel packages/sources/src/index.ts tylko w sources-http), wyleczona --overrides.
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-orc-062-worker

## Occurrences

- 2026-10-20 framework-polityczny (FP-005) run `wf_53302ff1-8ed` warstwa `worker` — worker: BLOCKED_BY_PRIOR cause=machine; packages/sources/src/index.ts (barrel) nalezy tylko do dirs jednostki sources-http, brak reeksportow archive/ingest/raw-documents/adapters; luka w units[] analizy, naprawa przez --overrides layers.worker.scope
