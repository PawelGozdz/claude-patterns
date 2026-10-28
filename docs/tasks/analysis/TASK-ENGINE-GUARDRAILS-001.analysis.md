---
task: TASK-ENGINE-GUARDRAILS-001
telemetry_run: null
status: approved               # odpowiedzi Q1–Q6 = rekomendacje analizy (potwierdzone przez użytkownika); krok 2 odblokowany
threat_model: null              # ryzyka bezpieczeństwa: sekcja „Ryzyka” + panel security w body; pełny model STRIDE nie jest potrzebny (narzędzie lokalne, bez PII)

open_questions:
  # Kolejność: najpierw one-way (Q1), potem USER_CHALLENGE (Q2), potem TASTE razem (Q3–Q6).
  - id: Q1
    ask: >-
      Decyzje sprzeczne z kartą reguł albo oparte na fałszywym założeniu mogą dostać w pliku analizy osobny
      znacznik, który zostaje tam na stałe. Czy je wprowadzać, czy wystarczy zwykłe pytanie do Ciebie?
    q: "ANL-049/050: nowe pola premises/premise_failed/card_conflict w szablonie artefaktu (one-way: zostają w adoptowanych artefaktach) vs sama para open_questions bez nowych pól"
    class: TASTE
    door_type: one-way
    decision: D6
    options: ["Osobne pola, bo prepare pilnuje wtedy pary pytanie–odpowiedź (recommended)", "Samo pytanie, bez nowych pól"]
    answer: "Osobne pola, bo prepare pilnuje wtedy pary pytanie–odpowiedź"
  - id: Q2
    ask: >-
      Gdy agent sam dopisze usprawiedliwienie dla złamania reguły, czy przebieg ma stanąć i czekać na Twoją zgodę?
      Dziś jedno zdanie z powodem w kodzie wystarcza, żeby bramka puściła naruszenie.
    q: "exception-new: wyjątek (komentarz THROW-/QUEUE-EXCEPTION albo wpis w .claude/conformance.json) nieobecny w baseline z HEAD blokuje do zgody człowieka; v1 uznawał każdy wyjątek z powodem"
    class: USER_CHALLENGE
    door_type: two-way
    decision: D3
    options: ["Tak, nowy wyjątek zawsze czeka na człowieka (recommended)", "Nie, wystarczy powód w kodzie"]
    answer: "Tak, nowy wyjątek zawsze czeka na człowieka"
  - id: Q3
    ask: >-
      Czy reguła „handler komendy nie rzuca wyjątków” ma obejmować też pliki pomocnicze obok handlera?
      Objęłaby więcej kodu, a nie wiemy jeszcze, ile starego długu mają marketing-hub i grant-flow.
    q: "zakres bodyRules.match: tylko *.handler.ts (v1) vs wszystkie nie-spec pliki w application/commands|queries; helper z throw omija v1"
    class: TASTE
    door_type: two-way
    decision: D4
    options: ["Nie teraz — najpierw zmierzyć dług w tych projektach (recommended)", "Tak, od razu"]
    answer: "Nie teraz — najpierw zmierzyć dług w tych projektach"
  - id: Q4
    ask: >-
      Zadania wyglądające na paczkę kilku osobnych zmian mają zatrzymywać start przebiegu czy tylko ostrzegać?
      Na 440 dotychczasowych analiz zatrzymany zostałby jeden przypadek — ten, od którego wszystko się zaczęło.
    q: "ORC-142: bundle gate exit 2 (z bundle_ack) vs same ostrzeżenia; pomiar: 1/440 hits>=2, 8/440 hits==1"
    class: TASTE
    door_type: two-way
    decision: D7
    options: ["Zatrzymywać, z możliwością świadomej zgody (recommended)", "Tylko ostrzegać"]
    answer: "Zatrzymywać, z możliwością świadomej zgody"
  - id: Q5
    ask: >-
      Czy blokada dla agenta od testów, który zapisał kod produkcyjny, ma działać od razu, czy najpierw tylko
      zapisywać takie przypadki do dziennika? Blokada jest jednorazowa i opiera się na heurystyce, więc czasem może zatrzymać niesłusznie.
    q: "ORC-143: check-test-implementer-scope domyślnie block vs log-only; warn (stderr, exit 0) nie wraca do modelu (hipoteza niezweryfikowana), więc warn-first wymagałby nowego dziennika"
    class: TASTE
    door_type: two-way
    decision: D8
    options: ["Blokować od razu, tylko w projektach z blokiem DDD (recommended)", "Najpierw dziennik, blokada po dwóch tygodniach"]
    answer: "Blokować od razu, tylko w projektach z blokiem DDD"
  - id: Q6
    ask: >-
      Czy otworzyć osobne zadanie na to, żeby ręcznie uruchamiani agenci dostawali reguły wprost w poleceniu?
      To główna przyczyna z audytu, a ten task domyka ją tylko częściowo.
    q: "punkt 8 zadania: hook SubagentStart wstrzykujący karty, zapisy przez Bash w check-subagent-pattern-reads, wymóg code-quality-verifier po ręcznym implementerze — poza zakresem 8 SP"
    class: TASTE
    door_type: two-way
    decision: D9
    options: ["Tak, osobne zadanie (recommended)", "Nie, poza zakresem"]
    answer: "Tak, osobne zadanie"

decisions:
  - id: D1
    topic: "Gdzie biegnie kontrola conformance"
    choice: "Pole `conformance` + `conformanceReport` w istniejącej sondzie `checks` (pętla naprawcza) ORAZ deterministyczna kontrola w kroku 4 `/orchestrate` przed `git add` (kod wyjścia, bez modelu). NIE w sondzie hasha drzewa."
    means: "Naruszenie reguły wraca do agenta z dokładnym plikiem i linią, a przed zapisem do stagingu sprawdza je jeszcze raz program, nie model. Liczba wywołań Haiku się nie zmienia."
    rationale: >-
      Sonda hasha (ORC-139) woła Haiku 2× na próbę warstwy, 2× na rundę bramki końcowej i 1× przy pieczęci, ma schemat z jednym polem
      i `parseTreeHash` przepuszcza wyłącznie hex; wynik ratchetu zależy od drzewa, nie od momentu, więc pre i post dałyby to samo przy wielokrotnym koszcie
      (template: `treeHash`, `buildTreeHashPrompt`). Sonda `checks` biegnie raz na próbę i już ma mapowanie wyników na pola.
      Odpowiedź Haiku to twierdzenie, a `skipped` przy exit 3 (brak baseline) daje ciche przejście, więc potrzebny jest backstop jak
      `orchestrate-tree-hash.mjs --check` w kroku 4. Panel: architekt i skeptyk niezależnie rekomendują to samo.
    class: MECHANICAL
    door_type: two-way
  - id: D2
    topic: "Zakres i podstawa porównania kontroli"
    choice: >-
      (a) Zawężenie `--only <dirs>` / `--skip <pliki>` składa KOD z `effectiveDirs(layer)` i `a.dirtyAtStart` (w CORE, jak `treeHashCmd`), ścieżki przez filtr `[\w./@+-]` bez `..` i bez wiodącego `-`;
      prepare emituje gołe id `conformance`. (b) Ratchet porównuje z SHA z początku przebiegu (`baseSha` z prepare), nie z ruchomym HEAD.
    means: "Kontrola nie oskarża agenta o cudze niezacommitowane pliki ani o prace innych jednostek, i nie da się jej oszukać commitem w trakcie przebiegu."
    rationale: >-
      v1 `--changed` jest repo-wide (git diff vs HEAD + nieśledzone). Na develop dochodzą ORC-124/130/132 (`dirtyAtStart`, `baseSha`) i jednostki z `scope.dirs`:
      cudzy brudny plik z `throw` albo praca jednostki n-1 wpadłaby jako NEW i warstwa wyczerpałaby próby czerwienią, której implementer nie może naprawić (ten sam kształt co ORC-134).
      Prepare rozwija `checks` raz na warstwę, a overrides podmieniają tablice po fakcie, więc tylko `buildProbePrompt` widzi komplet danych. Panel: architekt (C), skeptyk (2), security (2.1: przesunięcie HEAD).
    class: MECHANICAL
    door_type: two-way
  - id: D3
    topic: "Wyjątki od reguł ciała pliku"
    choice: "Wyjątek obecny w baseline (źródło i `.claude/conformance.json` z `baseSha`) działa jak w v1. Wyjątek dodany w tym przebiegu ma status `exception-new` i blokuje; każda różnica `.claude/conformance.json` względem `baseSha` (reguły, `baselineRef`, `exceptions`, `disabled`) to osobne ustalenie. `.claude/conformance.json` i `.claude/test-scope.json` wypadają z dozwolonych zapisów hooka."
    means: "Agent nie może sam sobie wystawić zgody na złamanie reguły; zgodę wydaje człowiek."
    rationale: >-
      Dowód w kodzie v1: `evaluateBodyRules` oznacza ustalenie z wyjątkiem jako `excepted` (nie `new`), a `check.mjs` liczy w exit code tylko `bodyNew`;
      baseline liczony jest z BIEŻĄCEJ konfiguracji wyjątków. Wystarczy więc jeden dopisany komentarz z dowolnym „powodem” — dokładnie ten mechanizm (fałszywy komentarz), który oszukał weryfikatora w audycie.
      Zmiana kierunku względem v1, więc pytanie Q2.
    class: USER_CHALLENGE
    door_type: two-way
  - id: D4
    topic: "Zakres reguł ciała pliku i luki detekcji"
    choice: "W tym zadaniu: zakres `match` bez zmian (tylko `*.handler.ts`), domknąć luki detekcji importu (`export … from`, `import x = require()`, `bull` i `@nestjs/bull` na liście modułów) i klucz baseline po STAREJ ścieżce przy rename. Pliki pomocnicze: dopiero po pomiarze (Q3)."
    means: "Reguła łapie więcej sposobów obejścia, ale nie zalewa projektów starym długiem, którego jeszcze nie policzyliśmy."
    rationale: >-
      Security: `throw` w `*.helper.ts` obok handlera omija `match`; rename pliku spoza `match` do `*.handler.ts` wnosi stare `throw` jako baseline (analiza po nowej ścieżce, `baseline.mjs`).
      Dług w `application/commands/` marketing-hub i grant-flow nie był mierzony (zadanie, sekcja „Do zrobienia po scaleniu”), więc rozszerzenie zakresu bez pomiaru to zgadywanie.
    class: TASTE
    door_type: two-way
  - id: D5
    topic: "Czerwona sonda: wszystkie miejsca decyzyjne + test strażnik"
    choice: "`probeIsRed` jako jedyny predykat, plus dopisanie `conformance` w `probeCrashed`, `finalProbeSkippedFields`, `finalProbeSummary`, w czterech funkcjach odroczeń/flaky i w 3 wywołaniach sondy (próba warstwy, `final-fix-checks`, bramka końcowa). Test strażnik: statyczny (żadnego `=== 'fail'` na polach sondy poza `probeIsRed` i whitelistą) + behawioralny (sonda `{typecheck:pass, tests:pass, conformance:fail}` nigdy nie daje GO, odroczenia ani flaky)."
    means: "Czerwona kontrola reguł nie może zostać po cichu uznana za zieloną w żadnym miejscu silnika."
    rationale: >-
      v1 zastąpił 5 kopii warunku. Na develop (e9864d9) jest ich 6 (`probeHasGreenEvidence` l. 973, `typecheckRedIsLaterLayers` 1249, `testsRedIsLaterLayers` 1292, `testsFlakyUnderLoad` 1308,
      pętla warstwy 1975 i nowa `final-fix-checks` 2286) oraz 3 miejsca o innym kształcie (`probeCrashed` 1239, `finalProbeSkippedFields` 962, `finalProbeSummary` 987). Mechaniczny port pominąłby 2286 i trzy kształty. Zweryfikowane grepem i odczytem; skeptyk potwierdził niezależnie.
    class: MECHANICAL
    door_type: two-way
  - id: D6
    topic: "ANL-049/050/051: jeden kanał zgody"
    choice: >-
      Pola `premises[]`, `premise_failed`, `card_conflict` zostają jako FAKT o decyzji (opcjonalne). Bramka w prepare nie czyta `exception_approved`: wymaga sparowanego pytania (`decision: <id>`) z niepustym `answer`, a przy `options` odpowiedź musi być jedną z opcji. ANL-051 (wynik częściowy bramki) = pozycja w `open_questions` z `answer: null`, bez zmian w prepare.
    means: "Człowiek zatwierdza wyjątek w jednym miejscu — odpowiadając na pytanie — a nie w dwóch rozjeżdżających się."
    rationale: >-
      Prepare czyta dziś z `decisions[]` tylko `choice`, z `open_questions[]` tylko `answer == null`; `class`/`door_type`/`options` to „tylko prompt” (ANL-047/048). v1 dokładał drugi kanał (`exception_approved: true`) obok pytania.
      Architekt: dwa kanały mogą się rozjechać (pytanie bez odpowiedzi i flaga, albo odwrotnie). Nowe pola w szablonie zostają w adoptowanych artefaktach, więc one-way → Q1.
      Otwarte: kto po odpowiedzi „zmieniamy podejście” aktualizuje `choice` — z plików nie wynika; do ustalenia w kroku 2 (prawdopodobnie ponowna analiza, jak dziś).
    class: TASTE
    door_type: one-way
  - id: D7
    topic: "ORC-142: pakiet zadań"
    choice: "Port prawie mechaniczny: progi 3 różne „PRn” / >20 jednostek / >4 konteksty, dwa sygnały = exit 2, `bundle_ack` jako wyjście, jeden sygnał = ostrzeżenie. Dodać do komunikatu liczby z pomiaru."
    means: "Start przebiegu zatrzyma się tylko przy paczkach podobnych do tej, która wymknęła się w audycie."
    rationale: >-
      Pomiar na 440 istniejących analizach 16 projektów (api-1 jako reprezentant bliźniaków): hits>=2 = 1 (TS-SEC-D0-BETA-HARDENING-001: 5 PR, 47 jednostek, 6 kontekstów), hits==1 = 8, p90 jednostek = 6, max 47.
      Progi przestają być samą oceną. Zastrzeżenie: pomiar bez tekstu tasków (sygnał „PRn” zaniżony) i skalibrowany na przypadku, który ma wychwycić. Sygnał „PRn” jest najszumniejszy (7 z 8 pojedynczych trafień), dlatego nie powinien sam zatrzymywać.
      Merge-time dotyczy WSZYSTKICH projektów (prepare jest wywoływany ze ścieżki claude-patterns), więc ryzyko zatrzymania jest realne, choć zmierzone na 1/440 → Q4.
    class: TASTE
    door_type: two-way
  - id: D8
    topic: "ORC-143: hook zakresu test-implementera"
    choice: "Port mechaniczny pliku hooka i testów z poprawkami: źródłem prawdy dla zakresu jest `git diff --name-only <baseSha>` (nie transkrypt), transkrypt zostaje wczesnym ostrzeżeniem; `.claude/conformance.json` i `.claude/test-scope.json` poza dozwolonymi; rejestracja tylko przez blok DDD (settings + `overlay.hooks`)."
    means: "Agent od testów nie przemyci zmian w kodzie produkcyjnym przez zapis w skrypcie ani przez Bash."
    rationale: >-
      Security: rozpoznawanie zapisów Bash to heurystyka z fałszywymi negatywami (`for … sed -i`, `cd dir && sed -i`, `rm`, `git apply`, skrypt `python3 x.py`), błąd parsowania = fail-open, a `stop_hook_active` robi blokadę jednorazową.
      Deterministyczny diff nie ma tych luk. Czy `SubagentStop` ustawia `stop_hook_active` jak `Stop`, z plików nie wynika (niezweryfikowane).
    class: TASTE
    door_type: two-way
  - id: D9
    topic: "Punkt 8: przyczyna po stronie ręcznych agentów"
    choice: "Poza zakresem 8 SP. Ten task: hook z D8 + kontrola z D1/D2 (łapią skutek). Osobne zadanie: wstrzykiwanie kart dla `*-implementer`, zapisy Bash w `check-subagent-pattern-reads`, wymóg weryfikatora po ręcznym implementerze, oraz tani eksperyment, czy ostrzeżenie PostToolUse z exit 0 dociera do modelu."
    means: "Dopóki nie powstanie osobne zadanie, ręcznie uruchamiany agent nadal nie dostaje reguł w poleceniu; nowa bramka tylko wychwytuje skutki."
    rationale: "Zadanie samo oznacza te propozycje jako „poza tym zadaniem, wymagają decyzji”; hipoteza o exit 0 jest wprost niezweryfikowana. Odpowiedź na Q6 rozstrzyga."
    class: TASTE
    door_type: two-way
  - id: D10
    topic: "ORC-141: drobne ustalenia weryfikatora"
    choice: "Akapity `MINOR_REMINDER` i `CARD_PRECEDENCE` portowane tekstowo. Zamiast samego regexu `BEHAVIOR_CHANGE_RE`: weryfikator oznacza per uwaga `behavior_change: true|false` (schemat obiektowy, z kompatybilnym czytaniem starych stringów); regex zostaje wąską siatką (`throw`, `Result.fail`, `rollback`, status HTTP, kod odpowiedzi). Przed włączeniem: pomiar siatki na zapisanych `minor_findings` z rollupów."
    means: "Zmiana zachowania nie przejdzie jako „drobiazg” do automatycznej poprawki bez weryfikacji, a zwykłe uwagi o nazwach i importach nie będą zamieniać GO w NO_GO."
    rationale: >-
      v1 regex zawiera `await`, `try`, `commit`, `queue`, `kolejk\w*`, `kolejno[śs]\w*` i trafia w uwagi typu „zbędny await”, „zmień kolejność importów”, „nazwa commitMessage”. Skeptyk szacuje nadmiar jakościowo; liczby nie mam (brak próbki), stąd pomiar jako warunek.
      Zmiana dotyczy wszystkich stacków (Flutter, Go, Node), nie tylko DDD, a `reclassifyMinor` zmienia werdykty także w projektach bez `conformance` — kolejny powód, by nie wypuszczać szerokiego regexu.
    class: MECHANICAL
    door_type: two-way
  - id: D11
    topic: "Bramki pre-commit i numeracja"
    choice: "Numery ORC-140..143 i ANL-049..051 (wolne, stan na dziś w obu drzewach: ostatnie ORC-139, ANL-048; sprawdzić ponownie tuż przed każdym commitem reguły). Wiersze w tabelach komend tylko CO i CO egzekwuje, bez dat ISO i słowa „incydent”; historia i uzasadnienia do `docs/decisions/orchestrate-rule-history.md` z `**Claim:**` przy każdej regule."
    means: "Nowe reguły przejdą bramki repozytorium za pierwszym razem i mają mierzalny cel."
    rationale: "Archeologia obejmuje agents/, commands/, skills/, patterns/*_summary.md i templates/fragments/ (validate-prompt-structure.mjs, `archaeologyFiles`); nie obejmuje rules/, templates/task-analysis-template.md ani blocks/. Claim: format jak w rule-history (metric ∈ firstPass|falseGo|gateNoGo|retryCost|died, `engine=` do podmiany)."
    class: MECHANICAL
    door_type: two-way

patterns:
  - application/command-handler-pattern.md
  - application/command-handler-queue-port-pattern.md

patterns_exclude: []

final_checks: []

units: []

layers_skip: []

layers_scope: []
---

# Analiza: TASK-ENGINE-GUARDRAILS-001

## Synteza (tech-lead)

Zadanie dodaje bramki, które łapią wzorce-naruszenia bez udziału modelu. Stara implementacja (37 plików) to dobra specyfikacja, ale nie nadaje się do prostego scalenia z dwóch powodów: silnik poszedł naprzód (ORC-122..139, ANL-045..048), a panel znalazł w v1 cztery realne luki, które w audycie zadziałałyby przeciwko nam.

**Co przenieść prawie mechanicznie** (20 plików nakłada się czysto; po poprawkach z D3–D5, D8):

| Krok | Zakres | Port | Uwaga |
|---|---|---|---|
| 2 | `tools/conformance` (body-rules, baseline, check, rules.json) + testy | mechaniczny + poprawki | D2 (baseSha, `--only/--skip`), D3 (`exception-new`), D4 (luki importu, rename). `/conformance-check --dir` po zmianie zwraca exit 1 także za `throw` w handlerach; nikt tego dziś nie bramkuje (jedyny konsument to opis komendy), ale zmianę trzeba opisać w komendzie. |
| 7 | hook `check-test-implementer-scope` + testy + ustawienia | mechaniczny + poprawki | D8. Plik hooka jest nieaktywny, dopóki projekt go nie zarejestruje (blok DDD + materialize). |
| — | `blocks/ddd/{core,cqrs,layers}.yml`, `schemas/block.schema.json`, fixture materialize, karty (`CH5`/`N3`/`N12`, `application-handlers.md`), `pre-commit-guards.mjs`, `hooks/README.md` | mechaniczny | Konfiguracja bez efektu do czasu `materialize-runtime`. |

**Co zaprojektować od nowa na aktualnym silniku:**

| Krok | Powód | Decyzje |
|---|---|---|
| 3 sonda `conformance` | 9 miejsc decyzyjnych zamiast 5; zakres jednostek i `dirtyAtStart` (ORC-124/130/132); backstop w kroku 4 obok `orchestrate-tree-hash.mjs` | D1, D2, D5 |
| 4 `minor_findings` | regex zbyt szeroki, zmiana werdyktów we wszystkich stackach | D10 |
| 5 `/analyze` | v1 dokładał drugi kanał zgody; szablon artefaktu zmienił się o ANL-047/048 | D6 (Q1) |
| 6 próg pakietu | konflikt z ORC-122..139 w `orchestrate-prepare.mjs`; progi teraz z pomiaru | D7 (Q4) |

### (b) Czy sonda `conformance` wchodzi do sondy hasha drzewa?

Nie. Sprawdzone w kodzie: sonda hasha jest osobnym wywołaniem Haiku z kontraktem „jedno polecenie, nic więcej”, wołanym 2× na próbę warstwy, 2× na rundę bramki końcowej i 1× przy pieczęci. Dołożenie conformance zwielokrotniłoby wywołania bez nowej informacji (ratchet zależy od drzewa, nie od momentu) i rozlałoby zmianę kontraktu na `orchestrate-tree-hash.mjs`, który dzieli z nią `treeHashCmd`/`parseTreeHash`. Kontrola jedzie w istniejącej sondzie `checks` (zero dodatkowych wywołań), a prawdę rozstrzyga program w kroku 4 przed `git add`. Kontrola jest tylko do odczytu, więc nie zmienia hasha drzewa.

### (c) Wpływ na bramki pre-commit

- **Archeologia = 0.** Skanowane są `agents/`, `commands/`, `skills/`, `patterns/*_summary.md`, `templates/fragments/`. Wiersze v1 w `orchestrate.md` i `analyze.md` trzeba skrócić do CO i CO egzekwuje; opisy objawów idą do rule-history. Zrobić `validate-prompt-structure.mjs --list` po każdej zmianie komendy.
- **Kroki i piny.** Backstop w kroku 4 to nowy krok `/orchestrate`, więc wymaga wpisu w `required-steps.json`; piny dla tokenów maszynowych: `conformance`, `--ratchet`, `bundle_ack`, `exception-new`, `premise_failed`, `card_conflict`. Ten sam commit.
- **Kontekst stały.** `context-bill --check` jest dziś zielony (298 elementów, ~142,7 KB). Dwie karty dociągane do KAŻDEGO promptu warstwy application przez `layer_contributions: "*:app"` mają razem ok. 14 KB (9,7 KB + 4,4 KB), czyli to koszt czasu przebiegu, nie rachunku stałego. Po zmianach: `--check`, a przy przekroczeniu `--capture` w tym samym commicie.
- **Claim** przy każdej z 7 reguł (ostrzeżenie pre-commit): propozycja metryk: ORC-140 `falseGo`, ORC-141 `falseGo`, ORC-142 `retryCost`, ORC-143 `falseGo`, ANL-049/050 `falseGo`, ANL-051 `gateNoGo`. Do potwierdzenia przy pisaniu; `engine=` podmienić po pierwszym rollupie.
- **Nowe bramki:** dwa evale w `pre-commit-guards.mjs` (conformance, test-implementer-scope), plus test strażnik z D5. Liczniki: hooki 47→48 (`count-assets.mjs --check-docs`), CHANGELOG, `METADATA.yml`.
- **Karty reguł** zmieniają się, więc `rag-freshness` w worktree zrobi się czerwona; przed scaleniem reseed w głównym drzewie.

### (d) Ryzyko dla projektów na żywo

Nic nie trafia do głównego drzewa przed Twoim sygnałem; praca jest w worktree. Po scaleniu rozchodzi się to dwiema drogami:

| Droga | Co | Skutek |
|---|---|---|
| **Natychmiast** (symlink / ścieżka do claude-patterns) | `commands/*.md`, `orchestrate-prepare.mjs`, `orchestrate.template.mjs`, `tools/conformance`, pliki hooków | Dotyczy WSZYSTKICH projektów używających `/orchestrate`, także bez bloku DDD: bramka pakietu (exit 2; zmierzone 1/440), `CARD_PRECEDENCE` w promptach weryfikatora, `behavior_change`/siatka `reclassifyMinor` (zmienia werdykty), `probeIsRed`. Hook jest nieaktywny bez rejestracji. |
| **Po `materialize-runtime`** | `blocks/ddd/*` → `runtime.yml` projektu: `conformance` w `checks:` warstwy application i bramki końcowej, `layer_contributions`, rejestracja hooka | api-1 i inne projekty na `ddd/layers`. marketing-hub i grant-flow mają własne `layers` — dopisują `conformance` ręcznie, dopiero po pomiarze długu. |

Wniosek: ryzyko merge-time jest w silniku (nie w konfiguracji), więc przed scaleniem chcę (1) test strażnik z D5, (2) pomiar siatki z D10, (3) evale na fixture bez `conformance`, żeby udowodnić, że projekt bez tej kontroli zachowuje się jak dotąd. Żaden projekt na żywo nie odwołuje się dziś do `conformance` (sprawdziłem `settings*.json`, `runtime.yml`, `conformance.json` i `package.json` projektów poza `_*`).

### Panel advisory (tylko pytania z niepewnością)

- **Security** (3 pytania): potwierdził samo-nadawane wyjątki (D3), wskazał 4 dalsze obejścia ratchetu (przesunięcie HEAD, helper poza `match`, luki importu, rename) i fałszywe negatywy hooka (D2, D4, D8).
- **Skeptyk** (4 pytania): 3 dodatkowe miejsca decyzyjne i test strażnik (D5), fałszywa czerwień z zakresu (D2), zbyt szeroki regex (D10), potrzeba backstopu deterministycznego (D1). Jego liczby „9 miejsc” zweryfikowałem grepem i odczytem.
- **Architekt** (A/B/C): sonda `checks` + krok 4, nie sonda hasha (D1); jeden kanał zgody (D6); składanie zakresu w CORE (D2).
- Pominąłem reviewerów dla pytań bez realnej niepewności (numeracja, bramki pre-commit — mechaniczne, sprawdzone w kodzie).

## Otwarte pytania (DO DYSKUSJI — odpowiedz w frontmatter `answer:`)

- **Q1** [TASTE, one-way]: Czy decyzje sprzeczne z kartą albo z fałszywą przesłanką dostają osobne, trwałe pola w pliku analizy, czy wystarczy zwykłe pytanie? Rekomendacja: osobne pola.
- **Q2** [USER_CHALLENGE, two-way]: Czy nowy wyjątek dopisany przez agenta zawsze czeka na Twoją zgodę? Rekomendacja: tak (zmiana względem v1).
- **Q3** [TASTE]: Czy reguła o `throw` obejmuje pliki pomocnicze obok handlera? Rekomendacja: nie teraz, najpierw pomiar długu.
- **Q4** [TASTE]: Czy paczka kilku zmian zatrzymuje start? Rekomendacja: tak, z `bundle_ack`.
- **Q5** [TASTE]: Czy blokada agenta od testów działa od razu? Rekomendacja: tak, tylko w projektach z blokiem DDD.
- **Q6** [TASTE]: Czy otworzyć osobne zadanie na reguły dla ręcznie uruchamianych agentów? Rekomendacja: tak.

## Decyzje (proponowane — zweryfikuj)

MECHANICAL, rozstrzygnięte bez pytania: **D1** (sonda `checks` + krok 4), **D2** (zakres składany w kodzie, baseSha), **D5** (wszystkie miejsca + test strażnik), **D10** (`behavior_change` zamiast szerokiego regexu; warunek: pomiar), **D11** (numeracja, archeologia, Claim). Pozostałe czekają na odpowiedzi: **D3**→Q2, **D4**→Q3, **D6**→Q1, **D7**→Q4, **D8**→Q5, **D9**→Q6. Szczegóły i uzasadnienia w frontmatterze.

### Proponowany podział na commity (krok 2, po approved)

1. `tools/conformance`: reguły ciała pliku, ratchet z `baseSha`, `exception-new`, luki importu, `--only/--skip` + evale. Reviewer: `ecc:code-reviewer`.
2. Hook `check-test-implementer-scope` + ustawienia DDD + evale + `hooks/README.md`. Reviewer: `ecc:code-reviewer`.
3. Konfiguracja: bloki ddd, schemat, fixture, karty, `pre-commit-guards`. Reviewer: `ecc:code-reviewer`.
4. Silnik, sonda (ORC-140): prepare + template (9 miejsc, test strażnik, zakres, nadpisanie werdyktu bramki końcowej) + krok 4. Reviewer: `ecc:silent-failure-hunter`.
5. Silnik, drobne ustalenia (ORC-141) i próg pakietu (ORC-142). Reviewer: `ecc:silent-failure-hunter`.
6. `/analyze` (ANL-049..051): komenda, szablon artefaktu, bramka pary w prepare + evale. Reviewer: `ecc:silent-failure-hunter`.
7. Dokumentacja: rule-history z Claimami, CHANGELOG, `METADATA.yml`, liczniki, README, `context-bill`.

Kroki i piny z punktu (c) trafiają do commitów 4–6 razem ze zmianą komend, nie do 7. Scalenie dopiero po Twoim sygnale; po nim reseed → `audit-projects` → `materialize-runtime` → `verify-project-setup`.

## Ryzyka / uwagi

- **Niezweryfikowane (nie traktować jako fakt):** (1) hipoteza z zadania, że ostrzeżenia z exit 0 nie dochodzą do modelu; (2) czy `SubagentStop` ustawia `stop_hook_active` tak jak `Stop`; (3) nadmiar siatki `behavior_change` — nie ma próbki raportów, stąd pomiar jako warunek D10; (4) dług `throw`/BullMQ w `application/commands/` marketing-hub i grant-flow; (5) pomiar pakietu pominął tekst tasków, więc sygnał „PRn” jest zaniżony i skalibrowany na przypadku, który ma łapać.
- **Częściowa ochrona:** kontrola widzi `throw` jako instrukcję `ThrowStatement`; `Promise.reject(...)` i `assert` przechodzą (poza zakresem reguły). Analiza statyczna nie wykryje błędu semantycznego u konsumentów zmienianego kodu — ten sam limit co w audycie.
- **Ryzyko pętli:** bez D2 czerwień z cudzych plików kończy warstwę ESCALATE; dlatego D2 jest warunkiem włączenia sondy, nie dodatkiem.
- **Koszt czasu przebiegu:** dwie karty (~14 KB) w każdym prompcie warstwy application u projektów na `ddd/layers`; wchodzi dopiero po materialize.
- **Koszt tej analizy:** 3 agenty panelu (~155 tys. tokenów łącznie), 0 zmian w kodzie produkcyjnym, 0 zmian w głównym drzewie.

---
> Po wypełnieniu odpowiedzi i zatwierdzeniu decyzji: ustaw `status: approved`,
> potem rozpocznij krok 2 w worktree `/opt/projects/_claude-patterns-guardrails`.
