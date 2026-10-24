---
id: TASK-OBS-017
title: 'Reguła deklaruje metrykę: claim w rule-history i skrzynce, raport tygodniowy, status resolved'
type: feature
status: todo
priority: P2
story_points: 3
created_date: 2026-10-22
updated_date: 2026-10-22
assignee: '@unassigned'
labels: [observability, reporting]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-014]
related: [TASK-OBS-007, TASK-OBS-013]
source: 'ADR 0015 D6 (claim)'
---

# TASK-OBS-017: domknięta pętla reguła → metryka → status

## 🎯 Goal

96 reguł ORC ma „dlaczego" z datą i kosztem; 85 rekordów skrzynki poszło do tasków. Nigdzie nie ma
„czy pomogło". Po tym tasku każda nowa reguła i każde promowane zgłoszenie mówi, którą liczbę ma
poprawić, a raport tygodniowy to sprawdza i sam zmienia status w skrzynce.

## Zakres

1. Pole `claim` w rekordzie skrzynki (`promoted`) i w nagłówku wpisu rule-history: `metric` (nazwa
   licznika z rollupu albo sygnatura `deviation`), `direction` (`down|up`), `threshold` (względny),
   `engine` (hash wdrożenia). `scripts/lib/inbox.mjs` czyta pole; `generate-inbox-index` je wypisuje.
2. `telemetry-report.mjs --claims`: dla każdego `claim` okno przed/po hashu (z TASK-OBS-014) i werdykt
   `confirmed | no_effect | regressed | insufficient_data` (minimum 20 przebiegów po każdej stronie).
3. Skrzynka: `confirmed` → `status: resolved` (nowy stan, `resolution` bez zmian), `regressed` → reopen
   tym samym mechanizmem co dziś. Zmiany statusu zapisuje raport, commituje człowiek.
4. Raport tygodniowy: cron w poniedziałek po agregacie, `telemetry/reports/<RRRR>-W<ww>.md` (w gicie),
   sekcje: delta per silnik z tygodnia, claims, jakość danych, reguły bez `claim`. `telemetry-freshness`
   pilnuje, że raport powstał.
5. `pre-commit-guards.mjs`: nowa reguła ORC/ANL bez `claim` to ostrzeżenie (nie błąd); eval
   `reporting-hygiene` rozszerzony.

## Kontekst dla świeżej sesji

- Reguły wstecz nie dostają `claim` hurtem; dopisujemy przy okazji, zaczynając od ORC-098, ORC-100,
  ORC-117 (najwięcej promowanych rekordów).
- Status `resolved` to zmiana listy statusów skrzynki: ADR 0011 aneks, `generate-inbox-index`, eval.

## Kryteria akceptacji

- [ ] Rekord z `claim` i wystarczającymi danymi dostaje werdykt w raporcie; `confirmed` zmienia status.
- [ ] Pierwszy raport tygodniowy leży w `telemetry/reports/` i ma cztery sekcje.
- [ ] Nowa reguła bez `claim` daje ostrzeżenie w pre-commit.
