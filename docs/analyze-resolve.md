# `/analyze` — kroki 1.b, 3.b, 3.c: pytania z rekomendacją

Procedura czytana przez `/analyze` WYŁĄCZNIE wtedy, gdy `runtime.yml` ma `analyze.resolve` i po panelu zostały
pytania spoza `MECHANICAL` (`commands/analyze.md`, „Kroki 1.b, 3.b, 3.c"). Trzymana poza komendą, bo komenda
płaci za każdy swój bajt przy każdym wywołaniu (`scripts/context-bill.mjs`). Uzasadnienia: [ADR 0016](adr/0016-rozstrzyganie-otwartych-pytan-w-analyze.md)
i [wpisy ANL-054..059](decisions/orchestrate-rule-history.md#anl-054). Skrypty: `scripts/verify-answer-sources.mjs`,
`scripts/resolve-finalize.mjs`.

**Telemetria (ANL-059).** Gdy krok 1.b wchodzi, dopisz do `--plan` z kroku 0.c pozycję `resolve:resolve:resolve`; po kroku zamknij go
`telemetry-emit step --step-id resolve --group resolve --role resolve --outcome ok --tool-calls <n> [--cost-usd <x>]`.
Opis wywołania Explore/haiku zaczyna się od `[slot:resolve]` (ANL-041). Uzasadnienia reguł: `decisions/orchestrate-rule-history.md`, ANL-054..059.

## Krok 1.b — otwarte pytania z rekomendacją (ANL-054, ANL-055, ANL-056)

Wchodzi tylko, gdy `runtime.yml` ma `analyze.resolve` (blok `decision-registry`) i po panelu zostały pytania, których nie
rozstrzyga ANL-047 (`MECHANICAL`). Bez `analyze.resolve` przebieg jest taki jak przed tą zmianą. Decyzję podejmuje
człowiek: ten krok tylko przygotowuje pytanie tak, żeby dało się na nie odpowiedzieć jednym słowem.

1. Weź pytania w kolejności partii (ANL-057), nie więcej niż `analyze.resolve.max_questions`; reszta idzie dalej bez rekomendacji (`basis: none`, ANL-051).
2. Jedno wywołanie Explore/haiku na WSZYSTKIE pytania (ANL-019: zwraca cytaty z namiarami, nie pliki), korpus wg `lookup_order`,
   indeksu decyzji, `governance.canon` (stan z kroku 0.d), KANON i `BUSINESS_RULES`. Wynik: kandydaci `{source: "plik:linia", quote}`.
3. Ty wybierasz podstawę: `canon` (dokument odpowiada wprost), `precedent` (analogiczna decyzja BDR/ADR/KANON/BUSINESS_RULES),
   `new-pattern` (brak precedensu), `none` (bez rekomendacji; `q` mówi czemu). Cytaty trafiają do `evidence: [{kind: answer|precedent, source, quote}]`.
4. `node <claude-patterns>/scripts/verify-answer-sources.mjs <artefakt>`: exit 2 = zły cytat albo format. Usuń cytat, którego nie ma w pliku,
   i obniż `basis` do `new-pattern`/`none`; nigdy nie dopisuj cytatu z pamięci.
5. Format `file`: pytanie produktowe/prawne albo `one-way` bez zweryfikowanego źródła dostaje plik pytania w `questions_dir`
   (kształt wg `README.md` tego katalogu; `decyduje`, `domyslnie`), a jego id idzie do `question_file`. Zapis po `check-write` (ANL-058).

## Krok 3.b i 3.c — odpowiedź człowieka i utrwalenie (ANL-057, ANL-058)

**3.b Podsumowanie (po zapisie artefaktu).** `verify-answer-sources.mjs <artefakt>` zwraca `batch` (najwyżej `batch_size` pytań,
numerowanych od 1) i `remaining`. Pokaż każde pytanie jako dwie linie, dosłownie z pól `ask` i `rec`, bez komentarza (ANL-040):

```
1. <ask>
   <rec>
```

Pod listą jedna linia: „Odpowiedz zbiorczo: „ok wszystkie" (tylko pytania ze źródłem i dwudrzwiowe), „ok poza 3 i 5", „2: <odpowiedź>"
albo „ok 4" (jawna zgoda na wskazane pytanie)". Gdy `remaining` > 0: „Zostało N pytań, pokażę je po tych".

**3.c Odpowiedź.** Człowiek odpowiada w tej samej sesji albo po czasie przez `/analyze <TASK-ID> --resume` (pomija kroki 0.b–2: żadnego
panelu; wymaga artefaktu ze `status: awaiting-human`). `verify-answer-sources.mjs <artefakt> --reply "<słowa człowieka>"` mówi, które
`answer:` zapisać; zapisujesz dokładnie tekst opcji z `reply.answers[]` (nie „ok"). `reply.hold` i `reply.unparsed` pokaż człowiekowi i dopytaj;
nie zgaduj. `status:` zmieniasz na `approved` tylko na wprost polecenie człowieka („zatwierdzam"): ANL-034 działa jak dotąd.
Po zapisie odpowiedzi pokaż następną partię, jeśli `remaining` > 0, a potem utrwal decyzje (ANL-058).

## Pełna treść reguł ANL-054..059

Rejestr w komendzie ma tylko nakazy; tu jest ich pełna treść (kolumny jak w rejestrze: ID, trigger, wymagana akcja, mechanizm, ref).

| ID | trigger | wymagana akcja | mechanizm | ref |
|---|---|---|---|---|
| ANL-054 | krok 1.b: `runtime.yml` ma `analyze.resolve`, po panelu zostało pytanie bez rozstrzygnięcia z ANL-047 | szukaj źródła odpowiedzi i PRECEDENSÓW (analogiczne BDR/ADR, KANON, BUSINESS_RULES) w dokumentach wg `lookup_order`, indeksu decyzji i `governance.canon`; zapisz `basis: canon\|precedent\|new-pattern\|none` i `evidence: [{kind, source: "plik:linia", quote: "dosłowny cytat z tej linii"}]`; jedno wywołanie Explore/haiku na wszystkie pytania; cytatu bez pliku, linii i dosłownego tekstu nie wpisuj, brak źródła = `new-pattern`/`none`; ANL-049 (przesłanki o kodzie) obowiązuje bez zmian | `scripts/verify-answer-sources.mjs` (exit 2: plik nie istnieje, linia poza plikiem, cytatu nie ma w linii, plik poza źródłami projektu albo `.env*`, `precedent`/`canon` bez zweryfikowanego cytatu) | [ANL-054](docs/decisions/orchestrate-rule-history.md#anl-054) |
| ANL-055 | pytanie z rekomendacją trafia do `open_questions[]` | `ask` = JEDNO proste pytanie (jedno zdanie, „?", język biznesowy, bez żargonu); `rec` = „Rekomendacja: … (zgodne z BDR-xx / KANON §y)" albo „Rekomendacja: … (nowy wzorzec, oparty o …)" — „nowy wzorzec" mówisz uczciwie, gdy brak zweryfikowanego precedensu; `ask` + `rec` razem najwyżej 2 zdania; `options` w jednej linii z DOKŁADNIE jedną „(recommended)"; numer BDR/ADR tylko w `rec`; kontekst techniczny w `q` | hook `check-human-voice` (`rec`: prefiks, 2 zdania łącznie, brak plików/klas/żargonu) + `verify-answer-sources.mjs` (exit 2) | [ANL-055](docs/decisions/orchestrate-rule-history.md#anl-055) |
| ANL-056 | każde pytanie w kroku 1.b | DECYZJĘ PODEJMUJE CZŁOWIEK: nic nie dostaje `answer` bez jego słów, rekomendacja jest propozycją, `answered_by: auto` nie istnieje. `USER_CHALLENGE`, `one-way` (brak `door_type` = one-way) i `new-pattern` mogą mieć rekomendację, ale nigdy nie idą hurtem; flagi `premise_failed`/`card_conflict` zachowują zamek `prepare` (ANL-049/050). Produkt/prawo/`one-way` bez zweryfikowanego źródła nie dostaje zgadniętej wartości (w `rec` kierunek, nie liczba), a w formacie `file` ma plik pytania (`question_file`). Limit `max_questions` albo budżet `resolve` wyczerpany → ANL-051: reszta idzie do człowieka bez rekomendacji. `questions_format: none` albo brak `analyze.resolve` → flow sprzed zmiany | `verify-answer-sources.mjs` (brak `domain`, produkt/prawo bez źródła i bez `question_file`: exit 2; hurtowość tylko dla pytań `bulkEligible`) + `orchestrate-prepare.mjs` (`answer: null`, ANL-034) | [ANL-056](docs/decisions/orchestrate-rule-history.md#anl-056) |
| ANL-057 | krok 3.b/3.c: artefakt ma pytania bez odpowiedzi | pokaż najwyżej `batch_size` (domyślnie 5) pytań, każde jako dwie linie `ask`/`rec` bez komentarza; kolejność: `USER_CHALLENGE` i `one-way`, potem reszta, w grupie wg `blocks_sp`. Odpowiedź „ok wszystkie"/„ok poza 3 i 5" obejmuje tylko pytania `bulkEligible`, „ok 2 4" i „2: odpowiedź" to jawne odpowiedzi. Zapisuj `answer:` WYŁĄCZNIE z `reply.answers[]` skryptu (tekst opcji, nie „ok"); `hold`/`unparsed` wracają do człowieka. Wznowienie: ta sama sesja albo `--resume` (bez panelu, `status: awaiting-human`). `status: approved` tylko na wprost polecenie człowieka; ANL-034 bez zmian | `verify-answer-sources.mjs --reply` (parser odpowiedzi, `bulkEligible`) + `orchestrate-prepare.mjs` (`status`, `answer: null`) | [ANL-057](docs/decisions/orchestrate-rule-history.md#anl-057) |
| ANL-058 | pytanie dostało odpowiedź człowieka, `questions_format` ≠ `none` | utrwal decyzję WYŁĄCZNIE w ścieżkach z configu: `domain: tech` → nowy dokument w `resolution_sink.tech` (ADR), `product`/`legal` → nowy w `resolution_sink.product` (BDR) i minimalna edycja plików z `resolution_sink.canon_edit`; dokument ma pole `link_field` (domyślnie `rozstrzyga`) z id pytania; uchylenie = nowy wpis (`supersedes`), starego nie ruszasz. Przed KAŻDYM zapisem `resolve-finalize.mjs check-write` (exit 2 = nie pisz). Format `file`: `close-questions` kasuje plik pytania dopiero, gdy dokument decyzji z `link_field` istnieje; format `index`: usuń wiersz pytania. W artefakcie `resolution_docs: [{question, doc}]` i `resolve_stats`. Bez commita i bez `git add` | `scripts/resolve-finalize.mjs` (`check-write`: ścieżka spoza configu, edycja istniejącej decyzji, glob w `canon_edit`, `.env*`; `close-questions`: brak dokumentu decyzji = plik zostaje, exit 2) + prompt | [ANL-058](docs/decisions/orchestrate-rule-history.md#anl-058) |
| ANL-059 | krok 1.b i 3.c | koszt kroku jako osobny `step` (`--step-id resolve --role resolve`, `--tool-calls`, `--cost-usd`), Explore z `[slot:resolve]`; po odpowiedzi człowieka wpisz do artefaktu `resolve_stats` z `verify-answer-sources.mjs --stats` (`rec_total`, `rec_rejected`, `rec_rejected_ratio`, `by_basis`): odsetek rekomendacji odrzuconych przez człowieka to miara jakości kroku, wysoki = złe rekomendacje | `verify-answer-sources.mjs --stats` (liczy deterministycznie) + prompt (`telemetry-emit` zapisuje tylko pola schematu v1) | [ANL-059](docs/decisions/orchestrate-rule-history.md#anl-059) |
