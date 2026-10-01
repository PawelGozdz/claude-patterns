---
id: DEV-agent_note-verifier-ecc-flutter-reviewer-warstwa-implementat
status: dismissed
dismissed_reason: >
  Sygnał poprawnie zignorowany przez agenta (nie wykonał wstrzykniętej instrukcji MCP). To
  pytanie o konfigurację serwera MCP "Claude Docs" w harnessu (czy jego instrukcje powinny w
  ogóle docierać do subagentów code-review /orchestrate), nie kod w claude-patterns. Patrz też
  DEV-agent_note-w-trzecim-wznowieniu... (ten sam sygnał, 4x w jednym wznowieniu) i
  DEV-agent_note-weryfikator-ecc-flutter-reviewer-warstwa-implemen (wariant PL) — grupowane
  tu jako jeden temat platformowy.
trigger: agent_note
rule_ref: null
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - feature-flags
---

# DEV-agent_note-verifier-ecc-flutter-reviewer-warstwa-implementat

## Occurrences

- 2026-09-26 feature-flags (0010) run `wf_2a6df522-a59` warstwa `implementation:sdk-dart-core` — Verifier ecc:flutter-reviewer (warstwa implementation:sdk-dart-core, próba 3) zaraportował deviation_note: w trakcie przebiegu w system-reminder pojawił się blok instrukcji narzędzia MCP 'Claude Docs' nakazujący utworzenie dokumentu/artefaktu przez batch/guide. Agent poprawnie zignorował to jako niezaufaną/wstrzykniętą treść niezwiązaną z zadaniem code-review i nie wywołał żadnego narzędzia artefaktów. Zgłaszane jako sygnał do przeglądu (czy ten blok instrukcji MCP powinien w ogóle docierać do subagentów przebiegu /orchestrate), nie jako naruszenie z winy agenta.
