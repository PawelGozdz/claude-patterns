---
id: EP-OBSERVABILITY-001
title: '[EPIC] Raportowanie i telemetria floty — skrzynka problemów + metryki wszystkich przebiegów'
type: epic
status: done
priority: P1
created_date: 2026-10-10
updated_date: 2026-11-07
labels: [observability, telemetry, reporting]
external_ref: 'docs/adr/0011-raportowanie-dryfu-i-telemetria-floty.md, docs/adr/0012-metryki-przebiegow-zdarzenia-v1.md'
member_tasks: [TASK-OBS-003, TASK-OBS-004, TASK-OBS-005, TASK-OBS-006, TASK-OBS-007, TASK-OBS-008, TASK-OBS-009, TASK-OBS-010, TASK-OBS-011]
---

# EP-OBSERVABILITY-001 — Raportowanie i telemetria floty

## Po co

Decyzja użytkownika z 2026-10-10: system raportowania to najważniejsza funkcja claude-patterns,
bo pozwala poprawiać narzędzie każdego dnia. Docelowo dane trafiają na serwer zespołu, który
rozwija claude-patterns i podejmuje decyzje na ich podstawie. Do tego potrzebne są dwa
strumienie: **skrzynka** (`docs/tasks/_inbox/` — co dokładnie się psuje i dlaczego) i
**zdarzenia** (`telemetry/events/` — jak często, w jakiej części całej pracy, ile to kosztuje).

Refaktor z 2026-10-10 znalazł 15 problemów fundamentu, z których skrzynka znała jeden, a
migracja historii pokazała, że stara telemetria raportowała 420/420 udanych przebiegów
`/orchestrate`, z których bramka końcowa odrzuciła 172 (41%).

## Stan (2026-11-07)

| Obszar | Stan | Gdzie |
|---|---|---|
| Skrzynka zasilana przez `/orchestrate`, `/analyze`, audyt floty | ✅ | ADR 0011 A, `8e84867` |
| Codzienny audyt floty (cron 7:30 dni robocze, `--report`) | ✅ cron działa | ADR 0011 B1, `scripts/cron/audit-daily.sh` |
| Format zdarzeń v1, `report-deviation` → zdarzenie `deviation` | ✅ | ADR 0012 krok 1, `f11191e` |
| Collector w v1 + migracja historii (12 953 zdarzenia od 2026-07) | ✅ | ADR 0012 krok 2, `0c82a8f` |
| Pole `category` w skrzynce = `cause` w zdarzeniach | ✅ | `0ae7587` |
| Opis `deviation_note` w schematach orchestratora | ✅ | `002d49e` (ADR 0011 B2) |
| Metryki `/analyze` (dwa hooki + `run-start/run-end`) | ✅ w `develop`, oba hooki wpięte globalnie | TASK-OBS-003, `b7f8844` |
| Agregaty dzienne (per host) + `_inbox/index.json`, cron po audycie | ✅ w `develop`, cron 7:45 działa | TASK-OBS-005, `ab82030` |
| Audyt jako źródło metryk (krok per projekt × kontrola), setup zgłasza do skrzynki | ✅ | TASK-OBS-004, `ea1d391` |
| Plan przebiegu i wersja silnika w `run.start` (orchestrate) | ✅ | TASK-OBS-006, `225f000` |
| Higiena raportowania (postarzanie triage, nadmiary, świeżość crona) | ✅ | TASK-OBS-007, `724314b` |
| Dashboard na żywo (`flow-top`) + kontrakt transportu (`telemetry-export`) | ✅ | TASK-OBS-008, `268568c` |
| Wysyłka na serwer + widok web | ⏸ odroczone, brak decyzji spoza repo | TASK-OBS-009 |
| Bramki pre-commit w metrykach (która bramka coś łapie) | ✅ | TASK-OBS-010, `cee3780` |
| Blokady z hooków w metrykach (dzienne liczniki per reguła) | ✅ | TASK-OBS-011, `6d9685f` |

## Kontynuacja

Przegląd telemetrii z 2026-10-22 ([ADR 0015](../adr/0015-pomiar-wartosci-zamiast-samooceny.md)) idzie
w [EP-OBSERVABILITY-002](EP-OBSERVABILITY-002.md): wynik ludzki po przebiegu, narzędzia w telemetrii,
raport nad rollupami i domknięta pętla reguła → metryka. TASK-OBS-011 został w tym epiku i jest zamknięty.

## Kolejność

TASK-OBS-003 → TASK-OBS-005 → TASK-OBS-006 → TASK-OBS-004 → TASK-OBS-007 → TASK-OBS-008, potem
TASK-OBS-010 i TASK-OBS-011 (po TASK-OBS-004); TASK-OBS-009 czeka na decyzje spoza repo. Uzasadnienie: `/analyze` nie ma dziś żadnych danych (ślepa
plamka), agregaty dają wartość od razu na 13 tys. istniejących zdarzeń, reszta je uzupełnia.

## Jak zacząć (świeża sesja)

Epik jest zamknięty; nowa praca idzie przez [EP-OBSERVABILITY-002](EP-OBSERVABILITY-002.md), a jej sekcja
„Jak zacząć” jest aktualna. Poniżej klocki i zasady, które dalej obowiązują.

1. Przeczytaj ADR 0012 (format, prywatność, emitery) i ten epik. ADR 0011 = skrzynka i audyt.
2. Gałąź: `feature/TASK-OBS-NNN` wychodzi z `develop`, praca **w głównym katalogu**
   `/opt/projects/claude-patterns` (decyzja użytkownika 2026-10-10: bez worktree).
3. **Ten katalog jest żywy dla całej floty**: `~/.claude/hooks` → `claude-patterns/hooks`,
   wzorce/agenci/reguły projektów to symlinki tutaj. Checkoutowana gałąź = kod, którego używają
   wszystkie sesje we wszystkich projektach. Nie zostawiaj w drzewie niedziałającego hooka ani
   skryptu; nowy hook rejestruj w `hooks/hooks.json` dopiero, gdy jego eval jest zielony.
4. Gotowe klocki (nie pisz od nowa):
   - `scripts/lib/telemetry-events.mjs` — `appendEvent`, `appendEventsDedup`, `deterministicId`,
     `validateEvent`, `normalizeOutcome`, `defaultCategory`, listy z schematu;
   - `scripts/telemetry-emit.mjs` — CLI `run-start | step | run-end` dla procesów bez Workflow;
   - `scripts/lib/telemetry-legacy.mjs` — wzorzec mapowania etykiet kroków na rolę/rundę/`fixes`;
   - `tests/flow-evals/telemetry-events/run.js` — eval; nowe przypadki dopisuj tutaj albo w
     evalu emitera; `CLAUDE_TELEMETRY_DIR=<tmp>` kieruje zapis poza prawdziwe dane.
5. Każdy nowy eval rejestruj w `scripts/pre-commit-guards.mjs` (`runCheck('eval: …')`).
6. Weryfikacja na danych: zdarzenia w `telemetry/events/RRRR-MM.jsonl` (poza gitem) czyta się
   krótkim skryptem node — bez czytania plików przez model.
7. Środowisko sesji: aktywny Fact-Forcing Gate (przed pierwszą edycją pliku podaj importerów,
   API, schemat danych i polecenie użytkownika); żadnego `grep -r`/`rg` na korzeniu repo —
   tylko na podkatalogach (`scripts/ hooks/ docs/ tests/`); commit tylko na prośbę użytkownika.

## Zasady wspólne dla tasków epiku

- Zdarzenie zgodne ze `schemas/telemetry-event-v1.schema.json`; nowa wartość listy zamkniętej
  = świadoma zmiana schematu + ADR 0012.
- Prywatność u źródła: bez treści promptów, powodów ze skrzynki, ścieżek plików i konfiguracji
  projektów. `taskRef` tylko lokalnie — agregaty i serwer go pomijają.
- Zapis metryki nigdy nie przerywa mierzonej pracy (best-effort, ostrzeżenie na stderr).
- Każdy emiter ma eval w `tests/flow-evals/telemetry-events/` albo własny.

## Stan zamknięcia (2026-11-07)

Epik zamknięty jako kontener. Dzieci (`epic: EP-OBSERVABILITY-001`, razem 9, tyle samo co w `member_tasks`):

- **Zrobione (8):** TASK-OBS-003, TASK-OBS-004, TASK-OBS-005, TASK-OBS-006, TASK-OBS-007, TASK-OBS-008,
  TASK-OBS-010, TASK-OBS-011.
- **Przeniesione do EP-OBSERVABILITY-002 (0):** żadne; zadania EP-002 (TASK-OBS-012..017) od początku
  należą do EP-002.
- **Odroczone z powodem (1):** TASK-OBS-009 (wysyłka na serwer i widok web, `todo`, P3). Kontrakt paczki jest
  gotowy (TASK-OBS-008), a start wymaga decyzji spoza repo: adres i uwierzytelnienie serwera, harmonogram
  wysyłki, anonimizacja nazwy projektu, zachowanie odbiorcy wobec `contentHash`. EP-OBSERVABILITY-002 trzyma
  go jako pozycję „poza epikiem" do czasu drugiej maszyny; do tego czasu wystarcza `telemetry-report.mjs`
  (TASK-OBS-014). TASK-OBS-009 zachowuje `epic: EP-OBSERVABILITY-001`, bo zmiana pola nie jest potrzebna do
  spójności, a historia decyzji zostaje przy epiku, który go wydzielił.

Żadne dziecko nie jest `in-progress` ani nie blokuje zamknięcia.

## Poza epikiem (stan floty 2026-11-07)

Notatka z 2026-10-10 o niezacommitowanych zmianach w innych repozytoriach była zdjęciem stanu drzew roboczych,
a nie pracą tego epiku, więc przestała tu obowiązywać. Sprawdzone w tej sesji (tylko odczyt, liczba plików ze
zmianami w `git status`): juz-ide-api-2 29, ai-os-bot 44, juz-ide-mobile-app 32, marketing-hub 22, aegis-flow 17,
juz-ide-api-3 2, juz-ide-api-4 2, grant-flow 2, iam 1, juz-ide-api-1 1, platform 0.

Przyczyn z 2026-10-10 (brak `firebase-admin` w api-2, limit czasu testów NX w api-3) nie sprawdzano ponownie.
juz-ide-api-4 pozostaje pominięte decyzją użytkownika. Dryf konfiguracji projektów zgłasza codzienny audyt floty
do skrzynki (`DEV-aud-*`, dziś 3 `proposed` i 4 `dismissed`); to jego kanał, nie epiku.
