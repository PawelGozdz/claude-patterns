---
id: DEV-orc-135-application-producer
status: dismissed
dismissed_reason: >
  Zgodnie z ORC-135: krok usuwania odsiewa ścieżki poza zakresem warstwy (poza dirs, ORC-042)
  i brudne przed startem (ORC-124), a odrzucone zapisuje w raporcie. Pliki do usunięcia
  (kontrakt, audit.handler.ts i spec) muszą mieć właściciela w dirs jednostki; ANL-038 wymaga
  tego dla decyzji usuwającej eksport. Brak dowodu, że krok pominął ścieżkę z zakresu.
  2026-11-02.
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: ORC-135
first_seen: 2026-11-01
last_seen: 2026-11-01
occurrences: 1
projects:
  - juz-ide-api-4
---

# DEV-orc-135-application-producer

## Occurrences

- 2026-11-01 juz-ide-api-4 (TS-GEO-RESIDENCE-SWITCH-AUDIT-001) warstwa `application:producer` — krok mechaniczny usuwania (ORC-135) odrzucił usunięcie pliku kontraktu poza dirs i nie usunął audit.handler.ts + speca mimo deleted_files; sprzątanie wykonane ręcznie przez agenta.
