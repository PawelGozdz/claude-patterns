---
id: TASK-OBS-009
title: 'Wysyłka agregatów na serwer zespołu i widok web telemetrii'
type: feature
status: todo
priority: P3
story_points: 5
created_date: 2026-10-17
updated_date: 2026-10-17
assignee: '@unassigned'
labels: [observability, telemetry, dashboard, transport]
epic: EP-OBSERVABILITY-001
depends_on: [TASK-OBS-008]
related: [TASK-OBS-005]
source: 'reszta TASK-OBS-008: kontrakt paczki jest gotowy (telemetry-export), brakuje wysyłki i widoku web'
---

# TASK-OBS-009: wysyłka i widok web

## 🎯 Goal

Agregaty z `telemetry/rollups/` docierają na serwer zespołu rozwijającego claude-patterns, a zespół widzi je
w przeglądarce. Kontrakt paczki jest zrobiony w TASK-OBS-008 (`scripts/telemetry-export.mjs`,
ADR 0012, sekcja „Transport agregatów"); tu zostaje to, co wymaga decyzji spoza repo.

## Decyzje potrzebne przed startem

1. Adres serwera, uwierzytelnienie i miejsce na sekret (nie w repo).
2. Harmonogram wysyłki: cron obok audytu, hook po `telemetry-aggregate`, czy ręcznie.
3. Czy nazwa projektu (`project`) jedzie jawnie, czy jest anonimizowana (sól po stronie zespołu).
4. Odbiorca: upsert po `rollups[].id`; co robi z `contentHash` (pomijanie niezmienionych).

## Zakres

1. Klient wysyłki: bierze paczkę z `buildBatch`, wysyła partiami, ponawia przy błędzie, nie blokuje pracy.
   Stan „co już wysłano" (`id` + `contentHash`) trzymany lokalnie poza gitem.
2. Odbiorca (osobne repo albo katalog): przyjmuje paczkę, robi upsert po `id`, odrzuca pola spoza kontraktu.
3. Widok web na tych samych agregatach: koszt i udział napraw per proces, per wersja silnika (`engines`),
   lejek weryfikacji, przyczyny NO-GO.

## Kryteria akceptacji

- [ ] Wysyłka jest idempotentna: dwa uruchomienia pod rząd nie zmieniają stanu serwera.
- [ ] Na serwerze nie ma `taskRef`, `runId`, ścieżek ani treści odstępstw (test na odebranych danych).
- [ ] Widok web pokazuje koszt i udział napraw per wersja silnika.
