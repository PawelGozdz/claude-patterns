---
id: DEV-orc-041-implementation-core-gate
status: promoted
resolution: >
  ORC-124: lista plików brudnych przed startem trafia do promptów weryfikatora (zakaz
  oceniania i zalecania git checkout/restore/reset) i implementera (nie edytuj, nie cofaj,
  pozycję z poleceniem cofnięcia pomiń w deviation_note); sonda po cichej śmierci i bramka
  „kod istnieje" nie liczą plików brudnych, chyba że implementer sam je zgłosił. Zniszczona
  praca właściciela została przywrócona ręcznie w projekcie.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-041
first_seen: 2026-10-23
last_seen: 2026-10-23
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-041-implementation-core-gate

## Occurrences

- 2026-10-23 ai-os-bot (BOT-041) run `wf_88100bcf-827` warstwa `implementation:core-gate` — Plik z niezatwierdzoną zmianą właściciela sprzed przebiegu (src/core/llm/models.ts, w dirtyAtStart) został uznany za zmianę implementera: diff-sonda nie filtruje dirtyAtStart, weryfikator dał NO_GO z poleceniem 'git checkout', a implementer cofnął plik do HEAD (praca właściciela zniszczona; przywrócona ręcznie z głównej sesji). Sonda i weryfikator powinny odejmować dirtyAtStart, a prompt naprawczy nie może zalecać cofania cudzych zmian.
