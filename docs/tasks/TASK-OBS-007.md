---
id: TASK-OBS-007
title: 'Higiena raportowania: postarzanie triage, nadmiary w audycie, świeżość codziennego audytu'
type: feature
status: done
priority: P2
story_points: 3
created_date: 2026-10-10
updated_date: 2026-10-15
assignee: '@unassigned'
labels: [observability, reporting, audit]
epic: EP-OBSERVABILITY-001
depends_on: []
related: [TASK-OBS-004]
source: 'ADR 0011 B1 (ograniczenie crona), B4, B5'
---

# TASK-OBS-007: higiena raportowania

## 🎯 Goal

Skrzynka i audyt same pilnują, żeby nie zgniły: zgłoszenie bez ruchu jest widoczne, cron, który
przestał chodzić, jest wykrywany, a audyt widzi też to, czego nikt nie zadeklarował.

## Kontekst dla świeżej sesji

- Wpis crona dokładnie: `30 7 * * 1-5 cd /opt/projects/claude-patterns &&
  /home/dev/.nvm/versions/node/v24.14.1/bin/node scripts/audit-projects.mjs --all --report >>
  /home/dev/.claude/metrics/audit-daily.log 2>&1`.
- Wzorzec kontroli świeżości: `scripts/telemetry-freshness.mjs` (dziś pilnuje
  `workflow-steps.jsonl`). Bramki pre-commit: `scripts/pre-commit-guards.mjs` (po wszystkich
  bramkach drukuje już podsumowanie skrzynki — tam dopisać rekordy bez ruchu).
- Pola rekordu skrzynki do postarzania: `status`, `last_seen`, `first_seen`, `reopened_at`.
- Audyt nadmiarów: co wnosi kompozycja — `runtime.yml` (`agents`, `patterns.always/triggers`)
  i `project.yml` (`exclude_skills`, overlay); kontrole dopisz w `scripts/lib/audit-checks.mjs`.

## Zakres

1. `pre-commit-guards.mjs`: rekordy `promoted` bez ruchu > 7 dni i `proposed` > 14 dni (ADR 0011 B4).
2. Audyt: agenci, skille i kategorie wzorców obecne w projekcie, a niewnoszone przez
   `runtime.yml`/`project.yml` — INFO, nie błąd (ADR 0011 B5).
3. `telemetry-freshness.mjs`: świeżość `~/.claude/metrics/audit-daily.log` (dni robocze). Wpis
   crona ma zaszytą ścieżkę node z nvm (`v24.14.1`) — po zmianie wersji cron padnie po cichu;
   rozważyć wrapper szukający node zamiast stałej ścieżki.

## Kryteria akceptacji

- [x] Stare rekordy skrzynki widoczne w wyjściu pre-commit (bez blokowania commita).
- [x] Brak wpisu w `audit-daily.log` z ostatniego dnia roboczego = ostrzeżenie.
- [x] Nadmiary raportowane w audycie jako INFO, z evalem.
