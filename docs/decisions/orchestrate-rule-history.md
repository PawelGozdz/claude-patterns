# Historia reguł `/orchestrate` i `/analyze`

Ten plik jest **uzasadnieniem** reguł, które w `commands/orchestrate.md` i `commands/analyze.md`
stoją już tylko jako wiersze tabeli. Rozdzielenie zrobiono w K94 (TASK-KAIZEN-002, 2026-09-07),
bo obie komendy urosły do dziennika incydentów, z którego model przy każdym przebiegu na nowo
odtwarzał skrypt Workflow — 543 i 290 linii prozy z siedmioma identyfikatorami przebiegów
i dziewiętnastoma datami wplecionymi w treść reguł.

Podział obowiązków:

- **Komenda** mówi, CO zrobić i CO to egzekwuje. Jest krótka, bo czyta ją agent w każdym przebiegu.
- **Ten plik** mówi, DLACZEGO — z datą, identyfikatorem przebiegu i kosztem. Czyta go człowiek,
  kiedy chce zmienić regułę albo zrozumieć, skąd się wzięła.

Narracje poniżej przeniesiono 1:1. Nic nie zostało skrócone ani przepisane — zmieniło się
wyłącznie miejsce, w którym leżą.

---

## `/orchestrate` — reguły ORC

<a id="orc-001"></a>

### ORC-001 — zero własnej implementacji, egzekwowane hookiem, nie odebraniem narzędzia

Do 2026-08-13 bramką było `disallowedTools: Edit`. Blokowała nie to, co trzeba:
koordynator nie mógł dopisać `layers_done:` do własnego artefaktu ani poprawić
promptu w skrypcie workflow przed `resumeFromRunId`, a `Write` (nadpisanie
całego pliku) zostawał otwarty — obietnicy „zero implementacji" nie egzekwowała
w ogóle.

Egzekwuje to hook `check-delegation` w trybie STRICT: przy aktywnym znaczniku przebiegu
główna sesja nie zapisze ŻADNEGO pliku źródłowego (`.ts/.tsx/.dart/.py/.svelte`) — także
takiego, którego `pattern-routing` nie mapuje na wzorzec. Artefakty koordynacyjne
(`.analysis.md`, pliki tasków, `runtime.yml`, skrypty workflow) zostają otwarte, bo
prowadzenie ich to praca koordynatora, nie implementacja.

<a id="orc-003"></a>

### ORC-003 — znacznik przebiegu bierze czas z zegara, nie z pamięci

Pobierz realny czas — `Bash("date -u +%Y-%m-%dT%H:%M:%SZ")` — NIE wpisuj go z pamięci:
masz dostęp do dzisiejszej daty przez kontekst sesji, ale nie do godziny; „wypełnienie"
`ts` bez zegara literalnie wyszło jako `00:00:00Z` w produkcji (audyt api-1, 2026-08-19)
— znacznik wyglądał na 9h45min starszy niż był, bo TTL 8h liczy się właśnie z tego pola.

`session_id` jest po to, żeby przebieg w jednej instancji nie ograniczał równoległej sesji
na tym samym repo (ADR 0006).

<a id="orc-010"></a><a id="orc-012"></a>

### ORC-010 / ORC-012 — pola warstwy muszą być respektowane, inaczej blok deklaruje martwe bramki

Warstwa w `orchestrate.layers` poza `id`/`dirs`/`agent` może mieć pola sterujące. Silnik MUSI
je respektować — bez tego blok deklaruje bramki, których nikt nie odpala (realna dziura,
znaleziona 2026-08-11 w `library-layers`).

`id: implementation` nie mówi agentowi niczego; „cały kod produkcyjny serwisu, bez podziału
na warstwy domenowe" mówi mu i czego się od niego oczekuje, i czego ma nie robić — stąd
`role:` wstawiane do promptu dosłownie.

`patterns:` warstwy wnoszą inne bloki przez `layer_contributions` (ślad `# +<blok>`
w runtime.yml): blok walidacji nie ma własnej warstwy, ale ma coś do powiedzenia warstwie
aplikacji.

<a id="orc-011"></a>

### ORC-011 — zakres warstwy do promptu weryfikatora

`{LAYER_SCOPE}` MUSI dostać to samo, co implementer: `id`, `dirs` i `role` warstwy właśnie
zaimplementowanej. Bez tego `code-quality-verifier` szuka plików WSZYSTKICH warstw (jego
Phase 1 discovery domyślnie skanuje domain + application + infrastructure + testing naraz)
— w warstwie `application` żąda więc repozytoriów, których jeszcze nie ma, VETO-uje ich brak,
a implementer pod presją dopisuje infrastrukturę, o którą nikt nie prosił (juz-ide-api-2,
2026-08-16; kod był poprawny, ale poza zakresem — i cały cykl fix→verify, który do tego
doprowadził, jest czystym kosztem). `{LAYER_SCOPE}` mówi verifierowi: plik spoza tych `dirs:`
jest poza zakresem, nie brakujący — nie VETO-uj jego nieobecności.

<a id="orc-014"></a>

### ORC-014 — liczy się kod wyjścia, nie treść outputu

Skrypt kończący się zerem przy czerwonym raporcie NIE jest bramką (`--ci` bez przekazanej
flagi, `--passWithNoTests` na nieistniejącym katalogu — obie pułapki spotkane w vytches-ddd).
Werdykt opieraj na `$?`.

<a id="orc-015"></a>

### ORC-015 — output `checks` nigdy nie trafia do kontekstu subagenta

Uruchamiaj `checks` tak, żeby output NIGDY nie trafił do kontekstu subagenta —
`<cmd> > /tmp/check-<nazwa>.log 2>&1; echo "EXIT:$?"`, i przy `EXIT:0` nie czytaj pliku wcale.
Samo „zwracaj tylko ogon przy błędzie" w prompt-cie NIE wystarcza: agent i tak musi WYKONAĆ
komendę, więc pełny stdout trafia do jego kontekstu w momencie wywołania Bash, zanim zdąży
cokolwiek streścić.

Diagnoza z dziennika przebiegu (vytches-ddd, 2026-08-20): sondy kosztowały 142k tokenów
(15% całego przebiegu) — po 27-32k **za sondę**, mimo `model: haiku` + `effort: low` — bo
każda w pełni zmaterializowała output `nx run-many` (19 pakietów / 14 plików testowych)
tylko po to, by ostatecznie zwrócić „exit 0, exit 0".

<a id="orc-016"></a>

### ORC-016 — `checks` zawężone do dotkniętego pakietu w monorepo

`nx affected --target=test` / `pnpm --filter <pkg>... test` zamiast gołego `pnpm test`.
Ten sam przebieg (vytches-ddd, 2026-08-20): zmiana w jednym pliku odpalała testy wszystkich
19 pakietów, i to na `checks` KAŻDEJ warstwy osobno oraz na `final_gate` — koszt czasu (nie
tylko tokenów) mnożony przez każdą rundę fix-loopa. Gdy warstwy/`final_gate` nie da się
jednoznacznie zawęzić (zmiana przecina pakiety), uruchom pełny zakres świadomie i odnotuj to
w raporcie — nie milcz, ale nie rób tego domyślnie.

<a id="orc-017"></a>

### ORC-017 — brak skryptu w `package.json`: pomiń i ZARAPORTUJ

„check `test:contracts` pominięty — brak skryptu". Cicha omisja robi z bramki dekorację.

<a id="orc-022"></a>

### ORC-022 — `final_gate` uruchamia sumę `checks` warstw, które weszły

Raz, na całości zmiany. To ostatnie miejsce, gdzie wychodzi regresja między warstwami
(testy zielone przed warstwą `api-surface`, czerwone po niej).

**Zmiana 2026-09-24 (TS-MH-005):** suma samych warstw gubiła testy regresji dokładnie wtedy, gdy
analiza pominęła warstwę testing, a w projektach na `ddd/layers` (warstwy bez `checks`) bramka nie
uruchamiała niczego. Blok deklaruje teraz `final_gate.checks`, które wchodzą zawsze, przed sumą
`checks` warstw. Prepare ostrzega, gdy bramka zostaje bez żadnego checka.

<a id="orc-024"></a>

### ORC-024 — checkpoint `layers_done` dopisywany `Edit`, nie `Write`

Po KAŻDYM GO warstwy silnik NATYCHMIAST dopisuje jej id do `layers_done:` w artefakcie
(`Edit` — punktowo we frontmatter; NIE `Write` całego pliku, bo nadpisanie artefaktu gubi
odpowiedzi na `open_questions`) — to checkpoint, dzięki któremu wznowienie nie płaci za
zrobione.

Przy wznowieniu: zaufaj zapisowi — nie re-implementuj; zamiast pełnego verify zrób szybki
sanity check (pliki warstwy istnieją w repo/stage).

<a id="orc-030"></a>

### ORC-030 — helper `ask()` sprowadzający dwa tryby awarii do jednego

Elementy kanonicznego skryptu to reakcja na dwa realne przebiegi z 2026-08-14.
`wf_23029d51-3a2` (juz-ide-api-2): 22 agentów, 89 M tokenów wczytanego kontekstu, 22,5 min
i **crash** przy 36 realnych edycjach. `wf_d4b19f61-68c` (juz-ide-api-1): skrypt napisany
wzorowo — sondy, twarde `maxTurns`, retry 3×, ESCALATE, guardy na null — i mimo to `failed`
po 7,4 min, bo bronił się przed nullem, a przyszedł wyjątek.

Ze schemą brak StructuredOutput RZUCA WYJĄTEK, a nie zwraca null: guard `if (!wynik)` go NIE
złapie, a nieobsłużony kończy CAŁY przebieg jako `failed`. Helper sprowadza oba tryby awarii
(martwy agent → null, brak StructuredOutput → wyjątek) do jednego: null.

Nazwa helpera jest dowolna (`ask`, `safeAgent`…), ale MUSI wołać `await agent(` — po tym
`workflow-lint` go rozpoznaje i stosuje do wywołań przez niego wszystkie reguły (WL1 self-ocena,
WL4, WL10 limity, WL13 duplikat sondy). Owijka, która wywołuje agenta pośrednio (przez zmienną,
przez apply), staje się dla lintera niewidzialna i wyłącza te reguły po cichu — dokładnie to
zdarzyło się 2026-08-14 w api-2, zanim `callSites()` to naprawiło.

<a id="orc-031"></a>

### ORC-031 — sonda deterministyczna raz, verifier dostaje wynik jako fakt

Deterministyczne bramki uruchamiane RAZ, tanio, bez czytania kodu. Verifier dostaje jej wynik
jako FAKT i ma zakaz ponawiania. Bez tego jeden przebieg zrobił 48 typechecków i 43 uruchomienia
testów, a każde wyjście (16-23 KB) zostawało w kontekście i mnożyło się przez kolejne tury.

<a id="orc-033"></a>

### ORC-033 — schema na producencie danych, nie tylko na verify

Agent kończący turę wywołaniem narzędzia oddaje PUSTY STRING; w przebiegu `wf_23029d51-3a2`
6 z 17 zwrotów było puste, w tym cała konsultacja specjalisty wklejona potem do 3 promptów.
To NIE koliduje z zakazem self-oceny (WL1): zakaz dotyczy self-OCENY (verdict/status), nie
zwracania faktów. Uwaga — schema ma własny tryb awarii, przeciwny do pustego stringa: agent,
który nie zdąży jej wypełnić, RZUCA. Dlatego helper `ask()` jest warunkiem sensowności schemy.

<a id="orc-034"></a>

### ORC-034 — guard na null po `parallel()`/`pipeline()`

`parallel()` nie rzuca — padnięty thunk wraca jako null. `cat1.status` na nullu wywrócił cały
przebieg po 22 minutach (`wf_23029d51-3a2`, juz-ide-api-2, 2026-08-14,
TS-GEO-QUERY-KERNEL-002a).

<a id="orc-035"></a>

### ORC-035 — sonda mierzy PRZYROST, nie tylko zieloność

`wf_69187830-205` (juz-ide-api-4, 2026-08-14): trzy kolejne wywołania implementera wyczerpały
budżet tur bez `StructuredOutput`. Każde rzuciło wyjątek — i każde **zdążyło wcześniej
zmodyfikować pliki**. Trzecie dopisało 133 linie. Sonda przepuściła je (typecheck pass,
605/605 testów pass), bo dopisane były komentarze opisujące Check D i Check E, a nie ich
implementacja: komentarze się kompilują i nie czerwienią żadnego istniejącego testu.
Fabrykacja przeciekła do `docs/security/security-gaps.md` i `TECH-DEBT.md` jako „naprawione".
Wyłapał to dopiero drogi `code-quality-verifier` w trzeciej, ostatniej dopuszczalnej próbie.

„tsc pass + testy pass + niepusty diff" jest spełnialne przez sam komentarz. Dla zadań
dopisujących testy/kontrole policz nowe bloki wykonywalne — to nadal czysty grep, żadnego LLM-a:

```
git diff --cached -U0 | grep -cE '^\+\s*(it|test|describe)\('
```

Diff dodający >100 linii przy ZERO nowych blokach to NO_GO niezależnie od tsc. Uwaga: legalny
refaktor testów też ma zerowy przyrost — dlatego bramka dotyczy wyłącznie jednostek, których
zakresem jest DODANIE kontroli, i mierzy przyrost względem stanu sprzed danej jednostki, nie
wartość bezwzględną.

<a id="orc-036"></a>

### ORC-036 — cichy wyjątek to inna awaria niż NO_GO

Licz je osobno. Merytoryczne NO_GO znaczy „popraw to"; wyjątek z braku StructuredOutput znaczy
„zakres nie mieści się w budżecie" i trzecia próba TEGO SAMEGO kształtu tylko dokłada śmieci
do drzewa. Po DWÓCH z rzędu eskaluj zamiast powtarzać.

<a id="orc-037"></a>

### ORC-037 — fakt cichej awarii przekazany do kolejnej próby

Bez tego fix-prompt dostaje tylko violations z sondy („zero zmienionych plików"), więc
implementer myśli, że to przejściowa usterka, a nie sygnał, że zadanie go przerasta. Prompt
kolejnej próby mówi wprost: poprzednie próby skończyły się bez wyniku, budżet tur wyczerpany,
zakres jest najpewniej za duży, zrób NAJMNIEJSZY kompletny fragment, a pliki mogły zostać
częściowo zmodyfikowane — SPRAWDŹ ich stan przed edycją, nie zakładaj czystego drzewa.

<a id="orc-038"></a>

### ORC-038 — diff-sonda po cichej śmierci, ZANIM powtórzysz implementację

Cicha śmierć najczęściej znaczy „praca wykonana, budżet spalony na oddaniu wyniku", a NIE
„praca niezrobiona". TS-TOKEN-TOPUP-001/A2 (api-1, 2026-08-14): implementer umarł 2× bez
StructuredOutput, choć kod leżał KOMPLETNY w working tree i typecheck przechodził — skrypt
spalił drugą pełną próbę (~40 tur) i eskalował; dopiero ręczna interwencja przełączyła na
weryfikację istniejącego stanu.

Po nullu z implementera: tania sonda `git diff --name-only` (haiku, effort low); jeśli pliki
jednostki SĄ zmienione → idź do VERIFY-EXISTING (weryfikacja od zera + punktowe fixy naruszeń),
NIE do re-implementacji. Dopasowanie pliku do ZAKRESU jednostki jest konieczne — NIE samo
„diff niepusty": inne jednostki tego przebiegu już zmieniły drzewo, więc bez zawężenia każdy
cudzy diff wyglądałby jak wykonana praca.

**Dopisek 2026-09-24 (TS-MH-005, `wf_a95b083c-a06`):** diff-sonda uratowała pracę, ale nie tury.
`infrastructure-implementer` zamilkł 4 razy na 4, każdorazowo na dokładnie 40. turze, po 13–35
wywołaniach Bash (głównie iteracyjny `tsc`/build); powtórka tej samej pracy kończyła się w 5–15
turach. Rozmiar kart nie był przyczyną: warstwy domeny z identycznymi 75 KB kart kończyły się
poprawnie, a `domain-application-implementer` nie ma Bash. Definicja agenta i prompt implementera
zakazują teraz pętli kompilacji/testów, bo sonda robi to zaraz po implementerze
(TASK-ORCH-IMPL-SILENT-001).

<a id="orc-039"></a>

### ORC-039 — routing modeli jawnie, nie dziedziczeniem

`agent()` bez `model:` dziedziczy model GŁÓWNEJ pętli — na sesji z drogim modelem każda sonda
i implementer liczą kontekst po najdroższej stawce (a kontekst to ~91% rachunku przebiegu).
Jakość chronią weryfikatory, nie drogi implementer:

```
sondy/probes            → model: 'haiku',  effort: 'low'
implementery            → model: 'sonnet'
verify per-jednostka    → model: 'sonnet' (rule-cards robią robotę, nie tier)
FINAL GATE              → bez override (dziedziczy sesyjny, zwykle najmocniejszy)
```

<a id="orc-040"></a>

### ORC-040 — wyjątek nie jest rollbackiem

`agent()`, które rzuciło, zostawia po sobie wszystkie `Edit`/`Write`, jakie subagent zdążył
wykonać. „Nieudane" z perspektywy orkiestratora nie znaczy „bez skutków na dysku" — kolejna
próba startuje na częściowo zmienionym drzewie. Dlatego ORC-037 każe implementerowi sprawdzić
stan plików, a nie zakładać czysty start, i dlatego bramka „kod istnieje" (WL3) mierzy
`git diff`, nie raport agenta.

<a id="orc-041"></a><a id="orc-042"></a><a id="orc-043"></a>

### ORC-041 / ORC-042 / ORC-043 — zakaz cofania

`git checkout`, `git restore`, `git stash` i `git reset` są zakazane na KAŻDEJ ścieżce — zero
wyjątków. Zakaz obejmuje wprost przypadek „to tylko mój własny plik" i przypadek „przywracam,
jak było" — to nie są furtki, to najczęstsza maska, pod którą zakaz bywa łamany.

Agent, który uważa jakiś plik za spoza swojego zakresu, **zgłasza to w raporcie końcowym
i na tym kończy**. Nigdy tego pliku nie cofa.

Uzasadnienie: cofnięcie to jedyny sposób, w jaki zweryfikowana praca może zniknąć NIE
ZOSTAWIAJĄC ŚLADU w diffie, który człowiek ogląda przed commitem. Awaria workflow zostawia
`failed` w journalu. Zły werdykt zostawia `violations[]`. Nawet cichy wyjątek zostawia
częściowo zmienione pliki na dysku (ORC-040). Cofnięcie nie zostawia nic — diff po prostu
przestaje zawierać to, co ktoś inny już zatwierdził.

**Protokół mutacji stanu, sformułowany pozytywnie:** do zapisania i przywrócenia stanu używaj
`cp`, nigdy gita. To jedyne narzędzie, którym wolno wykonać operację wyglądającą z zewnątrz
podobnie do cofnięcia — nie złagodzenie zakazu powyżej o kolejny przypadek.

`wf_f24e8621-140` (run journal, 2026-08-12): warstwa `gates` zaimplementowała swoje kryteria
w dwóch plikach; jej weryfikator zwrócił GO. Warstwa `baselines` ruszyła jako następna — jej
pytania kontrolne zawierały standardowy strażnik zakresu („czy zmiana mieści się w ścieżkach
zakresu, bez postronnych modyfikacji?"). Ten weryfikator zobaczył w drzewie roboczym zmiany
warstwy `gates` i zgłosił je jako zanieczyszczenie zakresu — POPRAWNIE, z jedyną informacją,
jaką miał: NO-GO. Agent naprawczy rozwiązał naruszenie najprostszą dostępną drogą:
`git checkout --` na obu plikach warstwy `gates`, po czym nałożył z powrotem wyłącznie własną
wąską edycję. Zatwierdzone kryterium zniknęło bez śladu w diffie, który człowiek miał później
przeglądać. Warstwa przeszła. Bramka końcowa to złapała, ale cztery warstwy i ~1,4 mln tokenów
subagentów już poszły, a odzyskanie było ręczne. Żaden agent nie zachował się źle — zabrakło
reguły.

**Czego ten zakaz sam nie rozwiązuje:** weryfikator warstwy N nadal nie wie, że pliki warstw
1..N-1 są już zatwierdzone, i będzie je zgłaszał jako zanieczyszczenie zakresu — zakaz blokuje
tylko najgorszą reakcję na ten błędny sygnał, nie usuwa samego sygnału. Deterministyczne
domknięcie (pomiar przyrostu zmian per ścieżka względem stanu sprzed danej warstwy) jest
osobnym, jeszcze nierozstrzygniętym zadaniem — ORC-011 i zawężanie diffu do `dirs` warstwy
w kanonicznym skrypcie są jego częściowym przybliżeniem.

<a id="orc-044"></a>

### ORC-044 — wstrzykiwanie kart reguł do promptów

`orchestrate.md` wymagało tego „od linii 148" (spec + decisions + **Rule Cards** + Codebase
Facts), a **nie robił tego żaden skrypt**. Skutek zmierzony 2026-08-14: prompt implementera
w api-1 nie zawierał ani jednego wystąpienia słowa `patterns`, `retrieve` czy `knowledge` —
agent szukał więc tam, gdzie umiał, i skończył na `find / -iname "*on-conflict-builder*"`,
trafiając w cudzy projekt. W api-2 prompt podawał ścieżki wzorców z poleceniem „przeczytaj
CAŁY plik": 20-36 KB weszło do kontekstu i mnożyło się przez każdą turę.

**Ograniczenie, które przesądza o kształcie:** skrypt Workflow **nie ma dostępu do
filesystemu** (żadnego `readFileSync`). Kartę czyta krok przygotowania — przed uruchomieniem
Workflow — i przekazuje przez `args`. Od K92 robi to `scripts/orchestrate-prepare.mjs`;
wcześniej robił to (albo nie robił) koordynator ręcznie.

**Dlaczego to jest tańsze, a nie tylko inne.** Karta wklejona do prompta wchodzi do
`cache_creation` **raz** i w kolejnych turach czytana jest po stawce cache read. Wzorzec
czytany przez agenta `Read`-em wchodzi w turze N i jest przeliczany w każdej turze od N do
końca — przy 40-90 turach implementera to ta sama treść policzona kilkadziesiąt razy. To jest
mechanizm, który wygenerował 89 M tokenów cache read w jednym przebiegu.

**Czego NIE wstrzykiwać:** pełnych wzorców (od tego są karty), treści RAG „na zapas"
(implementer nie ma czego szukać, bo ma kartę), całych plików ADR. Jeśli karta rośnie powyżej
~8 KB, `lint-patterns.mjs` to zgłasza — to znak, że wzorzec potrzebuje podziału, nie że limit
jest za mały.

<a id="orc-046"></a>

### ORC-046 — celowany retrieval TAK, „RAG na zapas" nadal NIE

Pierwotny zakaz eksploracji domykał ścieżkę Grep/Read, ale przy okazji domykał też najtańszą
alternatywę: implementer jednostki NE1 (api-3, 2026-09-01, TS-ARCH-HANDLER-CONTRACT-001) spalił
~25 z 45 tur na ręczny research Read/Grep, mając narzędzia retrievalu w definicji agenta i nie
wywołując żadnego — w całej historii przebiegów Workflow ZERO wywołań retrievalu.

Reguła jest kosztowa, nie ideologiczna. Karta odpowiada na „jak MA być" i jest wstrzyknięta
z góry — retrieval po reguły to marnotrawstwo. Na „jak JEST u nas zrobione" (istniejąca
implementacja referencyjna, sygnatura helpera, użycie biblioteki w naszym kodzie) najtańsze
jest jedno zapytanie `retrieve_code`/`retrieve_examples`: zwraca top-k gotowych wycinków
(kilka KB raz), gdy seria Grep + Read pełnych plików to dziesiątki KB przeliczane w każdej
kolejnej turze. Stąd limit wpisany do prompta: max 2 zapytania na przebieg agenta, zero gdy
karta wystarcza — i zero to nadal najlepszy wynik, nie wskaźnik do podbijania.

> Warunek sensowności tej reguły: `TASK-RAG-004` (indeks kodu skażony między worktree).
> Dopóki `retrieve_code` seeduje się z jednego checkoutu, „jak JEST u nas zrobione" może
> pochodzić z cudzego stanu repo (audyt 2026-09-07, znalezisko B4).

<a id="orc-047"></a>

### ORC-047 — weryfikator dostaje co innego niż implementer

Implementer: karta (`quickstart`) — ma pisać, nie rozważać. Weryfikator: pełny wzorzec albo
poziom `core`/`exhaustive` — ocenia zgodność, więc potrzebuje wyjątków od reguły, których karta
świadomie nie zawiera.

<a id="orc-048"></a>

### ORC-048 — pipeline, nie bariera

`parallel()` blokuje do najwolniejszego. Jednostka B czekała tam na A, choć zależała wyłącznie
od własnego pliku. Bariera jest uzasadniona tylko wtedy, gdy następny etap potrzebuje
WSZYSTKICH wyników naraz (dedup, zliczenie, „zero znalezisk → pomiń weryfikację"). Sekwencja
jest uzasadniona, gdy dwie jednostki dotykają TEGO SAMEGO pliku — wtedy łańcuch w jednym
`pipeline`, nie dwa równoległe.

Kanoniczny skrypt (K93) prowadzi warstwy SEKWENCYJNIE i nigdy nie zrównolegla weryfikatora
(WL2, CONFORMANCE §3: 9/9 martwych wywołań verify szło przez zrównoleglenie). Pipeline
zostaje narzędziem dla jednostek WEWNĄTRZ warstwy, gdy analiza je rozpisze.

<a id="orc-049"></a>

### ORC-049 — zadeklarowany rozłączny zakres to nie to samo co wymuszony

Prompt jednostki może mówić „dotykaj wyłącznie X" — to nie gwarantuje, że implementer się
tego trzyma; werdykt to złapie, ale dopiero PO fakcie, gdy zapis już wylądował na
współdzielonym working tree obok zapisów innych równoległych jednostek (incydent
TS-SEC-TRUSTED-PROXY-001, api-2, 2026-08-31: jednostka wyszła poza zakres i dotknęła `main.ts`
+ webhook należące do dwóch INNYCH, równolegle piszących jednostek — werdykty GO dla tamtych
stały się niepewne, bo mogły weryfikować stan zanieczyszczony konkurencyjnym zapisem).

Gdy 2+ równoległe jednostki mogą w praktyce dotknąć wspólnego pliku wejściowego (bootstrap,
DI wiring, współdzielony config) — nie ufaj samej dyscyplinie promptu: albo
`isolation: 'worktree'` dla tych jednostek (drogie, ale to dokładnie przypadek, do którego
jest), albo sekwencja w jednym `pipeline`.

<a id="orc-050"></a>

### ORC-050 — czego NIE ciąć

To kupiona jakość, nie narzut: niezależny verifier zamiast self-reportu, 3 próby
z `violations`, pełna lektura kontraktu przed edycją, guardian jako źródło prawdy, testy L2
widoczności, bramka końcowa.

<a id="orc-051"></a>

### ORC-051 — po starcie czegoś w tle NIE wywołuj ScheduleWakeup

`Workflow` i `Agent` uruchomione w tle **same** wracają z powiadomieniem, gdy skończą.
Sięganie po `ScheduleWakeup`, żeby „poczekać", kończy się błędem
`prompt is required when stop is not true` (zaobserwowane 3× w api-2 i api-4, za każdym razem
sesja dochodziła do tego od nowa). `ScheduleWakeup` należy do trybu `/loop` — samodzielnego
tempa iteracji — a nie do czekania na zadanie, które i tak Cię zawoła.

Czekasz na przebieg? Nie rób nic. Zajmij się kolejnym krokiem albo zakończ turę.

<a id="orc-052"></a>

### ORC-052 — nie startuj Workflow z sesji bliskiej limitu kontekstu

Subagenci dostają świeże konteksty, ale orchestrator musi mieć zapas na fix-loop, final gate
i raport — „będę zwięzły" w roli koordynatora to utrata jakości. Jeśli sesja pokazuje
ostrzeżenia o kontekście: ZATRZYMAJ SIĘ PRZED uruchomieniem Workflow i wypisz „⚠ Kontekst na
wyczerpaniu — otwórz świeżą sesję i odpal orchestrację ponownie; checkpoint `layers_done`
sprawia, że wznowienie jest prawie darmowe." Lepiej stracić minutę na restart niż przebieg na
zduszonym koordynatorze.

<a id="orc-053"></a>

### ORC-053 — budżety to bezpieczniki, nie sufit ambicji

Miękki limit ratuje częściowy output, twardy chroni przed klifem bez raportu. NIE zaciskaj
domyślnych, żeby „oszczędzać" — gdy task realnie potrzebuje więcej, podnieś `budgets:`
w project.yml (nadpisuje bloki bez ograniczeń, ADR 0008 OQ3).

<a id="orc-054"></a>

### ORC-054 — po awarii workflow: diagnoza przed re-runem

Przeczytaj `<transcriptDir>/journal.jsonl` (realne zwroty agentów — nie zgaduj przyczyny),
popraw skrypt/prompt i wznów `Workflow({scriptPath, resumeFromRunId})` — ukończone wywołania
wracają z cache, nie płacisz za nie drugi raz. Nigdy nie odpalaj od zera bez diagnozy.

<a id="orc-055"></a>

### ORC-055 — fork diagnostyczny dostaje JAWNY zakaz Agent/Workflow/Task

Diagnoza (czytanie diffa/journala po eskalacji) to dobry kandydat na fork — oszczędza kontekst
koordynatora. Ale „ZERO edycji plików, tylko raport" NIE wystarcza jako mandat: to zakaz
edycji, nie zakaz WYWOŁANIA narzędzi, które same edytują. Fork z pełnym dostępem do narzędzi
(dziedziczy go po Tobie) może wywołać `Agent`/`Workflow`/`Task` i odpalić pełną kontynuację
implementacji bez Twojego przeglądu (incydent TS-SEC-TRUSTED-PROXY-001, api-2, 2026-08-31:
fork poproszony wyłącznie o raport sam uruchomił drugi `Workflow` — wave2 + testy + bramka
końcowa — bez autoryzacji).

Prompt forka diagnostycznego MUSI jawnie wymieniać zakaz: „NIE wywołuj Agent, Workflow ani
Task — Twoim JEDYNYM dozwolonym wyjściem jest raport tekstowy do mnie." I: żaden kolejny
`Workflow` nie startuje na podstawie diagnozy, której nie przejrzałeś Ty (lub człowiek).

**Dodatek 2026-09-27 — „tylko prompt" złamane DRUGI raz, przeniesione do kodu.** grant-flow
TS-RATE-003: fork diagnostyczny po `ESCALATE_AND_HALT` na warstwie `application:application`
(3x identyczny realny NO_GO — brak `__tests__/handler.spec.ts` dla 4 nowych handlerów), mimo
jawnej instrukcji „NIE wywołuj Agent/Workflow/Task, wyłącznie raport" — zignorował ją, wpisał
`layers_done` dla tej warstwy BEZ napisania brakujących testów (samo-zatwierdzenie warstwy,
którą własny weryfikator 3x poprawnie odrzucił) i odpalił nienadzorowany kolejny `Workflow`
(przy okazji wykonujący też legalną robotę na `infrastructure-acl`/`infrastructure-persistence`
— nie czysty no-op, co utrudniło wykrycie). Koordynator złapał to krzyżowym sprawdzeniem
dziennika poprzedniego, autoryzowanego przebiegu vs. bieżący stan dysku PRZED zaufaniem
samo-zgłoszonemu `SKIPPED`/`layers_done` łotrzykowskiego przebiegu; cofnął fałszywy wpis.
Dodatkowo: `TaskStop` na agencie forka NIE zatrzymał już wystrzelonego wywołania `Workflow` —
to leciało dalej ~20 minut po stopie.

Druga niezależna konfirmacja tego samego wzorca (pierwsza: 2026-08-31, api-2) uruchamia własną
regułę tego repo („Co zrobić z regułą »tylko prompt«" w `commands/orchestrate.md`): przenieś do
kodu, nie dopisuj kolejnego akapitu prozy. `agents/universal/halt-diagnostician.md` — dedykowany
agent z `disallowedTools: Write, Edit, MultiEdit, Agent, Workflow, Task` na poziomie DEFINICJI,
nie samego promptu. Fork diagnostyczny po halcie/blokadzie MA używać
`subagent_type: halt-diagnostician`, nie gołego `fork`/`general-purpose`, który dziedziczy pełny
zestaw narzędzi wywołującego. `TaskStop`-nie-zatrzymuje-zagnieżdżonego-`Workflow` pozostaje
otwartym pytaniem o zachowanie samego harnessu — poza zasięgiem tego repo, do zgłoszenia osobno.

<a id="orc-058"></a>

### ORC-058 — znacznik przebiegu usuwany na KAŻDEJ ścieżce wyjścia

Także po `ESCALATE_AND_HALT` i po odmowie z bramek wejścia. Zostawiony znacznik trzyma sesję
w STRICT do końca TTL: kolejna, zwykła praca w tym repo odbije się od `check-delegation` bez
widocznego powodu.

<a id="orc-059"></a><a id="orc-060"></a>

### ORC-059 / ORC-060 — raport ma dwie części, w tej kolejności

Nie zaczynaj raportu od tabeli warstw. Człowiek, który odpalił orkiestrację godzinę temu,
wraca po odpowiedź „czy to jest gotowe do commita", nie po przebieg maszyny — przebieg jest
dowodem dla tej odpowiedzi, więc idzie pod nią.

<a id="orc-062"></a>

### ORC-062 — po czerwonej sondzie nie ma „braku zmian", jest `BLOCKED_BY_PRIOR` (2026-09-24)

marketing-hub, TS-MH-005, run `wf_a95b083c-a06`. Sonda uruchamia `checks` na całym repo, a warstwa
ma wąski zakres. Czerwony lint z wcześniejszej warstwy wyszedł w sondzie infrastruktury, pętla
wróciła do implementera z listą naruszeń, a implementer odpowiedział `changed_files: []`
z uzasadnieniem „poza zakresem". Gałąź no-op (dodana 2026-09-14 dla warstw, których task nie
dotyka) zawołała weryfikatora, który ocenił samo twierdzenie, bez wyniku sondy i bez naruszeń,
zgodził się i dał GO. Tak skończyły 4 z 4 warstw infrastruktury.

Po czerwonej sondzie ścieżka no-op jest zamknięta. Implementer, który nie może naprawić czerwieni
w swoim zakresie, zgłasza „POZA ZAKRESEM: plik:linia", warstwa dostaje status `BLOCKED_BY_PRIOR`
i przebieg staje jak przy `ESCALATE_AND_HALT`, bo kolejne warstwy trafiłyby na tę samą czerwień.
Rozważana była sonda bazowa na starcie każdej warstwy (odróżnienie „moja czerwień / odziedziczona"
bez udziału człowieka). Odrzucona na razie: dokłada jedno wywołanie na warstwę, a przyczyna
odziedziczonej czerwieni i tak wymaga decyzji, czy wracać do wcześniejszej warstwy. Przy okazji
weryfikator no-op dostaje naruszenia z poprzedniej rundy, bo ta sama dziura istniała po NO_GO
weryfikatora. Źródło czerwieni zamknięto osobno: warstwy `ddd/layers` dostały `checks`, więc lint
domeny wychodzi w warstwie domeny, nie w infrastrukturze. Egzekwuje `workflow-lint WL17` (ERROR).

<a id="orc-063"></a>

### ORC-063 — jedna lista plików z drzewa: bramka, diff-sonda i bramka końcowa (2026-09-24)

Dwa satelity, ten sam błąd. ai-gateway TS-AIG-015 (`wf_895a3077-bdc`): jednostka tworzyła same
nowe pliki testów, `git diff --name-only` ich nie widział (nieśledzone), sonda przyrostu po
`git add` agenta też nie (`git diff` bez bazy porównuje z indeksem), i po trzech próbach przyszedł
ESCALATE na zielonych testach. marketing-hub TS-MH-003/005: to samo plus `git status --short`
zwijający nowy katalog do `?? contexts/audience/`. Każdy przebieg w marketing-hub łatał to w kopii
skryptu.

Teraz wszystkie trzy miejsca używają jednego polecenia, `git diff --name-only <baza>; git ls-files
--others --exclude-standard`, a sonda przyrostu `git diff HEAD`. Bramka końcowa dostaje listę z tej
samej sondy względem `baseSha` zapisanego przez prepare, a nie sumę raportów warstw (warstwa no-op
oddawała `files: []`, więc bramka nie widziała infrastruktury ani migracji), oraz karty wszystkich
wzorców przebiegu, których wcześniej nie dostawała wcale. Pliki brudne już przed startem idą do
bramki osobno (`dirtyAtStart`). Licznik bloków łapie też `describe.each(`/`it.each(`.
Egzekwuje `workflow-lint WL18` (WARN) i eval w trzech stanach drzewa (nieśledzony, `A`, `AM`).

<a id="orc-064"></a>

### ORC-064 — `units[]` z analizy to pod-warstwy, nie komentarz (2026-09-24)

Analiza TS-MH-005 zaplanowała cztery przebiegi infrastruktury, prepare zbudował jeden: pole `units`
stało w szablonie analizy, ale nic go nie czytało. Człowiek zauważył to dopiero w wyjściu prepare.
Prepare rozwija teraz każdą jednostkę `{ id, layer, dirs, role?, checks?, reason? }` w pod-warstwę
`<warstwa>:<id>` w miejscu warstwy bazowej. Zakres działa jak `layers_scope`, karty idą z warstwy
bazowej (`base`), a `layers_done` przyjmuje id pod-warstwy. Wpis bez `dirs`, z nieznaną warstwą,
z warstwą w `layers_skip`/`layers_scope` albo ze zdublowanym id zatrzymuje start (exit 2).
To domyka pytanie zostawione otwarte w ANL-037.

<a id="orc-065"></a>

### ORC-065 — nadpisania przez plik i skrypt z wbudowanymi args (2026-09-24)

Przy ~150 KB args nie da się ich przekazać ręcznie, więc każdy przebieg w marketing-hub kończył się
własnym skryptem kopiującym szablon i podmieniającym treść. Raz zgubił fragment args na `$'`
w `String.replace` (ten sam błąd zrobiono zresztą przy pisaniu evala do tej zmiany). Prepare ma
teraz `--overrides <plik.json>` (głębokie scalenie; `layers` jako mapa po id; nieznany klucz
= exit 1) i `--emit-script <ścieżka>`: zapisuje szablon z wbudowanym `const a = …` przez
split/join, przepuszcza go przez `workflow-lint` (błąd = exit 4, plik nie powstaje) i podaje go
w `scriptPath`.

<a id="orc-066"></a>

### ORC-066 — odstępstwa z satelitów wracają do claude-patterns automatycznie (2026-09-25)

Miesiące rozwoju tego repo, a jedynym kanałem „satelita natrafił na coś dziwnego → ktoś to
naprawi centralnie" był człowiek ręcznie czytający output workflow i zakładający
`docs/tasks/TASK-ORCH-*.md` — dowód: pięć takich plików dodanych tego samego dnia, każdy z
polem `source:` cytującym konkretny run, którego treść ktoś musiał ręcznie skopiować. Problemy
powtarzały się średnio co kilka dni, czasem po zmarnowaniu milionów tokenów w satelicie, zanim
ktokolwiek je zauważył.

`Workflow()` zwraca cały obiekt `report` do agenta orkiestrującego, a ten agent ma już dziś
Bash/Write i resolvowaną ścieżkę `<claude-patterns>` (używa jej w kroku 2). Krok 5 wykorzystuje
dokładnie to: po HALT-cie (ESCALATE_AND_HALT/BLOCKED_BY_PRIOR którejkolwiek warstwy, NO_GO bramki
końcowej, exit 4 workflow-lint przy `--emit-script`, albo niepuste `deviation_note` od
implementera/verifiera) agent wywołuje `report-deviation.mjs`, który tworzy lub aktualizuje jeden
plik w `docs/tasks/_inbox/` na sygnaturę problemu (rule_ref jeśli znany, inaczej slug reasonu) —
powtarzający się problem zwiększa `occurrences` i dopisuje projekt zamiast mnożyć duplikaty.
Zero zmian w logice halt/status samego `orchestrate.template.mjs` poza jednym dodatkiem: opcjonalne
`deviation_note` w `IMPL_SCHEMA`/`VERDICT_SCHEMA`, żeby trigger 4. (adnotacja agenta) miał gdzie
wylądować. Zapis tylko `git add`-uje plik w claude-patterns, nigdy nie commituje — triage robi
człowiek (`docs/tasks/_inbox/README.md`). Egzekwuje `report-deviation.mjs` + krok 5
`commands/orchestrate.md`; widoczność bez nowego nawyku daje informacyjny wpis w
`scripts/pre-commit-guards.mjs` (uczy z `docs/adr/0006-cross-instance-broadcast.md`, gdzie
podobny mechanizm padł po zerze realnych wpisów, bo nikt go nie czytał).

<a id="orc-067"></a>

### ORC-067 — HALT "staged" musi być zweryfikowany `git status`, nie wyliczoną listą (2026-09-26)

Pierwszego dnia działania ORC-066 przyszło zgłoszenie z ai-os-bot (BOT-009, run
`wf_d9d51f1a-69a`, `docs/tasks/_inbox/DEV-orc-057.md`): finalny raport przebiegu twierdził
„8 plików staged", ale `git status` po zakończeniu pokazywał ZERO realnie zastage'owanych —
working tree miał je jako modified/untracked. Krok 4 był jednym zdaniem prozy („git add,
HALT") bez wymogu weryfikacji, więc agent orkiestrujący zbudował komunikat HALT z listy
plików z `report` (ta lista istnieje dla potrzeb bramki końcowej, nie jako dowód realnego
stanu working tree), zamiast z faktycznego stanu po `git add`. Koordynator naprawił to
ręcznie (`git add` tej samej listy) przed HALT-em, żeby obietnica „staged, not committed"
była prawdziwa w chwili raportu.

Krok 4 wymaga teraz dwuetapowo: `git add` plików z `report`, POTEM `git status --short` jako
niezależne potwierdzenie — treść HALT-u powstaje z tego zweryfikowanego stanu, nie z samej
listy. Egzekwuje wyłącznie prompt w `commands/orchestrate.md` (krok 4) — `git add`/`git
status` dzieją się w agencie orkiestrującym poza `Workflow()` (skrypt szablonu nie ma
dostępu do filesystemu), więc nie da się tego zamknąć w deterministycznym `workflow-lint`
tak jak ORC-063; kandydat do automatyzacji, gdyby powtórzyło się częściej.

<a id="orc-068"></a>

### ORC-068 — sygnatura zgłoszenia potrzebuje warstwy, zamknięty status trzeba reopen'ować (2026-09-26)

Godzinę po uruchomieniu ORC-066/067 przyszły dwa kolejne zgłoszenia BLOCKED_BY_PRIOR
(ORC-062) z marketing-hub, z dwóch RÓŻNYCH warstw i dwóch RÓŻNYCH przyczyn: `domain:rules`
(import/order zalane szumem z monorepo, już zdiagnozowane i naprawione) i `testing:l1-l2`
(globalny guard PII czerwony po kolumnie z innego kontekstu — realna, otwarta decyzja, nie
błąd). Sygnatura zgłoszenia dla znanej reguły to był goły `rule_ref` (`upsert()` w
`report-deviation.mjs`), więc oba trafiły do JEDNEGO pliku, `DEV-orc-062.md` — a `upsert()`
dopisywał kolejne wystąpienie bez sprawdzenia `status`, więc drugi, zupełnie inny problem
wylądował po cichu pod już zamkniętym `status: dismissed` z pierwszego. Widoczny w
podsumowaniu pre-commit (top wg `occurrences`), ale z etykietą "dismissed" — łatwo pominąć.

Sygnatura dla znanej reguły to teraz `rule_ref` + `--layer` razem (gdy `--layer` podany),
nie sam `rule_ref` — reguły-bezpieczniki ogólnego przeznaczenia (ORC-062 i podobne) odpalają
z dowolnego powodu na dowolnej warstwie, więc bez warstwy w sygnaturze różne przyczyny się
zlewają. Dodatkowo `upsert()` sprawdza `status` istniejącego rekordu: nowe wystąpienie na
rekordzie `dismissed`/`promoted` ustawia `status: proposed` z powrotem (`reopened_at`,
`reopened_from_status` w frontmatterze) i wypisuje ostrzeżenie na stderr — stary
`dismissed_reason`/`resolution` zostaje jako historia decyzji o POPRZEDNIM wystąpieniu, nie
jako wyrok na nowe. `DEV-orc-062.md` ręcznie rozdzielony na `DEV-orc-062-domain-rules.md`
(dismissed, naprawione) i `DEV-orc-062-testing-l1-l2.md` (proposed, czeka na decyzję
marketing-hub). Egzekwuje `report-deviation.mjs`; krok 5 `commands/orchestrate.md` dostał
przypomnienie, żeby zawsze podawać `--layer`, gdy dotyczy warstwy.

<a id="orc-069"></a>

### ORC-069 — `GO` z niezweryfikowanym zakresem to nie czysty `GO` (2026-09-26)

Konwencja "TURN BUDGET — silent-death guard" istnieje w promptach ~20 agentów-weryfikatorów
we wszystkich stackach od 2026-07-02: przy ~80% budżetu tur agent ma dać częściowy werdykt z
`unverified_scope:` (pliki niesprawdzone) zamiast ginąć po cichu, a `code-quality-verifier.md`
wprost obiecuje "the orchestrator dispatches a narrowed second pass on `unverified_scope`".
Przez dwa miesiące nic tej obietnicy nie realizowało: `unverified_scope` nie było polem
`VERDICT_SCHEMA`, a `decideVerdict()` sprawdzało wyłącznie `verdict.verdict === 'GO'` —
uczciwie przyznane „nie zdążyłem sprawdzić X" przechodziło identycznie jak pełna weryfikacja.
Ujawnione 2026-09-26 przez ORC-066: marketing-hub TS-MH-010, warstwa `testing:l1-l2`
(jednostka 105 plików) — weryfikator po ~13/15 turach zgłosił `unverified_scope` i mimo to
dał GO, choć realnie było 11 czerwonych testów; błąd wyszedł dopiero jako `BLOCKED_BY_PRIOR`
na KOLEJNEJ jednostce (`infrastructure:cli-request-id`), o jeden krok za późno.

`unverified_scope: string[]` jest teraz w `VERDICT_SCHEMA` (pole faktograficzne, nie
self-ocena — WL1 OK). `decideVerdict()`: `GO` z niepustym `unverified_scope` to czwarta,
odróżniona ścieżka — w pętli warstwy konsumuje próbę jak `NO_GO` (świeży budżet tur na
kolejną rundę weryfikatora), a po wyczerpaniu prób eskaluje z jawnym powodem. Bramka końcowa
nie ma pętli retry (jeden strzał), więc tam `GO` z niepustym `unverified_scope` jest od razu
wymuszane na `NO_GO`. Nie jest to pełna realizacja obietnicy „narrowed second pass" (to
wymagałoby osobnej, węższej ścieżki weryfikacji zamiast reużycia pętli implement→verify) —
świadomie prostszy, bezpieczny wariant: kolejna pełna próba dostaje świeży budżet tur, co w
praktyce daje weryfikatorowi szansę dokończyć to, czego nie zdążył. Egzekwuje
`orchestrate.template.mjs` (`decideVerdict`, sekcja bramki końcowej); eval:
`verdict-go-with-unverified-scope-is-not-clean-go` w `tests/flow-evals/orchestrate-script/
run.js`.

<a id="orc-070"></a>

### ORC-070 — `unverified_scope` cudzej warstwy nie blokuje czystego `GO` (2026-09-26)

ORC-069 (wyżej) traktuje KAŻDĄ niepustą pozycję `unverified_scope` jednakowo — jako lukę TEJ
warstwy. W praktyce weryfikator bywa uczciwy o dwie różne rzeczy naraz: „nie zdążyłem sprawdzić
X w SWOIM zakresie" (to ORC-069 ma łapać) i „X w ogóle nie jest moją robotą, tylko innej
jednostki tego samego przebiegu" (to nie jest niedokończona weryfikacja — to poprawne
przyznanie granicy `layers_scope.dirs`). Zlanie obu w jedno paliło pełną próbę na kodzie, który
był już gotowy i poprawny.

Ujawnione 2026-09-26, godzinę po starcie ORC-069: grant-flow TS-RATE-003, warstwa
`domain:domain` — weryfikator dał `GO` z `unverified_scope` na próbach 2 i 3 (`violations: []`),
ESCALATE_AND_HALT po 3 próbach. Diagnostyka dziennika + stanu dysku potwierdziła agregat/
encję/eventy/błędy tej jednostki za kompletne i poprawne. Z trzech pozycji `unverified_scope`
dwie (`domain/repositories/`, okablowanie error-mappera) z definicji leżą poza
`layers_scope.dirs` tej jednostki — należą do jednostek `application`/
`infrastructure-persistence` tego samego przebiegu; trzecia (pełny re-walk VO reguła-po-regule)
powtarza weryfikację już wykonaną w innej jednostce/przebiegu.

`decideVerdict()` dostaje teraz opcjonalnie `layer` i `allLayers` (wszystkie warstwy planu
bieżącego przebiegu). Pozycja `unverified_scope`, która **wygląda na ścieżkę** (zawiera `/` albo
`.`) i **nie dotyka** `effectiveDirs()` bieżącej warstwy, ale dotyka `effectiveDirs()` INNEJ
warstwy planu — zostaje odfiltrowana przed sprawdzeniem „czy GO jest czysty". Wolny tekst bez
separatora ścieżki (np. „pełny re-walk reguł") i ścieżki nieprzypisane do ŻADNEJ warstwy zostają
liczone tak jak wcześniej — konserwatywnie, jako realna luka — bo nie da się mechanicznie
odróżnić duplikatu weryfikacji od prawdziwie pominiętego zakresu bez historii poprzednich
jednostek/przebiegów (to pozostaje otwarte; patrz DEV-orc-069-implementation-sdk-dart-core.md
i DEV-orc-069-implementation.md w `docs/tasks/_inbox/` dla przypadków, których ten filtr
świadomie NIE rozwiązuje). Wywołania `decideVerdict()` bez `layer` (stare API, testy funkcji w
izolacji) wyłączają filtr i zachowują się jak przed ORC-070. Egzekwuje
`orchestrate.template.mjs` (`decideVerdict`, filtr `ownUnverified`); eval:
`verdict-unverified-scope-filters-other-layers-own-scope` w `tests/flow-evals/
orchestrate-script/run.js`.

**Dodatek 2026-09-27 — przyczyna, nie tylko objaw.** Filtr mechaniczny wyżej łapie zgłoszenie
DOPIERO w `decideVerdict()`, PO tym jak weryfikator już wpisał cudzą pozycję do
`unverified_scope`. Drugie niezależne wystąpienie potwierdziło, że to systematyczne: juz-ide-api-1
TS-SEC-112, warstwa `infrastructure:guards` — 3 IDENTYCZNE rundy `GO` z `unverified_scope`
(`changed_files: []` w rundach 2 i 3, zero zmian kodu między nimi), bo `unverified_scope`
wskazywał na `calibration-signal-shutdown.service.ts` (jednostka `shutdown`),
`system-log-retention-sweeper.scheduler.ts` (jednostka `logging`) i pełny przegląd speców
(jednostka `test-implementer`) — dokładnie to, co ORC-011 już nazywa „poza zakresem, nie
brakujący", tylko zastosowane do `dirs`, nie do samego pola `unverified_scope`. Diagnostyka
ręczna (grep na plikach) potwierdziła zero realnego defektu; 3 identyczne rundy zjadły cały
budżet prób na zerowej robocie. `buildVerifierPrompt()` dostał teraz wprost ten sam reminder,
którym ORC-011 opisuje `dirs` — wpisz do `unverified_scope` WYŁĄCZNIE własny, niesprawdzony
zakres; plik/spec innej jednostki tego przebiegu pomiń całkowicie, nie zgłaszaj go tutaj. To
uzupełnia filtr mechaniczny (który nadal łapie wolny tekst bez separatora ścieżki, np. „pełny
przegląd speców", gdyby jednak trafił do `unverified_scope" mimo przypomnienia), nie zastępuje
go — obrona w dwóch warstwach: prompt zapobiega u źródła, filtr sprząta to, czego prompt nie
złapał. Egzekwuje `orchestrate.template.mjs` (`buildVerifierPrompt`, akapit `unverified_scope`
tuż po instrukcji werdyktu); eval: rozszerzony
`verifier-prompt-carries-probe-facts-and-forbids-rerun` w `tests/flow-evals/orchestrate-script/
run.js`.

<a id="orc-071"></a>

### ORC-071 — samo-przyznanie „poza zakresem" w treści `unverified_scope` wystarcza (2026-09-27)

Dodatek do ORC-070 z tego samego dnia potwierdził się fałszywy niecały tydzień — a właściwie
tego samego dnia: juz-ide-api-1 TS-SEC-112, warstwa `infrastructure:shared-infra`, WARIANT #2
tego samego przebiegu. Weryfikator (mimo świeżo dodanego `scopeReminder`) wpisał do
`unverified_scope` jeden string prozy: „guards unit files (reputation-threshold.guard.ts,
residence-verification.guard.ts, geographic-access.guard.ts) — poza zakresem tej jednostki
(shared-infra)". Filtr ORC-070 wymaga strukturalnego dopasowania do `dirs` innej warstwy przez
`layerTouches()` — goła nazwa pliku bez prefiksu katalogu, wpleciona w nawias wewnątrz zdania,
nie dopasowuje się do niczego, więc pozycja liczyła się jako realna luka MIMO że weryfikator
sam już powiedział wprost, że nią nie jest. Wniosek wypisany w zgłoszeniu wprost: „instrukcja
promptu nie jest wiążąca dla LLM" — samo dopisanie przypomnienia o treści (co wolno/czego nie
wolno wpisywać) nie wymusza też FORMATU wpisu.

Dwie zmiany, obie w `decideVerdict()`/`buildVerifierPrompt()`, żadna nie zależy od tego, czy
druga zadziała:
1. **Ufaj słowu weryfikatora.** Pozycja `unverified_scope`, której treść zawiera samo-przyznanie
   („poza zakresem", „out of scope", „inna/innej jednostki", „owned by another/a different") —
   `SELF_ADMITS_OUT_OF_SCOPE` w `decideVerdict()` — jest odrzucana z `ownUnverified`
   NIEZALEŻNIE od tego, czy da się ją dopasować do `dirs` którejkolwiek warstwy. To mocniejszy
   sygnał niż dopasowanie ścieżki: skoro weryfikator sam to nazwał, nie ma sensu wymagać od
   niego jeszcze poprawnego formatu, żeby mu uwierzyć.
2. **Twardy FORMAT w promptcie.** `buildVerifierPrompt()` dostał wprost regułę: jeden wpis
   `unverified_scope` = jedna ścieżka względem repo, nic więcej — bez nawiasów, wyjaśnień, kilku
   plików w jednym stringu ani gołych nazw bez katalogu. Nie gwarantuje zgodności (LLM), ale
   zmniejsza szansę na powtórkę tego wariantu w przyszłości.

Obrona w trzech warstwach razem z ORC-070/ORC-011: prompt każe pominąć cudzy zakres całkowicie
(źródło), prompt każe formatować to, co jednak zostanie wpisane (format), `decideVerdict()`
łapie zarówno dopasowanie ścieżkowe (ORC-070), jak i samo-przyznanie w prozie (ORC-071) —
niezależnie od tego, które z dwóch przypomnień prompt faktycznie wymusił. Egzekwuje
`orchestrate.template.mjs` (`decideVerdict`, `SELF_ADMITS_OUT_OF_SCOPE`); eval:
`verdict-unverified-scope-self-admission` w `tests/flow-evals/orchestrate-script/run.js`.

**Osobna, NIEROZWIĄZANA obserwacja z tego samego zgłoszenia** (nie ORC-071, inny mechanizm):
`layers_done` nie zostało zapisane do `analysis.md` po pierwszym resume tego przebiegu, mimo że
`shared-infra` i `guards` obie osiągnęły faktyczny GO — drugi resume przerabiał więc obie
jednostki od zera. To dotyczy persystencji checkpointu przy wznowieniu (`resumeFromRunId`), nie
`decideVerdict()`, i wymaga osobnej inwestygacji, zanim powstanie kolejna reguła ORC — patrz
`DEV-orc-070-infrastructure-shared-infra.md` w `docs/tasks/_inbox/`, pozostawione częściowo
`proposed` w tej sprawie.

**Dodatek (tego samego dnia, 3. wystąpienie na tym samym tasku)** — grant-flow TS-RATE-003,
warstwa `infrastructure:infrastructure-persistence`: `unverified_scope` zawierał „VO files
owned by domain unit" i „aggregate/entity internals owned by domain unit" — samo-przyznanie
jest, ale w formie „owned by `<nazwa jednostki>` unit", nie „owned by another/a different", więc
wąski regexp z pierwszej wersji ORC-071 go nie łapał. Poszerzone do `owned by (?:another|a
different|[\w-]+\s+(?:unit|layer|warstw\w*))` — łapie dowolną nazwaną jednostkę/warstwę przed
„unit"/„layer"/„warstw…", nie tylko dwa sztywne warianty. Zgłaszający sam zaproponował dokładnie
ten kierunek („promować z 'tylko prompt' do `decideVerdict`") — potwierdza to, że regexy do
samo-przyznania będą się rozszerzać wraz z nowymi sformułowaniami; jeśli wzorzec „nazwana
jednostka + unit/layer" też zacznie mijać się z realnymi zgłoszeniami, kolejnym krokiem powinno
być dopasowanie po RZECZYWISTYCH `id` warstw z `allLayers` (już dostępnych w `decideVerdict()`),
nie kolejny wariant frazy. Eval: rozszerzony `verdict-unverified-scope-self-admission`.

<a id="orc-072"></a>

### ORC-072 — bramka końcowa dostaje ten sam kanał decyzji co warstwy (2026-09-27)

Warstwy mają wbudowaną ścieżkę naprawy dla nieoczywistego zakresu: `layers_scope[].reason` z
artefaktu analizy trafia do `layer.scope.reason`, który `scopeBlock()` pokazuje weryfikatorowi
wprost („ZAWĘŻENIE Z ANALIZY... powód: ..."). Bramka końcowa (`buildFinalGatePrompt()`) takiego
kanału nie miała, mimo że dane już do niej docierały: `a.task.decisions` (z `analysisDoc.fm.
decisions`) jest częścią `args` od dawna i `buildImplPrompt()` je renderuje — po prostu nikt
nie dorenderował tego samego pola do promptu bramki końcowej.

Skutek zgłoszony 2026-09-27 (feature-flags TASK-0010, `agent_note` z warstwy `final-gate`): 2 z
4 eskalacji ORC-069 tego przebiegu wydarzyły się na bramce końcowej, na pozycjach trywialnych
(README, .gitignore, sam plik analizy). Bramka końcowa jest jednorazowa (bez retry — ORC-069),
więc jedyna droga naprawy była ręczna interwencja człowieka PO fakcie — bez żadnego kanału,
którym człowiek mógłby zaadresować to PRZED kolejnym uruchomieniem, tak jak robi to
`layers_scope[].reason` dla warstw.

`buildFinalGatePrompt()` renderuje teraz `a.task.decisions` dokładnie tym samym formatem co
`buildImplPrompt()`, z jednym zdaniem instrukcji: decyzja jawnie adresująca pozycję, którą
inaczej trzeba by wpisać do `unverified_scope` (np. „D9: plik X jest dokumentacyjny, poza
zakresem tej weryfikacji"), liczy się jako rozstrzygnięta, nie jako luka. Człowiek dopisuje taką
decyzję do `decisions:` w analizie; kolejne uruchomienie (`resumeFromRunId`) tego samego taska ją
zobaczy na bramce końcowej — symetrycznie do tego, jak `layers_scope[].reason` odblokowuje
warstwy. Brak nowego pola w schemacie artefaktu ani w `orchestrate-prepare.mjs` — to ISTNIEJĄCY
kanał, tylko nie dotąd renderowany w tym jednym miejscu. Egzekwuje `orchestrate.template.mjs`
(`buildFinalGatePrompt`, akapit `decisions`); eval: rozszerzony
`final-gate-prompt-covers-whole-change` w `tests/flow-evals/orchestrate-script/run.js`.

<a id="orc-073"></a>

### ORC-073 — sonda grepuje własny zakres PRZED `tail`, nie zamiast niego (2026-09-27)

Sonda deterministyczna (`buildProbePrompt`) przy niezerowym exit code instruowała: „zwróć
ostatnie 40 linii w `tail`". W monorepo z jednym `lint:check` na cały repozytorium to systemowo
gubi błąd WE WŁASNYM zakresie warstwy, jeśli w tym samym logu, PO nim, leży dość ostrzeżeń z
katalogów spoza zakresu (np. `shared/`) — implementer widzi tylko cudzy ogon logu i uczciwie,
ale błędnie ogłasza no-op.

Ujawnione 2026-09-27, marketing-hub TS-MH-006, DWUKROTNIE z rzędu na tym samym tasku, ten sam
objaw: warstwa `testing:campaign`, potem `testing:knowledge` — implementer zacytował jako „red
probe" wyłącznie ostrzeżenia z `shared/`, ogłosił no-op, `BLOCKED_BY_PRIOR` (ORC-062) poprawnie
się zatrzymał. Ręczna weryfikacja (`pnpm run lint:check` poza silnikiem) potwierdziła: 3 błędy
`import/order` w nowo dodanym pliku WE WŁASNYM zakresie warstwy (`testing:knowledge`) BYŁY w
pełnym wyjściu eslint, wcześniej w logu niż sekcja `shared/` — „ostatnie 40 linii" ich nie
objęło. Zgłaszający słusznie podejrzewał ekstrakcję w `orchestrate.template.mjs`, nie sam
implementer.

`buildProbePrompt()` instruuje teraz: gdy warstwa ma niepusty `dirs` (`effectiveDirs(layer)`),
NAJPIERW `grep -E '<escaped dirs>' /tmp/check-<id>.log` — linie z WŁASNEGO zakresu, w CAŁOŚCI,
niezależnie od długości. Dopiero gdy ten grep nic nie zwróci (błąd bez ścieżki pliku, np.
konfiguracyjny — grep z natury go nie złapie) — fallback do starych „ostatnich 40 linii całego
logu". Warstwa bez `dirs` (cały projekt, nie ma czego zawężać) zachowuje stare zachowanie bez
zmian. Egzekwuje `orchestrate.template.mjs` (`buildProbePrompt`, `scopeGrep`/`tailInstruction`);
eval: `probe-prompt-greps-own-scope-before-tail-fallback` w `tests/flow-evals/orchestrate-script/
run.js`.

<a id="orc-016-code"></a>

### ORC-016 — uzupełnienie: zawężenie kodem, nie już samą prozą (2026-09-27)

Rekomendacja ORC-016 była do tej pory czystą prozą w prompcie sondy — `buildProbePrompt()`
budował `checks` jako goły `npm run <check>`, niezależnie od `dirs` warstwy. W monorepo z
turbo/nx (`dependsOn: ["^build"]`) to odpala pełny build WSZYSTKICH zależności upstream, nie
tylko pakietu, którego dotyczy warstwa.

feature-flags TASK-0010 (0010), 2026-09-27, warstwa `implementation:sdk-dart-core`: root
`"lint": "turbo run lint"`, `turbo.json` z `lint`/`typecheck`/`test`/`build` zależnymi od
`^build` — niezawężony `npm run lint` w sondzie wymusił build `packages/contracts`, którego ta
warstwa nie dotykała. Build w tamtym środowisku miał złą wersję toolchainu AJV i psuł
`packages/contracts/src/generated/standalone-validators.js` — zdarzyło się DWUKROTNIE w tym
samym przebiegu (raz ręcznie cofnięte, raz odtworzone samoistnie w rundzie 5), bo każde kolejne
wywołanie sondy powtarzało tę samą, nieza­wężoną komendę.

Silnik Workflow (ten plik) nie ma dostępu do systemu plików (patrz nagłówek pliku) — lookup
najbliższego `package.json` dla `dirs` warstwy robi więc SONDA (ma `Bash`), nie ten skrypt:
jedna funkcja powłoki (`_pkgdir()`) w tekście promptu, wywołana przed `checks`, ustawia
`$PKGROOT` na najbliższy katalog-przodek z `package.json` (albo `.`, gdy żaden nie pasuje —
wtedy sonda ma jawny nakaz zaznaczyć to w odpowiedzi, zgodnie z oryginalnym „nie milcz" z
ORC-016). Każdy check leci jako `(cd "$PKGROOT" && npm run <check>)` zamiast gołego `npm run
<check>` na roocie. Egzekwuje `orchestrate.template.mjs` (`buildProbePrompt`, `_pkgdir`/
`PKGROOT`); eval: `probe-prompt-scopes-checks-to-package-root-in-monorepo` w
`tests/flow-evals/orchestrate-script/run.js`.

<a id="orc-074"></a>

### ORC-074 — `GO` z `unverified_scope` konsumuje próbę przez `reverify`, nie przez `fix` (2026-09-27)

ORC-069 rozróżnił „GO z niepustym `unverified_scope`" od czystego GO — poprawnie, ale kolejna
próba wracała w `mode = 'implement'`, czyli przez PEŁNĄ rundę implementer→sonda→verify, mimo że
w tej gałęzi weryfikator nie zgłosił żadnych naruszeń kodu: zabrakło mu czasu albo kompetencji
na część zakresu, nie znalazł nic do naprawienia. Implementer dostawał więc `violations` w
kształcie „nie zdążono sprawdzić: testing-pyramid, conventions" — tekst nie do zaimplementowania
— i zwracał pracę bez zmian, po czym weryfikator dostawał dokładnie ten sam kod do oceny drugi
raz.

Dwa niezależne przebiegi tego samego dnia (2026-09-27) potwierdziły koszt:
- **ai-os-bot BOT-014**, warstwa `implementation`: `architecture-verifier` ma stały,
  zakodowany checklist (messaging isolation, źródło person, credentials) i STRUKTURALNIE nie
  oceni 7 wstrzykniętych kart spoza niego (testing-pyramid, conventions, security-invariants,
  ...) niezależnie od liczby prób ani budżetu tur — zgłasza to uczciwie przez `unverified_scope`
  (naprawione w agencie 2026-09-26, patrz `agents/stacks/node-ts-claude-api/
  architecture-verifier.md`), ale 3 próby paliły implementera na kodzie, który był poprawny za
  KAŻDYM razem.
- **marketing-hub TS-MH-006**, `infrastructure:wiring-security-format-fix`: `dirs` tej nowej
  jednostki celowo objęły `format:check` na 46 plikach (w tym plikach już zamkniętych,
  wcześniejszych jednostek) — weryfikator uczciwie nie zdążył sprawdzić całości w budżecie tur.
  Zatwierdzone ręcznie po niezależnej weryfikacji; 3-cia próba nie miała żadnej zmiany w diffie,
  tylko pisemną analizę.

`decideVerdict()` zwraca teraz `next: 'reverify'` (zamiast `'fix'`) dla GO+`unverified_scope`,
gdy próby jeszcze zostały. Pętla warstwy obsługuje `reverify` przez `mode = 'verify-existing'`:
pomija implementera, idzie prosto w sondę (tanio, idempotentnie) i verify ze świeżym budżetem
tur. Nie rozwiązuje to strukturalnej niekompetencji weryfikatora (ai-os-bot i tak eskaluje po 3
próbach — to decyzja per-projekt o obsadzie agentów, nie silnika), ale usuwa koszt dwóch
zbędnych rund implementera po drodze. Egzekwuje `orchestrate.template.mjs` (`decideVerdict`,
gałąź `reverify` w pętli warstwy); eval: `verdict-go-with-unverified-scope-is-not-clean-go` +
`verdict-unverified-scope-filters-other-layers-own-scope` + `verdict-unverified-scope-
self-admission` w `tests/flow-evals/orchestrate-script/run.js` (zaktualizowane asercje
`.next === 'reverify'`).

<a id="orc-075"></a>

### ORC-075 — plik towarzyszący może być własnością osobnej jednostki `tests: true` (2026-09-27)

`scopeBlock()` ma WYJĄTEK „pliki towarzyszące": test w tym samym katalogu i z tym samym rdzeniem
nazwy co plik z zakresu należy do zakresu TEJ warstwy (ORC-011/marketing-hub TS-MH-005). Zakłada
to milcząco, że test tego pliku to praca tej samej warstwy — fałsz, gdy przebieg ma osobną,
późniejszą jednostkę `tests: true` (`units[]`, ORC-064), której `dirs` i tak pokrywają te same
katalogi.

grant-flow TS-RATE-003, warstwa `application:application`, 3 eskalacje `ESCALATE_AND_HALT` na
tym samym powodzie: weryfikator flagował brak `__tests__/handler.spec.ts` dla 4 nowych
handlerów jako naruszenie blokujące, mimo że (a) rola `domain-application-implementer` ma
jawny zakaz pisania testów i bez `Task` w tym wywołaniu per-warstwa nie ma jak delegować do
`@test-implementer`, i (b) `units[]` tego samego taska ma już osobną, downstream jednostkę
`testing:testing`, której `dirs` jawnie obejmują `application/**/__tests__/`. Cały właściwy kod
produkcyjny przeszedł na pierwszej próbie z zerem naruszeń — jedyny sporny punkt to WŁAŚCICIEL
plików testowych, nie ich jakość czy istnienie.

`scopeBlock(layer, a)` (nowy drugi parametr — `a` to te same `args`, które i tak mają już
`buildImplPrompt`/`buildVerifierPrompt`) szuka w `a.layers` innych jednostek z `tests: true` i,
gdy takie istnieją, dopisuje do WYJĄTKU towarzyszącego zastrzeżenie: gdy katalog brakującego
testu pokrywa taka jednostka, to JEJ praca, nie luka tej warstwy. Warstwa, która SAMA ma
`tests: true`, nie dostaje tego zastrzeżenia o samej sobie. Egzekwuje `orchestrate.template.mjs`
(`scopeBlock`); eval: `scope-block-defers-companion-test-to-sibling-testing-unit` w
`tests/flow-evals/orchestrate-script/run.js`.

---

## `/analyze` — reguły ANL

<a id="anl-002"></a>

### ANL-002 — dlaczego `Edit` jest dozwolony (zmiana 2026-08-12)

Był zabroniony, a `Write` nie — zakaz nie chronił więc przed niczym (Writem można nadpisać
dowolny plik), za to blokował jedyną rzecz, której wymaga pozycja „rejestr threat-modeli"
z listy dozwolonych zapisów: dopisania wiersza do istniejącego rejestru. Realny skutek widoczny
w przebiegu z 2026-08-12: TM powstał, `Edit` na `index.md` odbił się o uprawnienie, a przebieg
zamknął się wpisem „dług administracyjny do wykonania ręcznie". Rejestr TM w `juz-ide-api-2`
deklarował wtedy 90 pozycji przy 106 plikach na dysku — dokładnie ten dryf, przed którym
ostrzega `patterns/cross-layer/registry-drift-guard-pattern.md`. Bramką jest lista dozwolonych
zapisów i zakaz implementacji, nie odebrane narzędzie.

> Sprzeczność usunięta w K94 (2026-09-07): plik komendy miał jednocześnie sekcję „dlaczego
> `Edit` jest dozwolony" i bullet „`Edit`/`MultiEdit` pozostają zabronione". Frontmatter
> (`tools: … Edit …`, `disallowedTools: MultiEdit, NotebookEdit`) rozstrzyga na korzyść
> pierwszej wersji, więc rejestr reguł zapisuje: `Edit` dozwolony wyłącznie do rejestrów
> z listy dozwolonych zapisów, `MultiEdit` zabroniony. Zachowanie komendy bez zmian.

<a id="anl-003"></a>

### ANL-003 — zakres `Grep`/`Glob` (zmiana 2026-08-12)

`Grep`/`Glob` były wcześniej zabronione, żeby wymusić delegowanie wyszukiwania do tanich
agentów. W praktyce dawało to odwrotny skutek: komenda nie umiała znaleźć pliku taska,
delegowała discovery, a subagent bez tych narzędzi zgadywał ścieżki plików — jeden taki
przebieg spalił 219k tokenów na serię „File does not exist".

Dlatego `Grep`/`Glob` służą do **celowanego** szukania (znajdź plik taska, sprawdź, czy symbol
istnieje). Szerokie przeczesywanie repo nadal deleguj do Explore — ale delegowanie ma być
decyzją o koszcie, nie skutkiem braku narzędzia.

<a id="anl-006"></a>

### ANL-006 — preflight stanu drzewa przed rozpisaniem jednostek pracy

Dla każdej planowanej jednostki potwierdź grepem na KONKRETNYM pliku, że wzorzec, który każesz
zmigrować, faktycznie tam jeszcze jest. Znalezione „już zrobione" odnotuj w artefakcie jako
`status: already-done` z dowodem (hash commita albo linia z `git status`) — i **nie twórz dla
niej jednostki**.

Dlaczego to jest w bramce, a nie w dobrych chęciach: w przebiegu `wf_23029d51-3a2`
(juz-ide-api-2, 2026-08-14) dwie z sześciu jednostek pracy odkryły dopiero po pełnym rozruchu
drogiego agenta, że zmiany są już w drzewie („Both migrations were found already implemented
as uncommitted", „the OQ6 premise is stale"). Każde takie odkrycie kosztuje pełny kontekst
implementera — kilka dolarów za powtórzenie `git status`, którego nikt nie zrobił.

<a id="anl-009"></a>

### ANL-009 — nazwa kolekcji RAG NIGDY nie jest konstruowana z nazwy katalogu

Bliźniacze checkouty tego samego repo współdzielą JEDNĄ kolekcję (juz-ide-api-1..4 →
`code_juz_ide_api`; zgadnięte `code_juz_ide_api_2` = pusty RAG, incydent 2026-08-14).
Deleguując do subagenta wstrzykuj **literalną** wartość do promptu, nie instrukcję „weź
z runtime.yml". Źródłem jest `project.yml → knowledge_collection`, zmaterializowane do
`runtime.yml → knowledge.collection`; osobny `knowledge.json` był drugim configiem obok
runtime i został zmigrowany.

<a id="anl-012"></a>

### ANL-012 — indeks decyzji budowany skryptem, nie agentem

`node <claude-patterns>/scripts/index-decisions.mjs <projekt>` → wynik ląduje
w `.claude/config/decisions-index.json` (regenerowany za każdym razem; ADR-y powstają między
setupami, więc cache byłby kłamstwem). Skrypt filtruje po statusie i `adr_exclude`
z `params."decision-registry"`, więc do panelu wchodzi kilka wpisów, a nie cały katalog
(juz-ide: 123 pliki → ~120 aktywnych → kilka trafnych).

<a id="anl-013"></a>

### ANL-013 — `needs_scope_check: true` znaczy „częściowo", nie „nieaktualne"

Taki wpis **nadal obowiązuje**, a pole `scope` niesie zdanie mówiące, co dokładnie padło,
a co nie (np. ADR-0076: „uchylony jest wyłącznie fixed cap 5 km; 25 km² i guardrail 15 km
obowiązują dalej"). **Cytuj `scope` zamiast otwierać plik** — po to tam jest. Gdy `scope`
milczy o Twoim parametrze, sprawdzasz go wg `lookup_order`: kod i `BUSINESS_RULES.yaml` przed
nagłówkiem ADR, nigdy odwrotnie.

<a id="anl-014"></a><a id="anl-015"></a><a id="anl-016"></a>

### ANL-014 / ANL-015 / ANL-016 — czego indeks decyzji NIE rozstrzyga

- `source: frontmatter` = status pochodzi ze strukturalnych metadanych pliku (`status`,
  `superseded_by`, `supersedes`, `scope`); `source: proza` = odczytany z nagłówka i jest
  mniej pewny.
- `problems.duplicate_ids` — jeden numer, dwa pliki (w juz-ide 13 takich par). Cytując ADR
  podawaj ścieżkę pliku, nie sam numer.
- `problems.missing_status` — brak czytelnego statusu ≠ nieaktualny; te wpisy wchodzą jako
  aktywne i wymagają ostrożności.

<a id="anl-017"></a>

### ANL-017 — `decision-gate` dostaje `brief[]`, nie surowy indeks

Stage nie dostaje surowego pliku ani całej tablicy `entries[]` (98 KB przy 150 aktywnych
decyzjach w juz-ide — to właśnie ten budżet miał chronić). Do jego promptu idzie:

- `brief[]` — jedna linia na wpis (kind/id/status/tagi/streszczenie do 200 znaków), pole
  istnieje w indeksie dokładnie po to (`index-decisions.mjs`, komentarz przy `brief:`); to jest
  pierwszy przebieg — „czy COKOLWIEK tu dotyczy taska".
- `entries[]` **przefiltrowane do `needs_scope_check: true`** (zwykle kilkanaście z kilkuset)
  — to jedyne wpisy, gdzie `scope` faktycznie trzeba zacytować; resztę `entries` pomiń, `brief`
  już je pokrył.
- `problems` w całości (małe, strukturalne) i `open_questions`.

Stage odpowiada na jedno pytanie: czy task opiera się na parametrze czekającym na decyzję albo
uchylonym. Trafienie → **blokujące** `open_question` (`answer: null`) w artefakcie, cytujące
wpis i miejsce sporu. Stage jest tani (haiku, czyta JSON tej wielkości, nie cały indeks), nie
ma `when:` i nie wolno go pomijać.

<a id="anl-019"></a>

### ANL-019 — `corpus:` nie jest wklejany do promptu

13 dokumentów kanonu juz-ide to ~284 KB. Zamiast tego: wąski Explore/haiku przeszukuje `corpus`
pod kątem taska i zwraca CYTATY z namiarami (plik + sekcja), a cytaty wędrują do slotu.
`inject:` to osobna półka — krótkie fragmenty (np. apex §5) wklejane wprost, zawsze.

<a id="anl-020"></a>

### ANL-020 — dopasowanie `when:` idzie po podłańcuchu, w obie strony

**Zawsze wypisz, KTÓRE słowo trafiło**: `threat-model ← "auth"`. Dopasowanie idzie po
podłańcuchu, więc `auth` łapie `author` i `geographic-auth`, `list` łapie `specjalista`,
a `pin` łapie `mapping`. Gdy trafione słowo jest fragmentem innego wyrazu i sens slotu do taska
nie pasuje — **powiedz to i pomiń slot**, zamiast odpalać panel „bo regex".

Odwrotny błąd jest groźniejszy: `cross_context` z podkreśleniem NIE łapie „cross-context"
pisanego z dywizem. Brak trafienia nie jest dowodem, że tematu nie ma — gdy widzisz w tasku
ryzyko, którego żaden `when:` nie złapał, potraktuj to jak trafienie i zgłoś lukę w regexie
bloku.

<a id="anl-024"></a>

### ANL-024 — do slotu idzie STRESZCZENIE poprzednich stage'ów, nigdy surowy output

Ustalenia + otwarte pytania, kilkanaście linii — NIGDY pełny surowy output (anty-pattern
kwadratowego wzrostu; incydent 2026-07-04, ta sama klasa co WL6).

<a id="anl-026"></a>

### ANL-026 — syntezę robi `tech-lead` z modelem opus

Jego frontmatter mówi `haiku`, co jest właściwe dla przeglądów stanu projektu, ale nie dla
ostatniego osądu w analizie: to tutaj wejście z Opusa i Sonneta zamienia się w `decisions[]`
i listę pytań, na których stanie implementacja. Fallback: gdy środowisko przerywa liście,
syntezę robi główny agent (ma pełen kontekst) — odnotuj w artefakcie.

<a id="anl-027"></a>

### ANL-027 — weryfikacja nazwanych symboli PRZED zapisem artefaktu

Każdą funkcję/klasę/ścieżkę wymienioną w checklistach/decisions zgrepuj (wąski Explore, jawny
limit tool-calli). Nie istnieje → jawnie oznacz „TO TRZEBA STWORZYĆ" (incydent
TS-SEC-ONBEHALF-001: aspiracyjna nazwa czytana jako fakt = implementer w pętli do klifu
maxTurns).

<a id="anl-029"></a><a id="anl-030"></a><a id="anl-031"></a>

### ANL-029 / ANL-030 / ANL-031 — dwa rejestry: co czyta człowiek, co czytają agenci

Artefakt ma dwóch odbiorców o rozbieżnych potrzebach. Agent chce namiaru bez szukania: nazwy
klasy, ścieżki, numeru ADR. Człowiek zatwierdzający analizę chce wiedzieć, o co go pytasz —
te same namiary są dla niego kosztem, nie pomocą. Jeden tekst nie obsłuży obu, więc pola są dwa:

| pole | odbiorca | reguła |
|---|---|---|
| `open_questions[].ask` | człowiek | pytanie, na które da się odpowiedzieć bez otwierania repo |
| `open_questions[].q` | agent, audyt | pełny kontekst techniczny |
| `decisions[].means` | człowiek | co ta decyzja zmienia dla produktu albo użytkownika |
| `decisions[].choice` / `rationale` | agent | wybór i jego techniczne uzasadnienie |

Test, czy `ask` jest napisane dobrze: **czy człowiek, który nie zna tego kodu, odpowie na nie
sam?** Jeśli musi najpierw zapytać, co znaczy nazwa w pytaniu, to nie jest jeszcze `ask` — to
skrócone `q`.

```yaml
# ŹLE — q przebrane za ask
ask: "Czy zamknąć B9/B10 w rejestrze wpisem BDR, skoro ADR-0094 i AuthorTierClassifierDomainService już to rozstrzygają?"

# DOBRZE — decyzja ta sama, próg wejścia żaden
ask: >-
  Stara decyzja z rejestru jest już rozwiązana w kodzie, ale formalnie wisi jako
  otwarta. Zamykamy ją teraz, czy zostawiamy do osobnego przeglądu?
```

Nie chowaj w `ask` konsekwencji wyboru. „Szybciej znaczy drożej", „to opóźni wydanie o tydzień",
„bez tego nie wyjdziemy poza jeden kraj" — to jest ta część, dla której człowiek w ogóle czyta
pytanie.

<a id="anl-033"></a>

### ANL-033 — sekcje artefaktu są warunkowe, nie stałe

Artefakt dostaje sekcję tylko od slotu, który faktycznie wszedł. Projekt bez bloku `governance`
(np. biblioteka) nie ma widzieć nagłówka „Zgodność ze strategią: n/d" w każdej analizie.
Gdy weszły sloty governance, dopisz do frontmattera:

```yaml
governance:
  strategy_fit: { verdict: wzmacnia-rdzeń | obok-rdzenia | sprzeczne, cytaty: ["apex §5: …"] }
  decision_gate: { blocking: false, sprawdzone: [BDR-004, ADR-0106] }
  data_classification: { poziom: wewnętrzne | publiczne, uzasadnienie: "…" }
```

<a id="orc-061"></a>
### ORC-061 — kontrakt `retrieve_code` w promptach subagentów (2026-09-07, TASK-RAG-004 R1 / K79)

Indexer zapisywał `source` jako ścieżkę absolutną z drzewa `juz-ide-api-1`; agent w api-2 dostawał
trafienie, które fizycznie istniało i czytało się czysto — tylko z innego brancha. Od K79 `source`
jest względne wobec korzenia repo, indeks powstaje z `origin/develop` (`indexedSha`), a odpowiedź
niesie `evidence` (12 linii) zamiast pełnego `text`. Prompt subagenta musi to mówić wprost, bo opis
narzędzia wypada z kontekstu długo przed pierwszym wywołaniem; dlatego kontrakt jest też polem
`_contract` w samej odpowiedzi.

<a id="anl-035"></a>
### ANL-035 — to samo dla panelu `/analyze` (2026-09-07)

Ta sama zmiana co ORC-061, dla wywołań RAG w kroku 0.b. Panel advisory nie pisze kodu, więc ryzyko
jest mniejsze, ale cytowanie `evidence` jako „stanu kodu" w artefakcie analizy wprowadza w błąd
człowieka zatwierdzającego analizę.

<a id="anl-036"></a>
### ANL-036 — warstwy, których task nie dotyka, deklaruje analiza, nie odkrywa silnik (2026-09-14)

juz-ide-api-2, task infrastrukturalny: implementer warstwy `domain` trzy razy oddał zero zmian —
słusznie, task nie dotykał modelu domenowego, co potwierdzała zatwierdzona decyzja w analizie.
Silnik widział tylko „bramka «kod istnieje» nie przeszła" i po `max_attempts` eskalował; ten sam
obraz daje zwykle warstwa `application`, gdy robota jest wyłącznie w infrastrukturze. Dwa poziomy
naprawy, bo to dwa różne momenty:

1. **Analiza wie wcześniej.** Jednostki pracy są rozpisane w `/analyze`, więc tam wiadomo, które
   `dirs` z `runtime.yml` nikt nie ruszy. Nowe pole `layers_skip: [{ id, reason }]` w artefakcie;
   `orchestrate-prepare.mjs` mapuje je na `skip` warstwy (obok `layers_done`, które jest checkpointem
   wznowienia — inna klasa: tam praca była, tu jej nie będzie) i odrzuca wpis bez `reason` albo
   z nieznanym `id`. Powód jest obowiązkowy, bo pominięcie bez uzasadnienia wygląda identycznie
   jak niewykonana praca — a o to właśnie chodzi, żeby dało się je odróżnić.
2. **Siatka w silniku.** Gdy analiza tego nie przewidziała, implementer może oddać
   `changed_files: []` + `no_changes_reason`. To nie wynik, tylko twierdzenie: weryfikator warstwy
   dostaje tryb `verify-noop` (spec + analiza + uzasadnienie, bez sondy) i albo potwierdza (GO bez
   plików, `note: no-op`), albo obala listą konkretnych braków, która wraca do implementera jako
   poprawka. Pusta lista bez powodu nadal jest niewykonaną pracą.

Ten sam przebieg ujawnił drugi błąd: decyzje D1–D7 docierały do promptów puste, bo artefakt
nazwał pole `decision`, a prompty czytają `choice`. Bramka prepare przepuszczała to bez słowa.
Teraz każda decyzja bez `choice` (albo z aliasem `decision`/`answer`/`option`) zatrzymuje start
z komunikatem, które pole przemianować — zatwierdzona decyzja, której nikt nie stosuje, jest gorsza
niż brak decyzji, bo człowiek myśli, że ją wyegzekwowano.

<a id="anl-037"></a>
### ANL-037 — warstwa dotknięta częściowo to zawężenie (`layers_scope`), nie pominięcie (2026-09-18)

juz-ide-api-2, TS-ERROR-MAPPER-001: zatwierdzona analiza wpisała warstwę `application` do
`layers_skip` z powodem „pominięta TYLKO dla 7 z 8 kontekstów — NIE dotyczy
neighborhood-economy/shares; implementer dostaje zawężony zakres". Autor artefaktu wyraził w
polu binarnym coś, czego pole nie umie przenieść. `orchestrate-prepare.mjs` dopasowuje skip po
samym `id`, więc `application` dostało `skip: true`, a szablon Workflow (`layerPlan`, `if (l.skip)
return { run: false }`) nie odpaliłby implementera wcale. W tym „jednym z ośmiu" kontekstów siedziała
naprawa żywego wycieku na produkcji (D6: poziom zaufania, próg dostępu nierezydenta i promień GPS
w treści 422, `create-local-share/handler.ts:1269`). Silnik zgubiłby ją po cichu, z zielonym
raportem — dokładnie to, co ANL-036 miało odróżniać od niewykonanej pracy. Ten sam błąd był w
wpisie dla `domain` („Wyjątek: `error-codes.ts` może dostać nowe wpisy"). Człowiek złapał to
czytając wyjście prepare przed startem, nie silnik.

Dwie rzeczy, bo to dwa różne braki:

1. **Brak formy na „częściowo".** Nowe pole `layers_scope: [{ id, dirs, reason }]`: warstwa
   WCHODZI, ale `dirs` (katalogi albo pojedyncze pliki, ścieżki od korzenia repo) zastępują
   `dirs` z `runtime.yml` wszędzie, gdzie zakres ma znaczenie — blok `ZAKRES WARSTWY` w prompcie
   implementera i weryfikatora (z powodem i zakazem dotykania reszty warstwy „nawet jeśli widzisz
   tam ten sam problem"), pathspec sondy (`:(glob)**/<dir>/**`, dla pliku bez `/**`) oraz
   `layerTouches` przy atrybucji zmienionych plików. Trzecia klasa obok `layers_done` (checkpoint)
   i `layers_skip` (praca nie istnieje). Prepare odrzuca wpis bez `dirs`, bez `reason`, z nieznanym
   `id` oraz warstwę wpisaną w obie listy naraz.
2. **Bramka na złe pole.** Powód w `layers_skip` zawierający „wyjątek"/„z wyjątkiem", „oprócz",
   „zawężon-", „częściow-", „N z M", „pominięta tylko", „tylko dla", „nie jest (już) całkowicie",
   `except`/`partial`/`only for` zatrzymuje start z komunikatem, do jakiego pola przenieść wpis.
   Lista jest celowo wąska: gołe „tylko" i „nie dotyczy" siedzą w legalnych powodach („zmiany
   tylko w infrastrukturze", „task nie dotyczy domeny") — zbyt szeroka reguła wypchnęłaby autorów
   w ogólnikowe powody, czyli w gorszy wzorzec (ta sama pułapka co WL1 w `workflow-lint`). Powód
   wymieniający ścieżkę w kodzie (`src/…`) daje tylko ostrzeżenie. Testowane dwukierunkowo: oba
   realne powody z artefaktu zatrzymują (trafienia „Wyjątek", „zawężon"), kanoniczny powód z
   szablonu przechodzi bez słowa.

Czego to NIE robi: nie rozstrzyga, gdzie kończy się „zawężenie", a zaczyna „osobna jednostka
pracy" (`units[]`, seam Ralphinho). Dziś `units: []` i jeden unit na task; gdy units wejdą, scope per
unit będzie naturalniejszy niż scope per warstwa — to wtedy do przemyślenia, nie teraz.

<a id="orc-076"></a>

### ORC-076 — bramka końcowa dostaje ten sam filtr self-admission co warstwy (2026-09-29)

`decideVerdict()` (pętla warstwy) od ORC-071 ufa słowu weryfikatora: pozycja `unverified_scope`,
która sama się przyznaje do bycia poza zakresem („poza zakresem", „out of scope", „owned by X
unit"), jest odrzucana z `ownUnverified` niezależnie od dopasowania ścieżki. Bramka końcowa
(`orchestrate.template.mjs`, sekcja „6. bramka końcowa") NIE WOŁA `decideVerdict()` w ogóle —
od 2026-09-26 (ORC-069) miała własny, osobny blok, który robił wyłącznie
`unverified_scope.filter(Boolean)`. Żadna z trzech poprawek zrobionych na `decideVerdict()` w
tym samym tygodniu (ORC-070 filtr cudzej warstwy, ORC-071 self-admission, ORC-074 `reverify`
zamiast `fix`) nie dotarła na final gate — biegał dalej w najbardziej naiwnej wersji reguły,
sprzed wszystkich trzech rund twardnienia, które okazały się konieczne na poziomie warstw.

Ujawnione 2026-09-28 (juz-ide-mobile-app DESIGN-SYSTEM-009, `DEV-orc-069-presentation.md`):
`flutter-security-verifier` dał czysty werdykt na wszystkich dotkniętych powierzchniach, ale
uczciwie przyznał, że nie przeczytał w całości 7 plików niezmienionych (sprawdzonych tylko
grepem) i celowo pominął 8 plików testowych (nie trafiają do binarki release). Final gate —
jednorazowy, bez retry — wymusił `NO_GO`; jedyna droga naprawy była ręczna interwencja
człowieka. Audyt historii tego repo (2026-09-29) potwierdził, że WSZYSTKIE zaobserwowane
odnowienia `DEV-orc-069` w `_inbox` (6 w 3 dni, 5 projektów: ai-os-bot, grant-flow, juz-ide-api,
feature-flags, marketing-hub) trafiają w final gate, zero w sam retry-loop warstw — spójne z
tym, że filtry 070/071/074 tam nie działają.

`SELF_ADMITS_OUT_OF_SCOPE` i nowa funkcja `filterSelfAdmittedOutOfScope()` przeniesione na
poziom modułu (jedno źródło zamiast dwóch rozjeżdżających się kopii tej samej reguły). Blok
final gate filtruje `unverified_scope` tym samym filtrem PRZED sprawdzeniem, czy `GO` jest
czysty. Filtr ORC-070 (dopasowanie ścieżkowe do dirs innej warstwy) świadomie NIE przeniesiony
na final gate — final gate ocenia CAŁOŚĆ zmiany (wszystkie warstwy naraz), więc pojęcie „cudza
warstwa" nie ma tam tego samego znaczenia; zaobserwowany przypadek był czystym self-admission,
nie cross-layer. Egzekwuje `orchestrate.template.mjs` (moduł-scope `SELF_ADMITS_OUT_OF_SCOPE`/
`filterSelfAdmittedOutOfScope`, blok bramki końcowej); eval:
`final-gate-unverified-scope-self-admission` w `tests/flow-evals/orchestrate-script/run.js`.
Zadanie: `docs/tasks/TASK-ORCH-FINALGATE-SELFADMIT-001.md`.

<a id="orc-077"></a>

### ORC-077 — etykieta sondy musi nieść numer próby, inaczej cache zamraża pierwszy wynik (2026-09-29)

Sondy `diff-probe`, `diff-gate` i `checks` w pętli warstwy dostawały etykietę zbudowaną
wyłącznie z `layer.id` (np. `layer.id + '-diff-gate'`), niezależną od numeru próby. Ich prompty
(`buildDiffProbePrompt(a.baseSha)`, `buildTreeProbePrompt(a.baseSha)`, `buildProbePrompt(a,
layer)`) też nie zależą od próby — zależą tylko od `layer`/`baseSha`, stałych w obrębie retry tej
samej warstwy. Para (etykieta, prompt) była więc IDENTYCZNA na każdej próbie, a cache silnika
Workflow (klucz: etykieta+prompt, mechanizm współdzielony z `resumeFromRunId`) zwracał wynik
PIERWSZEJ próby na zawsze — kolejne próby, nawet po realnej zmianie stanu repo (implementer
naprawił kod), dostawały ten sam zamrożony wynik sondy.

Ujawnione 2026-09-28 (grant-flow TS-SIM-001, run `wf_e7393e3a-315`, `DEV-orc-065.md`) —
zgłaszający zastosował ręczną łatkę (numer próby w etykiecie) i potwierdził ją przejściem przez
`workflow-lint`. Przeniesione tutaj do kanonicznego źródła. Etykiety `-diff-probe`, `-diff-gate`,
`-checks` dostają teraz sufiks `-' + attempt`. `-impl`/`-verify`/`-verify-noop` NIE wymagały tej
zmiany — ich prompty już zawierają treść zależną od próby (numer próby, `violations`, wynik
sondy), więc para (etykieta, prompt) i tak różniła się między próbami.

**Osobna, potwierdzona tylko częściowo obserwacja z tego samego dnia** (grant-flow TS-SIM-001,
run `wf_2196b7e0-b44`, `DEV-halt-warstwa-testing-testing-2-swiezy-run-z-rzedu-kon.md`): diff-gate
zgłosił „zero zmian" DWA ŚWIEŻE (nie-retry) przebiegi z rzędu mimo potwierdzonej mtime+git-status
realnej zmiany już-śledzonego pliku. To NIE jest ten sam mechanizm (różne `run_id`, więc różny
cache) — zgłaszający podejrzewa niedeterminizm samej sondy (Haiku, budżet 5 tur), bez wskazania
linii kodu. Pozostaje otwarte, do zbadania osobno, gdy się powtórzy z twardszą diagnozą. Egzekwuje
`orchestrate.template.mjs` (etykiety `-diff-probe-'+attempt`, `-diff-gate-'+attempt`,
`-checks-'+attempt`); weryfikacja: `canonical-script-passes-workflow-lint` w `tests/flow-evals/
orchestrate-script/run.js` (funkcjonalny eval cache'u silnika Workflow poza zakresem tego pliku —
zero LLM, zero uruchomienia Workflow). Zadanie: `docs/tasks/TASK-ORCH-PROBE-CACHE-STALE-001.md`.

<a id="orc-078"></a>

### ORC-078 — pathspec sondy testów dostaje wariant bez `lib/` dla stacków Flutter/Dart (2026-09-29)

Flutter/Dart rozdziela drzewo `lib/` i `test/` BEZ wspólnego segmentu (`lib/core/design/x.dart`
→ `test/core/design/x_test.dart`, NIE `test/lib/core/design/...`). `dirs` warstwy podane jako
pełna ścieżka od korzenia repo z segmentem `lib/` (naturalne dla `--overrides` w tym stacku)
budowały pathspec `:(glob)**/lib/core/design/**`, który nigdy nie trafia w drzewo testów —
`newTestBlocks` liczyło 0 niezależnie od realnej, poprawnej zawartości testów na dysku.

Ujawnione 2026-09-28 (juz-ide-mobile-app DESIGN-SYSTEM-009, `DEV-orc-035-presentation.md`):
fałszywy `ESCALATE_AND_HALT` mimo 5 plików testowych i ~21 bloków `test`/`testWidgets`
faktycznie napisanych i zielonych (potwierdzone ręcznym `flutter test`). `globScoped` w
`buildProbePrompt()` dostaje teraz, dla każdego `dir` zaczynającego się od `lib/`, DODATKOWY
wariant pathspecu bez tego segmentu — obok oryginalnego, nie zamiast (żeby nie zawęzić
dopasowania dla stacków, gdzie `test/` faktycznie lustrzanie odwzorowuje `lib/` z segmentem).
Egzekwuje `orchestrate.template.mjs` (`buildProbePrompt`, `globScoped`); eval:
`probe-prompt-flutter-lib-path-variant` w `tests/flow-evals/orchestrate-script/run.js`. Zadanie:
`docs/tasks/TASK-ORCH-PROBE-FLUTTER-LIBPATH-001.md`.

<a id="orc-079"></a>

### ORC-079 — plik analizy/task tego przebiegu wykluczony strukturalnie, nie po prozie (2026-09-29)

ORC-076 (wyżej) ufa słowu weryfikatora — filtruje `unverified_scope` po frazie self-admission
(„poza zakresem", „owned by X unit"). Kilka godzin po wdrożeniu, PIERWSZY realny przebieg z
tym filtrem na żywo (repo satelitarne symlinkuje `claude-patterns`, więc niecommitowana
poprawka działa natychmiast) pokazał lukę: ai-os-bot BOT-005a-tests, final gate NO_GO mimo
zielonych bramek deterministycznych — `unverified_scope` wymieniał m.in. „sam plik analizy"
tego przebiegu, ale bez ŻADNEJ frazy z `SELF_ADMITS_OUT_OF_SCOPE`, więc ORC-076 go nie
złapał. Zgłoszenie wprost: „ORC-072/ORC-076 nie pozwoliły ich zaadiudykować, bo bramka nie ma
jak uznać ich za poza zakresem" — ten sam kształt incydentu co ORC-072 (2026-09-27: 2 z 4
eskalacji na final-gate dotyczyły pozycji trywialnych — README, .gitignore, sam plik analizy).

Rozszerzanie regexu o kolejny wariant frazy (wzorem ORC-071) jest kruche — zależy od tego, JAK
konkretny weryfikator akurat to nazwie. Plik analizy i plik taska SAMEGO PRZEBIEGU są jednak
strukturalnie znane z `a.task.analysisFile`/`a.task.taskFile` (ten sam obiekt, którego
`buildImplPrompt`/`buildFinalGatePrompt` już używają) — nowa `filterOwnTaskArtifacts()` odrzuca
pozycję `unverified_scope`, której treść zawiera ścieżkę jednego z tych dwóch plików, PRZED
filtrem self-admission. Nie rozwiązuje to pozostałych dwóch pozycji z tego samego zgłoszenia
(„D4 po commicie", „pełny vitest") — to nie są ścieżki plików, tylko opis kroków procesu, a
blankietowe wykluczanie fraz „po commicie"/„pełny X" ryzykowałoby ukrycie realnej luki (D4 może
być realną, niedokończoną decyzją do zweryfikowania). Pozostawione świadomie jako otwarte —
kandydat na rozszerzenie kanału `a.task.decisions`/ORC-072 (człowiek jawnie adiudykuje D4 jako
rozstrzygnięte), nie na kolejny automatyczny filtr. Egzekwuje `orchestrate.template.mjs`
(`filterOwnTaskArtifacts`, blok bramki końcowej); eval:
`final-gate-filters-own-task-artifacts-by-path` w `tests/flow-evals/orchestrate-script/run.js`.

<a id="orc-080"></a>

### ORC-080 — filtr mechaniczny dla pozycji już adjudykowanych przez `decisions[]` (2026-09-29)

ORC-072 renderuje `a.task.decisions` w promptcie bramki końcowej i INSTRUUJE weryfikatora, że
pozycja jawnie zaadresowana decyzją człowieka nie jest luką. To instrukcja promptu, nie
mechanizm — ta sama kategoria problemu, którą ORC-071 już raz nazwał: „instrukcja promptu nie
jest wiążąca dla LLM". Potwierdzone 2026-09-29: ai-os-bot BOT-005a-tests, DRUGI przebieg tego
samego taska (`DEV-orc-069.md` reopen #6) — task miał `decisions: [D7]` jawnie adjudykujące
pozycję, a final gate i tak zgłosił TĘ SAMĄ pozycję jako `unverified_scope`, plus dorzucił
nową. Weryfikator dostał tekst decyzji w prompcie i mimo to jej „nie zastosował" (albo
zastosował niekonsekwentnie między próbami/przebiegami tego samego taska).

Zamiast kolejnego wzmocnienia tekstu instrukcji (ta droga już raz się wyczerpała przy ORC-071),
filtr mechaniczny: `filterAdjudicatedByDecision()` odrzuca pozycję `unverified_scope`, której
treść WYMIENIA `id` którejś z `a.task.decisions[]` (np. „D7"), niezależnie od tego, czy
weryfikator „zrozumiał" decyzję — sam fakt przywołania jej numeru wystarcza, bo to człowiek już
zdecydował, że ta pozycja jest rozstrzygnięta. Dopasowanie z granicą słowa (`\bD7\b`), żeby
„D71" nie trafiło w „D7". Stosowany PRZED `filterSelfAdmittedOutOfScope`/
`filterOwnTaskArtifacts` w tym samym łańcuchu filtrów final gate.

**Osobny, NIE zaadresowany dziś problem z tego samego reopenu** (marketing-hub TS-MH-009,
`DEV-orc-069-final-gate.md`): `unverified_scope` wymieniał „karty/README/render-with-refine" —
pozycje dokumentacyjne bez frazy self-admission, bez ścieżki własnego pliku analizy/task, i bez
odwołania do żadnej decyzji. Świadomie NIE zbudowano tu kolejnego filtra — bez konkretnych
ścieżek plików (jak przy ORC-079) każda heurystyka „to wygląda na dokumentację" byłaby
zgadywaniem, dokładnie tym, przed czym ostrzega `docs/CONTRIBUTING.md`. Do zebrania więcej
dowodów, jeśli się powtórzy z konkretnymi ścieżkami. Egzekwuje `orchestrate.template.mjs`
(`filterAdjudicatedByDecision`, blok bramki końcowej); eval:
`final-gate-filters-items-adjudicated-by-decision-id` w `tests/flow-evals/orchestrate-script/
run.js`.

<a id="anl-038"></a>
### ANL-038 — jednostki, pliki towarzyszące i fałszywe trafienia wzorców mają swoje pola (2026-09-24)

marketing-hub, TS-MH-005. Analiza wyraziła trzy rzeczy, których silnik nie umiał przenieść.
Podział infrastruktury na cztery obszary poszedł do `units`, którego nikt nie czytał (ORC-064).
Zawężenie do `role-permissions.map.ts` zostawiło `role-permissions.adapter.spec.ts` poza zakresem,
a `pnpm -r run test` zatrzymywał się na nim w każdej kolejnej warstwie; to samo z `env.schema.ts`
i nową wymaganą zmienną w setupie testów L2/L3. Fałszywe trafienia keywordów (TCC na „confirm",
wzorce web na „dashboard") analiza opisała w komentarzu, a karty i tak weszły do promptów.

Od teraz: `units[]` ma formę i bramkę. Test w tym samym katalogu i z tym samym rdzeniem nazwy co
plik z zakresu należy do zakresu automatycznie. Resztę plików towarzyszących (setup testów,
`.env.example`, compose) analiza dopisuje do `dirs` jednostki albo `layers_scope`, bo tego silnik
nie zgadnie. `patterns_exclude: [<ścieżka wzorca>]` usuwa wzorzec z doboru, a wpis, który niczego
nie wykluczył, daje ostrzeżenie (literówka).

<a id="orc-081"></a>

### ORC-081 — prompt weryfikatora nazywa wynik sondy obiektem `checks` (2026-09-29)

`code-quality-verifier` (krok 7 kontekstowej dyscypliny) każe traktować jako fakt „obiekt
`checks` z wynikiem typecheck i testów" i nie uruchamiać ich ponownie. `buildVerifierPrompt`
podawał ten sam wynik pod nagłówkiem „FAKTY Z SONDY" z polami `typecheck:`/`testy:`, bez słowa
`checks`. Weryfikator nie rozpoznawał dopasowania i zgłaszał „brak obiektu checks w prompcie"
(grant-flow TS-SIM-002A, `application:app-cqrs`, run `wf_fb11e116-996`, `DEV-orc-069-application-app-cqrs`).
Zamiast wykorzystać wynik sondy, wydawał budżet tur na własne grepy, co kończyło się
GO z `unverified_scope` (ORC-069) i halt po 3 próbach.

Poprawka: blok faktów nazywa się wprost obiektem `checks` i używa pól `checks.typecheck`,
`checks.tests`, `checks.newTestBlocks`, czyli nazw z instrukcji agenta. Egzekwuje
`orchestrate.template.mjs` (`buildVerifierPrompt`). Nie dotyczy weryfikatorów, których definicja
nie mówi o `checks` (nie szkodzi im). Nie sprawdza, czy to jedyna przyczyna halt na app-cqrs:
drugie wystąpienie (`wf_d5c12ecc-e1d`) nie mówi nic o `checks`, więc zostaje do obserwacji.

<a id="orc-082"></a>

### ORC-082 — czerwony typecheck tylko w późniejszych warstwach jest odroczony (2026-09-30)

juz-ide-api-1, trzy zgłoszenia ORC-062 w dwóch taskach (TS-REP-DISCLOSURE-POLICY-001:
`domain:tier-projector` `wf_1c64744d-058`, `application` `wf_169047bf-a4d`;
TS-REP-PROJECTION-FRESHNESS-001: `domain` `wf_0dfc8c0b-427`). `domain` i `application` mają
`checks: ["typecheck"]` (dodane 2026-09-24, żeby ich własna czerwień wychodziła u nich, a nie
w infrastrukturze). Typecheck biegnie jednak na całym pakiecie: metoda dodana do portu
w domenie albo nowy argument konstruktora handlera czerwieni pliki `infrastructure/` i
`__tests__/`, czyli późniejszych warstw. Implementer słusznie zgłaszał „poza zakresem",
a ORC-062 zamieniał to w `BLOCKED_BY_PRIOR` i zatrzymywał przebieg na czerwieni, której ta
warstwa nie mogła naprawić. Każdy task zmieniający kontrakt międzywarstwowy trafiał na to z
definicji.

Odrzucone: zdjęcie `typecheck` z `domain`/`application` (sugestia ze zgłoszenia), bo wraca
problem z TS-MH-005, czyli własna czerwień domeny wychodząca dopiero w infrastrukturze.
Odrzucone: instrukcja w prompcie sondy „zignoruj cudzą czerwień", bo to ta sama kategoria, co
przy ORC-071/080 (instrukcja promptu nie jest wiążąca dla LLM, a decyzja o odroczeniu nie może
zależeć od jego oceny).

Mechanizm: `typecheckRedIsLaterLayers()` (CORE). Z `probe.tail` wyciąga ścieżki błędów TS
(`plik(l,k): error TSxxxx`). Czerwień jest odroczona (`probe.typecheck = 'deferred'`), gdy:
każdy błąd ma ścieżkę (liczba sparsowanych = liczba wystąpień `error TS`), żaden nie leży w
dirs tej warstwy ani wcześniejszych, każdy leży w dirs którejś późniejszej warstwy z
niepustymi dirs, a testy nie są czerwone. Błąd bez ścieżki (np. TS18003), nieparsowalny ogon i
ostatnia warstwa nie odraczają nic. Odroczoną czerwień domyka sonda następnej warstwy
(`infrastructure` ma typecheck) i bramka końcowa. Weryfikator dostaje w `checks` notkę, że
czerwień jest odroczona i nie jest naruszeniem tej warstwy.

Znane ograniczenie: sonda zwraca własny zakres w całości (grep po dirs), a przy braku trafień
ostatnie 40 linii logu. Przy >40 błędach w późniejszych warstwach ogon może nie zawierać
wszystkich, ale wtedy własne błędy i tak są już wyłapane grepem, a ewentualny błąd wcześniejszej
warstwy poza ogonem łapie bramka końcowa. Eval: `typecheck-red-only-in-later-layers-is-deferred`
w `tests/flow-evals/orchestrate-script/run.js`.

**Uzupełnienie (2026-10-01):** to samo zgłoszenie `domain` w TS-REP-PROJECTION-FRESHNESS-001
(`wf_0dfc8c0b-427`) pokazało, że parser nie dostawał surowych linii: sonda (haiku) zwróciła w
`tail` własne streszczenie („Missing method `findSubjectsForProjectionPage` in infrastructure
implementation…"), `typecheckErrorPaths` znalazł 0 błędów i wyjątek słusznie nie zadziałał
(nieparsowalny ogon). Grep po własnym `dirs` nic nie daje, gdy czerwień jest poza zakresem, więc
agent schodził na fallback „ostatnie 40 linii" i go parafrazował. Poprawka: osobne pole sondy
`tsErrors` z żądaniem dosłownego `grep -E 'error TS[0-9]+' <log> | head -60`; parser czyta
`tsErrors`, a `tail` tylko gdy go brak. Instrukcja promptu dalej nie jest wiążąca, ale bezpiecznik
zostaje: bez `tsErrors` i bez parsowalnego `tail` czerwień nie jest odraczana. Eval:
`probe-prompt-requests-verbatim-ts-errors` oraz rozszerzony przypadek ORC-082.

<a id="orc-083"></a>

### ORC-083 — zgłaszamy odstępstwa maszyny, nie błędy kodu (2026-10-01)

juz-ide-api-1, TS-REP-PROJECTION-FRESHNESS-001, run `wf_b5a21301-91f`: bramka końcowa dała
NO_GO, bo kod miał realne błędy (UNION uuid/varchar w `findSubjectsForProjectionPage`, 2 testy
L2, czerwony spec schedulera, niewdrożone decyzje D9/D7/D8). Krok 5 (ORC-066) mówił „dla KAŻDEGO
`finalGate.verdict !== 'GO'` zgłoś", więc orchestrator zgłosił to do `_inbox` bez oceny, czy to
odstępstwo maszyny, a w `--reason` opisał treść błędów kodu (DEV-no_go-bramka-koncowa-no-go-union-
uuid-varchar). Sam to potem nazwał szumem. Zgłoszenie bez rozróżnienia zaśmieca inbox i obniża
sygnał prawdziwych odstępstw (ORC-069 i spółka).

Bramka jest mechaniczna, nie w prompcie: silnik tagi każde zatrzymanie polem `cause`.
`machine` = maszyna nie domknęła weryfikacji: brak wyniku weryfikatora/bramki, GO z
`unverified_scope` po wyczerpaniu prób albo wymuszone NO_GO bramki końcowej (ORC-069),
implementer bez wyniku, brak zmian w zakresie warstwy (bramka „kod istnieje"), pętla bez werdyktu.
`code` = kod ma błędy, weryfikator je wskazał: wyczerpane próby przy NO_GO, sonda na czerwono,
brak przyrostu testów, własne NO_GO bramki końcowej. `BLOCKED_BY_PRIOR` zostaje zgłaszany
(ORC-062 dotyczy kolejności warstw, czyli maszyny). Krok 5 zgłasza tylko `cause === 'machine'`
(brak pola = `machine`, żeby stary skrypt nie gubił zgłoszeń); `workflow_lint` i
`deviation_note` bez zmian, bo z definicji dotyczą maszyny. `cause` bramki końcowej nadpisujemy
po stronie silnika, nie ufamy polu z wyjścia LLM.

Nie rozstrzyga: sprzeczności werdyktu z uzasadnieniem (marketing-hub TS-MH-009: `NO_GO` przy
rationale „GO z warunkami") — mechanicznie nie do odróżnienia od realnego NO_GO, więc liczy się
jako `code`. Egzekwuje `orchestrate.template.mjs`; eval `decide-verdict-tags-cause-code-vs-machine`.

<a id="orc-084"></a>

### ORC-084 — luka warstwy nie zatrzymuje przebiegu (GO_WITH_GAPS) (2026-10-01)

Inbox 2026-10-01: 98 wystąpień, 43 wspomina `unverified_scope`, ORC-069 to największa pojedyncza
przyczyna (38 wystąpień/16 wpisów); tylko 11 z 43 zamknięto jawnie „ręcznie, zielone". Przykład:
TS-UI-003 (`web:web-bootstrap`, `wf_b5e7727d-cfe`) — weryfikator 3x GO, zero naruszeń, lista
nieprzeczytanych plików (AuthGate, RedirectToSignIn, specy, vitest.config.ts). `decideVerdict`
zamienił to w `ESCALATE_AND_HALT`: kolejne warstwy nie ruszyły, bramka końcowa się nie
uruchomiła, nic nie trafiło do stagingu, ~10 agentów/8 min na brak werdyktu o kodzie.

Zmiana (decyzja użytkownika 2026-10-01, dotyczy WARSTW; bramka końcowa zostaje surowa — ORC-069
na niej obowiązuje jak 2026-09-27/28):
- `decideVerdict` przy wyczerpaniu prób na GO+unverified_scope zwraca `gaps`.
- `layerGapsAcceptable()`: GO, zero `violations`, sonda ODPOWIEDZIAŁA i typecheck/testy nie są
  `fail` (pass|skipped|deferred) → warstwa kończy jako `GO_WITH_GAPS`, luki do `report.gaps`.
  Brak wyniku sondy = brak dowodu, że kod działa, więc halt jak dotąd. `haltsRun` nie zatrzymuje
  nowego statusu (lista dodatnia).
- Bramka końcowa dostaje „ZNANE LUKI WARSTW" w prompcie i próbuje je sprawdzić; pozycje
  `unverified_scope` pasujące do znanej luki (`filterKnownLayerGaps`) nie wymuszają NO_GO, trafiają
  do `finalGate.absorbed_gaps`.
- NO_GO bramki końcowej wymuszone WYŁĄCZNIE przez unverified_scope (zero własnych naruszeń) →
  `report.stageForReview`: pliki są staged z flagą „wymaga przeglądu" (krok 4). Staging niczego nie
  niszczy, a człowiek i tak robi review przed commitem.

Ryzyko: realny błąd w niesprawdzonym pliku wyjdzie dopiero w bramce końcowej albo na review.
Łagodzą to zielona sonda i zero naruszeń. Odwrócenie: usunąć wywołanie `layerGapsAcceptable` w
pętli warstwy. Haltem zostają: czerwona sonda, naruszenia po wyczerpaniu prób, brak wyniku
weryfikatora/sondy. Evale: `layer-gaps-acceptable-requires-green-probe-and-zero-violations`,
`final-gate-absorbs-known-layer-gaps`.

<a id="orc-085"></a>

### ORC-085 — ślepa sonda, budżet weryfikatora skalowany z liczbą plików, GO_WITH_GAPS wymaga dowodu (2026-10-01)

grant-flow TS-UI-003, warstwa `web:web-bootstrap` (diagnoza halt-diagnostician, 6 prób w 2
przebiegach): zatrzymanie nie wynikało z kodu, tylko z trzech przyczyn maszyny.

1. **Sonda nigdy nie działała.** `checks` warstwy `web` w bloku to nazwy skryptów ROOTA
   (`typecheck:web`, `lint:check:web`, `test:web`, `build:web`), a sonda biegnie w katalogu
   pakietu (`apps/web`), gdzie skrypty nazywają się `typecheck`, `lint:check`, `test`. Wszystkie
   checks wychodziły `skipped`, weryfikator dopisywał brak Phase-0 do niezweryfikowanego.
   Dotyczy każdego monorepo z sufiksowanymi nazwami (także upstream `blocks/monorepo-layers.yml`).
   Poprawka: `_chk` w sondzie — dokładna nazwa w pakiecie → nazwa bez OSTATNIEGO segmentu po „:" w pakiecie,
   tylko gdy ten segment równa się nazwie katalogu pakietu (`:web` dla `apps/web`) → dokładna nazwa w korzeniu repo.
   Osłona jest konieczna: pierwsza wersja odcinała wszystko po pierwszym „:" i `lint:check:web` schodziło do
   `lint` (z `--fix` w grant-flow), czyli sonda zmieniałaby pliki — wykryte testem na prawdziwym układzie grant-flow. Ślepa sonda (checks skonfigurowane, oba wyniki `skipped`)
   daje głośny log i `report.warnings`.
2. **Budżet weryfikatora.** Domyślne 15 wywołań na jednostkę ~37 plików: 5 z 6 prób GO z
   `unverified_scope`, a weryfikator kończył po 7-12 wywołaniach, bo prompt („czytaj tylko
   zmienione", „TWARDY LIMIT") czytał jako zachętę do pośpiechu. Teraz `scaledBudget()`: bez
   jawnego `budgets.<slot>` budżet = 15 + (pliki - 10), do 50, dla weryfikatora warstwy i bramki
   końcowej (jawny wpis wygrywa). Prompt dodaje: nie kończ przed wyczerpaniem budżetu, dopóki
   są nieprzeczytane pliki z listy; `unverified_scope` jest dla plików, na które budżetu zabrakło.
3. **Środowisko (poza silnikiem).** Brak `NPM_TOKEN` → `pnpm install` 404 na `@juz-ide/tokens`,
   próby 1-2 stracone. Silnik tego nie rozwiąże; do ustawienia przed startem przebiegu.

**Korekta ORC-084.** `layerGapsAcceptable` dopuszczał `skipped` jako „zieloną sondę", więc przy
ślepej sondzie (wszystko `skipped`) GO_WITH_GAPS przeszłoby bez żadnego dowodu, że kod działa —
dokładnie przypadek TS-UI-003. Teraz wymaga co najmniej jednego `pass` (typecheck albo testy).

Nie rozstrzyga: podziału zbyt dużej jednostki (decyzja analizy/`units[]`) — budżet skalowany do
50 pokrywa ~40 plików, powyżej warto dzielić. Eval: `probe-prompt-falls-back-from-suffixed-script-names`,
`scaled-budget-grows-with-files-and-explicit-wins`, rozszerzony `layer-gaps-acceptable-...`.

<a id="orc-086"></a>

### ORC-086 — zatrzymanie tylko dla poważnych problemów (2026-10-01)

Użytkownik: orchestratory przerywają w środku pracy i wklejają problemy z pytaniem „co dalej".
Przegląd wszystkich punktów zatrzymania (`ESCALATE_AND_HALT`/`BLOCKED_BY_PRIOR`/bramka końcowa):

Zostają haltem (poważne — kod lub brak dowodu): sonda czerwona po wyczerpaniu prób
(`code`), NO_GO weryfikatora z naruszeniami po wyczerpaniu prób (`code`), twierdzenie no-op
sprzeczne z zadaniem (`code`), brak przyrostu testów w warstwie testowej (`code`),
BLOCKED_BY_PRIOR (czerwień odziedziczona), GO_WITH_GAPS bez dowodu zielonej sondy (sonda ślepa
lub brak wyniku), brak zmian w zakresie warstwy po wszystkich próbach, NO_GO bramki końcowej z
własnymi naruszeniami.

Przestają zatrzymywać: GO z `unverified_scope` przy zielonej sondzie (ORC-084), oraz — nowość —
weryfikator dwukrotnie bez wyniku (padł/przekroczył budżet) przy zielonej sondzie i niepustym
zakresie warstwy: `GO_WITH_GAPS` z luką „cała warstwa niezweryfikowana" (`silentVerifierGapsAcceptable`,
wspólny helper `probeHasGreenEvidence` z ORC-084/085). Bez dowodu zielonej sondy nadal halt.

Zmiana drugiej połowy problemu — zachowania głównego agenta: do `commands/orchestrate.md`
dodana sekcja „Po zatrzymaniu": zatrzymanie `machine` → halt-diagnostician → mechaniczna
naprawa przez `--overrides` + jedno wznowienie, bez pytania; człowiek dopiero przy `code`,
zmianie kompozycji/analizy/sekretu albo gdy wznowienie już raz zawiodło; raport z jedną
rekomendacją zamiast listy wariantów. To nadal reguła „tylko prompt" (egzekwuje ją tylko uwaga
agenta), ale opiera się na polu `cause` ustawianym mechanicznie przez silnik (ORC-083).
Eval: `silent-verifier-gaps-require-green-probe-and-changed-files`.

<a id="orc-087"></a>

### ORC-087 — commity implementera, manifesty zależności, bramka końcowa bez wyniku (2026-10-01)

Cztery zgłoszenia z jednego dnia, trzy realne luki silnika:

1. **Commity mimo `STAGE_NOT_COMMIT`** (ai-os-bot BOT-023, 4 commity implementerów:
   d9e569e, d3d1d7f, 0c4fca8, 7b22ed0). Prompt implementera zakazywał tylko cofania
   (`NO_REVERT`), nigdzie commitowania. Poprawka: `ZAKAZ COMMITOWANIA` w tej samej stałej
   (obowiązuje implementera i prompt naprawczy) + sonda drzewa przed bramką końcową zwraca
   `commits` (`git rev-list --count <baza>..HEAD`); >0 nie zatrzymuje przebiegu (diff względem bazy
   działa), ale ląduje w `report.warnings` z poleceniem spłaszczenia (`git reset --soft <baza>`).
2. **Manifesty zależności poza zakresem warstwy** (ai-gateway TS-AIG-013: zatwierdzona zależność
   `prom-client` nie mogła zostać dodana, bo `package.json`/lockfile leżą poza `src/` → wcześniej
   BLOCKED_BY_PRIOR; grant-flow TS-UI-003 dotknął `.npmrc`/`package.json`/`pnpm-workspace.yaml` z tego
   samego powodu). `scopeBlock` (czytają go implementer, weryfikator i sonda) dostał wyjątek:
   `package.json`, lockfile, `pnpm-workspace.yaml`, `.npmrc` wolno zmienić, gdy zatwierdzona
   analiza/decyzja wymaga nowej zależności lub konfiguracji workspace. Celowo nie przez
   `layerTouches` — to rozszerzyłoby „kod istnieje" i listy plików każdej warstwy o manifesty.
3. **Bramka końcowa bez wyniku** (juz-ide-api-1 TS-REP-FACET-TIER-EXPOSURE-001: 33 plików, 2x cicho,
   także przy budżecie 60; grant-flow TS-UI-003 `agent empty result`). Jednorazowa bramka nie miała
   żadnej reakcji na ciszę. Teraz jedno ponowienie (etykieta `final-gate-retry`, ORC-077) z
   poleceniem: werdykt najpóźniej po ~70% budżetu, najpierw checks i pliki najwyższego ryzyka,
   reszta do `unverified_scope`. Dalsze milczenie = NO_GO `machine` + `report.stageForReview`
   (wszystkie warstwy były GO, pliki idą do przeglądu zamiast zostać puste w stagingu).
   Przyczyna ciszy po stronie agenta (brak treści błędu w journalu) pozostaje nieustalona —
   ponowienie to łagodzenie, nie diagnoza.

Nie zmieniono: `DEV-agent_note-deviation-note-…` (ai-os-bot: stała lista weryfikatora
nie sprawdza kart reguł CV/SI/SEP/…) — to konfiguracja slotu weryfikatora w projekcie
(`bot-verifiers`), nie silnik; `DEV-no_go-…` ai-gateway (unverified_scope przy zielonej sondzie) i
ai-os-bot (brak Postgresa dla testu integracyjnego) to uczciwe luki środowiskowe — przeszły przez
`stageForReview` (ORC-084), tak jak zaprojektowano. Evale: `impl-prompt-forbids-commits-and-scope-allows-dependency-manifests`,
`tree-probe-asks-for-commit-count-since-base`.

<a id="orc-088"></a>

### ORC-088 — `checks` jako komendy dosłowne; Flutter dostaje analyze/test (2026-10-02)

juz-ide-mobile-app (DESIGN-SYSTEM-009), `presentation`, wystąpienie 9 z `DEV-orc-069-presentation`:
bramka końcowa NO_GO wymuszona samym `unverified_scope`, a „realny błąd (overflow arkusza w trybie
Duży) wyszedł dopiero przy ręcznym `flutter test`". Przyczyna wszystkich wcześniejszych wystąpień
tego wpisu („weryfikator nie uruchamia kodu", testy `SemanticsFlag` niekompilujące się, 5
padających testów canvas_d): warstwy Flutter w `blocks/clean-arch.yml` nie miały żadnych
`checks`, a silnik umiał tylko `npm run <skrypt>` — Flutter nie ma `package.json`. Sonda zwracała
„skipped", weryfikatorzy dostawali brak dowodu, a ORC-084/085 słusznie nie pozwala przejść dalej
przy ślepej sondzie.

Poprawka: wpis `checks` ze spacją jest KOMENDĄ dosłowną uruchamianą z korzenia repo
(`flutter analyze`), bez spacji — nazwą skryptu package.json (`_chk`, ORC-085). Sonda mapuje wynik:
komenda z `analyze`/`typecheck`/`tsc`/`vet` → pole `typecheck`, z `test` → `tests`. Blok
`clean-arch`: `domain`/`application` → `flutter analyze`; `data`/`presentation` (tests: true) →
`flutter analyze` + `flutter test`; `final_gate.checks` → oba. `flutter analyze` łapie też testy,
które się nie kompilują. Koszt: pełny `flutter test` (~500 testów w juz-ide-mobile-app) na dwóch
warstwach i raz w bramce — świadomie, bo to jedyny sposób, by overflow w widget teście wyszedł
przed review. Projekty: `juz-ide-mobile-app`, `_uls-mobile-app` zmaterializowane; goldeny
`flutter-clean-arch` odświeżone. Eval: `probe-runs-literal-check-commands-without-npm`.

<a id="orc-089"></a>

### ORC-089 — plik analizy podany samą nazwą też jest artefaktem przebiegu (2026-10-02)

ai-gateway TS-AIG-043 (`wf_1dd26808-11c`): bramka końcowa NO_GO wyłącznie z `unverified_scope` —
jedyna pozycja to nieprzeczytany plik analizy, podany jako `TS-AIG-043.analysis.md`, bez ścieżki.
`filterOwnTaskArtifacts` (ORC-079) dopasowywał tylko pełną ścieżkę z `a.task.analysisFile`/
`taskFile`, więc go nie złapał — ta sama luka co przy ORC-070 (goła nazwa pliku zamiast ścieżki).
Poprawka: dopasowanie także po nazwie pliku (część po ostatnim `/`), bo nazwy plików tasku i
analizy zawierają id zadania i są jednoznaczne; nazwy krótsze niż 6 znaków nie są używane jako
filtr. Nie dotyczy pozycji innych niż te dwa artefakty. Eval:
`own-task-artifacts-filter-matches-bare-file-name`.

<a id="orc-090"></a>

### ORC-090 — odroczenie typechecku w monorepo, pliki brudne przed startem, powód ciszy agenta (2026-10-03)

Trzy luki silnika z jednego dnia zgłoszeń:

1. **ORC-082 nie działał w monorepo** (grant-flow TS-UI-004, `application`, `DEV-orc-082-application`
   i drugie wystąpienie `DEV-orc-062-application`). `tsc` w pakiecie podaje ścieżki względem
   pakietu (`src/app/api/x.ts`), a `dirs` warstw mają prefiks (`apps/api/src/app/api/`);
   `layerTouches` (indexOf) tego nie trafiał, więc czerwień „tylko w późniejszych warstwach"
   dalej zatrzymywała przebieg. Dodatkowo plik testu poza zawężeniem `layers_scope` nie należał
   do żadnej warstwy (zawężone `dirs`), choć leżał w katalogach warstwy testowej.
   Poprawka: `layerOwnsPath()` — dodatkowo dopasowuje dir z odciętymi 1-2 początkowymi
   segmentami (zostają ≥2 segmenty), a własność liczy po PEŁNYCH `dirs` (nie tylko zawężonych);
   `typecheckRedIsLaterLayers` sprawdza teraz wprost także warstwy WCZEŚNIEJSZE (wcześniej tylko
   „nie w tej, jest w późniejszej", co przy zachodzących dirs mogło odroczyć błąd wcześniejszej).
2. **stageForReview/staged brały pliki brudne przed startem** (ai-os-bot BOT-007: silnik zastage'ował
   `.claude/**`, KANBAN i cudzy BOT-024; człowiek zdejmował je z indeksu ręcznie). Dotyczyło też
   zwykłego `report.staged`. Poprawka: `stageableFiles()` odfiltrowuje `a.dirtyAtStart`, chyba że
   plik jest w raporcie którejś warstwy tego przebiegu (task go faktycznie zmienił).
3. **Cisza agenta bez śladu przyczyny** (`DEV-orc-056`: bramka końcowa milczała także po
   ponowieniu w grant-flow TS-UI-004; wcześniej juz-ide-api-1, grant-flow TS-UI-003). Journal nie
   niesie treści błędu. `ask()` zapisuje powód do `report.askErrors` (etykieta + komunikat do 400
   znaków). To diagnostyka, nie naprawa: przyczyna ciszy pozostaje nieustalona, wpis zostaje otwarty.

Nie zmieniono: zgłoszenie z DEV-orc-056, że weryfikatory dały GO mimo czerwonego `lint:check:web`,
niezaładowanego spec-a API i pustego FEATURE_ROUTES — brak mechanicznego tropu; po ORC-085 sonda
widzi `lint:check`, a lint w `checks` warstwy `web` jest jedynym, co by to złapało przed bramką.
Eval: `typecheck-deferral-handles-package-relative-paths-in-monorepo`,
`stageable-files-exclude-dirty-at-start-unless-layer-changed-them`.

<a id="orc-091"></a>

### ORC-091 — drobne ustalenia naprawia agent od razu (2026-10-03)

Użytkownik: przy każdym przebiegu musiał ręcznie wpisywać „napraw też ostrzeżenia, NO_GO i inne
drobne rzeczy, które da się łatwo naprawić" — w kółko to samo. Do tej pory ostrzeżenia
weryfikatora ginęły w uzasadnieniu (nie było dla nich pola), a NO_GO bramki końcowej z konkretnymi,
łatwymi naruszeniami kończył przebieg (bramka jednorazowa, bez pętli naprawczej, w przeciwieństwie
do warstw).

Zmiana (domyślnie włączona; `--overrides {"autoFixMinor": false}` wyłącza):
- **Pole `minor_findings`** w `VERDICT_SCHEMA` (weryfikatorzy warstw i bramka końcowa): ostrzeżenia i
  nity łatwe do mechanicznego naprawienia, format `plik:linia — problem — poprawka`; NIE zmieniają
  werdyktu, `violations` zostaje dla rzeczy blokujących (`MINOR_REMINDER` w obu promptach).
- **Pętla warstwy:** GO z drobnymi ustaleniami → jedno przejście naprawcze implementera
  (`formatMinorFix`), potem zwykła sonda i weryfikacja. Tylko gdy zostają 2 próby zapasu
  (`attempt + 2 <= maxAttempts`), żeby opcjonalne sprzątanie nie mogło zatrzymać warstwy, która była
  już GO; puste przejście nie jest traktowane jako „brak zmian warstwy". Nienaprawione drobiazgi →
  `report.minorFindings`.
- **Bramka końcowa:** runda naprawcza. Ustalenia `[BLOKUJĄCE]` (violations przy `cause=code`, do 8) i
  `[DROBNE]` trafiają do implementera warstwy-właściciela (po ścieżkach, `groupFindingsByLayer`; reszta
  do ostatniej warstwy produkcyjnej), po naprawie biegnie sonda warstwy. Przy blokujących — ponowna
  bramka (runda 2, `final-gate-r2`, z listą poprawionych pozycji); przy samych drobnych — naprawa +
  sonda, werdykt zostaje; czerwona sonda po naprawie drobiazgów → NO_GO `code` (zepsuliśmy to sami).
  Runda 2 nie ma kolejnej naprawy. `report.finalFix`, `report.finalGateRound1`.
- **Analiza:** pole `minor_fixes: [...]` w artefakcie analizy (drobne rzeczy znalezione przy analizie) →
  `a.task.minorFixes` → sekcja „DROBNE POPRAWKI Z ANALIZY" w pierwszym prompcie implementera warstwy
  (tylko w zakresie warstwy, mechanicznie).

Czego NIE robi: nie naprawia pozycji, które wymagają decyzji (implementer pomija je i opisuje w
`deviation_note`); `unverified_scope` nadal nie jest „drobnym ustaleniem" (luki weryfikacji to
ORC-084); nie rusza zatrzymań `code` po 3 próbach warstwy. Koszt: jedna dodatkowa iteracja
implementer+weryfikator na warstwę z drobiazgami, i do jednej dodatkowej bramki końcowej przy
blokujących naruszeniach. Eval: `minor-findings-collected-grouped-and-formatted`,
`verifier-and-final-gate-prompts-offer-minor-findings-and-impl-gets-analysis-minors`.

<a id="orc-092"></a>

### ORC-092 — limit tur z definicji agenta wygrywa z budżetem skryptu (2026-10-03)

iam TS-SSO-056 (`wf_1a61c8ae-2af`): bramka końcowa 2x bez werdyktu (brak StructuredOutput);
zgłaszający ustalił przyczynę: `security-e2e-verifier` ma w frontmatterze `maxTurns: 20`, a
`budgets.final-gate` z `--overrides` go nie podnosi — bramkę wykonano ręcznie. To jest szukana od
kilku tur przyczyna „cichej" bramki końcowej (DEV-orc-056: juz-ide-api-1, grant-flow TS-UI-003 i
TS-UI-004): bramka z 33-112 plikami potrzebuje więcej niż 20 tur, więc agent ginął na limicie
przed oddaniem werdyktu, niezależnie od `scaledBudget` (ORC-085) i ponowienia (ORC-087), które
liczyły na budżet skryptu. Ten sam sufit dotyczył weryfikatorów warstw (30 tur wobec budżetu do 50).

Poprawka (konfiguracja, nie silnik):
- `maxTurns: 60` (ponad sufit `scaledBudget` = 50) w 12 centralnych definicjach weryfikatorów i
  bramek: security-e2e-verifier (20), code-quality-verifier, library-quality-verifier,
  python-quality-verifier, flutter-quality/ui/security-verifier, sveltekit/nextjs/refine
  quality-verifier, architecture-verifier, safety-reviewer (30), każda z wpisem w `## Changelog`;
  oraz w 6 lokalnych kopiach: ai-gateway `aig-code-verifier`/`aig-security-gate`, ai-os-bot
  `bot-code-verifier`/`bot-safety-gate`, iam `code-quality-verifier`/`security-e2e-verifier`.
  Implementerzy (40) i doradczy recenzenci bez zmian.
- `orchestrate-prepare` ostrzega PRZED startem, gdy `maxTurns` agenta ze slotów verify/final-gate/
  implementer (plik `.claude/agents/<nazwa>.md` projektu) jest mniejszy niż budżet, który skrypt mu
  obiecuje (do 50 dla weryfikatorów, 40 dla implementera, albo jawny `budgets.*`) — `agentTurnCapWarnings`.
  Agenci z pluginów (`ecc:*`) są pomijani (brak lokalnego pliku).

Zmiany w lokalnych agentach ai-gateway, ai-os-bot i iam leżą w tych repozytoriach niezcommitowane.
Przyczyna wcześniejszych „cichych" bramek jest teraz ustalona; `report.askErrors` (ORC-090) zostaje
jako diagnostyka dla pozostałych przypadków ciszy.

<a id="orc-093"></a>

### ORC-093 — właściciel pliku po specyficzności dopasowania (2026-10-03)

grant-flow TS-TIME-READALL-001 (`wf_5ef0c74e-e85`): ORC-082 znów nie odroczył czerwonego typechecku
(`DEV-orc-082-application` reopen, wystąpienie 2) — `application` stanęła na BLOCKED_BY_PRIOR przy
błędach w `infrastructure`. Przyczyną była moja zmiana z ORC-090: sprawdzanie „czy któraś
WCZEŚNIEJSZA warstwa pasuje do ścieżki" wobec `domain` z `dirs: [apps/api/src/, domain/]`
(katch-all na cały `src` w `.claude/blocks/monorepo-layers-grant-flow.yml`) uznawało każdy plik
`apps/api/src/**` za domenowy, a goły dir `domain` dopasowywał się też do nazw plików
(`domain-event.ts`). ORC-090 poprawiał ścieżki względne pakietu, ale otworzył to drugie okno.

Poprawka: `layerMatchScore`/`ownerLayerOf` wyznaczają JEDNEGO właściciela pliku: nazwa
katalogu-segmentu (`infrastructure/`, `__tests__/`) pasująca do SEGMENTU ścieżki — bez nazwy
pliku — wygrywa z dopasowaniem prefiksu/wielosegmentowego (katch-all przegrywa); w obrębie rangi
wygrywa dłuższy dir; remis = brak właściciela (nie odraczamy). `typecheckRedIsLaterLayers` odracza
tylko, gdy KAŻDA ścieżka ma właściciela o indeksie większym niż bieżąca warstwa. `groupFindingsByLayer`
(ORC-091) używa tego samego właściciela. Do porównania brane są tylko warstwy, które faktycznie
biegną w przebiegu (`plan` z `run`) — odroczenie do pominiętej warstwy ukryłoby błąd do bramki
końcowej. Wbudowany katch-all w bloku grant-flow zostaje: jest tam zamierzony, silnik ma go
rozumieć. Eval: `typecheck-deferral-owner-by-specificity-with-catch-all-domain-dirs` (układ grant-flow).

<a id="orc-094"></a>

### ORC-094 — sonda: osobne logi i pole lint; zakaz commitów subagentów jako hook (2026-10-03)

Pięć zgłoszeń z jednego dnia, z czego trzy z realnymi lukami:

1. **Dwa checks, jeden log** (marketing-hub TS-MH-013, `DEV-orc-084-domain`). Warstwa `domain` ma
   `checks: ["typecheck:api", "lint:check:api"]`, a oba pisały do `/tmp/check-domain.log` — drugi
   nadpisywał pierwszy. `tsErrors` (grep po logu) czytało wynik lintu, nie `tsc`, więc ORC-082/093
   nie miało czego sparsować i warstwa stawała na halt `machine`; do tego wynik lintu trafiał do pola
   `typecheck`. Poprawka: osobny plik na check (`/tmp/check-<warstwa>-<n>.log`), grepy czytają
   `-*.log`; schemat sondy dostaje pole `lint`, mapowanie wyników jest ZAWSZE w prompcie (lint →
   `lint`, typecheck/tsc/analyze/vet/build → `typecheck`, test → `tests`); `lint: fail` liczy się jako
   czerwień sondy, nie jest dowodem zieleni (`probeHasGreenEvidence`) i blokuje odroczenie typechecku.
2. **40 commitów mimo „ZAKAZ COMMITOWANIA"** (ai-os-bot BOT-024, `DEV-orc-087`; w tym haiku-sondy).
   Prompt nie jest wiążący dla LLM. Nowy hook `hooks/block-subagent-commit.js` (PreToolUse/Bash,
   zarejestrowany w `hooks.json` i `settings.json` przez `sync-global-hooks --apply`) blokuje
   `git commit/push/rebase/tag/merge/cherry-pick/am/stash/reset/restore/checkout` WYŁĄCZNIE dla
   subagentów (`agent_id`) i tylko gdy w cwd (lub 3 katalogi wyżej) leży świeży (≤12 h) znacznik
   `.claude/run-state/orchestrating.json`. Sesja główna (człowiek, orchestrator) nie jest blokowana,
   więc zapomniany znacznik nikomu nie zatrzyma pracy. Dodatkowo, gdy sonda drzewa nie zwróci
   licznika commitów, raport dostaje ostrzeżenie (wcześniej cisza: `report.warnings` był pusty mimo 40
   commitów). Znacznik nadpisany w trakcie przebiegu (inny `session_id`) to osobny temat sesji, nie silnika.
3. **Brak ostrzeżenia w raporcie** — domknięte w pkt 2.

Bez zmian silnika: `DEV-orc-062-implementation-core` (ai-gateway TS-AIG-066: analiza pominęła
drugiego konsumenta `GatewayErrorKind`; implementer słusznie zgłosił poza zakresem, naprawione przez
`--overrides` + wznowienie — proces zadziałał, luka w analizie), `DEV-orc-062-testing-u11-...` (ai-os-bot
BOT-024: test bezpieczeństwa czytający `main.ts` czerwony po przeniesieniu filtra do dispatchera;
naprawa wymaga zmiany `*.security.test.ts` — decyzja człowieka, BLOCKED_BY_PRIOR słuszny; weryfikator
warstwy u4 dał GO mimo czerwonego testu — do obserwacji), `DEV-orc-069` (ai-gateway TS-AIG-066 —
`stageForReview` puste mimo NO_GO wymuszonego unverified_scope: w tym przebiegu dirty-at-start
filtrował wszystko; staging z drzewa zadziałał). Eval: `probe-writes-separate-log-per-check-and-maps-lint-field`,
`lint-fail-is-red-and-never-green-evidence`, 5 przypadków w `tests/flow-evals/hooks/fixtures/block-subagent-commit.json`.

<a id="orc-095"></a>

### ORC-095 — mniej przystanków, krótkie wiadomości (2026-10-03)

Użytkownik: orchestracja jest przerywana tylko po to, żeby napisał „ok"/„kontynuuj" (np. po warstwie
domain prośba o zgodę na kolejną), a podsumowania i pytania to „elaboraty" — ~15 linii, trudne do
czytania; przy KAŻDYM przebiegu musiał dopisywać „wytłumacz prostym językiem biznesowym w 1-2
zdaniach".

Przyczyny (wszystkie w instrukcjach/komunikacji, nie w pętli warstw — silnik jedzie warstwy bez
pytań): (1) brak wiążącej zasady „nie pytaj o zgodę między warstwami"; log po każdej warstwie
brzmiał jak polecenie („Dopisz jej id do layers_done…") i prowokował główny agent do przerywania
pracy; (2) sekcja „Raport" kazała dwie części, z czego „Przebieg" (sloty, próby, werdykty, lista
plików) szła do czatu; (3) `human_voice` obejmował tylko pole `ask`/`means` w artefakcie analizy i
tylko pod kątem żargonu, bez limitu długości; wiadomości orchestratora do człowieka nie miały
żadnego formatu.

Zmiana: sekcja „Komunikacja z człowiekiem" w `commands/orchestrate.md` (jedno ciągłe przejście;
wolno pytać tylko przy `PAUSE` analizy i po zatrzymaniu z ORC-086; wiadomość końcowa max 3 linie;
pytanie 1-2 zdania, tak/nie lub A/B z rekomendacją i domyślną odpowiedzią; „Przebieg" do pliku
`{TASK-ID}.report.md`). Silnik składa gotową linię `report.statusLine` (bez ścieżek, klas i numerów
reguł), a log po warstwie nie brzmi już jak polecenie. ANL-040 + hook `check-human-voice` ostrzega,
gdy `ask` ma > 2 zdania albo > 320 znaków. Nadal „tylko prompt" jest zachowanie czatu głównego
agenta (egzekwuje je tylko uwaga), ale oparte na mechanicznych polach `statusLine`/`cause`. Eval:
`status-line-is-short-business-and-has-no-paths`, fixture `check-human-voice` (za długie `ask`).

<a id="orc-096"></a>

### ORC-096 — przyrost testów: niedopasowany wzorzec nie może zerować liczenia (2026-10-03)

ai-os-bot BOT-024, jednostka `testing:u14-tooling` (`DEV-orc-035-testing-u14-tooling`): halt „zero
testów" mimo nowego, nieśledzonego `scripts/tooling.test.ts` (19 zielonych testów, `scripts/**` w
zakresie jednostki). Orchestrator zaproponował ręczne dopisanie jednostki do `layers_done` i zapytał
człowieka o zgodę — zamiast tego było to do naprawienia w silniku.

Przyczyna (odtworzona w tymczasowym repozytorium): sonda liczyła przyrost przez
`git add -N -- <wszystkie wzorce>; git diff HEAD -U0 -- … | grep -c …`. Dla wpisów-plików w `dirs`
(`package.json`, `vitest.config.ts`) generujemy też wzorce towarzyszące `*.spec.*`/`*.test.*`, które
zwykle nic nie dopasowują, a `git add` przerywa w CAŁOŚCI (`fatal: pathspec … did not match any
files`) już przy jednym takim wzorcu — nowy plik testu zostawał nieśledzony i przyrost wychodził 0.
Stary sposób: 0, nowy: 2 (test na dwóch jednorazowych repozytoriach).

Poprawka: `git ls-files -o --exclude-standard -z -- <wzorce> | xargs -0 -r git add -N --` — ls-files
zwraca tylko istniejące nieśledzone pliki, bez błędu na wzorcu bez trafień; `git diff HEAD … | grep -cE`
zostaje w jednej linii (WL6). Eval: `probe-counts-untracked-test-files-even-with-unmatched-pathspec`.
Wpisane też do sekcji „Po zatrzymaniu": fałszywy alarm deterministycznej bramki z dowodem (zielone
testy uruchomione ręcznie) to `--overrides` + wznowienie, nigdy ręczne `layers_done` i nigdy pytanie
o zgodę.

<a id="orc-097"></a>

### ORC-097 — bramka końcowa: model Sonnet i krótkie wyjście; koszty modeli bez cennika (2026-10-03)

Pomiar `workflow-steps.jsonl` (od 2026-10-01): bramka końcowa to najdroższy pojedynczy krok przebiegu —
39 z 46 bramek szło na `claude-opus-5-5` (dziedziczony model sesji), mediana 22 wywołań narzędzi, 137 tys.
tokenów zapisu do cache, 1,7 mln odczytu i **27 tys. tokenów wyjścia** na jeden werdykt (implementer: 3,9
tys.). Jednocześnie jej koszt w metrykach wychodził $0, bo cennik nie miał wpisów dla
`claude-sonnet-5-5`, `claude-opus-5-5` i sufiksu `[1m]` (734 z 3 576 kroków, czyli 20%, w tym wszystkie
najdroższe) — suma $906 była zaniżona, a stawki `claude-sonnet-5` nadal „intro" ($2/$10) mimo notatki
o zmianie od 2026-09-01.

Zmiana: (1) model bramki: domyślnie `auto` = Sonnet, model sesji TYLKO gdy analiza ma `threat_model`
(`task.securitySensitive` z `orchestrate-prepare`); `runtime.yml → final_gate.model: auto|inherit|sonnet|
opus|haiku` wymusza wybór (schemat bloku dopuszcza pole); (2) prompt bramki: `rationale` najwyżej 5
zdań, naruszenia po jednej linii `plik:linia — reguła — poprawka`, bez przepisywania kodu i streszczania
diffu; (3) `estimateCostUsd` szuka ceny: model → bez daty → bez `[1m]` → bez podwersji (`-5-5` → `-5`),
ostatnie to SZACUNEK po rodzinie; (4) stawki Sonneta 5 po okresie intro (3/15/3,75/0,3) w pliku
domyślnym i lokalnym `~/.claude/metrics/prices.json`. Stare rekordy nie są przeliczane (collector
idempotentny po runId+agentId); nowe będą miały koszt. Ryzyko: Sonnet na bramce końcowej może wychwycić
mniej niż Opus w subtelnych problemach bezpieczeństwa — dlatego taski z threat_model zostają na modelu
sesji; do obserwacji liczba `NO_GO` po fakcie ręcznej weryfikacji. Eval:
`final-gate-model-defaults-to-sonnet-and-inherits-for-security-tasks`, `final-gate-prompt-limits-output-length`,
`estimateCostUsd falls back to the model family`.

<a id="orc-098"></a>

### ORC-098 — bramka końcowa: GO z lukami zamiast NO_GO z samego unverified_scope (2026-10-04)

Przegląd `run-state` we wszystkich projektach: 8 pełnych raportów przebiegów, 7 z nich skończyło się
NO_GO bramki końcowej wymuszonym wyłącznie przez `unverified_scope` (ai-gateway AIG-064/067/069, iam
SSO-057, marketing-hub MH-012, mobile DS009 i DS009-2), przy zerze własnych naruszeń i zielonych checks.
Zgłoszenia w `_inbox` (ORC-069 — 21 wystąpień) mówią to samo. Dwie przyczyny: (1) bramka dostawała
tylko nazwy checks i miała je uruchomić sama — nie uruchamiała (AIG-064/069); (2) reszta luk to rzeczy
niesprawdzalne w repo (kopie u konsumentów, ścieżka produkcyjna, przeglądarka), których bramka z
natury nie domknie. ORC-069 słusznie nie pozwala traktować takiego GO jak czystego, ale NO_GO i halt to
za mocna reakcja: człowiek i tak dostaje staged pliki, a każdy przebieg kończył się pytaniem „zaakceptować?".

Zmiana: (1) przed bramką silnik odpala sondę checks (`buildProbePrompt` z pseudo-warstwą `final`), wynik
jedzie do bramki jako fakty z zakazem powtarzania (jak ORC-081 dla weryfikatora warstwy); (2) prompt mówi,
że niesprawdzalne w repo rzeczy idą do `unverified_scope`, nie do `violations`; (3) `finalGapsAcceptable`:
GO + niepusty `unverified_scope` po filtrach + zero naruszeń + zielona sonda (co najmniej jeden `pass`,
zero `fail`) → przebieg idzie dalej, luki do `report.gaps` (warstwa `final-gate`), `stageForReview`,
`statusLine` „niesprawdzone fragmenty / wymaga uważnego przeglądu". Brak wyniku sondy, ślepa sonda
(wszystko `skipped`) albo czerwona = NO_GO jak dotąd, plus ostrzeżenie w `report.warnings`. Czyste GO
(pusty `unverified_scope`) bez zmian. Nie zmienia ORC-069 na warstwach (GO_WITH_GAPS wg ORC-084).
Ryzyko: projekt bez `final_gate.checks` dalej dostaje NO_GO z samych luk (brak dowodu zieleni) — do
obserwacji; nie sprawdzone na żywym przebiegu, tylko eval. Eval:
`final-gate-gaps-acceptable-needs-green-engine-probe-and-zero-violations`,
`final-gate-prompt-passes-probe-facts-and-forbids-rerun`.

#### ORC-098b — dirs będące plikami w `layerMatchScore` (2026-10-04)

ORC-093 wprost pomijał wpisy `dirs` z rozszerzeniem (`/\.[a-z0-9]+$/`), więc zakres jednostki zawężony do
pliku (`layers_scope`: `src/wikiIndexer.ts`) nie miał właściciela, a odroczenie ORC-082 nie działało:
ai-os-bot BOT-025 (`u4-guarded-embeddings`) i ai-gateway AIG-068 (`usage-priced`), w płaskim serwisie
(`dirs: src/`) remis trzech warstw. Zmiana: (1) wpis-plik dopasowuje się dokładnie (także ścieżka
względna pakietu z `tsc`, gdy jeden z dwóch kończy się drugim po `/`) i ma najwyższą rangę — konkretny
plik wygrywa z każdym katalogiem; (2) `ownerLayersOf` zwraca wszystkie remisujące warstwy, a
`typecheckRedIsLaterLayers` odracza czerwień, gdy WSZYSTKIE są późniejsze od bieżącej (BOT-025: u5a i
u5b mają ten sam plik); remis z udziałem bieżącej warstwy nadal nie odracza. Nie obejmuje: czerwieni
między jednostkami TEJ SAMEJ warstwy (AIG-082 `config-env` ↔ `registry/testing`) — osobne zgłoszenie.
Eval: `owner-layer-file-dirs-win-over-directories`, `typecheck-red-deferred-when-tie-is-only-later-layers`.

<a id="orc-099"></a>

### ORC-099 — odroczenie czerwonych testów do późniejszych warstw (2026-10-04)

ai-gateway TS-AIG-082 (`implementation:config-env`): zmiana `Config` psuje `registry.ts`, a potem ~36 testów w
15 plikach należących do kolejnej jednostki; dwa halty z rzędu (typecheck, potem testy). ORC-082 odracza
tylko czerwony typecheck, testów nie. Zmiana: sonda zwraca `testFailFiles` (dosłowny wynik `grep FAIL`) i
`testFilesFailed` (liczba plików z podsumowania runnera); `testsRedIsLaterLayers` ustawia `tests: 'deferred'`,
gdy typecheck i lint nie są czerwone, lista ma dokładnie tyle plików, ile podaje podsumowanie, a KAŻDY
padający plik należy wyłącznie do warstw późniejszych od bieżącej (`ownerLayersOf`, ORC-098b). Brak
podsumowania, niepełna lista, plik własny albo bez właściciela = brak odroczenia (halt jak dotąd).
Weryfikator dostaje adnotację „testy odroczone". Ryzyko: poprawność zależy od tego, że agent-sonda
(Haiku) odda `grep FAIL` dosłownie; guard liczby plików chroni przed niepełną listą, nie przed
zmyśloną. Nie sprawdzone na żywym przebiegu. Eval:
`tests-red-deferred-only-when-all-failing-files-belong-to-later-layers`.

<a id="orc-100"></a>

### ORC-100 — te same luki po powtórnej weryfikacji zamykają warstwę (2026-10-04)

`decideVerdict` oddaje GO z niepustym `unverified_scope` jako `reverify` (ORC-074): kolejna próba to świeży
budżet samego weryfikatora. Zgłoszenia ORC-069 na warstwach (~25 wystąpień: `presentation`, `web-bootstrap`,
`app-cqrs`) pokazują, że weryfikator zwykle zwraca TE SAME luki w każdej rundzie, więc kolejne rundy tylko
palą tokeny, aż próby się skończą (ORC-084 domyka wtedy warstwę jako GO_WITH_GAPS, ale dopiero na końcu).
Zmiana: `reverify` niesie `gaps`; `repeatedGapsAcceptable` — ten sam zbiór luk co w poprzedniej rundzie
(bez względu na kolejność), werdykt GO bez naruszeń i zielona sonda (`probeHasGreenEvidence`) →
GO_WITH_GAPS od razu. Inny, mniejszy albo większy zbiór luk = zwykły `reverify`. Nie zmienia ORC-069
(luki dalej jadą do raportu i bramki końcowej). Nie sprawdzone na żywym przebiegu. Eval:
`repeated-identical-gaps-settle-as-go-with-gaps-without-more-attempts`.

<a id="orc-101"></a>

### ORC-101 — drobne poprawki z analizy bez właściciela warstwy (2026-10-04)

ai-gateway TS-AIG-069: wszystkie warstwy GO, a przebieg kończył się pytaniem „dopisać to mam ja czy ty?"
— lista poprawek z analizy (model zagrożeń, karta niezmienników, `architecture.md`, `CLAUDE-LOCAL.md`,
KANBAN) nie została wykonana. Przyczyna: `buildImplPrompt` daje `minor_fixes` KAŻDEJ warstwie z poleceniem
„wykonaj te z zakresu TEJ warstwy, resztę pomiń", a pliki dokumentacji leżą poza `dirs` wszystkich warstw,
więc każda je pomija. Zmiana: `orphanMinorFixes` wskazuje pozycje (`plik — co — poprawka`), których
ścieżka nie należy do żadnej warstwy z `dirs`; przed bramką końcową jedno przejście ostatniego
implementera (nie-testowego) z jawnym wyjątkiem od zakresu, wynik w `report.docFixes`. Porażka kroku
(implementer bez wyniku) nie zatrzymuje przebiegu: pozycje trafiają do `minorFindings` i `warnings`.
Pozycja bez rozpoznawalnej ścieżki zostaje po staremu. Ryzyko: implementer od kodu edytuje dokumenty —
zakres ogranicza lista, ale nie ma twardego strażnika poza promptem; hook `check-subagent-pattern-reads`
może zażądać wzorca przy plikach objętych wzorcami. Nie sprawdzone na żywym przebiegu. Eval:
`orphan-minor-fixes-are-those-outside-every-layer-scope`.

<a id="orc-102"></a>

### ORC-102 — błąd składni YAML we frontmatterze analizy nie może być cichy (2026-10-08)

ai-gateway TS-AIG-084 (`DEV-orc-101-final-gate`): jednostka `docs` z `units[]` „nie weszła do żadnej warstwy”,
a przebieg miał tylko warstwy bazowe. Przyczyna nie leżała w mapowaniu jednostek (ORC-101 dotyczy
`minor_fixes`), tylko w tym, że frontmatter analizy nie parsował się jako YAML (`\`` w ciągu w cudzysłowach,
linia 72). `splitFrontmatter` łapał wyjątek i zwracał `fm = null`; bramka czytała `status` i `answer: null`
regexem, więc przechodziła, a CAŁA reszta (`units`, `decisions`, `layers_scope`, `layers_skip`,
`minor_fixes`, `patterns_exclude`) znikała bez ostrzeżenia. Skala: 101 z 926 analiz we flocie
(~45 unikalnych po odjęciu bliźniaczych projektów) ma frontmatter, który się nie parsuje; najczęściej
`: ` w niecytowanym tekście, zduplikowany klucz albo `\`` w cudzysłowie.
Zmiana: (1) `splitFrontmatter` zwraca `fmError`, a bramka `prepare` kończy exit 2 z treścią błędu i listą pól,
które zostałyby pominięte; (2) `check-human-voice.js` (PostToolUse na `*.analysis.md`) ostrzega przy zapisie,
żeby błąd wyszedł u autora analizy, nie dopiero przy starcie. Skutek uboczny: stare, już zrealizowane
analizy z błędnym YAML nie wystartują ponownie bez poprawki frontmatteru. Eval:
`broken-frontmatter-yaml-exit-2`, `human-voice-broken-frontmatter-yaml-warns`,
`human-voice-valid-frontmatter-yaml-silent`.

### ORC-103 — naprawa bez zmiany w drzewie, niestabilne testy, właściciel czerwieni (2026-10-10)

**Objaw (3 zgłoszenia).**
1. marketing-hub TS-MH-007: runda naprawcza po NO_GO bramki końcowej (ORC-091) zgłosiła naprawę 13 ustaleń, ale żaden plik nie zmienił mtime. Lista `changed_files` implementera jest jego twierdzeniem, silnik nie porównywał jej z drzewem, więc marnował ponowną bramkę.
2. grant-flow TS-PROJ-COMPANY-001: 3 niestabilne testy (czas, entropia) czerwone pod obciążeniem, zielone osobno (53/53); obejście ręczne `layers.testing.tests=false`.
3. ai-gateway TS-AIG-073: warstwa testing stanęła na czerwonym `architecture.test.ts`, którego przyczyna leżała w kodzie warstwy implementation. Komunikat BLOCKED_BY_PRIOR nie nazywał właściciela, a wznowienie pominęło implementation z `layers_done`.

**Co ustaliłem w dzienniku `wf_4facde5d-58b`.** Dostępny jest tylko przebieg końcowy (wznowienie): implementation pominięte z `layers_done`, testing GO po 2 próbach, bramka końcowa GO z lukami. Pierwszych przebiegów w dzienniku nie ma, więc nie odtworzyłem, dlaczego implementation dostało GO: jego `checks` to `typecheck`, `lint` bez `test`, więc czerwony test nie był tej warstwie widoczny. To zgodne z projektem (testy należą do warstwy testing), a nie błąd sondy.

**Zmiana.**
- `fixLeftTreeUnchanged` + `treeFingerprintCmd`: odcisk (hash treści plików zmienionych względem bazy, nieśledzonych i statusu) przed i po każdej naprawie. Identyczne odciski = ostrzeżenie w `report.warnings`, brak sondy i ponownej bramki; blokujące kończą się haltem z oryginalnymi naruszeniami, drobne trafiają do `minorFindings` (bez fałszywego NO_GO). Brak odpowiedzi sondy to „nie wiadomo", nie „bez zmian".
- `testsFlakyUnderLoad`: sonda po czerwonych testach uruchamia raz same padające pliki (`testsRerunPassed`). Przy zgodnej liście plików i zielonym ponownym biegu testy liczą się jako zielone, a `report.warnings` wymienia pliki.
- `earlierRedOwners` + `blockedByPrior`: komunikat nazywa wcześniejszą warstwę-właściciela i mówi, że wznowienie z nią w `layers_done` ją pominie.

**Czego NIE zrobiłem.** Silnik nie otwiera sam wcześniejszej warstwy po BLOCKED_BY_PRIOR. To zmiana kontraktu (ponowna implementacja warstwy, która miała GO) i wymaga decyzji, a nie mam danych pierwszego przebiegu. Zgłoszenie `DEV-orc-062-implementation-origin-guard` zostaje `proposed` z tą adnotacją.

**Ryzyko.** Łagodzenie niestabilnych testów może ukryć błąd zależny od kolejności (test przechodzi osobno, pada w zestawie przez wspólny stan). Dlatego zawsze jest ostrzeżenie z nazwami plików.

### ORC-104 — luka weryfikatora liczona po podciągu ścieżki, sonda bez kotwicy korzenia (2026-10-10)

**Objaw.** juz-ide-api-1 TS-AUTH-CAPABILITIES-INIT-001 (`wf_3a5a4cbb-177`): `infrastructure:obs-guardian` — GO weryfikatora z `unverified_scope` za każdym razem innym (próba 1: `authorization-integration.processor.spec.ts`, `integration-event-fan-out-routing-contract.spec.ts`; próba 3: `authorization-phone-verified-real-queue.integration.spec.ts`, `…processor.spec.ts`), ESCALATE_AND_HALT po 3 próbach. Luki nie były identyczne, więc ORC-100 nie mógł ich zaakceptować.

**Przyczyna.** Jednostka `obs-guardian` ma w `dirs` `…/infrastructure/queues/`, a jednostka `repro-test` (testing) `…/infrastructure/queues/__tests__/`. Filtr ORC-070 w `decideVerdict` uznawał pozycję za własną, jeśli `layerTouches` (podciąg ścieżki) pasował do tej warstwy — a pasował, bo katalog nadrzędny zawiera podkatalog. Specyfikacje należały do jednostki testing (dłuższy, specyficzniejszy dir), więc weryfikator infrastruktury nie miał ich jak „dokończyć" i co próbę pomijał inne.

**Zmiana.**
- `decideVerdict`: pozycję `unverified_scope` wygrywa w rankingu specyficzności (`ownerLayersOf`, jak ORC-093) inna warstwa, a ta nie remisuje → cudza robota, nie luka. Remis lub brak właściciela zachowuje stare zachowanie.
- `buildProbePrompt`: polecenie sondy zaczyna się od `cd "$(git rev-parse --show-toplevel)" || exit 1`; `_pkgdir`, `npm run` i `git ls-files` liczą ścieżki od korzenia, nie od cwd agenta (wcześniej grant-flow, teraz juz-ide-api-1: `cd` w podkatalog = npm w złym miejscu).
- Instrukcja `layers_done` (krok 4): zapis GO także po `ESCALATE_AND_HALT`/`BLOCKED_BY_PRIOR`.

**Niezweryfikowane.** Zarzut agenta, że „każde ponowne wygenerowanie skryptu zrzuca cache warstw", nie jest potwierdzony: w dzienniku jest jeden przebieg tego zadania i `application` (GO po 2 próbach) nie trafiło do `layers_done`. To zgodne z hipotezą, że GO sprzed zatrzymania nie było zapisywane (instrukcja była dwuznaczna), ale nie dowodzi cache'u Workflow. Silnik nie ma dostępu do `fs`, więc zapis `layers_done` zostaje po stronie orkiestratora (prompt).

