---
id: DEV-agent_note-web-campaigns-write-queryclient-clear-w-wrapped
status: dismissed
dismissed_reason: >
  Błąd aplikacji marketing-hub, nie wzorca ani silnika: queryClient.clear() w
  wrappedAuthProvider.onError przy 403 (apps/web/src/app/App.tsx) daje pętlę GET na
  szczegółach. Agent słusznie zgłosił go jako poza zakresem poprawki (ORC-042). Do wzięcia
  jako osobne zadanie w marketing-hub.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - marketing-hub
---

# DEV-agent_note-web-campaigns-write-queryclient-clear-w-wrapped

## Occurrences

- 2026-10-22 marketing-hub (TS-MH-026) run `wf_5fc73b06-5a8` warstwa `web:campaigns-write` — web:campaigns-write: queryClient.clear() w wrappedAuthProvider.onError przy 403 daje pętlę GET na szczegółach (poza zakresem poprawki)
