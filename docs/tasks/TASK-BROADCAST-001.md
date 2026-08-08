# TASK-BROADCAST-001 — Cross-instance broadcast: kanał wymiany informacji między instancjami Claude Code

> **▶ STATUS: READY (2026-08-02).** Spec kompletny i zrecenzowany, **wszystkie twarde blokady
> zdjęte**, implementacja jeszcze nie ruszyła (kodu: zero). Branch: `feat/cross-instance-broadcast`.
> Następny krok: **faza 6.1** — patrz sekcja „Stan i co dalej" na końcu pliku.

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
| ~~`CI-DEVEX-001`~~ | zamknięte 2026-08-02 | **ADR 0007 D4**: lefthook = bramka dla człowieka bez Claude Code (w repo), hooki Claude zostają centralnie dla agenta; jedna implementacja checku, dwóch wywołujących. Mobile **zostaje w pilocie**. |
| ~~`workflow-watcher.js` / `RUN-STATE.md`~~ | zamknięte 2026-08-02 | Werdykt: **częściowe reużycie wzorców, osobne byty** — szczegóły w ADR, sekcja „Reużycie z workflow-watcher.js". Watcher obecnie nie chodzi (ręczny, brak w `hooks.json`). |
| **Własny kill-switch stand-by** | nowa, twarda dla 6.3 | `KILL` działa tylko na subagentów; stand-by przez `/loop` to main agent → potrzebny `.claude-swarm/STOP` |
| **OQ2, OQ3, OQ5-OQ8** | blokują fazy 6.3-6.5 | rekomendacje w ADR, decyzje po pilocie |

## Precedens do uszanowania

`TS-TEST-HISTORY-001` (`juz-ide-api`, done) zawiera świadomą decyzję: *„nie budować sieciowej
synchronizacji między instancjami — git sha + branch jako klucz"*. Broadcast jej **nie łamie**
(kanał to lokalny plik na współdzielonym filesystemie, nie sieć), ale należy to jawnie
odnotować przy implementacji, żeby nie wyglądało na cichą zmianę kursu.

## Stan i co dalej (aktualizacja 2026-08-02, przed przejściem na świeży kontekst)

### Zrobione — same dokumenty, kodu zero

| commit | co |
|---|---|
| `1109a75` | ADR 0006: OQ1 + OQ4 rozstrzygnięte, D11 `severity`, poprawki spójności z review |
| `7e10034` | weryfikacja `workflow-watcher.js` — werdykt: częściowe reużycie wzorców, byty osobne |
| `16d7436` | ADR 0007 (zarządzanie lokalnym setupem) + zastrzeżenie zakresu nazwy „broadcast" |
| `f35deb2` | D7 przepisane (`/loop` + bramka pustego przebiegu), OQ3 przeformułowane |

### Rozstrzygnięcia, które trzeba znać zaczynając od zera

- **Nazwa**: „broadcast" = **cały system** (kanał, stand-by, wstrzykiwanie, pytania, audyt),
  nie sam plik. Kanał jest tylko warstwą transportową.
- **Cały kod w `claude-patterns`.** Repo serwisowe dostaje wyłącznie
  `.claude/config/broadcast.yml`, nieśledzony przez `.git/info/exclude` — zero zmian
  śledzonych. Stan runtime w `/opt/projects/.claude-swarm/`, poza wszystkimi repo.
- **`severity` decyduje o torze** (D11): `critical` przerywa, `important` czeka do końca
  bloku pracy, `info` tylko w `/broadcast-status`. `critical` wolno nadać wyłącznie klasie
  `deterministic` albo człowiekowi.
- **Stand-by przez `/loop` z bramką pustego przebiegu** (D7) — nie hook, nie `claude -p`
  z hooka (odrzucone, powody w ADR). Interwał wyjściowy 3 min. `/loop` napędza **ocenę**,
  hooki realizują **dostarczenie**.
- **`tmux send-keys` nigdy nie niesie treści** (D8) — dostarczanie przez inbox + hook.
- Z `workflow-watcher.js` reużywamy **wzorce, nie kod**: czytelnik inkrementalny
  (`:132-154`), layout `renderRunState` (`:232-258`), rozdział raportuje/egzekwuje,
  opt-in per projekt.

### Następny krok: faza 6.1

Pliki do napisania (wszystkie w `claude-patterns`, szczegóły w sekcji „Zakres" wyżej):

1. `hooks/lib/broadcast/` — segmenty dzienne, kursory, claim `O_EXCL`, manifest,
   walidacja schematu v1 (z polem `severity`, limit `body` 2 KB, odrzucanie `hops >= 1`,
   cross-repo tylko dla `questions`)
2. `commands/broadcast.md` + `commands/broadcast-status.md`
3. `hooks/broadcast-session-start.js` (odczyt) i `hooks/broadcast-task-emit.js`
   (`PostToolUse` na `tasks/` — przypomnienie o emisji; **bez tego faza 1 nie ma czego mierzyć**)
4. `templates/broadcast/broadcast.yml` + sekcja w `scripts/setup-project.sh`
   (warunkowa, `--with-broadcast` / `--interactive`; **bez flag zachowanie bit w bit jak dziś**)

Potem **6.3**: stand-by w `juz-ide-api-1`, `/loop`, **wyłącznie log do terminala**, zero
wstrzykiwania. Bramka do 6.4: czy `critical` faktycznie było krytyczne, a `important` dało
się odłożyć.

### Do zweryfikowania przy pierwszym kodzie (nie zakładać)

- czy `Stop` obsługuje `hookSpecificOutput.additionalContext` (potrzebne dopiero w 6.4;
  wiedza pochodzi z odpowiedzi agenta czytającego dokumentację, nie ze sprawdzonego działania);
- czy `open(O_EXCL)` na współdzielonym katalogu zachowuje się jak zakładamy przy 4 instancjach.

### Zaległość niezwiązana, ale warta odhaczenia

`patterns/flutter/either-error-pattern.md` (commit `b0ef096`) i nowy
`patterns/infrastructure/external-adapter-pattern.md` są **niewidoczne dla
`retrieve_patterns`** do czasu `./scripts/reseed-patterns.sh`. Reseed to pełny `recreate()`,
więc warto zebrać zmiany wzorców i puścić raz.

---

## Powiązane

- ADR 0006 — spec (D0-D10, OQ1-OQ8, model wiadomości, plan faz)
- `docs/ROADMAP.md` Sprint 6 — rozbicie na 6.1-6.5
- `TASK-OBS-001` — `workflow-watcher.js`, kandydat na punkt integracji
- ADR 0003 — obserwowalność zewnętrzna
- `/api-schema-sync`, `/conformance-check` — deterministyczne źródła zdarzeń (D10, faza 6.5)
