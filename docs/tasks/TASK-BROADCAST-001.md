# TASK-BROADCAST-001 — Cross-instance broadcast: kanał wymiany informacji między instancjami Claude Code

> **⏸ STATUS: BLOCKED (2026-08-02).** Spec gotowy i zrecenzowany, implementacja **nie ruszyła**.
> OQ1 i OQ4 rozstrzygnięte (D11: `severity` → tor dostarczenia). Pozostałe blokady miękkie.
> Kolejność uzgodniona 2026-08-02: stand-by w `juz-ide-api-1` **tylko z logiem do terminala**,
> wstrzykiwanie dopiero gdy filtr okaże się trafny. Otwarte: `CI-DEVEX-001` (hooki globalne czy vendorowane) + weryfikacja `workflow-watcher.js`.

**Źródło:** [`docs/adr/0006-cross-instance-broadcast.md`](../adr/0006-cross-instance-broadcast.md)
(status `proposed`, review architektoniczny 2026-08-02) — D0-D11, OQ1 + OQ4 rozstrzygnięte.
**Plan wykonawczy:** `docs/ROADMAP.md` → Sprint 6 (pozycje 6.1-6.5).
**Priorytet:** średni — nic nie jest zablokowane *na* tym tasku; wartość rośnie z liczbą
równoległych instancji.

## Problem

Przy pracy na 2-4 równoległych instancjach Claude Code (`juz-ide-api-1..4` to cztery klony
jednego repo, każdy na własnym branchu) informacja o decyzjach jednej instancji dociera do
pozostałych **dopiero przy merge do `develop`** — czyli po dniach, po napisaniu kodu na
nieaktualnym założeniu. Dziś jedynym kanałem są ręczne sekcje handoff w `KANBAN.md`, które
przy mergu same generują konflikty.

Dowód, że to realny koszt, a nie hipoteza: `TS-PRICING-UNIFIED-CATALOG-001` w `juz-ide-api-1`
jest `blocked` dokładnie na koordynacji cross-instance (czeka, aż tabela z `api-2` trafi do
`develop`).

## Zakres — co gdzie powstaje

**Cały kod w `claude-patterns`.** Repo serwisowe dostaje wyłącznie
`.claude/config/broadcast.yml`, nieśledzony (wykluczenie w `.git/info/exclude`, per klon) —
**zero zmian śledzonych w repo serwisowym**. Stan runtime w `/opt/projects/.claude-swarm/`,
poza wszystkimi repozytoriami. Rollback całości = `rm -rf` jednego katalogu.

| ścieżka (w `claude-patterns`) | zawartość |
|---|---|
| `hooks/lib/broadcast/` | runtime: segmenty dzienne, kursory, claim `O_EXCL`, manifest, walidacja schematu v1 |
| `hooks/broadcast-session-start.js` | odczyt kanału na `SessionStart` |
| `hooks/broadcast-task-emit.js` | `PostToolUse` na `tasks/` — przypomnienie o emisji |
| `hooks/broadcast-inbox-inject.js` | `UserPromptSubmit` — inbox → prompt (faza 6.4) |
| `commands/broadcast.md`, `commands/broadcast-status.md` | komendy globalne |
| `skills/orchestration/broadcast-standby/` | pętla stand-by przez `/loop` (faza 6.3) |
| `templates/broadcast/broadcast.yml` | szablon manifestu |
| `scripts/setup-project.sh` | sekcja warunkowa + menu dodatków (faza 6.2) |

**Poza zakresem tego taska:** migracje bez sekwencyjności (ADR D0). ADR mówi wprost, że
migracje **nie są** przypadkiem użycia broadcastu — to alokacja współdzielonego zasobu, nie
deficyt informacji. Praca dotyczy konwencji w `juz-ide-api` i task powstaje tam.

## Zasada nadrzędna

**Wszystko additive i domyślnie wyłączone.** Brak `.claude/config/broadcast.yml` = system nie
istnieje dla danej instancji; hooki kończą `exit 0` przed jakąkolwiek pracą. Żaden istniejący
hook, skill ani plik nie zmienia zachowania. `setup-project.sh` bez flag musi zachować
dzisiejsze zachowanie bit w bit.

## Pilot (OQ1 rozstrzygnięte 2026-08-02)

| repo | instancje | emituje | subskrybuje |
|---|---|---|---|
| `juz-ide-api` | `juz-ide-api-1..4` | `geo`, `pricing`, `actor` | `juz-ide-api/*`, `juz-ide-mobile-app/contracts`, `claude-patterns/{hooks,agents}` |
| `juz-ide-mobile-app` | `juz-ide-mobile-app` | `ui-flows` | `juz-ide-api/{contracts,release}`, `claude-patterns/{hooks,agents}` |
| `claude-patterns` | `claude-patterns` | `patterns`, `agents`, `hooks` | — (źródło) |

Gotowe manifesty YAML: ADR, sekcja „Tabela własności topiców".

## Kryterium go/no-go (faza 6.1, po 2 tygodniach)

Hipoteza mogąca obalić całość: **czy agenty będą pisać sensowne `discovery`**.

- ≥1 wpis, który realnie zapobiegł pracy na nieaktualnym założeniu, **oraz**
- ≥30% wpisów ocenionych przez człowieka jako trafne.

Poniżej progu — porzucamy całość kosztem jednego katalogu i dwóch komend. Fazy 6.3-6.5 nie
mają wtedy czego przenosić.

## Blokady

| co | rodzaj | rozstrzygnięcie |
|---|---|---|
| ~~**OQ4**~~ — budżet hałasu | ✅ rozstrzygnięte 2026-08-02 | **D11**: `severity` (`critical`/`important`/`info`) decyduje o torze. `critical` przerywa (maks. 2 wpisy / ~1 KB), `important` czeka na koniec bloku pracy, `info` tylko w `/broadcast-status`. `critical` wolno nadać wyłącznie klasie `deterministic` lub człowiekowi. TTL 72 h |
| **`CI-DEVEX-001`** (`juz-ide-mobile-app`, `deferred`, P1) — chce przenieść hooki z `$HOME/.claude/hooks/` do repo | miękka, ale wywala mobile z pilota | decyzja: hooki broadcastu zostają globalne (symlink z `claude-patterns`) czy mobile wypada z pilota |
| **`workflow-watcher.js` / `RUN-STATE.md`** (TASK-OBS-001, DONE) — działający plikowy kanał sygnałowy z `halt.json` i kill-switchem | miękka, ryzyko duplikacji | przeczytać przed 6.1; ADR odrzucił daemon HTTP i git, ale **nie rozważył tego, co już działa** |
| **OQ2, OQ3, OQ5-OQ8** | blokują fazy 6.3-6.5 | rekomendacje w ADR, decyzje po pilocie |

## Precedens do uszanowania

`TS-TEST-HISTORY-001` (`juz-ide-api`, done) zawiera świadomą decyzję: *„nie budować sieciowej
synchronizacji między instancjami — git sha + branch jako klucz"*. Broadcast jej **nie łamie**
(kanał to lokalny plik na współdzielonym filesystemie, nie sieć), ale należy to jawnie
odnotować przy implementacji, żeby nie wyglądało na cichą zmianę kursu.

## Powiązane

- ADR 0006 — spec (D0-D10, OQ1-OQ8, model wiadomości, plan faz)
- `docs/ROADMAP.md` Sprint 6 — rozbicie na 6.1-6.5
- `TASK-OBS-001` — `workflow-watcher.js`, kandydat na punkt integracji
- ADR 0003 — obserwowalność zewnętrzna
- `/api-schema-sync`, `/conformance-check` — deterministyczne źródła zdarzeń (D10, faza 6.5)
