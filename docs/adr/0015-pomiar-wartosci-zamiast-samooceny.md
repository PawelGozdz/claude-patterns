# ADR 0015 — Pomiar wartości zamiast samooceny: wynik ludzki, narzędzia i domknięta pętla reguł

**Status**: accepted (2026-10-22) jako kierunek; wdrożenie w [EP-OBSERVABILITY-002](../tasks/EP-OBSERVABILITY-002.md).
**Rozszerza**: [ADR 0012](0012-metryki-przebiegow-zdarzenia-v1.md) (schemat zdarzeń: nowe `kind`, nowe wartości
`process` i `cause`), [ADR 0011](0011-raportowanie-dryfu-i-telemetria-floty.md) (skrzynka dostaje status
po weryfikacji), [ADR 0004](0004-modular-eval-pyramid.md) (luka L2 zostaje nazwana i dostaje źródło korpusu).
**Context source**: przegląd telemetrii z 2026-10-22 na prośbę użytkownika. Cel użytkownika: claude-patterns ma
być centralnym miejscem w firmie, w którym powstają rozwiązania z użyciem AI, i ma wiedzieć, które skille,
hooki, komendy, agenci i wzorce działają, czy zamierzony rezultat został dowieziony i czy nic w procesie
nie zostało pominięte.

---

## Kontekst

Hydraulika z ADR 0011 i 0012 działa: 24 tys. zdarzeń v1 od lipca, skrzynka z 220 rekordami, rollupy
dzienne, eksport z białą listą, kontrola świeżości, cron. Od października `run.start` niesie hash silnika.
Przegląd danych z 2026-10-22 pokazał jednak, że mierzymy nie to, o co pytamy.

1. **Pomiar kończy się na werdykcie bramki.** GO i NO_GO to opinia weryfikatora, który jest częścią tego samego
   systemu. Nikt nie zapisuje, co człowiek zrobił z wynikiem w stanie „staged, not committed": zacommitował bez
   zmian, poprawił, odrzucił, cofnął po dwóch dniach. First-pass yield 86% mierzy więc zgodność z własnymi
   weryfikatorami. W październiku 46 ze 122 tasków `/orchestrate` miało więcej niż jeden przebieg, jeden
   task trzynaście; bramka końcowa odrzuciła 89 z 258 przebiegów (34%), ale nie wiadomo, które GO warstw
   były fałszywe.
2. **Mierzone są orkiestry, nie narzędzia.** Telemetria zna siedem procesów. Nie widzi wywołań skilli (203),
   komend poza `/analyze` i `/orchestrate` (34 z 36), agentów wołanych poza Workflow (panel przeglądu,
   `product-owner`, `reviewer-*`), blokad hooków (TASK-OBS-011) ani tego, które wzorce trafiają do promptów
   i czy ktoś je czyta.
3. **Pętla reguła → efekt nie jest domknięta.** 96 reguł ORC ma uzasadnienie z datą i kosztem, 85 rekordów
   skrzynki poszło do tasków. Nigdzie nie ma „czy pomogło", choć `deviation` ma sygnaturę, a `run.start`
   hash silnika. Rollupy od lipca commitowano pięć razy, bo poza `flow-top` i eksportem nic ich nie czyta.
4. **Klasyfikacja jest pusta.** W skrzynce 97 ze 106 kategorii to `other`, 112 z 220 wyzwalaczy to
   `agent_note`. Jedenaście promowanych rekordów trafiło do jednego taska o kartach wzorców z obcego stosu,
   a takiej kategorii nie ma. `/analyze` kończy 61 z 62 przebiegów wynikiem `halted`, bo zaplanowane PAUSE
   i awaria mają ten sam wynik.
5. **Koszt jest mierzony, wartość nie.** Październik do 22. to ok. 1,7 tys. USD w krokach z kosztem, 18% na
   powtórki. Nie ma metryki „koszt do pierwszego GO per task" ani „koszt na dowieziony task", bo jednostką
   agregatu jest przebieg, a `taskRef` celowo nie wchodzi do rollupu.

## Decyzja

### D1. Wynik ludzki jest zdarzeniem pierwszej klasy

Nowe `kind: outcome.human` (`process` przebiegu, którego dotyczy). Powstaje, gdy człowiek zamyka pracę
agenta: commit w projekcie po przebiegu `/orchestrate`, zatwierdzenie lub odrzucenie analizy, revert.
Zdarzenie niesie wyłącznie liczby i wartości z listy zamkniętej:

- `decision`: `committed_as_is | committed_modified | rejected | reverted`;
- `survival`: liczba plików staged przez agenta i liczba plików, których treść dotarła do commita bez zmian
  (odcisk per plik zapisany lokalnie w `telemetry/sessions/staged/<runId>.json` na koniec przebiegu; w
  zdarzeniu tylko liczniki, bez ścieżek i bez diffu);
- `latencyMs`: czas od `run.end` do decyzji.

Powiązanie commit → przebieg: ostatni `run.end` tego projektu z tym samym `taskRef`, a gdy taska nie da się
odczytać z gałęzi ani z artefaktu analizy, ostatni `run.end` projektu z ostatnich 48 h. Przebieg bez
dopasowania nie dostaje zdarzenia; brak dopasowania jest liczony osobno jako luka pomiaru. Revert w ciągu
7 dni wykrywa codzienny audyt floty (krok per projekt), nie hook.

### D2. Poprawność werdyktów liczona z danych, które już są

Fałszywy GO = werdykt `go` warstwy, po którym bramka końcowa tego samego przebiegu dała `no_go` z naruszeniem
w jednostce tej warstwy. Fałszywy NO_GO = `no_go`, po którym krok naprawczy nic nie zmienił, a kolejny werdykt
to `go` bez `fixes`. Oba liczniki wchodzą do rollupu per rola i per agent weryfikujący. Źródłem prawdy jest
bramka końcowa, a po wdrożeniu D1 wynik ludzki; LLM jako sędzia werdyktów jest odrzucony (ADR 0004).

### D3. Jednostką wartości jest task, nie przebieg

Rollup dostaje blok `tasks` liczony z `taskRef`: liczba przebiegów, koszt do pierwszego GO bramki końcowej,
koszt całkowity, czas od pierwszego `run.start` `/analyze` do `outcome.human`. Blok jest **lokalny**: eksport
(`telemetry-export`) wysyła z niego wyłącznie rozkłady (percentyle, histogram liczby przebiegów), nigdy
identyfikatorów. `findLeaks` pilnuje tego jak dotąd.

### D4. Narzędzia są mierzone tak samo jak procesy

- Nowa wartość `process: tool`. Jeden generyczny emiter: PreToolUse/PostToolUse na `Skill` i na `Agent`
  wołany poza otwartym przebiegiem zapisuje `step.end` ze `step.role` = nazwa skilla lub typ agenta,
  wynikiem, czasem i kosztem z transkryptu (ta sama funkcja, co `telemetry-agent-stop`). Treść promptu,
  argumenty skilla i ścieżki nie są zapisywane.
- Każda komenda deklaruje plan. Frontmatter komendy wymienia kroki (`telemetry.plan`), komenda emituje
  `run-start` z tym planem i `run-end`, a `closeRun` dopisuje `skipped` dla kroków bez śladu. „Czy czegoś nie
  pominięto" staje się tą samą metryką dla `/security-review`, `/pulse` i `/orchestrate`. Wzorzec jest już
  w `/analyze` (ANL-041); tu zostaje uogólniony, a walidator komend sprawdza obecność planu.
- Blokady hooków wchodzą wg TASK-OBS-011 bez zmian.
- Użycie wzorców (który wzorzec trafił do promptu, czy agent go przeczytał) zostaje nazwane jako luka, ale
  nie wchodzi do tego ADR: emiter leży w `knowledge-retriever` (osobne repo) i wymaga tamtejszej decyzji.

### D5. Taksonomia odpowiada temu, co się powtarza

- `cause` dostaje wartości `pattern_card` (karta nie rozstrzyga albo pochodzi z obcego stosu), `plan`
  (`layers_scope`/`dirs` niespójne z zadaniem), `budget` już jest. `defaultCategory` mapuje nowe wyzwalacze.
- `report-deviation --trigger agent_note` bez `--category` kończy się błędem użycia. Agent zgłaszający musi
  sklasyfikować; `other` zostaje dozwolone, ale jego udział jest raportowany co tydzień jako metryka jakości
  danych (ADR 0012 już to zapowiada; teraz ma to być widoczne).
- `/analyze` z `analyze.exit: PAUSE` kończy przebieg wynikiem `ok` i `cause: null`; `halted` zostaje dla
  przerwań. Rozróżnienie żyje w `commands/analyze.md`, bez zmiany schematu.

### D6. Reguła deklaruje metrykę, raport ją sprawdza

- Wpis w `docs/decisions/orchestrate-rule-history.md` i rekord skrzynki ze statusem `promoted` dostają pole
  `claim`: nazwa licznika albo sygnatura `deviation`, kierunek, próg, hash silnika wdrożenia.
- Nowy `scripts/telemetry-report.mjs` czyta wyłącznie rollupy: per silnik, proces, rola, projekt, tydzień do
  tygodnia, oraz dla każdego `claim` porównuje okno przed i po hashu. Wynik: `confirmed | no_effect |
  regressed | insufficient_data`. Rekord skrzynki z `confirmed` przechodzi w `resolved`; `regressed` otwiera
  go ponownie tym samym mechanizmem, co dziś reopen.
- Raport jest tygodniowy (cron po agregacie w poniedziałek) i zapisuje `telemetry/reports/<tydzień>.md` w
  gicie, żeby ktoś go czytał. Rollupy commituje ten sam krok.

## Odrzucone

- **Jeden task na całość.** Zmiana schematu, rollupu, komend i hooków ma różne evale i różne bramki; hooki są
  zamrożone do scalenia TASK-ENGINE-GUARDRAILS-001, więc jeden task stałby w całości. Podział idzie po
  zestawie plików, nie po pomyśle (szczegóły w epiku).
- **LLM-sędzia dla poprawności werdyktów.** Niedeterministyczny i drogi; jako bramka bezużyteczny (ADR 0004).
  Prawdę daje bramka końcowa, a potem człowiek.
- **OTEL/Grafana lub serwer przed raportem.** Dziś jest jeden host i nikt nie czyta rollupów. Najpierw raport
  nad istniejącymi plikami; odbiorca danych (TASK-OBS-009) ma sens przy drugiej maszynie.
- **Zapis przepuszczeń hooków i każdego wywołania narzędzia Read/Grep.** Wolumen tysięcy zdarzeń dziennie bez
  pytania, na które odpowiadają. Mierzymy skille, agentów, komendy i blokady; nie każdy tool call.
- **Diff w zdarzeniu `outcome.human`.** Treść zmian to dane projektu. Zostają liczniki przetrwania per plik,
  liczone lokalnie z odcisków.

## Konsekwencje

- Metryki jakości (first-pass, fałszywe GO) dostają mianownik spoza systemu: decyzję człowieka. Dopiero
  wtedy „86%" coś znaczy.
- Rośnie zakres schematu v1 (nowy `kind`, dwie wartości `process`, dwie wartości `cause`); wszystkie pola
  nowe są opcjonalne, więc `v: 1` zostaje. Każda zmiana listy to aneks w ADR 0012.
- Skrzynka dostaje trzeci stan cyklu życia (`resolved` po weryfikacji metryką), a reguły ORC obowiązek
  deklaracji, co mają poprawić. Reguła bez `claim` jest dozwolona, ale raport ją wymienia.
- Hooki: dwa nowe emitery (commit, narzędzia) czekają na odmrożenie; reszta decyzji (D2, D3, D5, D6) nie
  dotyka `hooks/` i może iść od razu.
- Prywatność bez zmian: nowe zdarzenia niosą liczniki i wartości z list zamkniętych; blok `tasks` nie
  opuszcza maszyny inaczej niż jako rozkład.
