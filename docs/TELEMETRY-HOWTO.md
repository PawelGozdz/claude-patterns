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
| Hooki blokujące (9: `block-root-grep`, `block-subagent-commit`, `pre-workflow-lint`, `check-delegation`, …) | `process: hook`: jedno zdarzenie przy zablokowaniu, `step.role` = `<hook>:<reguła>` (np. `pre-workflow-lint:WL3`); przepuszczenia i ostrzeżenia nie zapisują nic; wyłączenie `HOOK_TELEMETRY=off` | `telemetry/events/*.jsonl` |
| `scripts/pre-commit-guards.mjs` | `process: pre-commit`: krok per bramka (`step.role` = stała nazwa, np. `eval-hooks`), odsetek porażek per bramka w agregacie | `telemetry/events/*.jsonl` |

## Codzienne komendy

```bash
node scripts/workflow-metrics-collect.mjs        # ręczny zbiór (idempotentny) — gdy podejrzewasz, że hook coś pominął
node scripts/flow-top.mjs grant-flow           # przebieg Workflow na żywo: postęp planu, NO-GO naprawione/otwarte, koszt, średnia 30 dni (--once, --json, --run wf_…)
node scripts/workflow-metrics-report.mjs         # przegląd kosztów per krok; --by task|model|day|project, --top 10, --regression
node scripts/telemetry-aggregate.mjs --since 2026-10-01   # agregaty dzienne do telemetry/rollups/ (--check nic nie zapisuje)
node scripts/telemetry-freshness.mjs --verbose   # czy pomiar nie stanął
node scripts/telemetry-report.mjs --engine <hash>   # raport tylko z rollupów: okno 7 dni przed i po silniku (first-pass, fałszywe GO, NO_GO bramki, koszt powtórek, zgon, gęstość odstępstw); szum < 20%
node scripts/telemetry-report.mjs --data-quality    # jakość danych: udział `other` w cause, kroki bez kosztu, przebiegi bez engine i bez taskRef (widoki: --by engine|process|role|project|week; --md plik, --json)
node scripts/telemetry-report.mjs --claims          # czy reguły i poprawki ze skrzynki zrobiły to, co deklarują (`claim`): werdykt confirmed|no_effect|regressed|insufficient_data; --write-status zapisuje zmianę statusu rekordu
node scripts/telemetry-report.mjs --weekly          # raport tygodniowy do telemetry/reports/<RRRR>-W<ww>.md (4 sekcje) + statusy claimów
npm run telemetry:weekly                        # to samo ręcznie, z agregatem dziennym przed raportem i logiem na terminalu (bez crona); `npm run telemetry:weekly:dry` tylko wypisuje raport, nic nie zapisuje
node scripts/telemetry-export.mjs --check      # paczka agregatów dla serwera zespołu: walidacja (bez --check: JSON na stdout, --out plik); niczego nie wysyła
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

- Blok `tasks` w rollupie ląduje w dniu ostatniego `run.end` taska. Cron liczy `--since` 3 dni wstecz, więc task wznowiony
  po dłuższej przerwie zostawia nieaktualny wpis w starym dniu — raz w tygodniu przelicz całość: `node scripts/telemetry-aggregate.mjs`.
- `step.blamed` (fałszywe GO) dopisuje kolektor. Zdarzenia sprzed 2026-10-23 uzupełnia `node scripts/telemetry-backfill-gate-blame.mjs`
  (idempotentny, czyta `wf_*.json`; przepisuje pliki zdarzeń atomowo, więc zrób kopię `telemetry/events/` przed pierwszym użyciem na nowej maszynie).

- Cron ma ubogi PATH — dlatego jest wrapper `scripts/cron/audit-daily.sh`, a podprocesy używają `process.execPath`.
- Ten sam plik hooka nie może stać pod dwoma zdarzeniami: `sync-global-hooks` identyfikuje hook po nazwie pliku (stąd osobny `workflow-metrics-stop.js`).
- `--project` w `telemetry-emit.mjs` musi być ścieżką, nie nazwą — hooki dopasowują agentów po katalogu roboczym.
