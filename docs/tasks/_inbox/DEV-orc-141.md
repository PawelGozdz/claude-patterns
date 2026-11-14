---
id: DEV-orc-141
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-141
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - juz-ide-api-8
---

# DEV-orc-141

## Occurrences

- 2026-11-13 juz-ide-api-8 (TS-TOOLING-HANDLER-NO-THROW-001) — Propozycja do transactional-outbox-pattern.md (czesc o konsumencie): handler wiadomosci outboxa (IOutboxMessageHandler.handle) sygnalizuje blad wylacznie rzutem lub odrzucona obietnica; wartosc zwrocona, w tym Result.fail, jest odrzucana, a wiadomosc trafia w stan PROCESSED; ponowienie, licznik prob i status FAILED po maxRetries uruchamia tylko wyjatek. Dowod: @vytches/ddd-messaging 0.32.1 dist/index.js:358-362, 392-412. Dodatkowo: karta CH5/N3 (application-handlers.md) nie rozroznia bledu biznesowego od technicznego, a ADR-0013 l.161 tak; do doprecyzowania.
