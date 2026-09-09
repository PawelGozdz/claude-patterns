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
