# ADR 0012 — Metryki przebiegów: wspólny format zdarzeń v1

**Status**: accepted (2026-10-10) — kroki 1–3 i 5 wdrożone, 4 i 6 kolejno
**Rozszerzony przez**: [ADR 0013](0013-zalazki-wpisow-blogowych.md) — `kind: seed`, `process: blog-seed` (zalążki wpisów, tylko kody).
**Aneks (2026-10-18, TASK-OBS-010)**: lista zamknięta `process` dostaje wartość `pre-commit` — bramki
`scripts/pre-commit-guards.mjs` (jeden commit = jeden przebieg, krok per bramka, `step.role` = stała nazwa
bramki bez nazw plików). Zapis best-effort, bez skanu dedupu (`dedup: false`), żeby narzut został poniżej 100 ms.
**Aneks (2026-10-22, TASK-OBS-011)**: lista zamknięta `process` dostaje wartość `hook` — blokady z hooków
(`hooks/lib/hook-telemetry.js`). Zapis TYLKO przy zablokowaniu: `step.end`, `outcome: halted`,
`step.role` = `<hook>:<reguła>`, `runId` = `hook-<RRRRMMDD>`; przepuszczenie i tryb ostrzegawczy nie zapisują nic.
Bez treści komendy, ścieżek i `session_id`; projekt = katalog roboczy hooka. Błąd zapisu nie zmienia decyzji
hooka, a `HOOK_TELEMETRY=off` wyłącza zapis.
**Rozszerza**: [ADR 0011](0011-raportowanie-dryfu-i-telemetria-floty.md) (punkt B6 — telemetria floty)
**Context source**: decyzja użytkownika z 2026-10-10: „jak będziemy wstawiać tylko problemy, to nie
da nam to procentowego rozbicia dobre vs błędy" + docelowo metryki trafiają na serwer zespołu
rozwijającego claude-patterns, który podejmuje decyzje rozwojowe na podstawie danych.

---

## Kontekst

Stan na 2026-10-10:

| Kanał | Co ma | Czego nie ma |
|---|---|---|
| `docs/tasks/_inbox/` | tylko problemy, 1 plik na sygnaturę, dobre opisy | mianownika — nie wiadomo, z ilu prób |
| `~/.claude/metrics/workflow-steps.jsonl` | każdy krok `/orchestrate` (11 220 kroków, 867 przebiegów), także udany | planu (ile kroków zaplanowano), powiązania naprawa→błąd, spójnych wyników (`NO-GO` i `NO_GO` obok siebie), kosztu kroku (`costUsd: null`), prawdziwego TS-ID |
| `/analyze` | nic — panel to wywołania narzędzia Agent z głównej pętli, nie Workflow, więc hook metryk go nie widzi | wszystkiego |
| audyt, setup | zgłoszenia błędów do skrzynki | wyników OK, więc i odsetka zdrowia floty |

Już z istniejących danych wychodzi: 74% GO / 26% NO-GO werdyktów weryfikatorów, 3,9% kroków
kończy się cichym zgonem agenta. Tego nie było nigdzie widać.

## Decyzja

### 1. Dwa strumienie, połączone identyfikatorami — nie jeden plik

| | **Zdarzenia** (metryki) | **Skrzynka** (ustalenia) |
|---|---|---|
| zawartość | każdy krok każdego procesu, także udany | problem wart naprawy, z opisem |
| wolumen | tysiące dziennie | kilka dziennie |
| forma | JSONL append-only | markdown w gicie, edytowany w triage |
| odpowiada na | ile, jak często, ile kosztuje | co dokładnie i dlaczego |

Połączenie: `report-deviation.mjs` przy KAŻDYM wywołaniu (także gdy `--once-per-project`
pomija wpis w skrzynce) dopisuje zdarzenie `deviation` z `signature` = id rekordu skrzynki
i `runId`. Skrzynka mierzy zasięg problemu, zdarzenia jego częstość; dashboard liczy
procenty ze zdarzeń, a szczegóły pokazuje z rekordu skrzynki o tej sygnaturze.

Skrzynka zostaje markdownem (edytują ją ludzie w triage; nagłówek YAML jest już maszynowy).
Podział na rodzaje błędów daje pole `category` rekordu = `cause` zdarzenia `deviation` — jedna
lista dla obu strumieni (`defaultCategory(trigger)` w `telemetry-events.mjs`, nadpisywalne
`--category`). Widok maszynowy skrzynki dla dashboardu: generowany `_inbox/index.json`
(TASK-OBS-005). Postęp prac: [EP-OBSERVABILITY-001](../tasks/EP-OBSERVABILITY-001.md).

### 2. Format zdarzenia v1 — niezależny od procesu

Kontrakt: [`schemas/telemetry-event-v1.schema.json`](../../schemas/telemetry-event-v1.schema.json);
implementacja zapisu: `scripts/lib/telemetry-events.mjs` (eval pilnuje zgodności list z
schematem).

- `kind`: `run.start` (z `plan` — listą zaplanowanych kroków), `step.end`, `run.end`, `deviation`.
- `engine` (opcjonalne, w `run.start`): krótki hash commitu claude-patterns (`git rev-parse --short HEAD`),
  `null` bez gita. Zmiany silnika wchodzą do wszystkich projektów naraz przez symlinki, więc samo
  zdarzenie musi nieść wersję, która je wygenerowała; pole opcjonalne, więc `v: 1` zostaje. Agregat
  dzienny liczy wtedy `engines.<hash>.<proces>` (przebiegi, wyniki, kroki, zgony, koszt); przebiegi bez
  `engine` nie tworzą bloku, więc agregaty historii się nie zmieniają.
- **Plan orchestrate a runId (TASK-OBS-006)**: `runId` Workflow (`wf_…`) powstaje dopiero przy wywołaniu
  narzędzia, więc prepare go nie zna. Rozstrzygnięcie: plan i `engine` jadą w argumentach skryptu
  (`telemetryPlan`, `engine` z `orchestrate-prepare`), skrypt zwraca je w `result`, a collector
  (`runResultFields`) dopina je do `run.start` po `wf.runId`. Zero przekazywania id między krokami;
  plan = warstwy faktycznie uruchamiane × (implementer, verifier) + `final:gate`, liczony po overrides.
- `process`: `orchestrate | workflow | analyze | audit | setup` — lista zamknięta (`workflow` =
  ręcznie pisany skrypt Workflow, `orchestrate` = tylko skrypt kanoniczny); nowy proces = świadoma
  zmiana schematu, jak w taksonomii tagów.
- `outcome` (zamknięty): `ok go no_go fixed failed died skipped cached halted killed unknown`.
  Stare wartości są normalizowane (`NO-GO`/`NO_GO` → `no_go`, `silent-death` → `died`,
  `GO_WITH_CONDITIONS` → `go`, `not-started` → `skipped`, `completed` → `ok`).
- `cause` (zamknięty): `typecheck test lint verifier scope config infra silent budget other`.
- `step.fixes`: id kroku, który ten krok naprawia — z tego wynika „NO-GO → naprawione / otwarte".
- `m`: `toolCalls durationMs tokensIn tokensOut cacheRead cacheWrite costUsd`.
- Każde zdarzenie ma `id` (UUID — idempotentny upload na serwer) i `host`
  (pseudonim maszyny: skrót SHA z hosta i użytkownika, nie nazwa).

### 3. Prywatność — od pierwszego zdarzenia, nie dopiero przy wysyłce

Zdarzenie NIE zawiera: treści promptów, treści `reason` ze skrzynki, ścieżek plików, nazw
tasków poza `taskRef` (TS-ID), niczego z konfiguracji projektu (np. assetów z `scope.yaml`
aegis-flow). Opis problemu żyje w skrzynce, w gicie — zdarzenie niesie tylko jego sygnaturę.
`taskRef` zostaje lokalnie; agregaty i wysyłka na serwer go pomijają.

### 4. Gdzie leżą dane

- Surowe zdarzenia: `claude-patterns/telemetry/events/<RRRR-MM>.jsonl` — centralnie w repo,
  ale **poza gitem** (per maszyna, wysoka zmienność, konflikty przy commitach z wielu maszyn).
  Ścieżkę nadpisuje `CLAUDE_TELEMETRY_DIR` (testy).
- Agregaty dzienne: `claude-patterns/telemetry/rollups/<projekt>/<dzień>.<host>.json` — w gicie
  (krok 5; host w nazwie, bo surowe zdarzenia są per maszyna).
- Serwer (później): transport czyta te same pliki; `id` zdarzenia zapewnia deduplikację.
  Format v1 jest kontraktem tego transportu — zmiana niekompatybilna = `v: 2`.

### 5. Emitery

| Proces | Mechanizm |
|---|---|
| orchestrate | `orchestrate-prepare` → `run.start` z planem warstw; collector (`workflow-metrics-collect.mjs`) → `step.end`/`run.end` w v1 |
| analyze | `scripts/telemetry-emit.mjs run-start/run-end` z komendy + dwa ogólne hooki: PostToolUse(Agent) przypina agenta do slotu otwartego przebiegu, SubagentStop zamyka jego krok (ten sam mechanizm dla każdego przyszłego procesu bez Workflow, krok 3) |
| audit | przebieg + wynik każdej kontroli w każdym projekcie, także OK |
| setup | `run.start/run.end` + `deviation` (ADR 0011 B3) |
| report-deviation | zawsze `deviation` |

Zapis zdarzeń jest best-effort: błąd zapisu idzie na stderr i nigdy nie przerywa procesu,
który go wywołał.

### 6. Metryki docelowe

First-pass yield (krok przechodzi weryfikację w 1. próbie), udział napraw (kroków i kosztu
przy `attempt > 1`), skuteczność napraw (`fixed` vs `halted`), gęstość odstępstw (deviation
na 100 kroków per sygnatura), cichy zgon / eskalacje / zabite przebiegi, koszt i czas na task
i rolę, dla analizy: pytania otwarte, pominięte stage panelu, odsetek zatwierdzeń; dla floty:
odsetek kontroli audytu na OK dzień po dniu.

### Transport agregatów na serwer zespołu (kontrakt, TASK-OBS-008)

Na serwer jadą agregaty dzienne, nie surowe zdarzenia. `scripts/telemetry-export.mjs` składa paczkę
`{ v: 1, kind: 'rollup-batch', hosts, rollups[] }` z `telemetry/rollups/`.

- **Biała lista zamiast czyszczenia.** Paczka powstaje od zera z pól, które znamy (liczniki, percentyle,
  `project`/`day`/`host`). Nowe pole w rollupie samo nie wyjedzie. Drugą linią obrony jest `findLeaks`:
  skan kluczy i napisów pod kątem ścieżek, białych znaków i id zadań (eksport kończy się exit 1).
- **Odstępstwa bez sygnatur.** Klucz odstępstwa (`DEV-…`) powstaje z treści zgłoszenia, więc mógłby nieść
  nazwy z projektu. Wychodzą liczniki per (przyczyna, wyzwalacz).
- **Idempotencja.** `rollups[].id` = stabilna funkcja `projekt|dzień|host`; odbiorca robi upsert po `id`
  (zastępuje). Przeliczenie dnia zmienia `contentHash`, ale nie `id`, więc ponowna wysyłka niczego nie dubluje.
- **Nie ma jeszcze wysyłki.** Skrypt tylko buduje paczkę. Adres serwera, uwierzytelnienie i harmonogram
  to osobna decyzja; nazwa projektu (`project`) jedzie jawnie — anonimizacja to decyzja po stronie zespołu.

## Kolejność wdrożenia

1. **(2026-10-10)** Schemat v1, `scripts/lib/telemetry-events.mjs`, `scripts/telemetry-emit.mjs`,
   `report-deviation` → `deviation`, eval `telemetry-events`.
2. Orchestrate: plan w `run.start`, collector w v1, normalizacja wyników, `fixes`, koszt kroku,
   prawdziwy TS-ID; migracja 11 tys. historycznych kroków (trend od pierwszego dnia).
   **Wdrożone 2026-10-10 (bez planu w `run.start`)**: `scripts/lib/telemetry-legacy.mjs`
   (jeden konwerter dla collectora i migracji), collector zapisuje v1 równolegle ze starym
   formatem, `scripts/telemetry-migrate-legacy.mjs` przeniósł 12 953 zdarzenia (867 przebiegów,
   od 2026-07), 0 odrzuconych, powtórka idempotentna. Ustalenia z danych:
   - `attempt` w starym rekordzie = 1 w 99% kroków; runda siedzi w etykiecie
     (`<warstwa>:<jednostka>-<rola>[-<runda>]`) — z niej rola, próba i `fixes` (146 napraw);
   - ~~`taskId`~~ to losowy identyfikator narzędzia; prawdziwy TS-ID jest w `result.taskId`
     (collector zapisuje go teraz jako `taskRef`; pokrycie kanonicznych przebiegów 0 → 393/420);
   - kanoniczny skrypt zawsze kończy się `completed`/`STAGE_NOT_COMMIT`, a `result.escalatedAt`
     nie istnieje — stara telemetria pokazywała 420/420 udanych. Po uwzględnieniu werdyktu
     bramki końcowej (`result.finalGate.verdict` → `finalVerdict`): **172/420 (41%) przebiegów
     kończy się NO_GO bramki końcowej**;
   - ręczne skrypty Workflow (`process: workflow`, 447 przebiegów) mają 65,4% werdyktów GO w
     pierwszej próbie wobec 89,3% kanonicznego skryptu.
   Plan w `run.start` czeka na `orchestrate-prepare.mjs` (staged zmiany innej sesji).
3. Analyze: `run-start/run-end` w `commands/analyze.md` + hooki PostToolUse(Agent) i SubagentStop.
   **Wdrożone 2026-10-10** (TASK-OBS-003). Projekt z pierwszej wersji ADR-a („jeden hook
   PostToolUse(Agent) pisze `step.end`") nie wytrzymał sprawdzenia na żywym payloadzie:
   - narzędzie Agent zwraca `async_launched` (agentId, model, plik wyjścia) — bez tokenów, czasu i
     wyniku, bo agent dopiero startuje. Koniec agenta widzi dopiero SubagentStop (`agent_id`,
     ścieżka transkryptu, ostatnia odpowiedź). Oba hooki dzielą `agentId` i `session_id`;
   - **SubagentStop potrafi wyprzedzić PostToolUse** tego samego agenta (szybki agent, zmierzone na
     żywo). Hook stop zostawia wtedy „oczekujące zatrzymanie", a hook startu po rejestracji domyka
     krok. Każda strona po własnym zapisie zagląda do drugiej, więc żadna kolejność nie gubi zdarzenia.

   Jak to działa teraz:
   - stan w `telemetry/sessions/` (poza gitem): `runs/<runId>.json` otwiera `run-start`,
     `agents/<agentId>.json` zapisuje hook startu, `stops/<agentId>.json` czeka na rejestrację.
     Plik NA AGENTA, nie wspólny plik sesji — panel odpala agentów równolegle;
   - slot agenta z markera `[slot:<id>]` na początku `description` (wpisuje go komenda,
     ANL-041). Reszta opisu to tekst z promptu i nie jest zapisywana. Agent bez markera nie jest krokiem panelu;
   - wynik kroku z transkryptu i odpowiedzi: błąd API na końcu → `failed`/`infra`, pusta odpowiedź →
     `died`/`silent`, reszta → `ok`. Czas z sygnatur czasowych transkryptu, tokeny i koszt z tej samej
     funkcji co `subagent-stop-cost-log.js`;
   - `run-end` dopisuje `skipped` dla slotów z planu bez agenta i `unknown` dla agentów bez końca,
     potem `run.end`, i kasuje stan. Przebieg starszy niż 6 h (`CLAUDE_TELEMETRY_RUN_TTL_MS`)
     hooki ignorują, a następny `run-start` zamyka go zdarzeniem `run.end` z `unknown`.

   Czego nie ma: `killed` (agent zatrzymany przez TaskStop) — payload SubagentStop nie niesie takiego
   znacznika, więc takie kroki wychodzą jako `ok`/`died`. `costUsd` jest `null` dla modeli bez
   wpisu w `~/.claude/metrics/prices.json`. Hooki są w `hooks/hooks.json`; do `~/.claude/settings.json`
   trafiają przez `node scripts/sync-global-hooks.mjs --apply`.
4. Audit i setup.
5. Rollup dzienny `telemetry-aggregate.mjs` → `telemetry/rollups/`.
   **Wdrożone 2026-10-10 (TASK-OBS-005)**: `scripts/telemetry-aggregate.mjs` i czysta funkcja
   `scripts/lib/telemetry-rollup.mjs` (zdarzenia → agregat), jeden plik na projekt × dzień × **host**:
   `telemetry/rollups/<projekt>/<RRRR-MM-DD>.<host>.json`. Host w nazwie odstępuje od pierwotnego
   `<dzień>.json`: surowe zdarzenia leżą poza gitem i nie scalają się między maszynami, więc plik
   z jednej maszyny nadpisałby plik drugiej, a percentyle nie dają się sumować. Plik hosta niesie
   liczniki (odbiorca je sumuje) i percentyle (lokalne). Zawartość per proces × rola: liczniki
   `outcome` i `cause`, p50/p90 czasu, koszt i liczba kroków bez kosztu, kroki z `attempt > 1`
   wraz z kosztem, `verification {units, firstPassGo}`, `repairs {fixSteps, fixed, open}`; osobno
   `run.end` per wynik i gęstość `deviation` per sygnatura. Bez `taskRef`, `runId`, ścieżek i id
   kroków (te zdradzają nazwy jednostek z konfiguracji projektu) — pilnuje tego eval.
   - **first-pass** = odsetek jednostek, których PIERWSZY werdykt weryfikatora to `go`. Jednostka =
     id kroku bez numeru rundy (`#N`, `.N`, `:N`, `:aN` — w danych jest kilka postaci); werdykt
     liczy się do dnia, w którym zapadł, więc przebieg przez północ nie dubluje jednostek.
     Na danych z 2026-10-10: orchestrate 86,6%, workflow 68,0%. Liczb 89,3% / 65,4% z kroku 2
     nie udało się odtworzyć żadną z prób (jednostki, `attempt ≤ 1`, wszystkie werdykty dają
     86,6–89,5% i 68,0–69,3%) — krok 2 liczył najpewniej inaczej; obowiązuje definicja z agregatu.
   - **skuteczność napraw**: krok z `fixes` jest naprawiony, gdy kolejny werdykt tej samej
     jednostki w przebiegu to `go`, inaczej otwarty. `fixes` ma tylko orchestrate (151 kroków:
     131 naprawionych, 20 otwartych); ręczne skrypty Workflow nie zapisują go wcale.
   - **koszt napraw** (kroki `attempt > 1`): orchestrate 22,3% kosztu, workflow 8,1%. Kroki bez
     `costUsd` (np. model spoza `prices.json`) są liczone osobno (`stepsWithoutCost`), żeby suma
     kosztu nie udawała kompletu.
   - **cron**: `45 7 * * 1-5` po audycie floty, `--since` 3 dni wstecz (idempotentny), log
     `~/.claude/metrics/telemetry-aggregate.log`. Przeliczone pliki zostają w drzewie jako zmiany
     niezacommitowane — commituje człowiek, tak jak skrzynkę. `--check` wykrywa nieaktualny plik,
     ale nie jest w pre-commit: zdarzenia są per maszyna, więc bramka padałaby na innej.
   - **indeks skrzynki** `docs/tasks/_inbox/index.json` (`scripts/generate-inbox-index.mjs`):
     id, status, trigger, category, sources, occurrences, projects, first_seen, last_seen;
     rekord bez `category` dostaje `defaultCategory(trigger)`, bez `sources` — `orchestrate`.
     Czytnik nagłówków jest wspólny z `report-deviation` (`scripts/lib/inbox.mjs`).
     `--check` w pre-commit odpala się tylko, gdy w commicie są pliki z `_inbox/`: rekordy
     skrzynki są u zgłaszającego nietrackowane, więc bramka na każdy commit padałaby na maszynie,
     która ich nie ma.
6. Dashboard (terminal na żywo, potem web) i transport na serwer.

## Konsekwencje

- Jedno źródło liczb dla wszystkich procesów; dashboard i serwer nie znają różnic między
  orchestrate a analyze — widzą proces, rolę, wynik, przyczynę.
- `workflow-steps.jsonl` żyje równolegle do zakończenia kroku 2 (istniejące raporty
  `workflow-metrics-report.mjs` i `telemetry-freshness.mjs` z niego czytają).
- Zamknięte listy `outcome`/`cause` wymuszają klasyfikację u źródła; „other" jest dozwolone,
  ale jego udział sam jest metryką jakości danych.
