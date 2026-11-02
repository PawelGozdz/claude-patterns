---
id: DEV-agent_note-bramka-koncowa-kategoria-llm-internal-b-ad-progr
status: dismissed
dismissed_reason: >
  Ustalenie bramki końcowej o kodzie projektu ai-os-bot (BOT-045): kategoria LLM_INTERNAL
  zamyka bezpiecznik i dostaje okno komunikatu o awarii, a koszt po błędzie parsowania SDK to
  0, czego D6 nie rozstrzyga. Rozstrzyga człowiek; silnik zadziałał poprawnie. 2026-11-02.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-02
last_seen: 2026-11-02
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-agent_note-bramka-koncowa-kategoria-llm-internal-b-ad-progr

## Occurrences

- 2026-11-02 ai-os-bot (BOT-045) run `wf_7f777ada-370` warstwa `final-gate` — Bramka końcowa: kategoria LLM_INTERNAL (błąd programisty, np. odpowiedź nie-JSON) liczy się jako recordReachable i zamyka bezpiecznik, a aggregator stosuje do niej okno komunikatu o awarii (DREAD 5); błąd parsowania SDK po odpowiedzi bramy księguje koszt 0, czego D6 nie rozstrzyga
