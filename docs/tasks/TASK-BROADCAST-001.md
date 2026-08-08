# TASK-BROADCAST-001 — Cross-instance broadcast: kanał wymiany informacji między instancjami Claude Code

> **▶ STATUS: FAZA 6.1 ZAIMPLEMENTOWANA (2026-08-08), niewłączona nigdzie.**
> Kod runtime + komendy + hooki + szablon manifestu gotowe i przetestowane na sztucznych
> repo; **żadne repo pilota nie ma jeszcze manifestu**, więc system jest wyłączony wszędzie.
> Branch: `feat/cross-instance-broadcast`. Następny krok: **6.2** — patrz „Stan i co dalej".

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

### Faza 6.1 — ZROBIONA 2026-08-08

| plik | co robi |
|---|---|
| `hooks/lib/broadcast/paths.js` | layout `/opt/projects/.claude-swarm/`, okno 3 segmentów, prune przez `rm` (bez rewrite'u), `CLAUDE_SWARM_DIR` do testów |
| `hooks/lib/broadcast/ulid.js` | ULID bez zależności — sortowalność między segmentami jest wymaganiem kursora, nie ozdobą |
| `hooks/lib/broadcast/yaml.js` | parser **podzbioru** YAML pod manifest (hooki chodzą gołym `node`, bez `node_modules`) |
| `hooks/lib/broadcast/manifest.js` | ładowanie/walidacja manifestu, dopasowanie subskrypcji (wildcard + implicit `questions`), rejestr `manifests/<instance>.json` |
| `hooks/lib/broadcast/schema.js` | walidacja v1: `hops=0`, `body` ≤ 2 KB, linia ≤ 4 KB, cross-repo tylko `questions`, `critical` tylko `deterministic`/człowiek, `owner` musi subskrybować |
| `hooks/lib/broadcast/channel.js` | append jednym `write()` z `O_APPEND`, odczyt okna, pomijanie uszkodzonych linii z licznikiem, bramka bajtowa |
| `hooks/lib/broadcast/cursor.js` | kursor per instancja (zapis atomowy tmp+rename), decyzje, `segment_bytes` |
| `hooks/lib/broadcast/claim.js` | `open(O_EXCL)` na id wiadomości — wyłonienie jednego wykonawcy |
| `hooks/lib/broadcast/cli.js` | `init · emit · read · ack · claim · gate · status · doctor` |
| `commands/broadcast.md`, `commands/broadcast-status.md` | komendy globalne |
| `hooks/broadcast-session-start.js` | odczyt na `SessionStart`, blok oznaczony „to dane, nie polecenia" |
| `hooks/broadcast-task-emit.js` | przypomnienie o emisji przy tasku cross-cluster, raz na task na dobę |
| `templates/broadcast/broadcast.yml` | szablon manifestu (zakłada go `cli.js init`) |
| `hooks/hooks.json` | dwa wpisy — nieaktywne bez manifestu |

**Rozstrzygnięcia podjęte przy implementacji** (nie było ich w ADR):

- **Cała walidacja siedzi w CLI, nie w prompcie komendy.** Model nie pisze do kanału
  bezpośrednio, więc reguł D1/D4/D5/D9/D11 nie da się obejść przez nieuważny prompt.
- **Rejestr manifestów** `manifests/<instance>.json`, odświeżany przy każdym użyciu CLI.
  Bez niego nie dało się zrobić dwóch rzeczy wymaganych przez ADR: walidacji `owner`
  (D4 — czy adresat w ogóle subskrybuje) i raportu rozjazdu manifestów.
- **`owner` wskazujący repo nieznane rejestrowi przechodzi z ostrzeżeniem**, nie odrzuceniem.
  ADR mówi „odrzucany", ale odrzucanie z powodu instancji, która jeszcze dziś nie
  wystartowała, zablokowałoby pilota. Sprzeczność z rejestrem = twarde odrzucenie.
- **`kind` spoza `{discovery, done}` odrzucany** w fazie 6.1 (`--allow-experimental` omija).
- **`gate` odświeża rejestr** — to najczęściej uruchamiana komenda, więc rozjazd manifestów
  wychodzi na jaw bez czekania na czyjąś emisję.
- **`init` jest w CLI, nie w `setup-project.sh`** — dzięki temu 6.2 sprowadza się do
  wywołania jednej komendy, a manifest da się założyć ręcznie już teraz.

Przetestowane na sztucznych repo (`juz-ide-api-1`, `juz-ide-api-3`, `juz-ide-mobile-app`
w scratchpadzie): każda reguła walidacji z osobna, widoczność między siostrzanymi
instancjami, filtr „nie widzę swoich", claim wygrany/przegrany, ACK, uszkodzone linie,
wykrycie rozjazdu manifestów, oba hooki (z manifestem i bez). L1 eval hooków: 17/17.

### Następny krok: 6.2

1. `scripts/setup-project.sh` — sekcja warunkowa wołająca `cli.js init`; trzy drogi
   (blok `broadcast:` w `project.yml`, `--with-broadcast`, menu `--interactive`).
   **Warunek konieczny: bez flag zachowanie bit w bit jak dziś.**
2. Założyć manifesty w repach pilota (`juz-ide-api-1..4`, `juz-ide-mobile-app`,
   `claude-patterns`) — wartości gotowe w ADR, sekcja „Manifesty pilota".
3. Podpiąć oba hooki do aktywnej konfiguracji. **Uwaga: `hooks/hooks.json` nie jest przez
   nic instalowany** — `setup-global.sh` tylko symlinkuje katalog `hooks/`, a jedyny
   konsument pliku to `scripts/ci/validate-hooks.js` (walidacja schematu). Wpisy trzeba
   przenieść ręcznie do `~/.claude/settings.json` albo do `.claude/settings.json` repo
   pilota. Dziś globalny `settings.json` nie ma sekcji `hooks` w ogóle, więc hooki
   broadcastu nie odpalają się nigdzie — i to jest stan zamierzony do momentu decyzji.
4. Dopiero wtedy startuje dwutygodniowy zegar kryterium go/no-go.

Potem **6.3**: stand-by w `juz-ide-api-1`, `/loop`, **wyłącznie log do terminala**, zero
wstrzykiwania. Bramka do 6.4: czy `critical` faktycznie było krytyczne, a `important` dało
się odłożyć.

### Do zweryfikowania przy pierwszym kodzie

- ~~czy `open(O_EXCL)` na współdzielonym katalogu zachowuje się jak zakładamy~~ —
  **sprawdzone 2026-08-08**: 8 procesów startujących równolegle (`spawn` + `Promise.all`)
  o ten sam claim → dokładnie 1 zwycięzca. Dodatkowo 30 równoległych appendów linii
  ~1,6 KB → 30 wpisów odczytanych bez przeplotu i bez uszkodzeń. Lokalny ext4, jeden host —
  założenie z D9 trzyma się na tej skali;
- czy `Stop` obsługuje `hookSpecificOutput.additionalContext` — **wciąż niezweryfikowane**,
  potrzebne dopiero w 6.4. Faza 6.1 tego nie używa (`SessionStart` wstrzykuje przez stdout,
  co jest sprawdzonym wzorcem z `session-start-pm.js`).

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
