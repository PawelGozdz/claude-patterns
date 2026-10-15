# Telemetria i audyt — jak uruchamiać i jak weryfikować

Krótka instrukcja operacyjna. Uzasadnienia i format zdarzeń: [ADR 0012](adr/0012-metryki-przebiegow-zdarzenia-v1.md),
higiena raportowania: [ADR 0011](adr/0011-raportowanie-dryfu-i-telemetria-floty.md).

## Skąd biorą się dane

| Źródło | Co zapisuje | Gdzie |
|---|---|---|
| Hook `workflow-metrics-postrun` + `workflow-metrics-stop` | kroki i przebiegi `/orchestrate` (Workflow startuje w tle, więc `stop` domyka zbiór po zakończeniu) | `~/.claude/metrics/workflow-steps.jsonl` |
| Collector (ten sam, uruchamiany przez hooki) | zdarzenia v1 | `telemetry/events/*.jsonl` (poza gitem) |
| `/analyze` | `telemetry-emit.mjs run-start` / `run-end` | to samo |
| Cron 07:30 pon–pt | `scripts/cron/audit-daily.sh` → audyt floty | `~/.claude/metrics/audit-daily.log` |

## Codzienne komendy

```bash
node scripts/workflow-metrics-collect.mjs        # ręczny zbiór (idempotentny) — gdy podejrzewasz, że hook coś pominął
node scripts/workflow-metrics-report.mjs         # przegląd kosztów per krok; --by task|model|day|project, --top 10, --regression
node scripts/telemetry-aggregate.mjs --since 2026-10-01   # agregaty dzienne do telemetry/rollups/ (--check nic nie zapisuje)
node scripts/telemetry-freshness.mjs --verbose   # czy pomiar nie stanął
node scripts/audit-projects.mjs --all --report   # audyt floty; --report przekazuje błędy do docs/tasks/_inbox/
node scripts/report-deviation.mjs --list         # skrzynka odstępstw, triage
```

## Jak sprawdzić, że wszystko działa

1. **Hooki wpięte:** `node scripts/sync-global-hooks.mjs --check` → „globalne settings.json zgodne". Brak → `--apply`.
2. **Pomiar żyje:** `node scripts/telemetry-freshness.mjs` nie zgłasza „metryki Workflow martwe". Gdy zgłasza, a hook jest wpięty:
   uruchom collector ręcznie (wyżej) — przebieg mógł się skończyć po odpaleniu hooka.
3. **Cron żyje:** `ls -l ~/.claude/metrics/audit-daily.log` — data z ostatniego dnia roboczego, ostatnie linie to podsumowanie
   („N projekt(ów) wymaga uwagi"), nie stos błędu Node. Brak zapisu od ostatniego dnia roboczego 07:30 (+2 h) wykryje `telemetry-freshness`.
4. **Agregaty aktualne:** `node scripts/telemetry-aggregate.mjs --check` (dzisiejszy, wciąż rosnący dzień bywa „nieaktualny" — to normalne).
5. **Przed commitem:** `node scripts/pre-commit-guards.mjs` — 29 bramek, w tym evale telemetrii; wypisuje też zgłoszenia w skrzynce bez ruchu.

## Częste pułapki

- Cron ma ubogi PATH — dlatego jest wrapper `scripts/cron/audit-daily.sh`, a podprocesy używają `process.execPath`.
- Ten sam plik hooka nie może stać pod dwoma zdarzeniami: `sync-global-hooks` identyfikuje hook po nazwie pliku (stąd osobny `workflow-metrics-stop.js`).
- `--project` w `telemetry-emit.mjs` musi być ścieżką, nie nazwą — hooki dopasowują agentów po katalogu roboczym.
