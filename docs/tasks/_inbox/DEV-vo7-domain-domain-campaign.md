---
id: DEV-vo7-domain-domain-campaign
status: promoted
resolution: >
  Karta value-object-pattern_summary VO7 (2026-10-28) nie narzuca już nazwy metody: obowiązuje
  ta, którą deklaruje klasa bazowa projektu (getEqualityComponents w VytchesDDD/juz-ide,
  getIdentityComponents w @marketing-hub/ddd). Odtworzone: wszystkie VO w marketing-hub
  nadpisują getIdentityComponents.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: VO7
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - marketing-hub
---

# DEV-vo7-domain-domain-campaign

## Occurrences

- 2026-10-24 marketing-hub (TS-MH-028) warstwa `domain:domain-campaign` — Karta VO wymienia getEqualityComponents(), a @marketing-hub/ddd i repo używają getIdentityComponents(); karta nie rozstrzyga nazwy kanonicznej
