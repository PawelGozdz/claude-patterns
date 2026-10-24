---
id: DEV-orc-124-testing
status: promoted
resolution: >
  ORC-130: klucz dirtyAtStart w --overrides istniał (pole wyjścia prepare), ale nikt o nim nie
  wiedział, a ORC-124 uznaje brudne pliki za cudze. orchestrate-prepare ostrzega teraz przy >=
  20 brudnych plikach albo brudnym drzewie przy layers_done i podaje obejście --overrides
  {"dirtyAtStart": []}. Automatu nie ma: silnik nie odróżni pracy taska od cudzej.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-124
first_seen: 2026-10-23
last_seen: 2026-10-23
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-124-testing

## Occurrences

- 2026-10-23 juz-ide-api-2 (TS-GEO-HOME-POINT-001) run `wf_93d7deac-dfd` warstwa `testing` — Cała niezatwierdzona praca taska (209 plików) trafiła do dirtyAtStart, więc weryfikatorzy dostaliby polecenie 'nie oceniaj', a stageableFiles pominąłby te pliki. Brak klucza --overrides dla dirtyAtStart; wyzerowano listę w wyemitowanym skrypcie (poza repo). Potrzebny: override dirtyAtStart albo tryb 'cała praca w drzewie to praca taska'.
