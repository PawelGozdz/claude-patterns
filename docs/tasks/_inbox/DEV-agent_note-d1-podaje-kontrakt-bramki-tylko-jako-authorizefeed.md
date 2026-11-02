---
id: DEV-agent_note-d1-podaje-kontrakt-bramki-tylko-jako-authorizefeed
status: dismissed
dismissed_reason: >
  Błąd planu naprawiony w analizie projektu (3.1): D1 w TS-SEC-SP-PIN-CONSENT-FEED-RECHECK-001
  ma teraz drugą metodę resolveFeedItemLockKey, właściciela zmiany kontraktu (jednostka
  feed-consumer) i kolejność feed-consumer → ne-gate. Silnik zrobił swoje: agent zgłosił lukę,
  zamiast zgadywać. Jedno wystąpienie w jednym zadaniu; reguła ogólna dla kontraktu
  współdzielonego przez jednostki tej samej warstwy dopiero przy drugim przypadku.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-29
last_seen: 2026-10-29
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-agent_note-d1-podaje-kontrakt-bramki-tylko-jako-authorizefeed

## Occurrences

- 2026-10-29 juz-ide-api-2 (TS-SEC-SP-PIN-CONSENT-FEED-RECHECK-001) run `wf_e7dcd0e7-334` warstwa `infrastructure:feed-consumer` — D1 podaje kontrakt bramki tylko jako authorizeFeedItem, a D3 wymaga try-locka po id profilu, którego payload nie niesie; potrzebna druga metoda resolveFeedItemLockKey, a jednostka ne-gate nie ma jej w instrukcji
