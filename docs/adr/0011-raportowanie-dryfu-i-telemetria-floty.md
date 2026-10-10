# ADR 0011 — Raportowanie dryfu ze wszystkich procesów i telemetria floty

**Status**: accepted (2026-10-10) — część A wdrożona, część B kierunkowa (implementacja później)
**Context source**: refaktor fundamentu claude-patterns z 2026-10-10 (sesja w aegis-flow) i decyzja
użytkownika: „system raportowania to absolutnie najważniejsza funkcjonalność — pozwala na
poprawę narzędzia każdego dnia”.

---

## Kontekst

Refaktor z 2026-10-10 znalazł 15 problemów fundamentu: między innymi kolizję plików
`output:` panelu wyłączającą po cichu blokujący stage, lokalne wzorce poza gitem, symlinki
z absolutną ścieżką w commitach, kod TypeScript w `patterns.always` bloku `python` i martwe
dowiązania skilli. Skrzynka `docs/tasks/_inbox/` znała **jeden** z nich (kod TS we wzorcach,
promowany do taska, który czekał 14 dni bez właściciela). Audyt floty nie znał żadnego, a
sprawdzenie martwych linków skanowało przestarzałe ścieżki i raportowało 0.

Przyczyny są systemowe, nie punktowe:

1. Skrzynkę karmiło wyłącznie `/orchestrate` (halt, no_go, lint, adnotacja agenta). Błędy
   konfiguracji nie kończą się HALT-em — degradują po cichu — więc nigdy tam nie trafiały.
2. Audyt pytał tylko „czy to, co zadeklarowano, leży na tym dysku". Nie pytał, co widzi git
   (przenośność), czego nikt nie zadeklarował (nadmiary) ani czy uprawnienia są bezpieczne.
3. Każda zmiana generatora zapalała ✗ w 21/21 projektach — prawdziwe sygnały ginęły w szumie.
4. Telemetria (`~/.claude/metrics/workflow-steps.jsonl`) istnieje i działa, ale jest per
   maszyna i nikt jej nie agreguje per projekt/workflow.

## Decyzja

### A. Raportowanie — jedna skrzynka, wiele źródeł (wdrożone 2026-10-10)

- `scripts/report-deviation.mjs` przyjmuje `--source <orchestrate|analyze|audit|setup>` i nowe
  triggery `analyze_gate`, `analyze_note`, `setup_drift`. Rekord ma `sources[]`.
  `--once-per-project` dla źródeł cyklicznych: otwarty rekord znający projekt nie dostaje
  kolejnego wystąpienia; licznik mierzy zasięg problemu, nie liczbę przebiegów.
- `/analyze` ma krok 4: odstępstwa maszyny (pominięty stage, brakujący agent, brak pliku
  wejściowego bramki, wzorzec z obcego stosu, warstwa bez pracy) → `report-deviation` z regułą
  `ANZ-*`.
- `scripts/audit-projects.mjs --report`: każdy BŁĄD → `setup_drift` z sygnaturą per typ kontroli
  (`AUD-DEAD-LINK`, `AUD-GIT-ABS-SYMLINK`, `AUD-GIT-BAK`, `AUD-GIT-IGNORED-DEP`, `AUD-ENV-DENY`,
  `AUD-CLAUDE-LOCAL`, `AUD-RUNTIME-*`, `AUD-SETUP-INCOMPLETE`, `AUD-RAG-DRIFT`).
- Audyt jest strażnikiem spójności floty: martwe linki we właściwych ścieżkach, higiena gita,
  ochrona `.env*`, ręczny CLAUDE.md bez CLAUDE-LOCAL.md, repo poza systemem bloków, rozdział
  „zmienił się generator" (INFO, przez `inputs_hash`) od „zmieniła się kompozycja" (BŁĄD).
- Materializer waliduje u źródła: kolizja `output:` z blokującym stage'em = błąd, obowiązkowa
  warstwa bez katalogów = ostrzeżenie, `patterns.remove` działa w `extends`.

### B. Kierunek (do zrobienia — kolejność wg wartości)

1. ~~**Codzienny przebieg**~~ — **wdrożone 2026-10-10**: crontab użytkownika `dev`, dni robocze
   7:30, `audit-projects.mjs --all --report`, log w `~/.claude/metrics/audit-daily.log`.
   Znane ograniczenie: ścieżka node z nvm (`v24.14.1`) jest zaszyta — po zmianie wersji node
   cron padnie po cichu. Do zrobienia: kontrola świeżości `audit-daily.log` w
   `telemetry-freshness.mjs` (ten sam wzorzec, co dla `workflow-steps.jsonl`).
2. **Opis `deviation_note` w schematach `orchestrate.template.mjs`** (IMPL_SCHEMA,
   VERDICT_SCHEMA) z jawnymi przypadkami: warstwa bez pracy, wzorzec w obcym języku/stosie,
   agent ze slotu nieadekwatny do stosu. Odłożone 2026-10-10 tylko dlatego, że plik miał
   staged zmiany innej sesji.
3. **Setup zgłasza** (`--source setup`): materializacja z ostrzeżeniem, kategoria z overlay
   bez katalogu, README zachowany jako ręczny.
4. **Postarzanie triage**: `pre-commit-guards.mjs` pokazuje rekordy `promoted` bez ruchu
   > 7 dni i `proposed` > 14 dni.
5. **Nadmiary w audycie**: agenci/skille/kategorie wzorców obecne, a niewnoszone przez
   runtime.yml/project.yml.
6. **Telemetria floty** (osobna implementacja, dashboard na żywo):
   - źródło: istniejący `~/.claude/metrics/workflow-steps.jsonl` (wpis `run`: project, runId,
     workflowName, status, costUsd, durationMs, tokeny, agentCount, runtimeYmlHash) — nie
     nowe hooki; trzy uniwersalne hooki .sh (`cost-optimizer`, `state-manager`,
     `session-monitor`) NIE są tym mechanizmem (session-monitor czeka na pseudo-narzędzie
     `_SessionEnd`, które nie istnieje; liczy wystąpienia nazw modeli w transkrypcie);
   - zapis: lokalny JSONL per maszyna → skrypt `sync-telemetry` agregujący do
     `claude-patterns/telemetry/<projekt>/` jako **agregaty dzienne** (nie surowe logi —
     mniej konfliktów przy commitach z wielu maszyn);
   - prywatność: tylko project, workflow, model, koszt, czas, status, liczba poprawek
     inner_loop, hash runtime.yml. **Bez** nazw tasków, treści promptów, ścieżek plików
     i czegokolwiek z konfiguracji projektu (np. assetów z `scope.yaml` w aegis-flow);
   - do poprawy w źródle: `costCoverage` (dziś ~0.44) i `taskId` (losowy, nie TS-ID).

## Konsekwencje

- Skrzynka staje się jedynym miejscem, w którym widać zdrowie ekosystemu — także problemy,
  które nie zatrzymują żadnego przebiegu. Rośnie wolumen; deduplikacja po sygnaturze i
  `--once-per-project` mają go utrzymać w ryzach.
- Telemetria łamie zasadę „instance data → projekt, nie claude-patterns" świadomie i tylko
  w formie zagregowanej, bez danych merytorycznych projektów.
