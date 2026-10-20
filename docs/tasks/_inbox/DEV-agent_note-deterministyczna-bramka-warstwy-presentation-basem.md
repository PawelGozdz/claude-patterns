---
id: DEV-agent_note-deterministyczna-bramka-warstwy-presentation-basem
status: promoted
resolution: >
  Naprawione od ręki jako ORC-110: sonda typecheck rozpoznaje dart analyze i flutter analyze,
  więc czerwień ma ścieżki i da się ją odroczyć. Zakres i flagi flutter analyze oraz domyślny
  pełny flutter test w bramce końcowej to checks projektu (juz-ide-mobile-app), nie silnik.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - juz-ide-mobile-app
---

# DEV-agent_note-deterministyczna-bramka-warstwy-presentation-basem

## Occurrences

- 2026-10-18 juz-ide-mobile-app (MAP-BASEMAP-STYLE-001) run `wf_7dc4170a-4e4` warstwa `presentation:basemap-seam` — deterministyczna bramka warstwy presentation:basemap-seam: fałszywy alarm — flutter analyze na szerokim zakresie (lib/core/design/components, test/core) łapał stare ostrzeżenia spoza zmiany, sonda szukała tylko 'error TS' i nie wskazała przyczyny; halt otagowany cause=code mimo błędu maszyny; naprawa przez --overrides; bramka końcowa miała domyślnie pełny 'flutter test' na całym repo
