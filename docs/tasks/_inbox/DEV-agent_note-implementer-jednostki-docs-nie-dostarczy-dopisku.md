---
id: DEV-agent_note-implementer-jednostki-docs-nie-dostarczy-dopisku
status: dismissed
dismissed_reason: >
  Pominięcie konkretnego dopisku (INV-A2) przez implementera jednostki docs w ai-gateway TS-AIG-070; wykryła je bramka końcowa jako deviation_note, czyli system zadziałał. Brak wzorca systemowego — do obserwacji, jeśli weryfikator warstwy docs będzie systematycznie pomijał dopiski wymagane decyzjami.
trigger: agent_note
rule_ref: null
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-implementer-jednostki-docs-nie-dostarczy-dopisku

## Occurrences

- 2026-10-03 ai-gateway (TS-AIG-070) run `wf_865f6bd2-00a` warstwa `implementation:docs` — Implementer jednostki docs nie dostarczył dopisku w INV-A2 (wyjątek startowy tylko w core/secret-policy.ts) wymaganego przez D4/TM-070-05: dopisek trafił tylko do INV-A5, wiersz A2 nadal wymienia === na sekrecie jako naruszenie (ryzyko fałszywego flagowania przez przyszłego weryfikatora). Nie regenerowano też CLAUDE.md (D8). Oba braki wykryła dopiero bramka końcowa jako deviation_note, nie weryfikator warstwy.
