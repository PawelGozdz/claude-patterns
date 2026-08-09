# Broadcast — przewodnik operatorski

Kanał wymiany informacji między równoległymi instancjami Claude Code.

**Ten dokument mówi JAK tego używać.** Dlaczego akurat tak — patrz
[`adr/0006-cross-instance-broadcast.md`](adr/0006-cross-instance-broadcast.md) (specyfikacja
i odrzucone alternatywy). Historia wdrożenia — [`tasks/TASK-BROADCAST-001.md`](tasks/TASK-BROADCAST-001.md).

---

## 1. Co to rozwiązuje (i czego NIE rozwiązuje)

Pracujesz na kilku instancjach naraz — np. cztery klony `juz-ide-api` na czterech
branchach plus `juz-ide-mobile-app`. Instancja A ustala coś, co unieważnia założenie
instancji B. Dziś B dowiaduje się przy merge do `develop` — czyli po dniach, po napisaniu
kodu na nieaktualnym założeniu.

Broadcast skraca to do minut: A nadaje wpis, B widzi go przy najbliższym starcie sesji
albo przez agenta nasłuchującego.

**Czego to NIE jest:**

| nie służy do | dlaczego | co użyć zamiast |
|---|---|---|
| rezerwacji zasobu (numer migracji, port) | okno wyścigu to milisekundy, a agent czyta kanał raz na turę — dostaniesz *pozór* zabezpieczenia | timestamp/ULID w nazwie albo `open(O_EXCL)` na pliku claimu |
| trwałego zapisu decyzji | kanał ma TTL 72 h i celowo znika | `project-orchestration/tasks/`, ADR, git |
| komunikacji wewnątrz jednego klastra | ta informacja jest już w `tasks/` twojej instancji | po prostu task |
| synchronizacji przez sieć | zakłada wspólny lokalny filesystem, jeden host | nic — **NFS wyklucza ten mechanizm** |

---

## 2. Model w jednym obrazku

```
repo A, instancja 1 ─┐
repo A, instancja 2 ─┼─→  /opt/projects/.claude-swarm/events-YYYY-MM-DD.jsonl
repo B              ─┘         (append-only, okno 3 dni)
                                       │
                    ┌──────────────────┼──────────────────┐
                    ↓                  ↓                  ↓
             SessionStart        stand-by (/loop)     /broadcast-status
             (odczyt na          ocena + ACK          (raport, ~$0)
              starcie sesji)          │
                                      ↓
                               inbox/<instancja>.md
                                      ↓
                          UserPromptSubmit (DOMYŚLNIE WYŁĄCZONY)
```

Cały stan runtime leży w **jednym katalogu poza repozytoriami**:

```
/opt/projects/.claude-swarm/
  events-YYYY-MM-DD.jsonl    segmenty dzienne kanału
  cursors/<instancja>.json   co ta instancja już rozpatrzyła
  claims/<id-wiadomości>     kto wykonuje obowiązek (O_EXCL)
  inbox/<instancja>.md       kolejka do dostarczenia
  manifests/<instancja>.json rejestr konfiguracji (walidacja + wykrywanie rozjazdu)
  state/                     stan pomocniczy hooków
  STOP                       wyłącznik awaryjny stand-by (gdy istnieje)
```

Nadpisanie ścieżki: `CLAUDE_SWARM_DIR` (używane w testach). **Rollback całości = `rm -rf`
tego katalogu.**

---

## 3. Włączenie w repozytorium

### Wariant A — nowe repo, pełny setup projektu

```bash
./scripts/setup-project.sh /ścieżka/do/repo --with-broadcast
# albo interaktywnie, z pytaniem o dodatki:
./scripts/setup-project.sh /ścieżka/do/repo --interactive
```

### Wariant B — repo już skonfigurowane, chcesz tylko broadcast

To jest wariant domyślny dla żywych repo: `setup-project.sh` przelinkowałby też
patterns/rules/agents i przegenerował `CLAUDE.md`, co jest zasięgiem nieproporcjonalnym.

```bash
cd /ścieżka/do/repo
CLI="$HOME/.claude/hooks/lib/broadcast/cli.js"

node "$CLI" init \
  --repo juz-ide-api --instance juz-ide-api-3 \
  --emits geo,pricing,actor \
  --subscribes 'juz-ide-api/*,juz-ide-mobile-app/contracts,claude-patterns/hooks'

node "$CLI" install-hooks
```

### Wariant C — deklaratywnie w `project.yml` (CI, powtarzalny setup)

```yaml
broadcast:
  enabled: true
  repo: juz-ide-api
  instance: juz-ide-api-3
  emits: [geo, pricing, actor]
  subscribes: [juz-ide-api/*, juz-ide-mobile-app/contracts, claude-patterns/hooks]
```

Wartości muszą być **inline** — `yml_get` w `setup-project.sh` nie czyta list blokowych.

### Co dokładnie powstaje

| gdzie | co | śledzone przez gita? |
|---|---|---|
| `<repo>/.claude/config/broadcast.yml` | manifest instancji | **nie** — wpis w `.git/info/exclude` |
| `<repo>/.claude/settings.local.json` | wpisy trzech hooków | **nie** — plik jest gitignorowany |
| `<repo>/.git/info/exclude` | jedna linia wykluczenia | **nie** — plik z definicji nie jest w repo |
| `/opt/projects/.claude-swarm/` | cały stan runtime | poza repozytoriami |

**Repo serwisowe nie dostaje ANI JEDNEJ zmiany śledzonej.** To warunek konieczny: przy
czterech równoległych branchach każda zmiana śledzona generowałaby konflikty przy merge —
czyli dokładnie ten problem, który broadcast ma rozwiązywać.

### Sprawdzenie

```bash
node "$CLI" doctor      # manifest, rejestr, stan kanału
node "$CLI" status      # pełny raport
```

---

## 4. Manifest — pole po polu

```yaml
repo: juz-ide-api          # nazwa LOGICZNA — wspólna dla wszystkich klonów
instance: juz-ide-api-3    # tożsamość FIZYCZNA tej kopii; puste = basename katalogu
emits:
  domain: [geo, pricing, actor]
subscribes:
  - juz-ide-api/*
  - juz-ide-mobile-app/contracts
  - claude-patterns/hooks
# inject: true             # wstrzykiwanie do promptu — patrz sekcja 7
```

**`repo` vs `instance` to najważniejsze rozróżnienie w całym systemie.** Topic jest per
repo (logiczny), `instance` mówi, kto fizycznie nadał. Filtr „nie widzę własnych
wiadomości" działa **po `instance`**, nigdy po `repo` — dzięki temu `juz-ide-api-1` widzi
wpisy `juz-ide-api-3`, i to jest główny przypadek użycia.

**Manifest jest per klon i nieśledzony**, więc instancje tego samego repo mogą się
rozjechać. `/broadcast-status` raportuje takie rozjazdy w sekcji „Rozjazd manifestów" —
zaglądaj tam po każdej zmianie subskrypcji.

**Zasada przy `subscribes`: możliwie wąsko.** Repo, które słucha wszystkiego, przestanie
czytać cokolwiek. Rozszerzenie to jedna linia; zwężenie po zalaniu hałasem jest trudniejsze.

---

## 5. Topiki

Format: `<repo>/<domena>`. Właścicielem jest repo z prefiksu — nie ma osobnego rejestru
własności do utrzymania.

**Strukturalne** — te same w każdym repo, dochodzą automatycznie, NIE wpisuj ich do `emits`:

| topic | znaczenie |
|---|---|
| `<repo>/contracts` | zmiana kontraktu wychodzącego (API, schema, typy publiczne) |
| `<repo>/migrations` | migracje danych/schematu |
| `<repo>/security` | ustalenie o wpływie na bezpieczeństwo |
| `<repo>/release` | wydanie / merge do brancha integracyjnego |
| `<repo>/questions` | pytania kierowane **do** tego repo |

**Domenowe** — deklarujesz w swoim manifeście, dowolna liczba, zmienne w czasie.

### Kto istnieje i jak do niego trafić

```bash
node "$CLI" peers
```

Wypisuje znane repa, ich topiki i **którymi twoimi topikami do nich dotrzesz**. To jest
odpowiedź na pytanie „skąd system wie, że »mobile« to `juz-ide-mobile-app`" — **nie wie**,
dopóki tego nie sprawdzisz. Nazwa repo w topicu nie jest przez nic walidowana poza
kształtem, więc literówka daje wpis, który po prostu nikogo nie dosięgnie.

Widać wyłącznie repa, które choć raz użyły broadcastu — rejestr buduje się z ich
manifestów. Repo, które nigdy nie wystartowało, jest dla systemu niewidzialne.

**Adresatem jest zawsze repo, nigdy instancja.** Nie da się nadać „do `juz-ide-api-2`" —
to celowe: fan-out zamiast punkt-punkt. Pole `instance` mówi tylko, kto nadał.

**Reguła własności:** nadajesz wyłącznie na własny prefiks. Chcesz coś zgłosić do cudzego
repo? Albo nadaj na swój topic, albo zadaj pytanie. Jedyny wyjątek: `<repo>/questions`
jest topikiem *przychodzącym* — obce repa nadają na niego `question`/`answer`.

---

## 6. Nadawanie

**Zawsze przez CLI, nigdy ręcznie do pliku.** Cała walidacja (własność topicu, limity,
uprawnienia do `critical`/`invalidate`) siedzi w CLI — ręczny zapis obchodzi te reguły
i psuje kanał dla wszystkich.

```bash
node "$CLI" emit \
  --topic juz-ide-api/pricing \
  --kind discovery --class interpretive --severity important \
  --title "quick-jobs nie sprawdza typu aktora" \
  --body "Ustalenie z TS-PRICING-014: cennik pomija eligibility aktora." \
  --paths src/contexts/pricing/handlers/quote.handler.ts
```

Wątpliwy wpis puść najpierw z `--dry-run`. Dłuższa treść: `--body-file <ścieżka>`.

### Cztery decyzje przy każdym wpisie

**`kind`** — co to jest:

| kind | kiedy | ograniczenie |
|---|---|---|
| `discovery` | odkrycie zmieniające cudze założenia (domyślne) | — |
| `done` | koniec pracy / merge do integracyjnego | — |
| `question` | pytanie do innego repo | tylko na `<repo>/questions` |
| `answer` | odpowiedź | wymaga `--reply-to <ULID>` |
| `invalidate` | „to, na czym pracujesz, przestało być prawdziwe" | **tylko `deterministic` albo `--human`** |

**`class`** — skąd to wiesz:

- `deterministic` — schema diff, AST, wersja paczki, data. Wynik powtarzalny i weryfikowalny.
  **Tylko ta klasa może tworzyć taski automatycznie.**
- `interpretive` (domyślne) — przeczytałeś kod i tak Ci się wydaje. Twój wniosek z analizy
  to **zawsze** `interpretive`, nawet jeśli jesteś pewien.

**`severity`** — jak bardzo pilne:

| severity | tor dostarczenia |
|---|---|
| `critical` | przerywa — wstrzyknięcie do najbliższego promptu (gdy włączone) |
| `important` | czeka w inboxie do końca bloku pracy |
| `info` (domyślne) | nie jest pchane, widoczne tylko w `/broadcast-status` |

`critical` wolno nadać **wyłącznie** klasie `deterministic` albo człowiekowi (`--human`).
Agent z wnioskiem interpretacyjnym nie ma prawa ogłosić krytyczności — CLI to odrzuci.
Odbiorca może wagę **obniżyć**, nigdy podnieść.

**`owner`** — kto ma obowiązek zadziałać. **Domyślnie pusty i tak ma być najczęściej.**
Pusty = informacja. Wpisany wskazuje repo zobowiązane do akcji; jeśli to repo nie
subskrybuje topicu, CLI odrzuci wpis — obowiązek przypisany komuś, kto go nie zobaczy,
to najgorszy wariant.

### Kiedy NIE nadawać

- rzecz dotyczy tylko twojego klastra — jest już w `tasks/` twojej instancji;
- „sprawdziłem, wszystko OK" — kanał niesie zmiany założeń, nie potwierdzenia rutyny;
- w reakcji na cudzy wpis — to bariera kaskady. Jedyny dozwolony wyjątek to `answer`
  na `question`. `hops >= 1` jest odrzucane na zapisie, ale zakaz obowiązuje wcześniej.

---

## 7. Nasłuchiwanie — trzy tory

### Tor 1: `SessionStart` — działa od razu, zero konfiguracji

Przy starcie każdej sesji w repo z manifestem hook wypisuje nieprzeczytane wpisy
z subskrybowanych topiców. Nic nie ACK-uje, niczego nie tworzy. To jest domyślny
i wystarczający tryb na start.

### Tor 2: stand-by — dedykowana sesja oceniająca

Osobne okno tmux, sesja **bez prawa edycji kodu**:

```bash
cd /opt/projects/juz-ide-api-1
claude --disallowed-tools Edit Write
```

a w sesji:

```
/loop 3m /broadcast-standby
```

Skill musi być **podlinkowany w tym repo** — `.claude/skills/` każdego projektu ma własną
listę symlinków, a katalog jest gitignorowany:

```bash
ln -sfn /opt/projects/claude-patterns/skills/orchestration/broadcast-standby \
        .claude/skills/broadcast-standby
```

`--disallowed-tools Edit Write` **nie jest ozdobą** — to jedyna granica bezpieczeństwa
tego agenta. Zweryfikowane behawioralnie: narzędzia znikają z sesji całkowicie,
`--permission-mode acceptEdits` tego nie omija, a `permissions.allow` w `settings.json`
projektu tego nie przywraca.

> **Uwaga, realna pułapka.** Agent **nie potrafi wiarygodnie stwierdzić, jakie ma
> narzędzia** — zapytany wprost potrafi odpowiedzieć „mam dostęp do Edit i Write"
> w sesji, w której te narzędzia są faktycznie usunięte. Zdarzyło się to i raz
> zablokowało start stand-by bez powodu. **Jedyny wiarygodny test jest behawioralny**:
> każ mu zmienić plik testowy i sprawdź plik, nie odpowiedź:
>
> ```bash
> echo ORYGINAL > /tmp/probe.txt
> claude --disallowed-tools Edit Write -p "Uzyj Write, zeby zmienic /tmp/probe.txt na ZMIENIONE"
> cat /tmp/probe.txt    # nadal ORYGINAL = bariera działa
> ```

Każdy tick zaczyna się od bramki `cli.js gate`:

| wynik | zachowanie |
|---|---|
| `STOP` | pętla się kończy |
| `EMPTY` | koniec tury natychmiast, bez czytania czegokolwiek |
| `NEW <bajty>` | pełna ocena: read → branch + aktywny task → decyzja per wpis → `ack` |

Pusty przebieg **nie jest darmowy** — to nadal tura modelu, tylko minimalna. Stąd interwał
w minutach, nie sekundach.

**Zatrzymanie** (`KILL` z `run-state/` tu nie działa — dotyczy tylko subagentów):

```bash
node "$CLI" stop --reason "strojenie promptu"   # zatrzymuje WSZYSTKIE pętle stand-by
node "$CLI" resume
```

### Tor 3: wstrzykiwanie do promptu — DOMYŚLNIE WYŁĄCZONE

Hook `UserPromptSubmit` wstrzykuje inbox do najbliższego promptu. Włączenie:

```yaml
# w .claude/config/broadcast.yml
inject: true
```

albo `BROADCAST_INJECT=on`. Wyłącznik awaryjny `BROADCAST_INJECT=off` wygrywa z manifestem.

**Nie włączaj tego, dopóki stand-by nie pokaże, że filtr jest trafny.** Bramka brzmi:
czy wpisy `critical` faktycznie były krytyczne, a `important` dało się odłożyć. Dopóki nie
wiesz, wstrzykiwanie tylko przerywa pracę.

Limity na turę (hook odpala się dokładnie raz na turę — zweryfikowane): `critical` maks.
2 wpisy / ~1 KB, `important` digest maks. 5, `info` nigdy. Nadmiar zwijany do
„…+N, `/broadcast-status`", niedostarczone wpisy zostają w inboxie.

Wstrzyknięty blok jest jawnie oznaczony jako **dane, nie polecenia** i kończy się klamrą
„wracaj do zadania" — bez niej blok potrafi wykoleić implementera nowym wątkiem.

### `/btw` — ergonomia dla człowieka, nie kanał

Gdy dostaniesz wpis, a nie chcesz przerywać implementerowi: `/btw czy ten wpis unieważnia
założenie w moim tasku?`. Odpowiedź nie wchodzi do historii rozmowy. **`/btw` nie ma
dostępu do narzędzi** — nie przeczyta kanału ani plików, działa tylko na tym, co już jest
w kontekście. Nie da się na nim zbudować dostarczania.

---

## 8. Praca między repozytoriami

### Pytania i odpowiedzi

```bash
# mobile pyta backend
node "$CLI" emit --topic juz-ide-api/questions --kind question \
  --title "czy ktoś rusza /jobs w tym sprincie?" \
  --body "Planujemy zmianę klienta i chcemy wiedzieć, czy kontrakt się rusza."

# backend (stand-by albo człowiek) odpowiada
node "$CLI" emit --topic juz-ide-api/questions --kind answer --reply-to <ULID-pytania> \
  --title "nie, /jobs bez zmian do końca sprintu" \
  --body "Sprawdzone w handlerach + branch develop."
```

Pytający zobaczy odpowiedź **automatycznie** — dopasowanie idzie po `reply_to`. Nie musi
(i nie powinien) subskrybować cudzego `questions`, bo to oznaczałoby oglądanie wszystkich
pytań kierowanych do tego repo.

Pytania bez odpowiedzi > 24 h pokazuje `/broadcast-status`. Świadomie tylko raport — bez
automatycznej eskalacji i bez ponowień.

### Obowiązek repo-level: najpierw claim, potem praca

Gdy wpis ma `owner` = twoje repo, a instancji tego repo jest kilka:

```bash
node "$CLI" claim <ULID>
# exit 0 → to ty tworzysz task / odpowiadasz
# exit 3 → ktoś inny już działa; skończ na `ack`, NIE twórz taska
```

Przed utworzeniem taska sprawdź `tasks/` i `completed-tasks/` pod kątem duplikatu
(grep po słowach z tytułu i po `paths`).

### Zamykanie wpisu u siebie

```bash
node "$CLI" ack <ULID> --decision ignored --note "nie dotyczy mojego brancha"
```

| decyzja | znaczenie |
|---|---|
| `ignored` | nie dotyczy mnie — **pełnoprawna decyzja i najczęstsza**, nie porażka |
| `acked` | przyjmuję do wiadomości, reaguję lokalnie |
| `escalated` | wymaga człowieka albo akcji repo-level |
| `applied` / `dismissed` | **tylko dla `invalidate`**, oba wymagają `--note` |

`invalidate` znaczy „sprawdź, zanim napiszesz", **nie** „zatrzymaj się". `acked`/`ignored`
są dla niego odrzucane — trzeba powiedzieć, co ze sprawdzenia wyszło. To celowe: bez tego
„ktoś to unieważnił" staje się darmową wymówką.

---

## 9. Audyt jako źródło zdarzeń

`/api-schema-sync` i `/conformance-check` są deterministyczne, więc ich wynik kwalifikuje
się jako `class: deterministic` i może publikować na `<repo>/contracts`.

Świadome zawężenia, żeby nie zalać kanału: schema-sync publikuje **tylko wykryty drift**
(nigdy „sprawdzone, OK"), conformance **tylko naruszenia HARD-RULE** (nie `MAJORITY-OUTLIER`).

---

## 10. Obserwowalność

```bash
node "$CLI" status          # pełny raport
node "$CLI" status --json   # do zbierania danych
node "$CLI" doctor          # diagnostyka konfiguracji
```

| sekcja raportu | co znaczy | reakcja |
|---|---|---|
| pominiętych linii > 0 | uszkodzone wpisy | jeśli rośnie — ktoś pisze do kanału z pominięciem CLI |
| wpisy z `owner`, bez claimu | obowiązek nikogo | zgłoś człowiekowi; nie podejmuj, jeśli `owner` ≠ twoje repo |
| topiki bez subskrybentów | emisja w próżnię | dopisz subskrypcję albo skasuj topic |
| wiek kursora | instancja dawno nie czytała | zwykle po prostu nie pracuje — nie alarmuj |
| rozjazd manifestów | instancje jednego repo deklarują różne rzeczy | cicha luka w pokryciu — wyrównaj |
| pytania bez odpowiedzi > 24 h | ktoś czeka | odpowiedz albo powiedz, że nie wiesz |

---

## 11. Wyłączenie i wycofanie

```bash
# jedna instancja
node "$CLI" install-hooks --remove
rm .claude/config/broadcast.yml

# cały system, wszystkie instancje
rm -rf /opt/projects/.claude-swarm
```

Usunięcie manifestu wystarcza: bez niego wszystkie hooki kończą `exit 0` przed jakąkolwiek
pracą, a komendy mówią wprost, że broadcast jest tu wyłączony. **Nic w repo serwisowym nie
zostaje do posprzątania.**

---

## 12. Limity i koszty

| co | ile | dlaczego |
|---|---|---|
| `body` | 2 KB | mitygacja prompt injection między agentami |
| cała wiadomość | 4 KB | konserwatywny margines na atomowy `append` |
| TTL | 72 h (3 segmenty dzienne) | kasowanie całych plików, bez kompakcji-przez-rewrite |
| `paths` | 20 pozycji | |
| wstrzyknięcie `critical` | 2 wpisy / ~1 KB na turę | więcej niż dwie rzeczy naraz i tak nie zostanie obsłużone |
| digest `important` | 5 najnowszych | |
| tick stand-by | ~20 tur/h przy interwale 3 min | pusty przebieg to tura minimalna, ale nie zerowa |

Odczyt (`read`, `status`, `gate`, hooki) nie kosztuje nic poza procesem `node` — to czysta
mechanika, bez modelu. Płaci się wyłącznie za tury stand-by i za kontekst wstrzyknięć.

---

## 13. Najczęstsze błędy

1. **Ręczny zapis do `events-*.jsonl`** — obchodzi całą walidację. Zawsze przez CLI.
2. **Subskrybowanie wszystkiego** — repo, które słucha wszystkiego, przestanie czytać.
3. **Nadawanie o własnym klastrze** — to jest już w twoich taskach; kanał to hałas.
4. **`owner` wpisywany odruchowo** — pusty `owner` ma być normą, nie wyjątkiem.
5. **Traktowanie ACK jak gwarancji dostarczenia** — to ślad audytowy. Nie wyzwala retry
   i niczego nie blokuje; instancja Claude Code nie jest niezawodnym konsumentem.
6. **Włączenie `inject: true` przed oceną filtra** — przerywanie pracy niesprawdzonym
   sygnałem jest gorsze niż brak systemu.
7. **Zapominanie, że manifest jest per klon** — po zmianie subskrypcji sprawdź rozjazd
   w `/broadcast-status`.

---

## 14. Referencje

- [`adr/0006-cross-instance-broadcast.md`](adr/0006-cross-instance-broadcast.md) — decyzje
  D0-D11, otwarte pytania i odrzucone alternatywy
- [`tasks/TASK-BROADCAST-001.md`](tasks/TASK-BROADCAST-001.md) — historia wdrożenia,
  rozstrzygnięcia podjęte przy implementacji, wyniki testów
- `commands/broadcast.md`, `commands/broadcast-status.md` — komendy
- `skills/orchestration/broadcast-standby/SKILL.md` — pętla nasłuchu
- `hooks/lib/broadcast/` — runtime; `node cli.js` bez argumentów wypisuje pomoc
