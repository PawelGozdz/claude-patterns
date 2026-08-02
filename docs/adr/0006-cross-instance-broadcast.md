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

### D2 — Dwie warstwy topiców: strukturalne (stałe) + domenowe (per repo)

**Strukturalne** — ten sam zestaw w każdym repo, zdefiniowany centralnie w `claude-patterns`,
nierozszerzalny ad hoc:

| topic | znaczenie |
|---|---|
| `<repo>/contracts` | zmiana kontraktu wychodzącego (API, schema, typy publiczne) |
| `<repo>/migrations` | migracje danych/schematu |
| `<repo>/security` | ustalenie o wpływie na bezpieczeństwo |
| `<repo>/release` | wydanie / merge do integracyjnego brancha |
| `<repo>/questions` | pytania kierowane do tego repo (patrz D7) |

**Domenowe** — deklarowane przez repo w jego manifeście, dowolna liczba, zmienne w czasie.
Dziś w `juz-ide-api`: `geo`, `pricing`, `actor`. Za miesiąc mogą dojść `legal`, `gdpr`,
`organizations` — **bez żadnej zmiany w claude-patterns**.

Rozdział jest istotny: strukturalne mają znaną semantykę i mogą mieć twarde reguły
(np. `contracts` zawsze wymaga ACK), domenowe są luźne i lokalne.

### D3 — Manifest per repo: `.claude/config/broadcast.yml`

Jedno miejsce deklaracji, walidowane lintem:

```yaml
repo: juz-ide-api          # nazwa logiczna, NIE nazwa katalogu instancji
emits:
  domain: [geo, pricing, actor]     # + strukturalne automatycznie
subscribes:
  - juz-ide-api/*                   # siostrzane instancje TEGO SAMEGO repo
  - juz-ide-mobile-app/questions
  - juz-ide-mobile-app/contracts
  - vytches-ddd/contracts
  - claude-patterns/*
```

**Kluczowe rozróżnienie repo ↔ instancja.** `juz-ide-api-1..4` to **jedno repo,
cztery instancje**. Topic jest per repo (logiczne), pole `instance` w wiadomości mówi,
kto fizycznie nadał. Subskrypcja `juz-ide-api/*` obejmuje więc siostrzane instancje —
i to jest **główny przypadek użycia** (cross-cluster impact z sekcji Kontekst, pkt 1).
Reguła „nie widzę własnych wiadomości" działa po `instance`, nigdy po `repo`.

**Źródło `instance`.** Manifest jest commitowany, więc w czterech klonach jest
**identyczny** — `instance` nie może z niego pochodzić. Tożsamość instancji =
basename katalogu roboczego (`juz-ide-api-3`), z opcjonalnym override w gitignorowanym
`.claude/config/instance.local` (explicit config wygrywa z konwencją nazwy katalogu).

### D4 — Fan-out zawsze; obowiązek pojedynczy i przypisany, nigdy wywalczony

**Nie ma trybu „pierwszy bierze"** (competing consumers) — to on produkuje duplikaty tasków.
Jest fan-out do wszystkich subskrybentów + jedno pole `owner`:

- `owner` domyślnie = właściciel topicu (z prefiksu, D1);
- może być nadpisany jawnie (np. wiadomość na `juz-ide-api/contracts` z `owner: juz-ide-mobile-app`);
- **pusty `owner` = informacja, nikt nie ma obowiązku działać** — i to powinien być
  najczęstszy przypadek.

Tylko `owner` tworzy task. Pozostali subskrybenci ACK-ują i reagują lokalnie
(np. przestawiają kolejność u siebie), ale **nie tworzą tasków**.

Rezerwacja `O_EXCL` zostaje wyłącznie jako awaryjne rozstrzygnięcie, gdy właściciela nie
da się wyznaczyć. Przy dobrze zdefiniowanych topicach ma być rzadka.

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

### D7 — Stand-by: osobna instancja per sesja tmux, read-only, uruchamiana przez `/loop`

Nie wstrzykujemy do pracującego implementera na podstawie dopasowania ścieżki. Zamiast tego
**dedykowane okno tmux ze stand-by agentem**:

- uruchamiany przez istniejący `/loop <interwał>` — **nie piszemy schedulera**;
- uprawnienia: **read + tworzenie tasków/dokumentacji; zero edycji kodu** — granica
  bezpieczeństwa siedzi w uprawnieniach, nie w prompcie;
- zadanie na turę wąskie i policzalne: *przeczytaj nowe wpisy → dopasuj do bieżącego
  taska → zdecyduj: ignoruj / ACK / eskaluj*;
- obsługuje też `<repo>/questions` — odpowiada na pytania innych repo z kodu i dokumentacji.

Trzy zalety wobec wariantu z hookiem: implementer nie płaci kontekstem za cudzą korespondencję;
filtr działa **przed** przerwaniem (stand-by najpierw czyta task i kod, potem decyduje);
błąd stand-by nie może zepsuć kodu.

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
| `invalidate` | wg OQ5 | „sprawdź zanim napiszesz" (OQ6) + decyzja `applied/dismissed` w kursorze | nie |

Faza 1 używa wyłącznie `discovery` + `done`; `question`/`answer` dochodzą w fazie 4,
`invalidate` po rozstrzygnięciu OQ5.

---

## Tabela własności topiców — DO WYPEŁNIENIA

Wypełnia człowiek. `emits.domain` to jedyna kolumna wymagająca decyzji — strukturalne
(D2) dochodzą automatycznie. Propozycja wstępna na podstawie obecnych klastrów w KANBAN;
**wszystko poniżej jest do zmiany**:

| repo (logiczne) | instancje | `emits.domain` (propozycja) | `subscribes` (propozycja) |
|---|---|---|---|
| `juz-ide-api` | api-1..4 | `geo`, `pricing`, `actor` | `juz-ide-api/*`, `juz-ide-mobile-app/{questions,contracts}` |
| `juz-ide-mobile-app` | mobile-app | `ui-flows` | `juz-ide-api/{contracts,questions,geo,pricing,actor}` |
| `vytches-ddd` | vytches | ? | `claude-patterns/*` |
| `grant-flow` | — | ? | `vytches-ddd/contracts`, `claude-patterns/*` |
| `grant-flow-ui` | — | ? | `grant-flow/contracts` |
| `claude-patterns` | claude-patterns | `patterns`, `agents`, `hooks` | (mało — źródło, nie odbiorca) |
| `feature-flags` | feature-flags | ? | ? |
| `juz-ide-blog` / `juz-ide-landing-page` | — | ? | ? |

Uwaga do wypełniania: **subskrybować możliwie wąsko.** Repo, które słucha wszystkiego,
przestanie czytać cokolwiek.

---

## OTWARTE PYTANIA (blokują implementację)

**OQ1 — Tabela własności.** Powyższa, do wypełnienia. Które repo emituje jakie domeny
i kto kogo słucha? To jedyna decyzja niewywnioskowalna z kodu.
*Rekomendacja (review):* nie wypełniać całej — w pilocie manifesty tylko dla trzech repo:
`juz-ide-api`, `juz-ide-mobile-app`, `claude-patterns`. Reszta = decyzja odroczona do
fazy 4; „subskrybować wąsko" najlepiej wymusza się przez niedodawanie wierszy.

**OQ2 — Migracje: timestamp czy rezerwacja?** (D0) Timestamp jest czystszy, ale wymaga
zmiany konwencji i guardiana. Rezerwacja zachowuje numery kosztem mechanizmu do utrzymania.
*Rekomendacja (review):* timestamp/ULID — usuwa klasę problemu zamiast nią zarządzać;
TypeORM i tak domyślnie timestampuje migracje, a precedens zmiany konwencji
cross-instance już istnieje (`TS-TEST-HISTORY-001`). Koszt guardiana jednorazowy.

**OQ3 — Stand-by: gdzie i kiedy.** W każdej sesji tmux, czy tylko tam, gdzie ktoś aktualnie
pracuje? Osiem stand-by budzonych cyklicznie to stała opłata niezależna od tego, czy coś
się dzieje. Jaki interwał `/loop`?
*Rekomendacja (review):* tylko tam, gdzie trwa praca, i **nie budzić agenta bez potrzeby**:
tick `/loop` najpierw robi zerokosztowy check shellowy (rozmiar segmentów vs kursor
instancji); agent LLM startuje tylko, gdy są nowe bajty. Wtedy interwał może być
agresywny (5-10 min) przy koszcie ~0 w ciszy.

**OQ4 — Budżet hałasu.** Ile wiadomości maksymalnie wstrzykiwać do promptu implementera
w jednym oknie? Jaki TTL (propozycja 72 h)? Czy `discovery` wolno emitować tylko gdy
dotyczy innego repo/klastra niż własny?
*Rekomendacja (review):* maks. 3 wpisy / ~2 KB na wstrzyknięcie; priorytet:
`owner == ja` > deterministyczne z moich subskrypcji > interpretacyjne; nadmiar jako
jedna linia „…+N starszych, `/broadcast-status`". TTL 72 h = 3 segmenty dzienne.
`discovery` tylko cross-cluster/cross-repo — wewnątrz własnego klastra informacja
i tak jest w `tasks/` tej instancji.

**OQ5 — Kto może emitować `invalidate`.** Najsilniejszy sygnał. Tylko człowiek?
Tylko klasa deterministyczna? Czy agent po weryfikacji?
*Rekomendacja (review):* w fazach 1-3 tylko człowiek + klasa deterministyczna
(np. schema-diff wykrył usunięcie endpointu). Agent po weryfikacji emituje najwyżej
`discovery` z propozycją unieważnienia, eskalowaną do człowieka — spójne z D5:
najsilniejszy sygnał wymaga najsilniejszej klasy źródła.

**OQ6 — Semantyka `invalidate` u odbiorcy.** „Sprawdź zanim napiszesz" czy „zatrzymaj się"?
Ryzyko: agent użyje go jako wymówki („nie mogę, ktoś to unieważnił"). Rekomendacja: pierwsze.
*Review potwierdza + domknięcie:* odbiorca zapisuje w kursorze decyzję `applied/dismissed`
z jednym zdaniem uzasadnienia (D6) — wymówka przestaje być darmowa, bo zostawia ślad.

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
| **Kaskada** | stand-by A → implementer A → stand-by B → … | zakaz emisji przez stand-by w reakcji na broadcast; `hops >= 1` odrzucane na zapisie (defense-in-depth) |
| **Koszt** | 8 stand-by × cykl × doba, niezależnie od aktywności | OQ3 (zerokosztowy check shellowy przed obudzeniem agenta), wąskie zadanie, tańszy model + jawny budżet |
| **Duplikaty tasków** | dwie instancje/repo tworzą ten sam task | D4 (owner + claim `O_EXCL` na id wiadomości) + D5 (gate klas) + OQ8 (dedup po treści) |
| **Martwe topiki** | emisja w próżnię, nikt nie subskrybuje | lint manifestów + raport „topiki bez subskrybentów" |

---

## Plan wdrożenia — każdy krok porzucalny bez straty

| faza | zakres | co weryfikuje |
|---|---|---|
| **0** | Migracje (D0) — timestamp albo rezerwacja | niezależne od reszty; usuwa najbardziej bolesną klasę kolizji |
| **1** | Segmenty (D9) + `/broadcast` (człowiek i agent) + odczyt na `SessionStart` + **mechanizm emisji**: hook `PostToolUse` na `project-orchestration/tasks/` (precedens: `pm-task-check.js`) przypominający o `/broadcast` przy taskach cross-cluster + linijka w CLAUDE.md repo pilotażowych. Bez stand-by, bez ACK, bez pytań | **jedyna hipoteza mogąca obalić całość: czy agenty będą pisać sensowne `discovery`.** Bez mechanizmu emisji wynik byłby nieinterpretowalny (fałszywy negatyw: „nikt nie nadawał" ≠ „kanał bezwartościowy"). **Kryterium go/no-go po 2 tyg.: ≥1 wpis, który realnie zapobiegł pracy na nieaktualnym założeniu, i ≥30% wpisów ocenionych przez człowieka jako trafne** |
| **2** | Stand-by przez `/loop` w **jednym** repo, read-only, **bez dostarczania** — tylko raportuje człowiekowi „to dotyczyłoby Twojego taska" | trafność filtra, zanim dostanie prawo przerywać |
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
