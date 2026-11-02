---
id: DEV-agent_note-unverified-scope
status: dismissed
dismissed_reason: >
  Nowe wystąpienie 2026-10-31 (juz-ide-api-3 TS-GEO-DISTANCE-BUCKETS-001) to inna przyczyna
  niż ORC-138. D6 nie miało jednostki: naprawione w analizie (jednostka services niesie D6).
  "TO TRZEBA STWORZYĆ" przy pliku, który już był w HEAD, wynika z commitu człowieka w trakcie
  taska; ORC-147 ostrzega o takich commitach w prepare.
  Przypadek ORC-138: analiza TS-AIG-104 wpisała .env.example do jednostki, a
  deny Read(./.env.*) blokuje odczyt. Silnik ostrzega o tym od 2026-10-28; ta
  analiza powstała wcześniej.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-30
occurrences: 2
projects:
  - ai-gateway
  - juz-ide-api-3
reopened_at: 2026-10-30
reopened_from_status: dismissed
---

# DEV-agent_note-unverified-scope

## Occurrences

- 2026-10-30 juz-ide-api-3 (TS-GEO-DISTANCE-BUCKETS-001) run `wf_1c5dd603-e72` warstwa `testing:l2-oracle` — Analiza: D6 (BDR-122 pkt 7 / BDR-123 pkt 2: autorzy z klasą 'mało' sortowani po (przedział, id), width_bucket) nie ma żadnej jednostki; service_offerings nie ma address_density_class. Ponadto units[].reason testing:guardians mówi 'TO TRZEBA STWORZYĆ' o pliku no-metric-distance-in-responses.guardian.spec.ts, który już jest w HEAD (fałszywy unverified_scope).
- 2026-10-28 ai-gateway (TS-AIG-104) warstwa `implementation:docs-card` — Odczyt .env.example zablokowany regułą deny; weryfikator nie sprawdził ADR-0009 i ADR-0010 (unverified_scope).
