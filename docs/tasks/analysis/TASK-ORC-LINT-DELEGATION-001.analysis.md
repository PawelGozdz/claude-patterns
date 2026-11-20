---
task: TASK-ORC-LINT-DELEGATION-001
telemetry_run: null
status: approved               # Q1–Q6 rozstrzygnięte 2026-11-19 (Q1–Q4 i Q6 użytkownik, Q5 juz-ide-api)
threat_model: null              # narzędzie lokalne; jedyne ryzyko danych to ścieżki w komendzie sondy (ten sam filtr co conformance)

open_questions:
  - id: Q1
    ask: >-
      Od czego zaczynamy zawężanie: od weryfikatora warstwy czy od bramki końcowej? Proponuję warstwę, bo kosztuje
      najwięcej, a bramka końcowa przez ten czas sprawdza wszystko jak dziś i pokaże, czy lint coś przepuścił.
    q: "kolejność wdrożenia E2: najpierw delegacja tylko w weryfikatorze warstwy (bramka = grupa kontrolna z pełnym zakresem), bramka dopiero po progu przecieku; czy obie naraz"
    class: TASTE
    door_type: two-way
    decision: D4
    options: ["Najpierw warstwa, bramka później po pomiarze (recommended)", "Obie naraz", "Tylko bramka"]
    answer: "Najpierw warstwa, bramka później po pomiarze"
  - id: Q2
    ask: >-
      Gdzie w project.yml ma stać lista reguł: w ustawieniach nowego bloku (tak jak dziś komenda dla file-check),
      czy w osobnej sekcji `verification:`, jak w briefie?
    q: "miejsce konfiguracji: project.block_params.lint-delegation.{script, delegated_rules, holdout} (konwencja ADR 0008, wzór file-check) vs nowy klucz najwyższego poziomu verification.delegated_to_lint"
    class: TASTE
    door_type: one-way
    decision: D2
    options: ["Ustawienia bloku, jak file-check (recommended)", "Osobna sekcja verification:"]
    answer: "Ustawienia bloku, jak file-check"
  - id: Q3
    ask: >-
      Czy co dziesiąty krok (losowany, ale powtarzalny) ma iść bez delegowania, z pełnym zakresem? Bez tego nie
      zmierzymy, ile naprawdę oszczędzamy, bo nie będzie z czym porównać.
    q: "holdout: deterministyczne ~10% kroków bez delegacji jako grupa kontrolna do pomiaru tokenów i przecieku; 0% = brak pomiaru różnicowego"
    class: USER_CHALLENGE
    door_type: two-way
    decision: D5
    options: ["Tak, 10% (recommended)", "Tak, inny odsetek", "Nie, porównanie tylko z okresem sprzed zmiany"]
    answer: "Tak, inny odsetek: 20%"
  - id: Q4
    ask: >-
      Czy weryfikator może nadal zgłosić złamanie reguły oddanej linterowi, jeśli je zauważy? Proponuję tak, z osobnym
      znacznikiem: wtedy wiemy, że lint czegoś nie złapał, a weryfikator nie traci głosu.
    q: "delegowana reguła widziana przez weryfikatora: dozwolone zgłoszenie z flagą lint_miss (liczone osobno, blokuje jak dziś) vs całkowity zakaz zgłaszania"
    class: USER_CHALLENGE
    door_type: two-way
    decision: D6
    options: ["Tak, z osobnym znacznikiem i normalną blokadą (recommended)", "Nie, reguła delegowana jest poza zakresem weryfikatora"]
    answer: "Tak, z osobnym znacznikiem i normalną blokadą"
  - id: Q5
    ask: >-
      Skrypt ratchet w juz-ide-api: czy przyjmie listę plików jako argumenty i porównanie względem podanego commita
      (nie tylko HEAD), i czy kończy się kodem innym niż 0 tylko przy nowych naruszeniach reguł na poziomie `error`?
    q: "kontrakt CLI dla E1: <script> --files <f...> [--base <sha>]; exit≠0 tylko przy wzroście trafień reguł error; format linii wyjścia (do dosłownego raportu dla implementera)"
    class: FACT
    door_type: two-way
    decision: D1
    options: ["Tak, tak jak opisano", "Inaczej (opisz)"]
    answer: "Częściowo (ask-project juz-ide-api-develop, 2026-11-19): `--base <ref>` i `--files a b` (jedna flaga, ścieżki po spacji, opcje PRZED --files) są; exit 0/1/2 = brak regresji/regresja/błąd narzędzia; ALE regresja liczy wzrost trafień KAŻDEJ reguły z ruleId, także warn (8 reguł warn); pusta lista albo same pliki spoza src/ i test/ = 0 plików i exit 0; tekst: `plik  juz/reguła  przed → po  (linie: N)`, `--json` bez linii; 15 plików ok. 0,5 s"
  - id: Q6
    ask: >-
      Skrypt ratchet w juz-ide-api blokuje też wtedy, gdy przybywa trafień reguł ustawionych tylko na ostrzeżenie (8 reguł).
      Jeśli włączymy go w /orchestrate jako twardą kontrolę, warstwa wróci do poprawki także z ich powodu. Czy tak ma być?
    q: "E1 w juz-ide-api: lint:ddd:ratchet liczy wzrost trafień warn jak error (ratchet-core countByRule bez severity); blokujące pole projectLint cofnie warstwę także za warn. Opcje: akceptacja, flaga --severity error po stronie juz-ide-api, przejście reguł warn na error"
    class: USER_CHALLENGE
    door_type: two-way
    decision: D1
    options: ["Tak, wzrost warn też blokuje (ratchet łapie tylko nowe trafienia) (recommended)", "Nie, juz-ide-api dodaje flagę liczącą tylko error", "Nie, juz-ide-api przestawia te reguły na error"]
    answer: "Tak, wzrost warn też blokuje (ratchet łapie tylko nowe trafienia)"
---

# Analiza: TASK-ORC-LINT-DELEGATION-001

Źródło: brief @founder (juz-ide-api) z 2026-11-19. Wszystko poniżej sprawdzone w claude-patterns na `develop` (efe2639).
Brief opisuje stan z perspektywy juz-ide-api, więc tam, gdzie repo mówi coś innego, piszę to wprost.

## Synteza (tech-lead)

### Co brief zakłada, a co jest w repo

1. **„Wzór: conformance”.** Pasuje do sposobu rozwijania komendy, ale nie do źródła. `conformance` to narzędzie
   claude-patterns (`tools/conformance/check.mjs`), którego argumenty znamy. `lint:ddd:ratchet` to skrypt juz-ide-api.
   Mechanizm nie może znać nazwy `lint:ddd`, bo `ddd/layers` mają też iam, grant-flow i marketing-hub. Wniosek: id
   generyczne (`lint-ratchet`), nazwa skryptu z parametru bloku, kontrakt argumentów do potwierdzenia (Q5).
2. **Dopisanie skryptu do `checks:` już dziś.** Projekt może wpisać skrypt przez `layer_contributions` lokalnego bloku,
   ale (a) `layer_contributions` nie sięga `final_gate` (`materialize-runtime.mjs`, pętla tylko po `layers`),
   (b) goły skrypt z „lint” w nazwie trafia w pole `lint` sondy, a to pole ma historię (TASK-ORCH-LINT-BASELINE-001),
   (c) skrypt bez zakresu sprawdza całe repo albo nic, bo pliki zmiany i SHA startu zna dopiero template. Potrzebne jest
   wbudowane id jak `conformance`.
3. **Krok 3 i format `karta#ID`.** `normalizeRuleId` przepuszcza tylko `[a-z0-9][a-z0-9_.:-]{0,63}`. `#` w ID zamieni
   dziś każde ustalenie w `new` i pomiar zniknie bez śladu. Rozwiązanie: prompt prosi o `karta#ID` (czytelne dla ludzi
   i zgodne z briefem), normalizacja zamienia `#` na `:`. Slug karty = nazwa pliku bez `-pattern_summary.md`/`_summary.md`
   (np. `command-handler:n1`), mieści się w 64 znakach.
4. **Zakres weryfikatorów.** Delegacja nie dotyczy agenta, tylko promptu przebiegu (`buildVerifierPrompt`,
   `buildFinalGatePrompt`), tak jak `FINDINGS_FIELD`. Działa więc dla każdego weryfikatora w slocie, także lokalnych
   kopii (`aig-code-verifier`), i nie zmienia stałego kontekstu agentów (`context-bill`).

### Kolejność wdrożenia (propozycja do Q1)

| Etap | Co | Ryzyko dla jakości | Kiedy dalej |
|---|---|---|---|
| E1 | `lint-ratchet` w `checks:` warstw i bramki, blokujący | brak, tylko dodaje kontrolę | od razu po merge, gdy Q5 potwierdzone |
| E3 | ID z kartą w `findings` | brak, `decideVerdict` nie czyta `findings` | razem z E1; bez tego nie ma pomiaru E2 |
| E2a | delegacja w weryfikatorze warstwy, bramka z pełnym zakresem, holdout 20% | niskie: bramka nadal widzi całość | po ok. 2 tygodniach danych z E1+E3 |
| E2b | delegacja także w bramce | średnie: znika ostatnia pełna kontrola reguł delegowanych | gdy przeciek z E2a poniżej progu (niżej) |

E3 idzie przed E2 celowo: bez ID z kartą nie da się powiedzieć, czy bramka znalazła złamanie reguły oddanej linterowi,
czyli nie da się zmierzyć przecieku.

### Jak mierzyć oszczędność

Dwie liczby, obie z telemetrii, bez danych z `~/.claude/metrics`:

1. **Koszt kroku**: tokeny i wywołania narzędzi w krokach weryfikatora, `delegation: on` wobec `holdout` w tym samym
   okresie (Q3). Porównanie z okresem sprzed zmiany jest słabsze, bo zmieniają się zadania i prompty.
2. **Przeciek**: odsetek NO_GO bramki z `ruleHits` na regule delegowanej w warstwie (E2a) oraz liczba zgłoszeń `lint_miss`
   (Q4). Reguła z przeciekiem wraca na listę agenta; to decyzja projektu (zmiana `delegated_rules`).

Uczciwe zastrzeżenie: koszt weryfikatora to głównie kontekst czytany w każdej turze (pamięć repo: 91% rachunku to cache).
Krótsza lista reguł skraca liczbę tur tylko wtedy, gdy weryfikator przestaje otwierać pliki pod te reguły. Karty nadal są
w prompcie. Próg ≥30% z ADR-0144 może więc nie zostać osiągnięty samą listą. Kolejna dźwignia to pominięcie w prompcie
weryfikatora całej karty, której wszystkie reguły są delegowane; to osobny krok, dopiero po pomiarze E2a.

### Jak nie stracić kontroli osądu

- Karty zostają w prompcie implementera i weryfikatora; zmienia się tylko instrukcja, co weryfikator ocenia.
- Delegacja działa wyłącznie w kroku, w którym kontrola lintu naprawdę się wykonała. `skipped`, brak pola albo błąd
  narzędzia = pełny zakres (`delegation: fallback`), nigdy cichy GO.
- Weryfikator może zgłosić złamanie delegowanej reguły (Q4); takie zgłoszenie blokuje jak dziś i jest liczone osobno.
- Holdout (Q3) utrzymuje stały strumień kroków z pełnym zakresem, więc spadek jakości widać w danych, a nie po fakcie.
- Lista reguł należy do projektu. Prepare odrzuca (z ostrzeżeniem) regułę, której nie ma w żadnej wczytanej karcie,
  żeby literówka nie udawała delegacji. Warunki (a)–(c) z briefu (`error` + ratchet, wpis w tabeli pokrycia, dane)
  sprawdza projekt; claude-patterns ich nie widzi i nie udaje, że sprawdza.
- Reguły wymagające osądu (np. CH6 „czysta orkiestracja”, N2 „logika domenowa w handlerze”) nie mają postaci, którą lint
  rozstrzygnie; prompt i tak każe je oceniać, bo nie ma ich na liście.

### Panel advisory

Nie uruchamiany: zmiana jest w silniku `/orchestrate` (prompt, sonda, telemetria), bez nowej domeny i bez PII.
Bezpieczeństwo: komenda sondy dostaje ścieżki z analizy, więc przechodzą ten sam filtr co `conformance` (`conformancePathOk`)
i nazwa skryptu ten sam filtr co `shadow:` (bez spacji i znaków powłoki).

## Otwarte pytania (DO DYSKUSJI, odpowiedz w frontmatter `answer:`)

Q1–Q5 rozstrzygnięte (frontmatter). Q6: wzrost trafień reguł `warn` też blokuje (przyjęte).

## Decyzje (proponowane, zweryfikuj)

- **D1. Wbudowane id `lint-ratchet` w `checks:`.** Template rozwija je do `pnpm -s <script> --files <pliki zmiany warstwy>`
  (+ `--base <baseSha>`, jeśli skrypt to obsługuje, Q5). Pliki: zmiana w zakresie `effectiveDirs(layer)` bez `dirtyAtStart`;
  w bramce cała zmiana przebiegu. Pole sondy `projectLint` (nie `lint`), dosłowny raport do implementera jak `conformanceReport`.
  `probeIsRed` liczy `projectLint`. Brak skryptu w `package.json` = `skipped`.
  Kontrakt potwierdzony (Q5): `pnpm -s <script> --base <baseSha> --files <f...>` (opcje przed `--files`). Pusta lista
  i same pliki spoza zakresu skryptu dają u nich exit 0 przy 0 plików, więc template nie woła skryptu z pustą listą
  (`skipped`), a sonda zwraca `skipped`, gdy nagłówek mówi `0 plik(ów)`. Inaczej delegacja ruszyłaby na pustej kontroli.
  Exit 2 = `skipped` z powodem (błąd narzędzia), nie `fail`. Raport do implementera: tekst (ma numery linii), nie `--json`.
- **D2. Konfiguracja w nowym bloku `lint-delegation`** (`axis: process`, wzór `file-check`): parametry `script`,
  `delegated_rules` (`<karta>#<ID>`), `holdout` (0–0.5, domyślnie 0.2, Q3), `layers` (tagi warstw, domyślnie wszystkie).
  Materializacja dopisuje `lint-ratchet` do `checks:` dopasowanych warstw i `final_gate` oraz sekcję `verification:`
  w `runtime.yml` (widoczną dla człowieka). Wymaga rozszerzenia `layer_contributions` o `final_gate: true` albo osobnego
  kroku materializacji; wybór przy implementacji, oba dają ten sam `runtime.yml`. Brak bloku w `stack_blocks` = zero zmian.
- **D3. Format ID.** `FINDINGS_FIELD`: `ruleId` = `<karta>#<ID>` (karta = slug z nagłówka `--- <ścieżka> (karta reguł) ---`).
  `normalizeRuleId`: `#` → `:`, obcięcie `-pattern_summary`/`_summary`, reszta jak dziś. Goły `N1` przechodzi jak dziś.
  Rollup dostaje licznik `qualified` obok `hits`, żeby było widać, ile zgłoszeń ma kartę.
- **D4. Kolejność:** E1+E3 → E2a (warstwa) → E2b (bramka) według progu (Q1). Proponowany próg dla E2b: co najmniej 30 bramek
  po E2a i przeciek (NO_GO bramki na regule delegowanej w warstwie) nie wyższy niż w grupie holdout.
- **D5. Holdout** deterministyczny (20%, Q3): hash(`runId` + id warstwy) mod 100 < holdout×100. Bramka w E2b: hash(`runId`).
- **D6. `lint_miss`:** pole `findings[].lintMiss: true` dla reguły z listy; telemetria liczy je osobno. Nie zmienia
  `decideVerdict`.
- **D7. Telemetria:** `step.delegation` (`on|holdout|fallback|off`), `step.delegatedRules` (liczba), `step.lintMisses`
  (liczba) dla `verifier`/`gate`; `step.checks.projectLint` dla `probe`. Addytywne, `v: 1`, aneks ADR 0012. Lista ID reguł
  delegowanych nie trafia do zdarzenia, bo jest w `runtime.yml`; czy zdarzenie ma nieść hash konfiguracji, do sprawdzenia
  przy implementacji.

### Proponowany podział na commity (po approved)

1. `feat(telemetry)`: `normalizeRuleId` z `#`→`:` i slugiem karty, licznik `qualified`, testy (E3, część danych).
2. `feat(orchestrate)`: `FINDINGS_FIELD` z `<karta>#<ID>`, snapshot promptów (E3).
3. `feat(orchestrate)`: wbudowane `lint-ratchet`, pole `projectLint`, raport do implementera (E1).
4. `feat(blocks)`: blok `lint-delegation`, materializacja do `checks:`, `final_gate` i `verification:` (E1/E2).
5. `feat(orchestrate)`: delegacja w prompcie weryfikatora warstwy, fallback, holdout, `lint_miss`, telemetria (E2a).
6. `feat(orchestrate)`: włączenie delegacji w bramce za parametrem (E2b, domyślnie wyłączone także dla projektów z blokiem).

## Ryzyka / uwagi

- **Inni użytkownicy tych samych weryfikatorów.** `code-quality-verifier`: juz-ide-api-* i iam. `security-e2e-verifier`:
  juz-ide-api-*, iam, grant-flow, marketing-hub. E1/E2 nic dla nich nie zmieniają bez bloku (kryterium: pusty diff
  `runtime.yml` po rematerializacji i snapshot promptów). E3 zmienia prompt **wszystkich** projektów (wspólny `FINDINGS_FIELD`),
  także z innymi weryfikatorami (flutter, python, aig, bot). Werdykt się nie zmienia (`decideVerdict` nie czyta `findings`),
  zmienia się postać ID w telemetrii.
- **Ciągłość szeregów w telemetrii.** Po E3 te same naruszenia mają inne klucze (`n1` → `command-handler:n1`). Rollup `rules.hits`
  ma przerwę; `ruleSignature` (wyłącznik pętli z TASK-ORC-GATE-COST-001 E1) nie uzna runu sprzed i po zmianie za powtórkę.
  Skutek: najwyżej jedna przepuszczona powtórka na zadanie w dniu wdrożenia. Odnotować w CHANGELOG i rule-history.
- **Czytniki po stronie juz-ide-api.** `join-shadow-verifier.mjs` i `LINT_COVERAGE` czytają dziś gołe ID; nowy format
  wymaga zmiany u nich. Stary format nadal pojawia się w archiwum, więc oba muszą być czytane.
- **Czas sondy.** Pełny `lint:ddd` ok. 60 s, plik ok. 0,4 s. Kontrola musi dostać listę plików; bez niej (np. pusta lista)
  ma zwracać `skipped`, a nie odpalać pełnego lintu.
- **Lint pokazany implementerowi dwa razy.** Hook `file-check` już daje ratchet po zapisie. Kontrola w sondzie jest twarda
  i obejmuje pliki, których hook nie widział (OBS-019: nie potwierdzono, że hook odpala się dla implementerów `/orchestrate`).
- **Reguła na `warn`.** Ratchet z `exit 0` przy ostrzeżeniach nic nie blokuje. Delegowana reguła na `warn` = reguła, której
  nikt nie sprawdza. Claude-patterns tego nie wykryje; to warunek (a) po stronie projektu. Można to zabezpieczyć później
  plikiem pokrycia (`coverage_file`) czytanym przez prepare; poza zakresem v1.
- **Sonda to model, nie kod.** Raport musi przejść dosłownie (jak `conformanceReport`, ORC-137), inaczej implementer dostanie
  parafrazę. Delegacja zależy od pola `projectLint` zwróconego przez sondę; brak pola = `fallback`.
- **Zmiana silnika a konfiguracja projektów.** Po merge: `audit-projects` → `materialize-runtime` → `verify-project-setup`
  na wszystkich projektach w tej samej turze (wynik powinien być pusty). Włączenie w juz-ide-api to ich commit w `project.yml`.
