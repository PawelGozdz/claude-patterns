---
id: DEV-orc-139-infrastructure-followups-docs
status: promoted
resolution: >
  ORC-150 (2026-11-02): pliki brudne przed startem, których nie obejmuje żadna warstwa,
  wypadają z hasha drzewa, więc edycja cudzych plików przez równoległą sesję nie unieważnia
  GO. Plik w zakresie warstwy zostaje w haszu. Evale tree-hash-binding 3d/3e.
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: ORC-139
first_seen: 2026-11-01
last_seen: 2026-11-01
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-139-infrastructure-followups-docs

## Occurrences

- 2026-11-01 juz-ide-api-1 (TS-SEC-USER-BLOCK-002) run `wf_58566c3b-fee` warstwa `infrastructure:followups-docs` — ESCALATE_AND_HALT cause=machine: hash drzewa zmienił się w trakcie weryfikacji przez edycję cudzych, niezwiązanych plików (docs/founder/granty/*) przez równoległą sesję; obejście: --overrides treeHashExclude + 1 wznowienie. Propozycja: wykluczać z hasha pliki brudne przed startem (dirtyAtStart) poza zakresem warstw.
