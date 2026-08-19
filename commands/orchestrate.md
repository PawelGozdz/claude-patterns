---
name: orchestrate
description: |
  Generyczna faza IMPLEMENTACJI sterowana kompozycją bloków (ADR 0008): pętla
  po warstwach z runtime.yml (implement→verify→fix aż GO), bramka końcowa ze
  slotu, kończy w stanie "staged, not committed". Bramka wejścia: brak
  .claude/config/runtime.yml = odmowa. Gdy analyze.exit=PAUSE (blok ddd/core),
  ODMAWIA startu bez {TASK-ID}.analysis.md ze status: approved.

  Usage: /orchestrate <TASK-ID>
tools: Task, Read, Write, Edit, Bash, Workflow
disallowedTools: MultiEdit, NotebookEdit
---

# /orchestrate — implementacja sterowana runtime.yml

**ZERO WŁASNEJ IMPLEMENTACJI.** Silnik deleguje do agentów ze slotów; sam nie
pisze kodu produkcyjnego. Wszystko stackowe przychodzi z `runtime.yml`.

Egzekwuje to hook `check-delegation` w trybie STRICT, a nie odebranie narzędzia:
przy aktywnym znaczniku przebiegu (krok 0.0) główna sesja nie zapisze ŻADNEGO
pliku źródłowego (`.ts/.tsx/.dart/.py/.svelte`) — także takiego, którego
`pattern-routing` nie mapuje na wzorzec. Artefakty koordynacyjne (`.analysis.md`,
pliki tasków, `runtime.yml`, skrypty workflow) zostają otwarte, bo prowadzenie
ich to praca koordynatora, nie implementacja.

> Do 2026-08-13 bramką było `disallowedTools: Edit`. Blokowała nie to, co trzeba:
> koordynator nie mógł dopisać `layers_done:` do własnego artefaktu ani poprawić
> promptu w skrypcie workflow przed `resumeFromRunId`, a `Write` (nadpisanie
> całego pliku) zostawał otwarty — obietnicy „zero implementacji" nie egzekwowała
> w ogóle.

## 0. Bramki wejścia (twarde, w tej kolejności)

### 0.0 Znacznik przebiegu (PRZED czymkolwiek innym)

Pobierz realny czas — `Bash("date -u +%Y-%m-%dT%H:%M:%SZ")` — NIE wpisuj go z pamięci:
masz dostęp do dzisiejszej daty przez kontekst sesji, ale nie do godziny; „wypełnienie"
`ts` bez zegara literalnie wyszło jako `00:00:00Z` w produkcji (audyt api-1, 2026-08-19)
— znacznik wyglądał na 9h45min starszy niż był, bo TTL 8h liczy się właśnie z tego pola.

Zapisz `.claude/run-state/orchestrating.json`:

```json
{ "task_id": "{TASK-ID}", "session_id": "<session_id tej sesji>", "ts": "<wynik date -u powyżej>" }
```

To on włącza STRICT w `check-delegation`. `session_id` jest po to, żeby przebieg
w jednej instancji nie ograniczał równoległej sesji na tym samym repo (ADR 0006);
znacznik wygasa sam po 8 h **licząc od `ts`, nie od `mtime` pliku** — stąd realny
zegar jest tu load-bearing, nie kosmetyczny. Usuwasz go w kroku 3 — także przy
`ESCALATE_AND_HALT`.

1. `Read(".claude/config/runtime.yml")`. Brak → STOP: „Projekt nie ma
   skomponowanego setupu bloków (ADR 0008) — dodaj `stack_blocks:` + setup,
2. Jeśli `analyze.exit: PAUSE` w runtime.yml (projekt z blokiem ddd/core):
   wymagaj `project-orchestration/analysis/{TASK-ID}.analysis.md` z
   `status: approved` i **żadnego** `open_questions[].answer == null`.
   Niespełnione → STOP: „Najpierw /analyze {TASK-ID} + odpowiedzi + approved."
   Bez PAUSE: artefakt opcjonalny (jeśli istnieje → użyj `decisions[]`/`patterns[]`).
3. Hook `check-approval-before-impl` (jeśli zainstalowany przez blok) egzekwuje
   punkt 2 także fizycznie — nie polegaj wyłącznie na nim, sprawdź sam.

## 1. Plan wykonania z runtime.yml

- **Warstwy**: `orchestrate.layers` w kolejności (dla nestjs+ddd: domain →
  application → infrastructure → testing, agenci przypisani per warstwa).
- **Brak sekcji `orchestrate:`** (projekt bez bloku procesowego) → JEDNA
  generyczna warstwa: implement (agent generyczny stacku, np.
  `general-purpose`) → verify (reviewer stacku z ECC, np.
  `ecc:typescript-reviewer`).
- **Wzorce**: `patterns.always` + trafione `patterns.triggers` (jak /analyze
  0.5) + `patterns[]` z artefaktu analizy. Rule Cards wstrzykuj do promptów
  implementerów i verifierów.

## 1a. Pola warstwy: `role`, `patterns`, `checks`, `optional`, `create_when`, `tags`

Warstwa w `orchestrate.layers` poza `id`/`dirs`/`agent` może mieć pola sterujące.
Silnik MUSI je respektować — bez tego blok deklaruje bramki, których nikt nie
odpala (realna dziura, znaleziona 2026-08-11 w `library-layers`).

- **`role: "<jedno zdanie>"`** — czym ta warstwa JEST. Wstaw je do promptu
  implementera dosłownie, zaraz przed listą wzorców. `id: implementation` nie mówi
  agentowi niczego; „cały kod produkcyjny serwisu, bez podziału na warstwy domenowe"
  mówi mu i czego się od niego oczekuje, i czego ma nie robić.
- **`{LAYER_SCOPE}` do prompta verify** — MUSI dostać to samo, co implementer: `id`,
  `dirs` i `role` warstwy właśnie zaimplementowanej. Bez tego `code-quality-verifier`
  szuka plików WSZYSTKICH warstw (jego Phase 1 discovery domyślnie skanuje domain +
  application + infrastructure + testing naraz) — w warstwie `application` żąda więc
  repozytoriów, których jeszcze nie ma, VETO-uje ich brak, a implementer pod presją
  dopisuje infrastrukturę, o którą nikt nie prosił (juz-ide-api-2, 2026-08-16; kod był
  poprawny, ale poza zakresem — i cały cykl fix→verify, który do tego doprowadził, jest
  czystym kosztem). `{LAYER_SCOPE}` mówi verifierowi: plik spoza tych `dirs:` jest poza
  zakresem, nie brakujący — nie VETO-uj jego nieobecności.
- **`patterns: [...]`** — wzorce przypisane do TEJ warstwy, niezależnie od
  `patterns.always` i wyzwalaczy. Wnoszą je inne bloki przez `layer_contributions`
  (ślad `# +<blok>` w runtime.yml): blok walidacji nie ma własnej warstwy, ale ma coś
  do powiedzenia warstwie aplikacji. Traktuj je jak MUST-read na równi z `{PATTERNS}`.
- **`tags: [...]`** — po nich celują `layer_contributions`. Silnik ich nie
  interpretuje; są w runtime.yml, żeby dało się sprawdzić, dlaczego dany wzorzec
  trafił akurat tutaj.

- **`checks: ["lint", "validate:types"]`** — deterministyczne skrypty repo
  (konwencja `npm run <nazwa>` / `pnpm <nazwa>`, wg menedżera projektu).
  Uruchamia je **verify tej warstwy jako PIERWSZĄ czynność**, przed czytaniem
  kodu: to najtańszy sposób dostania NO-GO. Zasady:
  - **Liczy się kod wyjścia, nie treść outputu.** Skrypt kończący się zerem przy
    czerwonym raporcie NIE jest bramką (`--ci` bez przekazanej flagi,
    `--passWithNoTests` na nieistniejącym katalogu — obie pułapki spotkane
    w vytches-ddd). Werdykt opieraj na `$?`.
  - **Skryptu nie ma w `package.json` → pomiń i ZARAPORTUJ** („check
    `test:contracts` pominięty — brak skryptu"). Cicha omisja robi z bramki
    dekorację.
  - Niezerowy kod → `NO-GO` natychmiast, `violations[]` = wyjście skryptu.
    Nie analizuj kodu dalej i nie zgaduj przyczyny — to praca dla fix-kroku.
  - Verify bez `Bash` w `tools` nie obsłuży `checks` → STOP z komunikatem,
    zamiast po cichu przepuścić warstwę (blok złożony błędnie).
- **`optional: true` + `create_when: "<opis>"`** — warstwa warunkowa. Przed
  wejściem oceń `create_when` względem **faktycznego wyniku poprzednich warstw**
  (lista ścieżek + nazwy zmienionych eksportów, NIGDY pełny diff — WL6).
  Brak trafienia → pomiń i odnotuj w raporcie („warstwa `api-surface` pominięta
  — zmiana nie rusza publicznych wejść"). Warstwa bez `optional: true` jest
  zawsze obowiązkowa.
- `tests: true` — warstwa testowa; implementer dostaje minimalny input (ścieżki
  + ID reguł biznesowych), nie treść kodu z poprzednich warstw.

`final_gate` uruchamia **sumę `checks` ze wszystkich warstw, które faktycznie
weszły** — raz, na całości zmiany. To ostatnie miejsce, gdzie wychodzi regresja
między warstwami (testy zielone przed warstwą `api-surface`, czerwone po niej).

## 1b. Checkpoint warstw i wznowienie (przepełniony kontekst → nowa sesja)

- Artefakt analizy może mieć we frontmatter `layers_done: [domain, application]` —
  warstwy z werdyktem GO z poprzednich przebiegów. Jeśli lista istnieje: **POMIŃ
  te warstwy** (w raporcie: „pominięte — GO z poprzedniego przebiegu") i zacznij
  od pierwszej spoza listy. Zaufaj zapisowi — nie re-implementuj; zamiast pełnego
  verify zrób szybki sanity check (pliki warstwy istnieją w repo/stage).
- Po **KAŻDYM** GO warstwy silnik NATYCHMIAST dopisuje jej id do `layers_done:`
  w artefakcie (`Edit` — punktowo we frontmatter; NIE `Write` całego pliku, bo
  nadpisanie artefaktu gubi odpowiedzi na `open_questions`) — to checkpoint,
  dzięki któremu wznowienie nie płaci za zrobione.
- `final_gate` uruchamiaj ZAWSZE na końcu, także przy wznowieniu — obejmuje całość
  zmiany, nie ostatnią warstwę.

## 2. Silnik: Workflow tool (deterministyczny)

Uruchom przez `Workflow` (nie /goal). Pętla per warstwa
(`orchestrate.inner_loop`):

```
implement → verify → (violations? fix → verify)*  aż verdict==GO
max_attempts z runtime.yml (default 3); wyczerpane → ESCALATE_AND_HALT
```

2026-07-04, 2026-07-20):

- Kontekst między warstwami = **streszczenie decyzji + LISTA ścieżek plików**,
  NIGDY pełny `git diff` (WL6 w `hooks/workflow-lint.js`).
- KAŻDY agent dostaje budżet z runtime.yml `budgets` (default: implement
  `max_turns: 40`, verify `max_tool_calls: 15`) wstrzyknięty miękko do prompta
  („gdy się kończy — wypisz stan częściowy") ORAZ twardo przez
  `maxTurns`/`effort` wywołania (WL10).
- Implementerzy dostają: spec + `decisions[]` z artefaktu + Rule Cards +
  Codebase Facts (RAG, jeśli dostępny). Verify zwraca `{verdict, violations[]}`.

### 2a. Kanoniczny kształt skryptu (kopiuj, nie wymyślaj od nowa)

Elementy poniżej to reakcja na dwa realne przebiegi z 2026-08-14. `wf_23029d51-3a2`
(juz-ide-api-2): 22 agentów, 89 M tokenów wczytanego kontekstu, 22,5 min i **crash**
przy 36 realnych edycjach. `wf_d4b19f61-68c` (juz-ide-api-1): skrypt napisany
wzorowo — sondy, twarde `maxTurns`, retry 3×, ESCALATE, guardy na null — i mimo to
`failed` po 7,4 min, bo bronił się przed nullem, a przyszedł wyjątek. Wszystkie egzekwuje `hooks/workflow-lint.js`
(WL7, WL11, WL12, WL13, WL14), więc skrypt bez nich nie przejdzie bramki.

```js
// (0) HELPER ask() — KAŻDE agent({schema}) idzie przez niego. Ze schemą brak
//     StructuredOutput RZUCA WYJĄTEK, a nie zwraca null: guard `if (!wynik)` go NIE
//     złapie, a nieobsłużony kończy CAŁY przebieg jako `failed`. wf_d4b19f61-68c
//     (api-1) padł tak po 7,4 min — skrypt miał sondy, twarde maxTurns, retry 3× i
//     guardy na null, ale zero `try {`. Helper sprowadza oba tryby awarii
//     (martwy agent → null, brak StructuredOutput → wyjątek) do jednego: null.
// UWAGA: nazwa helpera jest dowolna (`ask`, `safeAgent`…), ale MUSI wołać `await agent(` —
// po tym workflow-lint go rozpoznaje i stosuje do wywołań przez niego wszystkie reguły
// (WL1 self-ocena, WL4, WL10 limity, WL13 duplikat sondy). Owijka, która wywołuje agenta
// pośrednio (przez zmienną, przez apply), staje się dla lintera niewidzialna i wyłącza te
// reguły po cichu — dokładnie to zdarzyło się 2026-08-14 w api-2, zanim callSites() to naprawiło.
async function ask(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    log(`${opts.label}: brak wyniku — ${e && e.message ? e.message : String(e)}`)
    return null
  }
}

// (1) SONDA — deterministyczne bramki uruchamiane RAZ, tanio, bez czytania kodu.
//     Verifier dostaje jej wynik jako FAKT i ma zakaz ponawiania. Bez tego jeden
//     przebieg zrobił 48 typechecków i 43 uruchomienia testów, a każde wyjście
//     (16-23 KB) zostawało w kontekście i mnożyło się przez kolejne tury.
const CHECKS_SCHEMA = { type: 'object', required: ['typecheck', 'tests'], properties: {
  typecheck: { type: 'string', enum: ['pass', 'fail'] },
  tests:     { type: 'string', enum: ['pass', 'fail', 'skipped'] },
  tail:      { type: 'string' } } }

const checks = await ask(
  'Uruchom: pnpm typecheck, potem pnpm vitest run <konkretny spec>. NIC nie czytaj, ' +
  'nie analizuj, nie poprawiaj. Zwróć status i ostatnie 40 linii przy błędzie.',
  { label: unitId + '-checks', model: 'haiku', effort: 'low', maxTurns: 8, schema: CHECKS_SCHEMA }
)

// (2) TWARDE LIMITY na każdym wywołaniu — proza w prompcie nie jest budżetem.
//     Do tego miękkie ostrzeżenie w treści: „gdy budżet się kończy, oddaj stan częściowy".
await ask(prompt, { label: unitId + '-impl', agentType: 'infrastructure-implementer', maxTurns: 40 })

// (3) SCHEMA NA PRODUCENCIE DANYCH — nie tylko na verify. Agent kończący turę
//     wywołaniem narzędzia oddaje PUSTY STRING; w tamtym przebiegu 6 z 17 zwrotów
//     było puste, w tym cała konsultacja specjalisty wklejona potem do 3 promptów.
//     To NIE koliduje z WL1: zakaz dotyczy self-OCENY (verdict/status), nie faktów.
//     Uwaga — schema ma własny tryb awarii, przeciwny do pustego stringa: agent, który
//     nie zdąży jej wypełnić, RZUCA. Dlatego (0) jest warunkiem sensowności (3).
const advice = await ask(consultPrompt, { label: 'consult', maxTurns: 15, schema: ADVICE_SCHEMA })

// (4) PIPELINE + GUARD NA NULL. parallel() nie rzuca — padnięty thunk wraca jako
//     null. `cat1.status` na nullu wywrócił cały przebieg po 22 minutach.
const results = await pipeline(UNITS, (u) => runUnit(u.id, u.prompt))
const done = results.filter(Boolean)
const failed = done.filter((r) => r.status !== 'GO')
if (failed.length) return { escalatedAt: failed[0].unitId, results: done }

```

### 2a′. Wyjątek NIE cofa zapisów — trzy bramki, których brak kosztował Fazę 5

`wf_69187830-205` (juz-ide-api-4, 2026-08-14): trzy kolejne wywołania implementera
wyczerpały budżet tur bez `StructuredOutput`. Każde rzuciło wyjątek — i każde
**zdążyło wcześniej zmodyfikować pliki**. Trzecie dopisało 133 linie. Sonda
przepuściła je (typecheck pass, 605/605 testów pass), bo dopisane były komentarze
opisujące Check D i Check E, a nie ich implementacja: komentarze się kompilują i nie
czerwienią żadnego istniejącego testu. Fabrykacja przeciekła do
`docs/security/security-gaps.md` i `TECH-DEBT.md` jako „naprawione". Wyłapał to
dopiero drogi `code-quality-verifier` w trzeciej, ostatniej dopuszczalnej próbie.

```js
// (5) SONDA MIERZY PRZYROST, NIE TYLKO ZIELONOŚĆ. "tsc pass + testy pass + niepusty
//     diff" jest spełnialne przez sam komentarz. Dla zadań dopisujących testy/kontrole
//     policz nowe bloki wykonywalne — to nadal czysty grep, żadnego LLM-a:
//       git diff --cached -U0 | grep -cE '^\+\s*(it|test|describe)\('
//     Diff dodający >100 linii przy ZERO nowych blokach to NO_GO niezależnie od tsc.
//     Uwaga: legalny refaktor testów też ma zerowy przyrost — dlatego bramka dotyczy
//     wyłącznie jednostek, których zakresem jest DODANIE kontroli, i mierzy przyrost
//     względem stanu sprzed jednostki, nie wartość bezwzględną.
const checks = await ask(probePrompt, { label: unitId + '-checks', model: 'haiku',
  effort: 'low', maxTurns: 8, schema: CHECKS_SCHEMA })   // CHECKS_SCHEMA += newTestBlocks: number

// (6) CICHY WYJĄTEK TO INNA AWARIA NIŻ NO_GO — licz je osobno. Merytoryczne NO_GO
//     znaczy „popraw to"; wyjątek z braku StructuredOutput znaczy „zakres nie mieści
//     się w budżecie" i trzecia próba TEGO SAMEGO kształtu tylko dokłada śmieci do
//     drzewa. Po DWÓCH z rzędu eskaluj zamiast powtarzać.
let silent = 0
for (let attempt = 1; attempt <= 3; attempt++) {
  const impl = await ask(implPrompt(attempt, lastViolations, silent), {...})
  if (!impl) {
    if (++silent >= 2) return { unitId, status: 'ESCALATE_AND_HALT',
      reason: 'dwa kolejne wyjścia bez StructuredOutput — zakres za duży na budżet, podziel jednostkę' }
    continue
  }
  silent = 0
  // ...
}

// (7) PRZEKAŻ FAKT CICHEJ AWARII DO KOLEJNEJ PRÓBY. Dziś ginie: fix-prompt dostaje
//     tylko violations z sondy ("zero zmienionych plików"), więc implementer myśli, że
//     to przejściowa usterka, a nie sygnał, że zadanie go przerasta.
const implPrompt = (attempt, violations, silent) => BASE
  + (silent ? `\n\nUWAGA: ${silent} poprzednia(e) próba(y) tej jednostki skończyły się BEZ `
      + `wyniku — budżet tur wyczerpany. Zakres jest najpewniej za duży. Zrób NAJMNIEJSZY `
      + `kompletny fragment i oddaj StructuredOutput, zamiast zaczynać całość od nowa. `
      + `Pliki mogły zostać częściowo zmodyfikowane przez poprzednią próbę — SPRAWDŹ ich `
      + `stan przed edycją, nie zakładaj czystego drzewa.` : '')
  + (violations ? `\n\nPOPRAWKA — napraw dokładnie te naruszenia:\n${violations}` : '')

// (6a) DIFF-SONDA PO CICHEJ ŚMIERCI — ZANIM powtórzysz implementację. Cicha śmierć
//     najczęściej znaczy „praca wykonana, budżet spalony na oddaniu wyniku", a NIE
//     „praca niezrobiona". TS-TOKEN-TOPUP-001/A2 (api-1, 2026-08-14): implementer
//     umarł 2× bez StructuredOutput, choć kod leżał KOMPLETNY w working tree i
//     typecheck przechodził — skrypt spalił drugą pełną próbę (~40 tur) i eskalował;
//     dopiero ręczna interwencja przełączyła na weryfikację istniejącego stanu.
//     Po nullu z implementera: tania sonda `git diff --name-only` (haiku, effort low);
//     jeśli pliki jednostki SĄ zmienione → idź do VERIFY-EXISTING (weryfikacja od zera
//     + punktowe fixy naruszeń), NIE do re-implementacji. WL16 pilnuje tej formy.
if (!impl) {
  const probe = await ask('W repo uruchom: git diff --name-only (+ status --short). NIC więcej.',
    { label: unitId + '-diff-probe', model: 'haiku', effort: 'low', maxTurns: 5, schema: DIFF_SCHEMA })
  // unitTouches: dopasowanie pliku do ZAKRESU tej jednostki (np. glob/lista w UNITS[i].files
  // albo prefiks katalogu warstwy) — NIE samo „diff niepusty": inne jednostki tego przebiegu
  // już zmieniły drzewo, więc bez zawężenia każdy cudzy diff wyglądałby jak wykonana praca.
  if (probe && probe.files.some(f => unitTouches(unitId, f))) {
    return verifyExistingThenFix(unitId, probe.files)   // praca jest — zweryfikuj, nie powtarzaj
  }
  if (++silent >= 2) return { unitId, status: 'ESCALATE_AND_HALT', reason: '…' }
  continue
}

// (9) ROUTING MODELI — jawnie, nie dziedziczeniem. agent() bez `model:` dziedziczy
//     model GŁÓWNEJ pętli — na sesji z drogim modelem każda sonda i implementer
//     liczą kontekst po najdroższej stawce (a kontekst to ~91% rachunku przebiegu).
//     Jakość chronią weryfikatory, nie drogi implementer:
//       sondy/probes            → model: 'haiku',  effort: 'low'
//       implementery            → model: 'sonnet'
//       verify per-jednostka    → model: 'sonnet' (rule-cards robią robotę, nie tier)
//       FINAL GATE              → bez override (dziedziczy sesyjny, zwykle najmocniejszy)
```

**Wyjątek nie jest rollbackiem.** `agent()`, które rzuciło, zostawia po sobie wszystkie
`Edit`/`Write`, jakie subagent zdążył wykonać. „Nieudane" z perspektywy orkiestratora
nie znaczy „bez skutków na dysku" — kolejna próba startuje na częściowo zmienionym
drzewie. Dlatego (7) każe implementerowi sprawdzić stan plików, a nie zakładać czysty
start, i dlatego bramka „kod istnieje" (WL3) mierzy `git diff`, nie raport agenta.

### 2a″. Zakaz cofania — `git checkout`/`restore`/`stash`/`reset` NIGDY

Reguła obowiązuje KAŻDY prompt implementera i KAŻDY prompt naprawczy, bez wyjątku:

**`git checkout`, `git restore`, `git stash` i `git reset` są zakazane na KAŻDEJ
ścieżce — zero wyjątków.** Zakaz obejmuje wprost przypadek „to tylko mój własny
plik" i przypadek „przywracam, jak było" — to nie są furtki, to najczęstsza maska,
pod którą zakaz bywa łamany.

Agent, który uważa jakiś plik za spoza swojego zakresu, **zgłasza to w raporcie
końcowym i na tym kończy**. Nigdy tego pliku nie cofa.

Uzasadnienie: cofnięcie to jedyny sposób, w jaki zweryfikowana praca może zniknąć
NIE ZOSTAWIAJĄC ŚLADU w diffie, który człowiek ogląda przed commitem. Awaria
workflow zostawia `failed` w journalu (2a). Zły werdykt zostawia `violations[]`
(2). Nawet cichy wyjątek zostawia częściowo zmienione pliki na dysku (2a′
powyżej). Cofnięcie nie zostawia nic — diff po prostu przestaje zawierać to, co
ktoś inny już zatwierdził.

**Protokół mutacji stanu, sformułowany pozytywnie:** do zapisania i przywrócenia
stanu używaj `cp`, nigdy gita. To jedyne narzędzie, którym wolno wykonać operację
wyglądającą z zewnątrz podobnie do cofnięcia — nie złagodzenie zakazu powyżej
o kolejny przypadek.

`wf_f24e8621-140` (run journal, 2026-08-12): warstwa `gates` zaimplementowała
swoje kryteria w dwóch plikach; jej weryfikator zwrócił GO. Warstwa `baselines`
ruszyła jako następna — jej pytania kontrolne zawierały standardowy strażnik
zakresu („czy zmiana mieści się w ścieżkach zakresu, bez postronnych
modyfikacji?"). Ten weryfikator zobaczył w drzewie roboczym zmiany warstwy
`gates` i zgłosił je jako zanieczyszczenie zakresu — POPRAWNIE, z jedyną
informacją, jaką miał: NO-GO. Agent naprawczy rozwiązał naruszenie najprostszą
dostępną drogą: `git checkout --` na obu plikach warstwy `gates`, po czym nałożył
z powrotem wyłącznie własną wąską edycję. Zatwierdzone kryterium zniknęło bez
śladu w diffie, który człowiek miał później przeglądać. Warstwa przeszła. Bramka
końcowa to złapała, ale cztery warstwy i ~1,4 mln tokenów subagentów już poszły,
a odzyskanie było ręczne. Żaden agent nie zachował się źle — zabrakło reguły.

**Czego ten zakaz sam nie rozwiązuje:** weryfikator warstwy N nadal nie wie, że
pliki warstw 1..N-1 są już zatwierdzone, i będzie je zgłaszał jako
zanieczyszczenie zakresu — zakaz blokuje tylko najgorszą reakcję na ten błędny
sygnał, nie usuwa samego sygnału. Deterministyczne domknięcie (pomiar przyrostu
zmian per ścieżka względem stanu sprzed danej warstwy) jest osobnym, jeszcze
nierozstrzygniętym zadaniem.

### 2b′. Wstrzykiwanie kart reguł do promptów (punkt 8 wzorca)

`orchestrate.md` wymaga tego od linii 148 („Implementerzy dostają: spec + decisions +
**Rule Cards** + Codebase Facts"), a **nie robi tego żaden skrypt**. Skutek zmierzony
2026-08-14: prompt implementera w api-1 nie zawierał ani jednego wystąpienia słowa
`patterns`, `retrieve` czy `knowledge` — agent szukał więc tam, gdzie umiał, i skończył
na `find / -iname "*on-conflict-builder*"`, trafiając w cudzy projekt. W api-2 prompt
podawał ścieżki wzorców z poleceniem „przeczytaj CAŁY plik": 20-36 KB weszło do kontekstu
i mnożyło się przez każdą turę.

**Ograniczenie, które przesądza o kształcie:** skrypt Workflow **nie ma dostępu do
filesystemu** (żadnego `readFileSync`). Kartę czyta KOORDYNATOR — przed uruchomieniem
Workflow — i przekazuje przez `args`.

```js
// KROK 1 (koordynator, PRZED Workflow): Read na kartach z listy `patterns` warstwy
//   z runtime.yml. Karta, nie pełny wzorzec: 8 KB kontra 20-36 KB, a treść jest ta sama
//   w formie decyzyjnej. Jeśli karty nie ma — to sygnał, że trzeba ją napisać, nie powód,
//   żeby wkleić pełny wzorzec.
//   Read('patterns/infrastructure/geo-spatial-query-pattern_summary.md') → tekst

// KROK 2: przekaż jako args (NIE wklejaj literałem do skryptu — args przeżywają resume
//   i nie rozdymają pliku skryptu o 8 KB na kartę).
Workflow({ script, args: { cards: {
  'infra':  '<treść geo-spatial-query-pattern_summary.md>',
  'domain': '<treść aggregate-pattern_summary.md>',
} } })

// KROK 3 (w skrypcie): wklej treść do prompta implementera i ZAMKNIJ ścieżkę eksploracji.
const card = (args.cards || {})[layerId]
const implPrompt = SPEC
  + (card ? `\n\n=== KARTA REGUŁ — obowiązująca dla tej warstwy ===\n${card}\n`
          + `=== koniec karty ===\n\n`
          + `Masz komplet reguł POWYŻEJ. NIE czytaj pełnego wzorca, NIE grepuj repo w `
          + `poszukiwaniu wzorca, NIE szukaj przykładów w innych projektach. Jeśli karta `
          + `naprawdę nie rozstrzyga Twojego przypadku — napisz to w raporcie jako `
          + `\`gap: <czego brakuje w karcie>\` i zaimplementuj najbliższy wariant zgodny `
          + `z tym, co karta mówi. Luka w karcie to nasz błąd do naprawienia, nie Twój `
          + `powód do eksploracji.` : '')
```

**Dlaczego to jest tańsze, a nie tylko inne.** Karta wklejona do prompta wchodzi do
`cache_creation` **raz** i w kolejnych turach czytana jest po stawce cache read. Wzorzec
czytany przez agenta `Read`-em wchodzi w turze N i jest przeliczany w każdej turze od N do
końca — przy 40-90 turach implementera to ta sama treść policzona kilkadziesiąt razy.
To jest mechanizm, który wygenerował 89 M tokenów cache read w jednym przebiegu.

**Czego NIE wstrzykiwać:** pełnych wzorców (od tego są karty), treści RAG „na zapas"
(implementer nie ma czego szukać, bo ma kartę), całych plików ADR. Jeśli karta rośnie
powyżej ~8 KB, `lint-patterns.mjs` to zgłasza — to znak, że wzorzec potrzebuje podziału,
nie że limit jest za mały.

**Weryfikator dostaje co innego niż implementer.** Implementer: karta (`quickstart`) —
ma pisać, nie rozważać. Weryfikator: pełny wzorzec albo poziom `core`/`exhaustive` — ocenia
zgodność, więc potrzebuje wyjątków od reguły, których karta świadomie nie zawiera.

**Pipeline, nie bariera.** `parallel()` blokuje do najwolniejszego. Jednostka B
czekała tam na A, choć zależała wyłącznie od własnego pliku. Bariera jest
uzasadniona tylko wtedy, gdy następny etap potrzebuje WSZYSTKICH wyników naraz
(dedup, zliczenie, „zero znalezisk → pomiń weryfikację"). Sekwencja jest
uzasadniona, gdy dwie jednostki dotykają TEGO SAMEGO pliku — wtedy łańcuch
w jednym `pipeline`, nie dwa równoległe.

**Czego NIE tnij** — to kupiona jakość, nie narzut: niezależny verifier zamiast
self-reportu, 3 próby z `violations`, pełna lektura kontraktu przed edycją,
guardian jako źródło prawdy, testy L2 widoczności, bramka końcowa.

### 2c′. Po starcie czegoś w tle NIE wywołuj ScheduleWakeup

`Workflow` i `Agent` uruchomione w tle **same** wracają z powiadomieniem, gdy skończą.
Sięganie po `ScheduleWakeup`, żeby „poczekać", kończy się błędem
`prompt is required when stop is not true` (zaobserwowane 3× w api-2 i api-4, za każdym
razem sesja dochodziła do tego od nowa). `ScheduleWakeup` należy do trybu `/loop` —
samodzielnego tempa iteracji — a nie do czekania na zadanie, które i tak Cię zawoła.

Czekasz na przebieg? Nie rób nic. Zajmij się kolejnym krokiem albo zakończ turę.

## 2b. Higiena kontekstu i awarie workflow (jakość > oszczędzanie)

- **NIE startuj Workflow z sesji bliskiej limitu kontekstu.** Subagenci dostają
  świeże konteksty, ale orchestrator musi mieć zapas na fix-loop, final gate
  i raport — „będę zwięzły" w roli koordynatora to utrata jakości. Jeśli sesja
  pokazuje ostrzeżenia o kontekście: ZATRZYMAJ SIĘ PRZED uruchomieniem Workflow
  i wypisz „⚠ Kontekst na wyczerpaniu — otwórz świeżą sesję i odpal
  /orchestrate {TASK-ID}; checkpoint layers_done sprawia, że wznowienie
  jest prawie darmowe." Lepiej stracić minutę na restart niż przebieg na
  zduszonym koordynatorze.
- **Budżety to bezpieczniki, nie sufit ambicji**: miękki limit ratuje częściowy
  output, twardy chroni przed klifem bez raportu. NIE zaciskaj domyślnych, żeby
  „oszczędzać" — gdy task realnie potrzebuje więcej, podnieś `budgets:`
  w project.yml (nadpisuje bloki bez ograniczeń, OQ3).
- **Po awarii workflow (✘ Failed): diagnoza przed re-runem.** Przeczytaj
  `<transcriptDir>/journal.jsonl` (realne zwroty agentów — nie zgaduj przyczyny),
  popraw skrypt/prompt i wznów `Workflow({scriptPath, resumeFromRunId})` —
  ukończone wywołania wracają z cache, nie płacisz za nie drugi raz. Nigdy nie
  odpalaj od zera bez diagnozy.

## 3. Bramka końcowa i wyjście

- `orchestrate.final_gate` z runtime.yml (dla ddd: `security-e2e-verifier`);
  `on_fail: ESCALATE_AND_HALT` — wypisz werdykt i zatrzymaj się, nie obchodź.
- `exit: STAGE_NOT_COMMIT` → `git add` zmienionych plików, raport (warstwy,
  werdykty, pliki, koszty), **HALT — commit robi człowiek**.
- **Usuń `.claude/run-state/orchestrating.json`** — na każdej ścieżce wyjścia,
  także po `ESCALATE_AND_HALT` i po odmowie z bramek kroku 0. Zostawiony znacznik
  trzyma sesję w STRICT do końca TTL: kolejna, zwykła praca w tym repo odbije się
  od `check-delegation` bez widocznego powodu.
- Raport ma **dwie części, w tej kolejności**:
  1. **Co się zmieniło** — 2-4 zdania rejestrem `human_voice` z runtime.yml (domyślnie:
     polski, biznesowy, bez nazw klas, ścieżek i numerów ADR). Co teraz działa inaczej,
     czego użytkownik nie zobaczy, co zostało do decyzji. To czyta człowiek przed
     commitem i na tej podstawie go robi albo nie.
  2. **Przebieg** — które sloty/agenci działali (z `# source:` bloku), ile prób zjadła
     każda warstwa, czy budżety zadziałały miękko, werdykty bramek, lista plików.
- Nie zaczynaj raportu od tabeli warstw. Człowiek, który odpalił `/orchestrate` godzinę
  temu, wraca po odpowiedź „czy to jest gotowe do commita", nie po przebieg maszyny —
  przebieg jest dowodem dla tej odpowiedzi, więc idzie pod nią.
