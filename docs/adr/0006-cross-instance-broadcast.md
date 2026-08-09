# ADR 0006 — Cross-instance broadcast: kanał wymiany informacji między instancjami Claude Code

**Status**: proposed (2026-08-02) — **NIE zaakceptowany, do przedyskutowania**
**Rev**: 2026-08-02 — naniesiono poprawki z review architektonicznego: ACK jako kursor
poza kanałem (D6), segmenty dzienne (D9), źródło `instance` (D3), wykonawca obowiązku
repo-level + zakres oceny stand-by (D4/D7), mechanizm emisji w fazie 1, ryzyko prompt
injection, inbox zamiast `send-keys` (D8), semantyka `kind`, `/broadcast-status`.
**Context source**: obserwacja użytkownika przy pracy na 2-3 równoległych instancjach
(`juz-ide-api-1..4`, `juz-ide-mobile-app`, `vytches-ddd`, `grant-flow`, ...);
rozpoznanie stanu 2026-08-01/02 (git, tmux, hooki, ECC).

> **Ten ADR niczego nie implementuje.** Zawiera decyzje do zatwierdzenia i sekcję
> OTWARTE PYTANIA, które wymagają odpowiedzi człowieka przed napisaniem pierwszej linii kodu.

> **Zakres nazwy (decyzja 2026-08-02).** „Broadcast" to nazwa **całego systemu komunikacji
> między instancjami**, nie samego pliku. Obejmuje: kanał (D9) jako warstwę transportową,
> stand-by agentów (D7), dostarczanie i wstrzykiwanie do implementera (D8, D11), pytania
> i odpowiedzi między repo (D7) oraz audyt spójności jako źródło zdarzeń (D10). Czytanie
> tego dokumentu jako „ADR o pliku JSONL" gubi to, że jest specyfikacją architektury
> multi-agent — kanał jest w niej najprostszą częścią.

---

## Kontekst

### Problem obserwowany

Przy pracy na wielu instancjach Claude Code równolegle (2-3 typowo, 12 procesów
zaobserwowanych 2026-08-02) występują cztery klasy strat:

1. **Cross-cluster impact.** Instancja pracująca nad klastrem GEO tworzy w trakcie analizy
   taski wpływające na kolejność implementacji w PRICING lub ACTOR. Pozostałe instancje
   dowiadują się przy merge — czyli po dniach, po napisaniu kodu na nieaktualnym założeniu.
2. **Kolizja zasobów sekwencyjnych.** Dwie instancje biorą „następny wolny" numer migracji.
   *(Uwaga: to NIE jest problem komunikacji — patrz D0.)*
3. **Brak kanału pytań.** `juz-ide-mobile-app` ma pytanie do `juz-ide-api` („czy ktoś rusza
   ten endpoint, co się zmienia?"). Dziś: przełączenie terminala przez człowieka.
4. **Brak proaktywnego audytu spójności** między repo (kontrakty API, wzorce, wersje).

### Stan zastany (zweryfikowany 2026-08-01/02)

- `juz-ide-api-1..4` to **cztery klony jednego repo** (`pawelgozdz/local-hero.git`),
  każdy na własnym branchu; integracja przez `develop`. `project-orchestration/` jest
  śledzone w gicie (1017 plików) — taski **już** się synchronizują, ale przy merge.
- Rozjazd `tasks/`: api-1↔api-2 = 1 plik; ↔api-3 = 8; ↔api-4 = 32 (api-4 odstaje ~2 tyg.).
- **tmux w użyciu**: 8 sesji w grupach o nazwach mapujących się na repo
  (`juz-ide-1`, `juz-ide-2`, `juz-ide-3`, `mobile-app`, `vytches`, `feature-flags`,
  `claude-patterns`, `my-int`) → routing adresowy istnieje za darmo.
- **Wzorzec append-only już wdrożony w repo**: `TS-TEST-HISTORY-001`
  (`.gitattributes`: `test/_history/runs*.jsonl merge=union` + `text eol=lf`,
  pole `repo_instance` w schemacie). Sprawdzony cross-instance.
- **Harness**: 27 typów hooków (m.in. `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `SubagentStop`); w `claude-patterns` używanych 5, 33 hooki napisane.
  Skill `/loop <interwał> <prompt>` istnieje — **nie trzeba pisać schedulera**.
- **ECC pokrywa szkielet, nie kanał**: `team-agent-orchestration` (work items, ownership,
  agent Kanban, control pane, merge gates) i `dmux-workflows` (panele tmux dla agentów)
  zakładają model manager → agenci. Grep na `broadcast|message|communicat|between agents`
  w `dmux-workflows`: **zero trafień**. Peer-to-peer między instancjami to luka → budujemy
  brakującą warstwę, nie duplikat (zgodnie z CLAUDE.md „prefer consuming ECC over rebuilding").
- **Zalążek audytu spójności już istnieje**: `/api-schema-sync` (OpenAPI drift backend ↔
  konsumenci, nie edytuje repo konsumenckich) i `/conformance-check` (AST, deterministyczny,
  jawnie bez RAG). Brakuje im cykliczności i wspólnego kanału na wynik.

---

## Decyzje

### D0 — Migracje NIE są przypadkiem użycia broadcastu

Kolizja numerów migracji to **alokacja współdzielonego zasobu**, nie deficyt informacji.
Okno wyścigu to milisekundy; agent czyta kanał raz na turę. Broadcast dałby tu
*pozór* zabezpieczenia — najgorszy możliwy wynik.

Rozstrzygnięcie (w kolejności preferencji):
1. **Usunąć sekwencyjność** — timestamp/ULID w nazwie migracji. Kolizja niemożliwa
   z definicji. Koszt: zmiana konwencji + `migration-registration.guardian.spec.ts`.
2. Jeśli numery muszą zostać — **atomowa rezerwacja** `open(O_EXCL)` na
   `.claims/migrations/<n>`. Wygrywa jeden, reszta bierze następny.

Broadcast „zająłem migrację N" jest dopuszczalny **wyłącznie jako informacja**,
nigdy jako jedyna ochrona.

### D1 — Topic w formacie `<repo>/<domain>`; właściciel wynika z prefiksu

**Nie ma osobnej tabeli własności jako bytu do utrzymania** — właścicielem topicu jest
repo w jego prefiksie. To rozwiązuje trzy problemy naraz:

- **własność**: `juz-ide-api/pricing` → właściciel `juz-ide-api`, bez dodatkowego rejestru;
- **kolizje nazw**: `juz-ide-api/geo` ≠ `vytches-ddd/geo`;
- **rozszerzalność**: nowy topic to wpis w manifeście **swojego** repo, bez zmian centralnych.

Konsekwencja: repo nie może emitować na topic cudzego repo. Chce zgłosić coś do `pricing`
w `juz-ide-api`? Emituje na **swój** topic albo zadaje pytanie (D7).

**Jedyny wyjątek: `<repo>/questions`.** Ten topic jest z definicji *przychodzący* —
emitują na niego repa **obce** (`juz-ide-mobile-app` pisze na `juz-ide-api/questions`),
a właściciel prefiksu jest adresatem, nie nadawcą. Odpowiedzi (`kind: answer`,
`reply_to`) lecą na ten sam topic, więc pytający musi go subskrybować, żeby zobaczyć
odpowiedź. Walidacja zapisu przepuszcza cudzy prefiks **wyłącznie** dla `questions`
i `kind ∈ {question, answer}`; każde inne cross-repo emitowanie jest odrzucane.

### D2 — Dwie warstwy topiców: strukturalne (stałe) + domenowe (per repo)

**Strukturalne** — ten sam zestaw w każdym repo, zdefiniowany centralnie w `claude-patterns`,
nierozszerzalny ad hoc:

| topic | znaczenie |
|---|---|
| `<repo>/contracts` | zmiana kontraktu wychodzącego (API, schema, typy publiczne) |
| `<repo>/migrations` | migracje danych/schematu |
| `<repo>/security` | ustalenie o wpływie na bezpieczeństwo |
| `<repo>/release` | wydanie / merge do integracyjnego brancha |
| `<repo>/questions` | pytania kierowane **do** tego repo — jedyny topic przychodzący, emitują obce repa (wyjątek od D1); odpowiedzi wracają na ten sam topic |

**Domenowe** — deklarowane przez repo w jego manifeście, dowolna liczba, zmienne w czasie.
Dziś w `juz-ide-api`: `geo`, `pricing`, `actor`. Za miesiąc mogą dojść `legal`, `gdpr`,
`organizations` — **bez żadnej zmiany w claude-patterns**.

Rozdział jest istotny: strukturalne mają znaną semantykę i mogą mieć twarde reguły
(np. `contracts` zawsze wymaga ACK), domenowe są luźne i lokalne.

### D3 — Manifest per instancja: `.claude/config/broadcast.yml` (GITIGNOROWANY)

Jedno miejsce deklaracji, walidowane lintem. **Plik jest nieśledzony przez gita** —
wykluczany przez `.git/info/exclude` (per klon; sam plik wykluczeń nie jest w repo), więc
repo serwisowe nie dostaje **żadnej zmiany śledzonej**. `.gitignore` byłby gorszy: to plik
commitowany, więc już sam wpis wykluczający byłby zmianą w repozytorium:

```yaml
repo: juz-ide-api          # nazwa logiczna, NIE nazwa katalogu instancji
instance: juz-ide-api-3    # tożsamość fizyczna tej kopii (patrz akapit niżej)
emits:
  domain: [geo, pricing, actor]     # + strukturalne automatycznie
subscribes:
  - juz-ide-api/*                   # siostrzane instancje TEGO SAMEGO repo
  - juz-ide-mobile-app/contracts
  - claude-patterns/hooks
  - claude-patterns/agents
```

Wartości powyżej to **obowiązujący manifest pilota**, nie przykład — pełny zestaw dla
trzech repów wraz z uzasadnieniem każdej linii: sekcja „Tabela własności topiców".
Własny `<repo>/questions` jest subskrybowany implicit i nie występuje w `subscribes`.

**Kluczowe rozróżnienie repo ↔ instancja.** `juz-ide-api-1..4` to **jedno repo,
cztery instancje**. Topic jest per repo (logiczne), pole `instance` w wiadomości mówi,
kto fizycznie nadał. Subskrypcja `juz-ide-api/*` obejmuje więc siostrzane instancje —
i to jest **główny przypadek użycia** (cross-cluster impact z sekcji Kontekst, pkt 1).
Reguła „nie widzę własnych wiadomości" działa po `instance`, nigdy po `repo`.

**Źródło `instance`.** Manifest jest gitignorowany, więc każda instancja ma własny —
`instance` deklarujemy **wprost w nim**, z fallbackiem na basename katalogu roboczego,
gdy pole jest puste. Osobny plik `instance.local` (wcześniejsza propozycja) jest zbędny.

**Dlaczego gitignore.** Manifest nie dotyka merge'ów do `develop`, nie generuje
konfliktów przy czterech równoległych branchach i nie zmienia zachowania niczego
u kogoś, kto pilota nie włączył. Brak pliku = system nie istnieje dla tej instancji.
Koszt: manifest nie propaguje się między klonami — zakłada go `setup-project.sh`
(sekcja Setup), a rozjazd deklaracji między instancjami tego samego repo raportuje
`/broadcast-status`.

### D4 — Fan-out zawsze; obowiązek pojedynczy i przypisany, nigdy wywalczony

**Nie ma trybu „pierwszy bierze"** (competing consumers) — to on produkuje duplikaty tasków.
Jest fan-out do wszystkich subskrybentów + jedno pole `owner`:

- **`owner` domyślnie PUSTY** = informacja, nikt nie ma obowiązku działać — i to ma być
  najczęstszy przypadek. Nadawca musi wpisać `owner` **świadomie**, nie odziedziczyć go;
- wpisany jawnie wskazuje repo zobowiązane do akcji — zwykle właściciela topicu
  (z prefiksu, D1), ale może wskazywać inne (wiadomość na `juz-ide-api/contracts`
  z `owner: juz-ide-mobile-app` = „to wy musicie się dostosować");
- `owner` wskazujący repo, które topicu nie subskrybuje, jest odrzucany na zapisie —
  obowiązek przypisany komuś, kto go nie zobaczy, to najgorszy wariant.

Tylko `owner` tworzy task. Pozostali subskrybenci ACK-ują i reagują lokalnie
(np. przestawiają kolejność u siebie), ale **nie tworzą tasków**.

**Zasada nadrzędna: rozstrzygaj przed pracą, ogłaszaj po.** Ogłoszenie „utworzyłem TS-XXX"
nie jest mechanizmem deduplikacji (wyścig już się wtedy odbył) — jest informacją
o zmianie kolejności, i w tej roli jest potrzebne.

**Który egzemplarz repo wykonuje obowiązek (owner = repo, a instancji jest kilka).**
Obowiązek jest per repo, wykonawca musi być dokładnie jeden. Rozstrzygnięcie: atomowy
claim `open(O_EXCL)` na `/opt/projects/.claude-swarm/claims/<message-id>` — pierwsza
instancja, której stand-by uzna, że wiadomość wymaga akcji repo-level (utworzenie taska,
odpowiedź na `question`), zakłada claim i działa; pozostałe widzą claim i kończą na ACK.
Claim leży na współdzielonym filesystemie poza repozytoriami, więc działa niezależnie
od stanu branchy. Reakcje **lokalne** (przestawienie kolejności u siebie, ACK) nie
wymagają claimu — są per instancja z definicji i nie tworzą współdzielonych artefaktów.

**Uwaga: `O_EXCL` występuje w tym ADR w dwóch różnych rolach** i nie należy ich mylić:
w D0 rezerwuje **zasób** (numer migracji) *przed* pracą; tutaj rozstrzyga **wykonawcę**
konkretnej wiadomości. Ten drugi jest ścieżką standardową dla każdej wiadomości z
niepustym `owner`, nie awaryjną.

### D5 — Dwie klasy sygnałów; tylko deterministyczne mogą tworzyć taski automatycznie

| klasa | źródło | wolno automatycznie utworzyć task? |
|---|---|---|
| **deterministyczna** | schema diff, AST (`/conformance-check`), wersje pakietów, `due_date` | **tak** — wynik jest powtarzalny i weryfikowalny |
| **interpretacyjna** | agent przeczytał kod i uważa, że coś jest niespójne | **nie** — trafia jako propozycja, wymaga potwierdzenia |

Uzasadnienie jest empiryczne, nie teoretyczne: 2026-08-01 wykryto, że `@product-owner`
raportował przez kilkanaście pulsów metrykę `B2C 68% / B2B 12%` skopiowaną z przykładu
w prompcie, dla projektu, którego taski **nie mają pola segmentu**. Sygnał wyglądał
wiarygodnie i był stabilny — dlatego przetrwał miesiące. Osiem repo × cykliczny audyt
interpretacyjny = fabryka fałszywych tasków, tyle że trafiających do backlogu, gdzie
ktoś zacznie je realizować.

Konsekwencja dla wizji „system usprawniający się bez przerwy":
**bez przerwy sprawdzający — tak; bez przerwy zmieniający backlog — nie.**

### D6 — ACK per subskrybent: kursor instancji POZA kanałem, nie pole w wiadomości

Model to **pub/sub z kursorem na odbiorcę**, nie kolejka. `acked: true` sprawiłoby,
że pierwszy odbiorca „zjada" wiadomość dla pozostałych.

Kanał jest append-only (D9) — pola raz zapisanej wiadomości **nie wolno** aktualizować,
więc ACK nie może być polem `acks` wewnątrz wiadomości (sprzeczność wykryta w review).
Każda instancja utrzymuje własny kursor:

```jsonc
// /opt/projects/.claude-swarm/cursors/juz-ide-api-3.json — pisze TYLKO ta instancja
{
  "last_processed": "01J...",                          // ULID ostatniego przetworzonego wpisu
  "decisions": { "01J...": "acked", "01K...": "ignored", "01M...": "escalated" }
}
```

Jeden zapisujący na plik = zero współbieżności. „Nie dotyczy mojego taska" (`ignored`)
jest **legalnym ACK-iem** — zamyka wiadomość dla tej instancji, nie ukrywając jej przed
resztą. Dla `invalidate` decyzja to `applied` albo `dismissed` z jednym zdaniem
uzasadnienia (patrz OQ6) — „nie mogę, ktoś unieważnił" zostawia ślad do przeglądu.

ACK jest **śladem audytowym, nie gwarancją dostarczenia.** Nie wyzwala retry i niczego
nie blokuje — instancja Claude Code nie jest niezawodnym konsumentem w pętli i nie wolno
budować mechanizmu, który udaje, że jest.

### D7 — Stand-by: osobna instancja, `/loop` + bramka pustego przebiegu

Nie wstrzykujemy do pracującego implementera na podstawie dopasowania ścieżki. Decyzję,
co trafia do promptu, podejmuje **dedykowane okno tmux ze stand-by agentem**:

- uruchamiany przez istniejący `/loop <interwał>` — **nie piszemy schedulera**;
- uprawnienia: **read + tworzenie tasków/dokumentacji; zero edycji kodu** — granica
  bezpieczeństwa siedzi w uprawnieniach, nie w prompcie;
- zadanie na turę wąskie i policzalne: *przeczytaj nowe wpisy → dopasuj do bieżącego
  taska → zdecyduj: ignoruj / ACK / eskaluj*;
- obsługuje też `<repo>/questions` — odpowiada na pytania innych repo z kodu i dokumentacji.

**Bramka pustego przebiegu.** Prompt pętli zaczyna się od porównania rozmiaru segmentów
z kursorem instancji (jedno wywołanie Bash). Nic nowego → **koniec tury natychmiast**: zero
czytania plików, zero rozumowania o stanie taska. Kosztowna ścieżka — task, kod, ocena,
`severity`, decyzja — odpala się wyłącznie, gdy coś faktycznie przyszło. Pusty przebieg
pozostaje turą modelu, ale minimalną; to jest cena za prostotę i jest akceptowalna.

**Latencja nie jest ograniczeniem.** Stand-by i tak musi przeczytać bieżący task, sprawdzić
stan implementacji i ocenić wiadomość — jego użyteczna tura z natury trwa. Nic w tym systemie
nie wymaga reakcji w sekundach, bo i tak czekamy na koniec czyjegoś bloku pracy. Stąd
interwał liczony w minutach, nie sekundach (patrz OQ3).

**Rola hooków jest inna niż wybudzanie.** `/loop` napędza **ocenę**, hooki realizują
**dostarczenie**: `UserPromptSubmit` w instancji pracującej wstrzykuje to, co stand-by już
przepuścił (D8, D11). Podział jest czysty i nie ma między nimi konkurencji.

**Efekt uboczny wart odnotowania**: stand-by to żywa sesja, więc repo, w którym nikt akurat
nie implementuje, **nadal ma kto odpowiadać na `<repo>/questions`**. Model oparty wyłącznie
na hookach tego nie daje — bez aktywnej pracy nic by się tam nie działo.

Zalety wobec wariantu czysto hookowego: implementer nie płaci kontekstem za cudzą
korespondencję; filtr działa **przed** przerwaniem (stand-by najpierw czyta task i kod, potem
decyduje); błąd stand-by nie może zepsuć kodu; ocena jest interpretacyjna, a hook potrafi
tylko dopasować ścieżki.

**Odrzucona alternatywa: hook `Stop` odpalający `claude -p` w tle.** Kusząca, bo wybudzałaby
stand-by dokładnie po zakończeniu bloku pracy i kosztowała zero w ciszy (hook jest procesem,
nie turą modelu). Odrzucona, bo niosła rekurencję do zabezpieczenia (headless też odpala
hooki), wymóg czystego odłączenia procesu (hook wykonuje się synchronicznie — blokowałby
koniec każdej tury) i dwa niezweryfikowane założenia o kontrakcie hooków — a oszczędność
wobec taniej bramki pustego przebiegu jest marginalna.

**Zakres oceny istotności: branch instancji, nie cały codebase.** Stand-by odpowiada
wyłącznie na pytanie lokalne: *czy ta wiadomość dotyka bieżącej pracy MOJEJ instancji*
(aktualny branch, aktywny task, przecięcie `paths` wiadomości z plikami taska). Cztery
stand-by tego samego repo celowo **nie** zachowują się tak samo, bo mają różne konteksty —
dla reakcji lokalnych (ACK, przestawienie kolejności u siebie) to pożądany fan-out bez
ryzyka duplikatów, bo nie powstaje żaden współdzielony artefakt.

Ocena „to jest istotne dla całego codebase" **nie jest decyzją stand-by** — stand-by może
ją co najwyżej *zgłosić* (`escalated`), a akcję repo-level wykonuje dokładnie jedna
instancja wyłoniona claimem na id wiadomości (D4). Duplikatom zapobiegają trzy warstwy,
w tej kolejności:
1. **claim `O_EXCL` na id wiadomości** (D4) — wyścig „kto działa" rozstrzygnięty atomowo,
   zanim powstanie jakikolwiek artefakt;
2. **gate klas sygnałów** (D5) — interpretacyjny wniosek „to problem całego codebase"
   i tak nie tworzy taska automatycznie, tylko propozycję do potwierdzenia;
3. **dedup po treści** (OQ8) — łapie powtórki rozłożone w czasie, np. gdy dwie instancje
   dojdą do tego samego wniosku niezależnie, z różnych wiadomości.

**Ostrzeżenie modelowe**: wąskie zadanie wolno powierzyć tańszemu modelowi, ale prompt musi
mieć jawny budżet i placeholdery zamiast przykładowych treści (patrz D5 i incydent z 2026-08-01),
inaczej dostaniemy wymyślone eskalacje — gorsze niż brak stand-by, bo przerywają pracę.

### D8 — Dostarczanie do implementera: inbox per instancja + hook, NIE `tmux send-keys`

`tmux send-keys` trafia do stdin panelu. Jeśli implementer stoi na dialogu uprawnień
(„Allow Edit?") albo na `AskUserQuestion`, **wstrzyknięty tekst zostanie potraktowany jako
odpowiedź na ten dialog** — stand-by mógłby zatwierdzić operację, której człowiek by nie
zatwierdził. Detekcja stanu panelu (`capture-pane` + heurystyka na tekst promptu) to
wyścig z TUI — krucha mitygacja ryzyka, którego można w ogóle nie mieć:

- stand-by zapisuje przefiltrowane, trafne wpisy do
  `/opt/projects/.claude-swarm/inbox/<instance>.md`;
- hook `UserPromptSubmit` implementera wstrzykuje zawartość inboxa do najbliższego promptu
  (z limitem z OQ4) i czyści go — dostarczenie jest harness-native, zero stdin;
- treść wiadomości **nigdy** nie płynie przez `send-keys`. Dopuszczalny jedynie opcjonalny
  „nudge" o stałej, nieszkodliwej treści („sprawdź inbox broadcast") dla przypadku
  idle-agent-bez-człowieka — nadal z detekcją stanu panelu (`capture-pane -p`), nigdy
  samo `y`/`n`/`1` ani goły `Enter`, **wyłączony w fazie pilotażowej** (patrz Plan).

Latencja nie rośnie: poprzednia wersja D8 („wysyłka tylko gdy panel czeka na zwykły
prompt") i tak oznaczała czekanie, aż implementer będzie bezczynny — inbox + hook osiąga
to samo bez dotykania stdin.

### D9 — Kanał: segmenty dzienne JSONL poza repozytoriami

`/opt/projects/.claude-swarm/events-<YYYY-MM-DD>.jsonl` — append-only, jedna linia =
jedno zdarzenie, zapis zawsze do segmentu bieżącego dnia. Jedna linia = jeden `write()`
z `O_APPEND`, limit 4 KB walidowany na zapisie — na lokalnym filesystemie (ext4/xfs)
zapisy równoległe nie przeplatają się w praktyce; POSIX gwarantuje atomowość offsetu.
(Uściślenie z review: limit „4 KB = `PIPE_BUF`" formalnie dotyczy pipe'ów, nie plików —
traktujemy go jako konserwatywny margines, nie gwarancję.)
**Założenie jawne: wszystkie instancje na jednym hoście, lokalny filesystem — NFS
wyklucza ten mechanizm.**

Rotacja **bez wyścigu**: czytelnicy czytają ostatnie 3 segmenty (= TTL 72 h za darmo),
starsze segmenty kasowane w całości (`rm` pliku jest atomowe). Żadnej
kompakcji-przez-rewrite — przepisywanie pliku, do którego ktoś równolegle appenduje,
gubi wpisy. ULID-y zachowują sortowalność między segmentami. Limit objętości
wstrzykiwanej do promptów pilnuje OQ4, nie rotacja.

Odporność czytelnika: linia uszkodzona lub niepasująca do schematu = skip + zliczenie
do raportu `/broadcast-status` (D10), nigdy crash.

Odrzucone alternatywy:
- **git jako kanał** — propagacja przy merge, czyli dni. Git zostaje jako warstwa **trwała**:
  co istotne i tak ląduje w `tasks/`. Dwie warstwy o różnych prędkościach.
- **daemon HTTP** (np. rozszerzenie knowledge-retriever :6403) — dodatkowa zależność;
  daemon pada = ślepota. Plik na dysku to najniższy wspólny mianownik.
- **pojedynczy `events.jsonl` z kompakcją** (pierwotna wersja tej decyzji) — kompakcja
  wyścigowa z równoległymi zapisami; segmenty dają TTL przez `rm` bez rewrite'u.

### D10 — Audyt spójności jest źródłem zdarzeń, nie osobnym systemem

`/api-schema-sync` i `/conformance-check` (istniejące, deterministyczne) uruchamiane cyklicznie
publikują wynik na `<repo>/contracts`. Nie budujemy drugiego mechanizmu raportowania.

```
audyt (cykliczny, deterministyczny)  ─┐
odkrycia agentów (ad hoc)            ─┼─→  kanał z topicami  ─→  stand-by per instancja
/broadcast człowieka                 ─┘         (fan-out)          ├─ ACK (kursor, D6)
                                                                    ├─ task (owner po claimie, D4)
                                                                    └─ inbox → hook (D8)
```

**Obserwowalność kanału**: `/broadcast-status` (wzorzec `/pm-status` — bez agenta, ~$0):
ostatnie wpisy, wpisy bez decyzji właściciela, topiki bez subskrybentów (mitygacja
„martwych topików" z tabeli ryzyk), wiek kursora per instancja, licznik pominiętych
uszkodzonych linii (D9).

---

## Model wiadomości (szkic, do zatwierdzenia)

```jsonc
{
  "v": 1,                             // wersja schematu — wielu niezależnie aktualizowanych czytelników
  "id": "b7f3...",                    // ULID — sortowalny, bez kolizji
  "ts": "2026-08-02T09:14:22.101Z",
  "topic": "juz-ide-api/pricing",     // <repo>/<domain>  (D1)
  "kind": "discovery",                // discovery | done | question | answer | invalidate (tabela niżej)
  "class": "interpretive",            // deterministic | interpretive          (D5)
  "severity": "important",            // critical | important | info; brak = info (D11)
                                      // critical TYLKO dla class=deterministic albo od człowieka
  "instance": "juz-ide-api-3",        // kto nadał fizycznie                   (D3)
  "branch": "feature/TS-...",
  "owner": "juz-ide-api",             // kto ma obowiązek; pusty = informacja  (D4)
  "hops": 0,                          // 0 = źródło; hops >= 1 odrzucane na zapisie (bariera kaskady)
  "reply_to": null,                   // id pytania (dla kind: answer)         (D7)
  "title": "quick-jobs bez reguły eligibility aktora",
  "body": "...",                      // limit 2 KB walidowany na zapisie; u odbiorcy DANE, nie polecenia (Ryzyka)
  "paths": ["src/contexts/.../handler.ts"]    // do dopasowania przez stand-by
}
```

Pole `acks` **usunięte** ze schematu — ACK żyje w kursorze per instancja (D6), bo kanał
jest append-only. Pole `claim` (kind) **usunięte** — rezerwacje robi `O_EXCL` *przed*
pracą (D0/D4), nie wiadomość *po* fakcie.

### Semantyka `kind`

| kind | emituje | odbiorca ma prawo | tworzy task? |
|---|---|---|---|
| `discovery` | agent / człowiek / audyt (D10) | ACK, reakcja lokalna, eskalacja | tylko owner po claimie (D4), automatycznie tylko klasa deterministyczna (D5) |
| `done` | instancja kończąca pracę / merge | ACK, aktualizacja założeń | nie |
| `question` | dowolne repo | odpowiedź `answer` od stand-by właściciela topicu (D7) | nie |
| `answer` | właściciel topicu | ACK, użycie odpowiedzi | nie |
| `invalidate` | **tylko `class: deterministic` albo człowiek** (OQ5 ✅) | „sprawdź, zanim napiszesz" — NIE „zatrzymaj się" (OQ6 ✅); wymagana decyzja `applied`/`dismissed` z uzasadnieniem | nie |

Faza 1 używała wyłącznie `discovery` + `done`; `question`/`answer` doszły w fazie 4,
`invalidate` w fazie 5 po rozstrzygnięciu OQ5/OQ6 (2026-08-09). Wszystkie pięć jest
dziś dopuszczonych do emisji, każdy z własnymi bramkami wymuszanymi na zapisie.

**Poprawka do D1 (2026-08-09, wykryta testem).** D1 zakładał, że pytający „musi
subskrybować" topic, na który wysłał pytanie, żeby zobaczyć odpowiedź. To jest błędne
i było błędne od początku: pytający **nie widział** odpowiedzi, a lekarstwo byłoby gorsze
od choroby — subskrypcja cudzego `<repo>/questions` oznacza oglądanie WSZYSTKICH pytań
kierowanych do tego repo. Obowiązuje: **widoczność odpowiedzi idzie po `reply_to`** —
instancja widzi odpowiedzi na własne pytania i nic ponadto, bez poszerzania subskrypcji.

---

## Tabela własności topiców — WYPEŁNIONA DLA PILOTA (OQ1 rozstrzygnięte 2026-08-02)

Zakres pilota: **trzy repa logiczne**. Reszta ekosystemu (`vytches-ddd`, `grant-flow`,
`grant-flow-ui`, `feature-flags`, `juz-ide-blog`, `juz-ide-landing-page`) świadomie
**poza pilotem** — dołącza w fazie 4 albo wcale. Manifestu bez decyzji nie zakładamy;
repo bez manifestu jest dla systemu niewidoczne.

| repo (logiczne) | instancje | `emits.domain` | `subscribes` |
|---|---|---|---|
| `juz-ide-api` | `juz-ide-api-1..4` | `geo`, `pricing`, `actor` | `juz-ide-api/*`, `juz-ide-mobile-app/contracts`, `claude-patterns/{hooks,agents}` |
| `juz-ide-mobile-app` | `juz-ide-mobile-app` | `ui-flows` | `juz-ide-api/{contracts,release}`, `claude-patterns/{hooks,agents}` |
| `claude-patterns` | `claude-patterns` | `patterns`, `agents`, `hooks` | — (źródło; tylko implicit własne `questions`) |

Strukturalne (D2: `contracts`, `migrations`, `security`, `release`, `questions`)
dochodzą do `emits` każdego repo automatycznie — nie wpisuje się ich do manifestu.

**Reguła implicit**: repo **zawsze** subskrybuje własny `<repo>/questions`, bez
deklaracji — inaczej nikt nie odpowiadałby na kierowane do niego pytania. Instancja widzi
też własne topiki domenowe nadane przez **siostrzane** instancje: filtr „nie widzę
swoich" działa po `instance`, nie po `repo` (D3).

### Uzasadnienie subskrypcji (dlaczego akurat tak wąsko)

**`juz-ide-api` → `juz-ide-api/*`** — to jest cały powód istnienia systemu: cztery
instancje jednego repo na czterech branchach, dziś dowiadujące się o swoich decyzjach
dopiero przy merge do `develop`. Jedyna subskrypcja z wildcardem w pilocie.

**`juz-ide-api` → `juz-ide-mobile-app/contracts`** — mobile jest konsumentem API, więc
jego zmiany kontraktowe (nowe oczekiwania klienta, deprecacje po stronie UI) wracają do
API jako sygnał. Pytania od mobile przychodzą na `juz-ide-api/questions`, subskrybowany
implicit — **nie** deklarujemy go.

**`juz-ide-mobile-app` → `juz-ide-api/{contracts,release}`** — dokładnie dwa zdarzenia,
które łamią mobile: zmiana kontraktu i wydanie. Klastry domenowe (`geo`, `pricing`,
`actor`) **celowo pominięte w pilocie** — dopisujemy, dopiero gdy okaże się, że mobile
potrzebuje sygnału wcześniejszego niż `contracts`. Rozszerzenie to jedna linia
w manifeście; zwężenie po zalaniu hałasem jest trudniejsze.

**oba → `claude-patterns/{hooks,agents}`** — zmiany hooków i definicji agentów propagują
się symlinkiem **natychmiast** i zmieniają zachowanie pracującej instancji (nowy hook
potrafi zablokować `Edit`). `claude-patterns/patterns` pominięte: to materiał
referencyjny pobierany na żądanie przez `retrieve_patterns`, nie zdarzenie.

**`claude-patterns` nie subskrybuje niczego** — jest źródłem, nie odbiorcą. Odbiera
wyłącznie pytania na własnym `claude-patterns/questions` (implicit).

### Manifesty pilota (zakłada je `setup-project.sh`)

```yaml
# /opt/projects/juz-ide-api-3/.claude/config/broadcast.yml   (gitignored, D3)
repo: juz-ide-api
instance: juz-ide-api-3          # w api-1/2/4 analogicznie
emits:
  domain: [geo, pricing, actor]
subscribes:
  - juz-ide-api/*
  - juz-ide-mobile-app/contracts
  - claude-patterns/hooks
  - claude-patterns/agents
```

```yaml
# /opt/projects/juz-ide-mobile-app/.claude/config/broadcast.yml
repo: juz-ide-mobile-app
instance: juz-ide-mobile-app
emits:
  domain: [ui-flows]
subscribes:
  - juz-ide-api/contracts
  - juz-ide-api/release
  - claude-patterns/hooks
  - claude-patterns/agents
```

```yaml
# /opt/projects/claude-patterns/.claude/config/broadcast.yml
repo: claude-patterns
instance: claude-patterns
emits:
  domain: [patterns, agents, hooks]
subscribes: []                   # źródło; własne questions implicit
```

Uwaga na przyszłość: **subskrybować możliwie wąsko.** Repo, które słucha wszystkiego,
przestanie czytać cokolwiek.

---

## OTWARTE PYTANIA (blokują implementację)

**Stan 2026-08-02**: OQ1 ✅ i OQ4 ✅ rozstrzygnięte — **faza 1 odblokowana**. (dawniej: limit
wstrzykiwania — bez niego pierwszy hook czytający kanał nie ma zdefiniowanego budżetu).
OQ2 dotyczy niezależnej fazy 0; OQ3 i OQ5-OQ8 blokują dopiero fazy 2-4.

**OQ1 — Tabela własności.** ✅ **ROZSTRZYGNIĘTE 2026-08-02** — tabela wyżej wypełniona
dla trzech repów pilotażowych (`juz-ide-api`, `juz-ide-mobile-app`, `claude-patterns`)
wraz z gotowymi manifestami i uzasadnieniem każdej subskrypcji. Pozostałe repa
ekosystemu świadomie poza pilotem — decyzja odroczona do fazy 4.

**OQ2 — Migracje: timestamp czy rezerwacja?** (D0) Timestamp jest czystszy, ale wymaga
zmiany konwencji i guardiana. Rezerwacja zachowuje numery kosztem mechanizmu do utrzymania.
*Rekomendacja (review):* timestamp/ULID — usuwa klasę problemu zamiast nią zarządzać;
TypeORM i tak domyślnie timestampuje migracje, a precedens zmiany konwencji
cross-instance już istnieje (`TS-TEST-HISTORY-001`). Koszt guardiana jednorazowy.

**OQ3 — Interwał `/loop` i kształt bramki pustego przebiegu.** Model wybudzania rozstrzygnięty
w D7 (`/loop` + bramka, nie hook). Zostaje kalibracja: jaki interwał i jak wąsko da się
zamknąć pusty przebieg, żeby kosztował jak najmniej.
*Rekomendacja:* **3 minuty** jako punkt wyjścia — nikt nie odczuje różnicy wobec 30 sekund,
a to 20 pustych tur na godzinę zamiast 120. Bramka: pojedyncze wywołanie Bash porównujące
rozmiar segmentów z `last_processed` w kursorze; przy braku zmian tura kończy się bez
czytania czegokolwiek. Kalibracja na realnych danych w fazie 2.
*Uwaga:* pusty przebieg **nie jest darmowy** — to nadal tura modelu. Wcześniejsza wersja
tej rekomendacji obiecywała koszt zerowy, co jest osiągalne tylko w modelu hookowym
odrzuconym w D7.

**OQ4 — Budżet hałasu.** ✅ **ROZSTRZYGNIĘTE 2026-08-02.** Kryterium to nie liczba, lecz
**waga wiadomości** — patrz **D11** (dwa tory dostarczania: krytyczne przerywają, istotne
czekają na koniec bloku pracy). TTL **72 h** = 3 segmenty dzienne. `discovery` wolno
emitować **tylko** gdy dotyczy innego repo/klastra niż własny — wewnątrz własnego klastra
informacja i tak jest w `tasks/` tej instancji.

**OQ5 — Kto może emitować `invalidate`.** ✅ **ROZSTRZYGNIĘTE 2026-08-09** — zgodnie
z rekomendacją: **tylko klasa deterministyczna albo człowiek**. Agent z wnioskiem
interpretacyjnym emituje najwyżej `discovery` z propozycją unieważnienia i eskaluje ją
do człowieka. Spójne z D5 i D11: najsilniejszy sygnał wymaga najsilniejszej klasy źródła,
bo alarm, który krzyczy za często, przestaje być alarmem.
*Wymuszone w kodzie* (`schema.js`, `INVALIDATE_REQUIRES`), nie w prompcie — emisja
`invalidate` z `class: interpretive` bez flagi `--human` jest odrzucana na zapisie.

**OQ6 — Semantyka `invalidate` u odbiorcy.** ✅ **ROZSTRZYGNIĘTE 2026-08-09** —
**„sprawdź, zanim napiszesz", NIE „zatrzymaj się"**. Odbiorca musi zająć stanowisko:
decyzja `applied` albo `dismissed`, **zawsze** z jednym zdaniem uzasadnienia w kursorze (D6).
Zwykłe `acked`/`ignored` jest dla `invalidate` odrzucane.
*Powód:* bez tego `invalidate` staje się darmową wymówką („nie zrobiłem, bo ktoś
unieważnił") i praca staje bez powodu. Obowiązek uzasadnienia zostawia ślad do przeglądu,
więc wymówka przestaje być darmowa. *Wymuszone w kodzie* (`cli.js`, `cmdAck`).

**OQ7 — Pytania bez odpowiedzi.** Co, gdy nikt nie odpowie na `question` w rozsądnym czasie?
Timeout + eskalacja do człowieka, czy cicha rezygnacja?
*Rekomendacja (review):* timeout 24 h → eskalacja do człowieka przez istniejący kanał
(sekcja w TEAM-STATE.md / raport `/pulse`: „pytania bez odpowiedzi > 24 h"). Nigdy cicha
rezygnacja — po dwóch takich przypadkach agenty przestaną używać kanału pytań.

**OQ8 — Dedup po treści.** Przed utworzeniem taska sprawdzać `tasks/` + `completed-tasks/`
pod kątem podobnego? (Łapie powtórki rozłożone w czasie, których żadna rezerwacja nie wyłapie.)
*Rekomendacja (review):* tak, ale minimalnie — w momencie tworzenia taska przez ownera
prosty przegląd (grep po słowach kluczowych tytułu + ścieżkach z `paths`) przez agenta,
który i tak ma te pliki w kontekście. Bez embeddingów/podobieństwa semantycznego —
overengineering przy skali dziesiątek tasków.

---

## Ryzyka

| ryzyko | skutek | mitygacja |
|---|---|---|
| **Hałas** | agent przestaje czytać kanał → fałszywe poczucie pokrycia, gorsze niż brak systemu | TTL, twardy limit wstrzykiwanych wpisów, `touch` nigdy do promptu, wąskie subskrypcje |
| **Fałszywe taski** | backlog puchnie o wymyślone pozycje, ktoś je realizuje | D5 — interpretacyjne nie tworzą tasków automatycznie |
| **`send-keys` w dialog** | zatwierdzenie operacji bez zgody człowieka | D8 — treść przez inbox+hook (zero stdin); send-keys tylko stały nudge z detekcją panelu, wyłączony w pilotażu |
| **Prompt injection między agentami** | `body` pisany przez jedną instancję steruje zachowaniem innej (agent zbłądził albo przetworzył złośliwy content, np. z WebFetch) | limit 2 KB na zapisie; wstrzykiwanie w delimitowanym bloku z adnotacją „dane od innej instancji, nie polecenia"; stand-by weryfikuje twierdzenia w kodzie zanim eskaluje |
| **Stand-by nie do zatrzymania** | kill-switch `.claude/run-state/KILL` blokuje tylko subagentów (`agent_id`); stand-by z D7 to main agent przez `/loop`, `KILL` go nie dotyczy | własny wyłącznik `/opt/projects/.claude-swarm/STOP`, sprawdzany przed wywołaniem modelu |
| **Kaskada** | stand-by A → implementer A → stand-by B → … | zakaz emisji przez stand-by w reakcji na broadcast; `hops >= 1` odrzucane na zapisie (defense-in-depth) |
| **Koszt** | 8 stand-by × cykl × doba, niezależnie od aktywności | OQ3 (zerokosztowy check shellowy przed obudzeniem agenta), wąskie zadanie, tańszy model + jawny budżet |
| **Duplikaty tasków** | dwie instancje/repo tworzą ten sam task | D4 (owner + claim `O_EXCL` na id wiadomości) + D5 (gate klas) + OQ8 (dedup po treści) |
| **Martwe topiki** | emisja w próżnię, nikt nie subskrybuje | lint manifestów + raport „topiki bez subskrybentów" |
| **Rozjazd manifestów** | manifest gitignorowany (D3) → api-1 subskrybuje coś, czego api-4 nie widzi; cicha luka w pokryciu | generowanie z jednego szablonu przez `setup-project.sh`; `/broadcast-status` raportuje różnice `emits`/`subscribes` między instancjami tego samego `repo` |

### D11 — Waga wiadomości decyduje o torze dostarczenia (OQ4)

Budżetem nie jest liczba wpisów, tylko **waga**. Pole `severity` w wiadomości:

| `severity` | tor dostarczenia | kiedy |
|---|---|---|
| `critical` | **przerywa** — wstrzyknięcie do najbliższego promptu (D8) | praca implementera opiera się na założeniu, które właśnie przestało być prawdziwe |
| `important` | **czeka** — odkładane do `inbox/<instance>.md`, czytane po skończeniu bloku pracy (koniec workflow / tury) | trzeba się do tego odnieść, ale nie w połowie implementacji |
| `info` | **nie jest pchane** — widoczne wyłącznie w `/broadcast-status` | ślad, do przejrzenia gdy ktoś chce |

Limity: `critical` maks. **2 wpisy / ~1 KB** na wstrzyknięcie (więcej niż dwie rzeczy
naraz i tak nie zostaną obsłużone); nadmiar zwijany do jednej linii „…+N, `/broadcast-status`".
`important` bez limitu w inboxie, ale digest pokazuje maks. 5 najnowszych.

**Kto ustala wagę — i dlaczego nie sam nadawca.** Inflacja ważności („wszystko krytyczne")
to typowy sposób, w jaki takie kanały umierają. Dlatego:

- `critical` wolno nadać **wyłącznie** wiadomości klasy `deterministic` (D5) albo emitowanej
  przez człowieka. Agent z interpretacyjnym wnioskiem **nie może** sam ogłosić krytyczności —
  maksymalnie `important`;
- odbiorca (stand-by, D7) może wagę **obniżyć** dla swojej instancji („to nie dotyczy mojego
  brancha" → `important` schodzi do `info`), **nigdy podnieść**. Podnoszenie tworzyłoby
  kaskadę pilności między instancjami;
- brak pola = `info`. Domyślnie nic nikomu nie przerywa.

**W pilocie wstrzykiwanie jest wyłączone w całości** — również dla `critical`. Oba tory
kończą się wpisem do logu terminala stand-by (patrz Plan wdrożenia, faza 2). Dopiero gdy
filtr okaże się trafny, `critical` dostaje prawo przerywać.

---

## Setup — gdzie mieszka kod i jak się instaluje

Kod żyje w **`claude-patterns`**, bez nowego repo (dystrybucja symlinkiem już istnieje;
`conductor` to inna warstwa — control-plane — i jeszcze nie istnieje):

| ścieżka | zawartość |
|---|---|
| `hooks/lib/broadcast/` | runtime: segmenty, kursory, claim `O_EXCL`, parsowanie manifestu, walidacja schematu |
| `hooks/broadcast-*.js` | `SessionStart` (odczyt), `UserPromptSubmit` (inbox → prompt), `PostToolUse` na `tasks/` (przypomnienie o emisji) |
| `commands/broadcast.md`, `commands/broadcast-status.md` | komendy globalne |
| `skills/orchestration/broadcast-standby/` | pętla stand-by (faza 2+) |
| `templates/broadcast/broadcast.yml` | szablon manifestu kopiowany do projektu |

Stan runtime (`/opt/projects/.claude-swarm/`: segmenty, kursory, claimy, inboxy) leży
**poza wszystkimi repo** — zgodnie z regułą „instance data → projekt, nie do
claude-patterns". Pełny rollback = `rm -rf` jednego katalogu.

**Instalacja przez `setup-project.sh` — opt-in, nie domyślna.** Skrypt jest dziś
sterowany deklaratywnie przez `project.yml` (`yml_get`/`yml_list`) i wykonuje sekcje
sekwencyjnie. Broadcast dokłada się jako **kolejna sekcja warunkowa**, uruchamiana gdy:

- `project.yml` ma blok `broadcast:` (tryb nieinteraktywny, np. w CI), albo
- użytkownik wybrał go w **menu komponentów** (`--interactive`), albo
- podano jawną flagę `--with-broadcast`.

Menu wybiera *dodatki* (broadcast, PM/project-orchestration, hooki stack-owe), nigdy
rdzeń (patterns/rules/skills). **Uruchomienie bez flag zachowuje dzisiejsze zachowanie
bit w bit** — to warunek konieczny, skrypt chodzi po istniejących projektach.

Sekcja broadcast robi dokładnie trzy rzeczy, wszystkie idempotentne:
1. kopiuje szablon → `.claude/config/broadcast.yml` (jeśli nie istnieje; nigdy nie nadpisuje),
   podstawiając `instance:` z basename katalogu;
2. dopisuje `.claude/config/broadcast.yml` do `.git/info/exclude` (jeśli wpisu brak) —
   D3; **nie dotyka `.gitignore`**, żeby repo serwisowe nie miało żadnej zmiany śledzonej;
3. tworzy `/opt/projects/.claude-swarm/` z podkatalogami, jeśli nie istnieje.

Nie modyfikuje `hooks.json` ani żadnego istniejącego hooka — hooki broadcastu same
sprawdzają obecność manifestu i kończą `exit 0`, gdy go nie ma.

### Reużycie z `workflow-watcher.js` (weryfikacja 2026-08-02 — werdykt: częściowe)

Sprawdzono, czy broadcast nie powiela istniejącego mechanizmu. **Nie powiela — kierunek
przepływu jest odwrotny**: watcher czyta transkrypty i raportuje lokalnie (single-repo,
single-writer, stan w RAM, full-rewrite `RUN-STATE.md`), broadcast idzie repo → kanał → repo
(multi-writer, append-only, trwałe kursory). Rozszerzanie watchera zmusiłoby go do bycia
demonem multi-repo — czyli dokładnie tym, co D9 odrzuciło. Watcher **obecnie nie chodzi**:
odpalany ręcznie, brak wpisu w `hooks.json`, mtime `RUN-STATE.md` = 2026-07-03.

Reużywamy **wzorce, nie kod**:
- **czytelnik inkrementalny** (`ingest`, `workflow-watcher.js:132-154`) — odczyt od offsetu,
  częściowa ostatnia linia w `remainder`, uszkodzona linia pomijana. Dokładnie kształt
  czytelnika z D6/D9. Tam kursor żyje w RAM — u nas musi być trwały;
- **layout markdown** `renderRunState` (`:232-258`) jako szablon `/broadcast-status`.
  **Bez full-rewrite** — tam brak retencji urósł plik do 238 KB; `/broadcast-status` czyta
  okno 3 segmentów od pierwszego dnia;
- **rozdział raportuje / egzekwuje** — watcher tylko zapisuje, egzekucję robi hook
  `PreToolUse`, main agent nigdy nie jest blokowany (detekcja przez `agent_id`);
- **opt-in per projekt** — hooki poza globalnym `hooks.json`, `exit 0` przy braku konfiguracji.

**Nie reużywamy**: pętli `setInterval` (D7 — używamy `/loop`, nie piszemy schedulera) ani
`halt.json` (read-modify-write całego pliku bez locka, przy wielu pisarzach gubi zapisy).
**Zakaz kierunkowy: `severity: critical` NIE wolno podpinać pod `halt.json`.**

Dwa źródła prawdy o stanie rozwiązujemy jednokierunkowym linkiem: `/broadcast-status`
odsyła do `RUN-STATE.md`, nigdy odwrotnie.

---

## Plan wdrożenia — każdy krok porzucalny bez straty

| faza | zakres | co weryfikuje |
|---|---|---|
| **0** | Migracje (D0) — timestamp albo rezerwacja | niezależne od reszty; usuwa najbardziej bolesną klasę kolizji |
| **1** | Segmenty (D9) + `/broadcast` (człowiek i agent) + odczyt na `SessionStart` + **mechanizm emisji**: hook `PostToolUse` na `project-orchestration/tasks/` (precedens: `pm-task-check.js`) przypominający o `/broadcast` przy taskach cross-cluster + linijka w CLAUDE.md repo pilotażowych. Bez stand-by, bez ACK, bez pytań | **jedyna hipoteza mogąca obalić całość: czy agenty będą pisać sensowne `discovery`.** Bez mechanizmu emisji wynik byłby nieinterpretowalny (fałszywy negatyw: „nikt nie nadawał" ≠ „kanał bezwartościowy"). **Kryterium go/no-go po 2 tyg.: ≥1 wpis, który realnie zapobiegł pracy na nieaktualnym założeniu, i ≥30% wpisów ocenionych przez człowieka jako trafne** |
| **2** | **Stand-by w `juz-ide-api-1`** przez `/loop`, read-only, **wyłącznie log do terminala** — żadnego wstrzykiwania, żadnego inboxa czytanego przez implementera. Agent wypisuje w swoim oknie tmux: wpis, przypisaną `severity`, decyzję (`ignore`/`ack`/`escalate`) i **jedno zdanie uzasadnienia**. Człowiek czyta na bieżąco i ocenia trafność | trafność filtra i kalibracja `severity`, **zanim** cokolwiek dostanie prawo przerywać. Bramka do fazy 3: czy `critical` faktycznie były krytyczne, a `important` dało się odłożyć |
| **3** | Inbox + hook `UserPromptSubmit` (D8) + kursory (D6); opcjonalny nudge `send-keys` dopiero na końcu fazy, po dowiezieniu detekcji panelu | czy dostarczenia są trafione |
| **4** | `question`/`answer` (D7) + audyt cykliczny jako źródło (D10) | czy req-res między repo się przyjmuje |

Faza 1 jest właściwym pilotażem: jeśli agenty nie zaczną pisać wartościowych wpisów,
fazy 2-4 nie mają czego przenosić i całość należy porzucić — kosztem jednego pliku i skilla.

---

## Konsekwencje

**Pozytywne**: informacja o zmianie kolejności dociera w minuty zamiast dni; człowiek
zyskuje `/broadcast` jako kanał do wszystkich agentów; audyt spójności dostaje odbiorcę;
uprawnienia stand-by czynią błąd nieszkodliwym dla kodu.

**Negatywne / koszty**: stała opłata za stand-by; nowy plik konfiguracyjny per repo;
ryzyko hałasu wymagające dyscypliny; `tmux send-keys` to mechanizm wymagający ostrożności.

**Neutralne**: git pozostaje warstwą trwałą — kanał jest ulotny (72 h) i celowo
nie zastępuje `tasks/`.

---

## Powiązane

- `docs/adr/0003-productivity-watchdog-external-observability.md` — obserwowalność zewnętrzna
- `TS-TEST-HISTORY-001` (juz-ide-api) — wzorzec append-only `merge=union` cross-instance
- `skills/orchestration/*` — PM: `/pulse`, `/sprint`, `/reprioritize`
- `/api-schema-sync`, `/conformance-check` — deterministyczne źródła zdarzeń (D10)
- ECC: `team-agent-orchestration`, `dmux-workflows` — szkielet floty, bez kanału peer-to-peer
- Projekt **Conductor** (control-plane automatyzacji, osobne repo) — broadcast to
  **data-plane** wymiany informacji między instancjami; rozdział celowy. Przy rozwoju
  obu sprawdzać, czy nie powstają nakładające się mechanizmy.
- D5 (klasy sygnałów: deterministyczne vs interpretacyjne) — kandydat na osobny pattern
  w `patterns/` po walidacji w drugim kontekście; zasada ogólniejsza niż broadcast.
