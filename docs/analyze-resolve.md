# `/analyze` — kroki 1.b, 3.b, 3.c: pytania z rekomendacją

Procedura czytana przez `/analyze` WYŁĄCZNIE wtedy, gdy `runtime.yml` ma `analyze.resolve` i po panelu zostały
pytania spoza `MECHANICAL` (`commands/analyze.md`, „Kroki 1.b, 3.b, 3.c"). Trzymana poza komendą, bo komenda
płaci za każdy swój bajt przy każdym wywołaniu (`scripts/context-bill.mjs`). Uzasadnienia: [ADR 0016](adr/0016-rozstrzyganie-otwartych-pytan-w-analyze.md)
i [ADR 0017](adr/0017-auto-przyjecie-pytan-ze-zrodlem-i-krotki-raport.md) (zmienia ANL-056/057, dodaje ANL-060), [wpisy ANL-054..060](decisions/orchestrate-rule-history.md#anl-054). Skrypty: `scripts/verify-answer-sources.mjs`,
`scripts/resolve-finalize.mjs`.

**Telemetria (ANL-059).** Gdy krok 1.b wchodzi, dopisz do `--plan` z kroku 0.c pozycję `resolve:resolve:resolve`; po kroku zamknij go
`telemetry-emit step --step-id resolve --group resolve --role resolve --outcome ok --tool-calls <n> [--cost-usd <x>]`.
Opis wywołania Explore/haiku zaczyna się od `[slot:resolve]` (ANL-041). Uzasadnienia reguł: `decisions/orchestrate-rule-history.md`, ANL-054..059.

## Krok 1.b — otwarte pytania z rekomendacją (ANL-054, ANL-055, ANL-056, ANL-060)

Wchodzi tylko, gdy `runtime.yml` ma `analyze.resolve` (blok `decision-registry`) i po panelu zostały pytania, których nie
rozstrzyga ANL-047 (`MECHANICAL`). Bez `analyze.resolve` przebieg jest taki jak przed tą zmianą. Decyzję podejmuje
człowiek: ten krok przygotowuje pytanie tak, żeby dało się na nie odpowiedzieć jednym słowem. Jedyny wyjątek to krok 4a.

1. Weź pytania w kolejności partii (ANL-057), nie więcej niż `analyze.resolve.max_questions`; reszta idzie dalej bez rekomendacji (`basis: none`, ANL-051).
2. Jedno wywołanie Explore/haiku na WSZYSTKIE pytania (ANL-019: zwraca cytaty z namiarami, nie pliki), korpus wg `lookup_order`,
   indeksu decyzji, `governance.canon` (stan z kroku 0.d), KANON i `BUSINESS_RULES`. Wynik: kandydaci `{source: "plik:linia", quote}`.
3. Ty wybierasz podstawę: `canon` (dokument odpowiada wprost), `precedent` (analogiczna decyzja BDR/ADR/KANON/BUSINESS_RULES),
   `new-pattern` (brak precedensu), `none` (bez rekomendacji; `q` mówi czemu). Cytaty trafiają do `evidence: [{kind: answer|precedent, source, quote}]`.
4. `node <claude-patterns>/scripts/verify-answer-sources.mjs <artefakt>`: exit 2 = zły cytat albo format. Usuń cytat, którego nie ma w pliku,
   i obniż `basis` do `new-pattern`/`none`; nigdy nie dopisuj cytatu z pamięci.
5. Format `file`: pytanie produktowe/prawne albo `one-way` bez zweryfikowanego źródła dostaje plik pytania w `questions_dir`
   (kształt wg `README.md` tego katalogu; `decyduje`, `domyslnie`), a jego id idzie do `question_file`. Zapis po `check-write` (ANL-058).

**Luka przeglądu nie jest pytaniem (ANL-051).** Gdy kontrola decyzji (1.a) nie przeczytała plików albo skończył się budżet:
doczytaj brakujące pliki sam (jedno celowane doczytanie). Nie da się, to wpisz „Luka przeglądu: <lista>" do `## Przebieg` i idź dalej.
NIGDY jako `open_question` ani w czacie. Pytanie bez `decision:` i `rec` albo o proces analizy (kontrola, bramka, budżet, „nie przeczytała")
`verify-answer-sources.mjs` odrzuca (exit 2).

**Krok 4a — automatyczne przyjęcie (ANL-060).** Dotyczy tylko pytania, które wynik `verify-answer-sources.mjs` wpisał do `auto.pending`
(`autoEligible`), a `analyze.resolve.auto_accept` jest `true`. Warunki, wszystkie naraz: `basis` `canon` albo `precedent` ze zweryfikowanym
cytatem (exit 0); `door_type: two-way`; `class` inna niż `USER_CHALLENGE`; `domain: tech` (produkt i prawo zawsze idą do człowieka);
decyzja sparowana (`decision:`) bez `premise_failed`/`card_conflict`; w pytaniu, `rec` i `q` nie ma retencji, RODO, prawa ani
bezpieczeństwa (słowa-klucze w skrypcie, zachowawczo); pytanie nie było cofnięte. Dla każdego pytania z `auto.pending`
zapisz `answer:` = tekst opcji `(recommended)` (pole `answer` z `auto.pending`) i `answered_by: auto`, a w artefakcie w `## Przebieg`
wypisz je (`ask` → odpowiedź), żeby człowiek mógł je przejrzeć. Nie ruszaj `status:` (ANL-034). Pytań `one-way`, `USER_CHALLENGE`,
`new-pattern` bez `bulkEligible`, produktowych/prawnych i z `basis: none` nie przyjmujesz nigdy. `auto_accept: false` (albo brak klucza w
`runtime.yml` sprzed ADR 0017) = zachowanie sprzed zmiany, `auto.pending` jest puste. Utrwalenie decyzji (ANL-058) dla przyjętych
automatycznie następuje dopiero po odpowiedzi człowieka na tę analizę i tylko dla tych, których nie cofnął.

## Krok 3.b i 3.c — raport w czacie, odpowiedź i utrwalenie (ANL-040, ANL-057, ANL-058, ANL-060)

**3.b Raport (po zapisie artefaktu).** Jedyny dozwolony kształt wiadomości dla człowieka (ANL-040). `verify-answer-sources.mjs <artefakt>`
zwraca `batch` (najwyżej `batch_size`, domyślnie 10, numerowane od 1), `remaining` i `auto` (`pending`, `accepted`). Najpierw wykonaj krok 4a
dla `auto.pending`, potem pokaż:

```
<TASK-ID>: <jedno zdanie biznesowe: co to zmienia w aplikacji albo w pracy zespołu>
Przyjęte automatycznie: N (cofnij: 1–N, lista w artefakcie)          ← tylko gdy N > 0, przy zerze brak linii
1. <ask>
   <rec>
2. <ask>
   <rec>
<instruction>
```

- Linia `<instruction>` to DOSŁOWNIE pole `instruction` z `verify-answer-sources.mjs` (liczy ją skrypt, zgodnie z parserem `--reply`):
  `ok` tylko gdy wszystkie pytania partii są `bulkEligible` (wtedy „ok" przyjmuje rekomendacje i zatwierdza); gdy zostają pytania
  `one-way`/`USER_CHALLENGE`/bez źródła, np. `ok 1,2 · 3: odpowiedź` (numery `bulkEligible` przyjmuje „ok", reszta wymaga własnej
  odpowiedzi; samo „ok" nic by wtedy nie zatwierdziło). Nie pisz z pamięci „ok = zatwierdź".

- Linia `TASK-ID`: jedno zdanie, język biznesowy, bez nazw klas, plików i numerów ADR/BDR. Odpowiada na pytanie, które człowiek zadawał
  osobno („co to zmienia w aplikacji, czy da się to zrobić bez innego taska?"), więc nie przepisuj tytułu zadania.
- Pytania dosłownie z pól `ask` i `rec`, bez komentarza. Bez trzeciej linii „Opcje:" i bez znaczników podstawy w `rec` (canon, precedent, basis…; jedyny
  wyjątek: „nowy wzorzec", bo tak każe ANL-055; sprawdza to `verify-answer-sources`, exit 2). Gdy nie ma pytań dla człowieka, zamiast listy i instrukcji pokaż jedną linię:
  „zatwierdzam = zatwierdź analizę" (plus „cofnij N", gdy N > 0).
- Gdy `remaining` > 0: „Zostało N pytań, pokażę je po tych" jest już w `instruction`, nie dopisuj osobnego akapitu.
- Bez `analyze.resolve` (brak parsera odpowiedzi) zamiast linii instrukcji: „Odpowiedz w czacie albo w artefakcie; „zatwierdzam" ustawia status".

**Czego nie wolno pokazać w czacie** (ANL-040): sekcji „Co sprawdziłem", „Czego nie sprawdziłem", „Odstępstwa od procesu", „Warto wiedzieć",
„Co ustalił panel", „Jeszcze ręcznie po przebiegu"; narracji o agentach panelu i o telemetrii; treści artefaktu (synteza, tabela STRIDE/DREAD,
lista decyzji `MECHANICAL`) ani akapitu syntezy w czacie (synteza tylko w artefakcie); regulaminu składni odpowiedzi poza jedną linią instrukcji; pytań spoza formatu ask/rec („Mam jeszcze
zaktualizować artefakt?", „Chcesz, żebym przygotował treść?", „Wolisz zatwierdzić przed opinią prawnika czy po?"). Agent albo robi daną rzecz,
albo ją pomija; nie pyta o nią. Meta-proces (co sprawdzono, czego nie, odstępstwa od procesu, ryzyka, panel, lista przyjęta automatycznie)
trafia do sekcji `## Przebieg` artefaktu; człowiek czyta ją tylko wtedy, gdy chce.

**3.c Odpowiedź.** Człowiek odpowiada w tej samej sesji albo po czasie przez `/analyze <TASK-ID> --resume` (pomija kroki 0.b–2: żadnego
panelu; wymaga artefaktu ze `status: awaiting-human`). `verify-answer-sources.mjs <artefakt> --reply "<słowa człowieka>"` mówi, co zapisać:

| słowa człowieka | wynik w `reply` |
|---|---|
| „ok", „ok wszystkie", „przyjmuję rekomendacje", „biorę rekomendacje", „tak, zatwierdzam rekomendacje" (diakrytyki i interpunkcja bez znaczenia) | `answers[]` dla pytań `bulkEligible`, reszta w `hold`; bez „poza" i gdy nic nie zostaje otwarte: `approve.granted: true` |
| „ok poza 3 i 5" | jak wyżej, ale 3 i 5 w `hold`; `approve.granted: false` |
| „ok 2 4", „2: odpowiedź" | jawne odpowiedzi (działają też dla `one-way`, `USER_CHALLENGE`, produktu); nie zatwierdzają |
| „zatwierdzam", „zatwierdzam wszystko" | przyjęcie `bulkEligible` plus `approve.granted: true`; gdy zostało pytanie `one-way`/`USER_CHALLENGE`/niepokazane: `granted: false`, `blockedBy` z numerami, `hold` |
| „cofnij 2", „cofnij 1 3", „cofnij wszystkie" | `reverted[]`: automatyczna odpowiedź wraca do człowieka |

`bulkEligible` (ANL-057): `door_type: two-way`, bez `USER_CHALLENGE`, bez flag decyzji (`premise_failed`/`card_conflict`), z rekomendacją
i jedną opcją `(recommended)`, a ponadto albo `canon`/`precedent` ze zweryfikowanym cytatem (dowolna domena), albo `new-pattern` w domenie
`tech`. `new-pattern` w produkcie/prawie, `basis: none`, `one-way` i `USER_CHALLENGE` wymagają osobnej odpowiedzi.

Zapisujesz dokładnie tekst opcji z `reply.answers[]` (nie „ok"). Dla `reply.reverted`: `answer: null`, usuń `answered_by`, dodaj
`auto_reverted: true` (pytanie wróci w następnej partii i nigdy więcej nie zostanie przyjęte automatycznie). `reply.hold` i `reply.unparsed`
pokaż człowiekowi i dopytaj; nie zgaduj. `status: approved` ustawiasz tylko, gdy `reply.approve.granted` jest `true`
(człowiek powiedział „zatwierdzam" albo „ok" bez „poza", i nic nie zostało otwarte); inaczej ANL-034 działa jak dotąd: status zostaje
`awaiting-human`, a człowiekowi pokazujesz `blockedBy`. Po zapisie pokaż następną partię, jeśli `remaining` > 0, a potem utrwal decyzje
(ANL-058): odpowiedzi człowieka i te przyjęte automatycznie, których nie cofnął.

**Po zatwierdzeniu (ANL-034).** Zmieniasz WYŁĄCZNIE artefakt analizy (`status: approved`, odpowiedzi) i zapisy ANL-058. Nie edytujesz kodu,
`package.json`, lockfile, plików zadań ani luk, nie ustawiasz `status: done`, nie commitujesz, nie mergujesz. Implementacja to `/orchestrate`. `resolve_stats` z `--stats` zawiera też `auto_total`,
`auto_reverted` i `auto_reverted_ratio`.

## Pełna treść reguł ANL-054..060

Rejestr w komendzie ma tylko nakazy; tu jest ich pełna treść (kolumny jak w rejestrze: ID, trigger, wymagana akcja, mechanizm, ref).

| ID | trigger | wymagana akcja | mechanizm | ref |
|---|---|---|---|---|
| ANL-054 | krok 1.b: `runtime.yml` ma `analyze.resolve`, po panelu zostało pytanie bez rozstrzygnięcia z ANL-047 | szukaj źródła odpowiedzi i PRECEDENSÓW (analogiczne BDR/ADR, KANON, BUSINESS_RULES) w dokumentach wg `lookup_order`, indeksu decyzji i `governance.canon`; zapisz `basis: canon\|precedent\|new-pattern\|none` i `evidence: [{kind, source: "plik:linia", quote: "dosłowny cytat z tej linii"}]`; jedno wywołanie Explore/haiku na wszystkie pytania; cytatu bez pliku, linii i dosłownego tekstu nie wpisuj, brak źródła = `new-pattern`/`none`; ANL-049 (przesłanki o kodzie) obowiązuje bez zmian | `scripts/verify-answer-sources.mjs` (exit 2: plik nie istnieje, linia poza plikiem, cytatu nie ma w linii, plik poza źródłami projektu albo `.env*`, `precedent`/`canon` bez zweryfikowanego cytatu) | [ANL-054](docs/decisions/orchestrate-rule-history.md#anl-054) |
| ANL-055 | pytanie z rekomendacją trafia do `open_questions[]` | `ask` = JEDNO proste pytanie (jedno zdanie, „?", język biznesowy, bez żargonu); `rec` = „Rekomendacja: … (zgodne z BDR-xx / KANON §y)" albo „Rekomendacja: … (nowy wzorzec, oparty o …)" — „nowy wzorzec" mówisz uczciwie, gdy brak zweryfikowanego precedensu; `ask` + `rec` razem najwyżej 2 zdania; `options` w jednej linii z DOKŁADNIE jedną „(recommended)"; numer BDR/ADR tylko w `rec`; kontekst techniczny w `q` | hook `check-human-voice` (`rec`: prefiks, 2 zdania łącznie, brak plików/klas/żargonu) + `verify-answer-sources.mjs` (exit 2) | [ANL-055](docs/decisions/orchestrate-rule-history.md#anl-055) |
| ANL-056 | każde pytanie w kroku 1.b | DECYZJĘ PODEJMUJE CZŁOWIEK; jedyny wyjątek to ANL-060 (ADR 0017). `USER_CHALLENGE`, `one-way` (brak `door_type` = one-way), produkt/prawo i `basis: none` nigdy nie są przyjmowane automatycznie ani hurtem; `new-pattern` idzie hurtem tylko dwudrzwiowy, w domenie `tech` (ANL-057). Flagi `premise_failed`/`card_conflict` zachowują zamek `prepare` (ANL-049/050). Produkt/prawo/`one-way` bez zweryfikowanego źródła nie dostaje zgadniętej wartości (w `rec` kierunek, nie liczba), a w formacie `file` ma plik pytania (`question_file`). Limit `max_questions` albo budżet `resolve` wyczerpany → ANL-051: reszta idzie do człowieka bez rekomendacji. `questions_format: none` albo brak `analyze.resolve` → flow sprzed zmiany | `verify-answer-sources.mjs` (brak `domain`, produkt/prawo bez źródła i bez `question_file`: exit 2; hurtowość tylko dla `bulkEligible`) + `orchestrate-prepare.mjs` (`answer: null`, ANL-034) | [ANL-056](decisions/orchestrate-rule-history.md#anl-056) |
| ANL-057 | krok 3.b/3.c: artefakt ma pytania bez odpowiedzi | pokaż najwyżej `batch_size` (domyślnie 10) pytań, każde jako dwie linie `ask`/`rec`; kolejność: `USER_CHALLENGE` i `one-way`, potem reszta, w grupie wg `blocks_sp`. „ok"/„ok wszystkie"/„przyjmuję rekomendacje" obejmują tylko pytania `bulkEligible`; „zatwierdzam" = przyjęcie `bulkEligible` + `status: approved` w jednym kroku, a gdy zostało pytanie `one-way`/`USER_CHALLENGE`: `hold` z numerami, bez `approved`. „ok 2 4" i „2: odpowiedź" to jawne odpowiedzi. Zapisuj `answer:` WYŁĄCZNIE z `reply.answers[]` (tekst opcji, nie „ok"); `hold`/`unparsed` wracają do człowieka. Wznowienie: ta sama sesja albo `--resume`. `status: approved` tylko gdy `reply.approve.granted`; ANL-034 bez zmian | `verify-answer-sources.mjs --reply` (parser odpowiedzi, `bulkEligible`, `approve`) + `orchestrate-prepare.mjs` (`status`, `answer: null`) | [ANL-057](decisions/orchestrate-rule-history.md#anl-057) |
| ANL-058 | pytanie dostało odpowiedź człowieka, `questions_format` ≠ `none` | utrwal decyzję WYŁĄCZNIE w ścieżkach z configu: `domain: tech` → nowy dokument w `resolution_sink.tech` (ADR), `product`/`legal` → nowy w `resolution_sink.product` (BDR) i minimalna edycja plików z `resolution_sink.canon_edit`; dokument ma pole `link_field` (domyślnie `rozstrzyga`) z id pytania; uchylenie = nowy wpis (`supersedes`), starego nie ruszasz. Przed KAŻDYM zapisem `resolve-finalize.mjs check-write` (exit 2 = nie pisz). Format `file`: `close-questions` kasuje plik pytania dopiero, gdy dokument decyzji z `link_field` istnieje; format `index`: usuń wiersz pytania. W artefakcie `resolution_docs: [{question, doc}]` i `resolve_stats`. Bez commita i bez `git add` | `scripts/resolve-finalize.mjs` (`check-write`: ścieżka spoza configu, edycja istniejącej decyzji, glob w `canon_edit`, `.env*`; `close-questions`: brak dokumentu decyzji = plik zostaje, exit 2) + prompt | [ANL-058](docs/decisions/orchestrate-rule-history.md#anl-058) |
| ANL-059 | krok 1.b i 3.c | koszt kroku jako osobny `step` (`--step-id resolve --role resolve`, `--tool-calls`, `--cost-usd`), Explore z `[slot:resolve]`; po odpowiedzi człowieka wpisz do artefaktu `resolve_stats` z `verify-answer-sources.mjs --stats` (`rec_total`, `rec_rejected`, `rec_rejected_ratio`, `by_basis`): odsetek rekomendacji odrzuconych przez człowieka to miara jakości kroku, wysoki = złe rekomendacje | `verify-answer-sources.mjs --stats` (liczy deterministycznie) + prompt (`telemetry-emit` zapisuje tylko pola schematu v1) | [ANL-059](docs/decisions/orchestrate-rule-history.md#anl-059) |
| ANL-060 | krok 1.b: pytanie `canon`/`precedent` ze zweryfikowanym cytatem (exit 0), `door_type: two-way`, `class` ≠ `USER_CHALLENGE`, `domain: tech`, bez flag decyzji i bez słów-kluczy retencja/RODO/prawo/bezpieczeństwo, `analyze.resolve.auto_accept: true` | `answer` = opcja `(recommended)`, `answered_by: auto`; człowiek widzi jedną linię „Przyjęte automatycznie: N (cofnij: 1–N)", lista w `## Przebieg`; „cofnij N" → `answer: null`, `auto_reverted: true`, pytanie wraca do człowieka i nigdy już nie jest przyjmowane samo; `resolve_stats` liczy `auto_total`, `auto_reverted`; utrwalenie (ANL-058) po odpowiedzi człowieka. `status: approved` nadal tylko na jego polecenie (ANL-034) | `verify-answer-sources.mjs` (`autoEligible`, `auto.pending`; `answered_by: auto` bez uprawnień = exit 2) + `orchestrate-prepare.mjs` (to samo, exit 2) | [ANL-060](decisions/orchestrate-rule-history.md#anl-060) |
