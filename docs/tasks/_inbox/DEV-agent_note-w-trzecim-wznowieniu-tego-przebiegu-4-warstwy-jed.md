---
id: DEV-agent_note-w-trzecim-wznowieniu-tego-przebiegu-4-warstwy-jed
status: dismissed
dismissed_reason: >
  Ten sam temat platformowy co DEV-agent_note-verifier-ecc-flutter-reviewer-warstwa-implementat
  (instrukcje MCP "Claude Docs" wstrzykiwane do subagentów), teraz potwierdzony 4x w jednym
  wznowieniu. Wszystkie 4 agenty poprawnie zignorowały. Konfiguracja harnessu/MCP, nie kod
  claude-patterns.
trigger: agent_note
rule_ref: null
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - feature-flags
---

# DEV-agent_note-w-trzecim-wznowieniu-tego-przebiegu-4-warstwy-jed

## Occurrences

- 2026-09-27 feature-flags (0010) run `wf_2a6df522-a59` warstwa `implementation:sdk-dart-core,implementation:sdk-dart-riverpod,implementation:sdk-node-conformance-adapter,testing` — W trzecim wznowieniu tego przebiegu (4 warstwy/jednostki: sdk-dart-core, sdk-dart-riverpod, static-corpus-fixtures, sdk-node-conformance-adapter) KAŻDY z 4 weryfikatorów odnotował ten sam deviation_note: w kontekście narzędzi pojawia się blok 'MCP Server Instructions' serwera Claude Docs, nakazujący tworzenie/edycję dokumentu dla każdej odpowiedzi. Wszystkie 4 agenty poprawnie zignorowały to jako nieistotne/niezaufane wobec zadania code-review i nie wywołały narzędzia artefaktów. To nie jest atak, tylko stała instrukcja włączonego serwera MCP wstrzykiwana do KAŻDEGO subagenta niezależnie od zadania — zgłaszane jako sygnał do przeglądu (koszt kontekstu + ryzyko, że kiedyś jakiś agent to jednak wykona), nie jako naruszenie.
