---
id: DEV-aud-rag-drift
status: dismissed
dismissed_reason: >
  Nieodtwarzalne 2026-10-29: audit-projects nie zgłasza AUD-RAG-DRIFT (zgłoszenie z
  claude-patterns mówiło o 2 plikach, zapewne po edycji kart tego dnia; sprawdź
  ./scripts/reseed-patterns.sh, gdy wróci). Wcześniej, 2026-10-20: reseed wykonany, przyczyna
  porażek to port embeddera :8301.
  Nieodtwarzalne 2026-10-20: reseed-patterns.sh zakończony sukcesem (kolekcje
  odtworzone, .rag-seed-state.json zapisany), audit-projects nie zgłasza
  AUD-RAG-DRIFT. Przyczyna wcześniejszych porażek reseedu: domyślny port
  embeddera :8301 nie nasłuchiwał, API CT 301 działa na :8000 (domyślne wartości
  poprawione w embedder.ts i docker-compose.yml).
trigger: setup_drift
sources:
  - audit
rule_ref: AUD-RAG-DRIFT
first_seen: 2026-10-10
last_seen: 2026-10-29
occurrences: 2
projects:
  - claude-patterns
category: config
reopened_at: 2026-10-29
reopened_from_status: dismissed
---

# DEV-aud-rag-drift

## Occurrences

- 2026-10-29 claude-patterns — ROZJAZD RAG: 2 plików różni się od tego, co jest w kolekcjach
- 2026-10-10 claude-patterns — ROZJAZD RAG: 5 plików różni się od tego, co jest w kolekcjach
