---
name: analyze
description: |
  Generyczna faza RESEARCH/ANALIZY sterowana kompozycją bloków (ADR 0008).
  Czyta .claude/config/runtime.yml (bramka: brak pliku = odmowa startu), odpala
  panel advisory ze slotów bloków (aktywacja warunkowa `when:`), pisze artefakt
  analizy i kończy wg `analyze.exit` (PAUSE = twarda bramka approval, wnosi ją
  blok ddd/core). NIGDY nie implementuje.

  Usage: /analyze <TASK-ID>
tools: Task, Read, Write, Edit, Grep, Glob, Bash
disallowedTools: MultiEdit, NotebookEdit
---

# /analyze — research sterowany runtime.yml (silnik szkielet+sloty)

**ZERO IMPLEMENTACJI.** Silnik nie zna żadnego stacku — wszystko, co stackowe,
przychodzi z `runtime.yml`.

**Co wolno zapisać — lista zamknięta.** Ograniczeniem jest ta lista, nie brak
narzędzia:

1. `project-orchestration/analysis/{TASK-ID}.analysis.md` — artefakt analizy;
2. `docs/security/threat-models/TM-{TASK-ID}.md` — gdy odpala się stage `threat-model`;
3. **rejestr threat-modeli** (`docs/security/threat-models/index.md` lub odpowiednik),
   gdy projekt wymaga wiersza per TM.

Nic poza tym — żadnego pliku w `src/`, żadnego taska, żadnego ADR-a.

> **Dlaczego `Edit` jest dozwolony (zmiana 2026-08-12).** Był zabroniony, a `Write`
> nie — zakaz nie chronił więc przed niczym (Writem można nadpisać dowolny plik),
> za to blokował jedyną rzecz, której pozycja 3 wymaga: dopisania wiersza do
> istniejącego rejestru. Realny skutek widoczny w przebiegu z 2026-08-12: TM powstał,
> `Edit` na `index.md` odbił się o uprawnienie, a przebieg zamknął się wpisem „dług
> administracyjny do wykonania ręcznie". Rejestr TM w `juz-ide-api-2` deklarował
> wtedy 90 pozycji przy 106 plikach na dysku — dokładnie ten dryf, przed którym
> ostrzega `patterns/cross-layer/registry-drift-guard-pattern.md`. Bramką jest lista
> powyżej i zakaz implementacji, nie odebrane narzędzie.

**Zakres narzędzi (zmiana 2026-08-12).** `Grep`/`Glob` były wcześniej zabronione, żeby
wymusić delegowanie wyszukiwania do tanich agentów. W praktyce dawało to odwrotny skutek:
komenda nie umiała znaleźć pliku taska, delegowała discovery, a subagent bez tych narzędzi
zgadywał ścieżki plików — jeden taki przebieg spalił 219k tokenów na serię „File does not
exist". Dlatego:

- `Grep`/`Glob` — do **celowanego** szukania (znajdź plik taska, sprawdź, czy symbol
  istnieje). Szerokie przeczesywanie repo nadal deleguj do Explore — ale delegowanie
  ma być decyzją o koszcie, nie skutkiem braku narzędzia.
- `Bash` — **wyłącznie** do rzeczy deterministycznych i tylko-do-odczytu: uruchomienie
  `index-decisions.mjs` (krok 0.8), `git log`/`git status`. Żadnych zapisów, żadnych
  instalacji, żadnego uruchamiania testów — od tego jest `/orchestrate`.
- `Edit`/`MultiEdit` pozostają zabronione: analiza nie dotyka kodu ani cudzych dokumentów.

## 0. Bramka wejścia (twarda)

- `Read(".claude/config/runtime.yml")`. **Brak pliku → STOP**: wypisz
  „Projekt nie ma skomponowanego setupu bloków (ADR 0008). Dodaj `stack_blocks:`
  do project.yml i odpal setup-project.sh, albo użyj starych komend
- `schema_version` inne niż `1` → STOP: „runtime.yml w starej wersji — odpal
  setup-project.sh ponownie."
- Ustal `{TASK-ID}` z argumentu; `project-orchestration/tasks/{TASK-ID}.md`
  jeśli istnieje = spec.

## 0.a1 Preflight stanu drzewa (PRZED rozpisaniem jednostek pracy)

Zanim podzielisz task na jednostki, sprawdź **czy praca nie jest już zrobiona**:

```bash
git status --short                    # niescommitowane zmiany na branchu
git log --oneline -15                 # co weszło od czasu napisania taska
```

Dla każdej planowanej jednostki potwierdź grepem na KONKRETNYM pliku, że wzorzec,
który każesz zmigrować, faktycznie tam jeszcze jest. Znalezione „już zrobione"
odnotuj w artefakcie jako `status: already-done` z dowodem (hash commita albo
linia z `git status`) — i **nie twórz dla niej jednostki**.

Dlaczego to jest w bramce, a nie w dobrych chęciach: w przebiegu
`wf_23029d51-3a2` (juz-ide-api-2, 2026-08-14) dwie z sześciu jednostek pracy
odkryły dopiero po pełnym rozruchu drogiego agenta, że zmiany są już w drzewie
(„Both migrations were found already implemented as uncommitted", „the OQ6
premise is stale"). Każde takie odkrycie kosztuje pełny kontekst implementera —
kilka dolarów za powtórzenie `git status`, którego nikt nie zrobił.

## 0a. Security preflight (slot warunkowy)

Jeśli panel w runtime.yml zawiera stage `threat-model`: dopasuj jego `when:`
(regex) do etykiet/treści taska. Trafienie + brak
`docs/security/threat-models/TM-{TASK-ID}.md` → uruchom stage (STRIDE/DREAD/
LINDDUN wg `skills/security/threat-model`), który ZAPISUJE TM do tej ścieżki.
TM istnieje → użyj (link w artefakcie). TM istnieje, ale nie pokrywa zakresu →
tryb ADDENDUM; jeśli addendum nie powstaje w tym przebiegu, artefakt MUSI mieć
BLOKUJĄCE `open_question` („TM addendum: <wektory>", `answer: null`).

## 0.5. Pattern discovery (z runtime.yml, nie z README)

- `patterns.always` z runtime.yml + te grupy `patterns.triggers`, których
  keywordy trafiają w treść taska. **To jest cała lista** (zwykle 5-10) — nie
  wczytuj patterns/README.md jako listy, nie ładuj „na wszelki wypadek".
- Wczytaj Rule Cards (`*_summary.md`) TYLKO dla tej zawężonej listy i wstrzykuj
  ich treść do promptów panelu (agenci ECC nie znają naszych konwencji).

## 0.6. RAG (graceful) + DOWÓD UŻYCIA

`collection` z `runtime.yml` (`knowledge.collection` — źródłem jest
`project.yml → knowledge_collection`; osobny `knowledge.json` był drugim configiem
obok runtime i został zmigrowany). **NIGDY nie konstruuj nazwy z nazwy katalogu
projektu** — bliźniacze checkouty tego samego repo współdzielą JEDNĄ kolekcję
(juz-ide-api-1..4 → `code_juz_ide_api`; zgadnięte `code_juz_ide_api_2` = pusty
RAG, incydent 2026-08-14). Deleguując do subagenta wstrzykuj **literalną**
wartość do promptu, nie instrukcję „weź z runtime.yml".
`retrieve_code(<intencja>, collection=...)` → Codebase Facts do impl-analizy;
`retrieve_patterns(<task>)` → grounding panelu. Fallback bez MCP: statyczna
lista z 0.5. Artefakt MUSI mieć frontmatter `rag:` — lista zapytań z liczbą
trafień albo jawne `rag: skipped (powód)`.

## 0.7. Decision cards (tylko gdy blok ddd/core aktywny)

Jeśli `stack_blocks` w runtime.yml zawiera `ddd/core`: wczytaj trafne karty
z `.claude/knowledge/decisions/`, skonsultuj precedens (`docs/adr/` — odkrycie
realnej ścieżki ADR deleguj do wąskiego Explore-agenta, NIE zgaduj slugów;
`BUSINESS_RULES.yaml`). Decyzja już zapadła → zastosuj i cytuj, nie re-decyduj.
Każda decyzja → `decisions[]` z uzasadnieniem wg karty i `propose_adr: true`
gdy nowa. Bez ddd/core: pomiń krok.

## 0.8. Rejestr decyzji (gdy panel ma stage `decision-gate`)

Zanim ruszy panel, odpal indeksację — **deterministycznie, skryptem, nie agentem**:
`node <claude-patterns>/scripts/index-decisions.mjs <projekt>` → wynik ląduje w
`.claude/config/decisions-index.json` (regenerowany za każdym razem; ADR-y powstają
między setupami, więc cache byłby kłamstwem). Skrypt filtruje po statusie i
`adr_exclude` z `params."decision-registry"`, więc do panelu wchodzi kilka wpisów,
a nie cały katalog (juz-ide: 123 pliki → ~120 aktywnych → kilka trafnych).

Czytając indeks pamiętaj, czego on NIE rozstrzyga:

- `needs_scope_check: true` = uchylenie albo zmiana CZĘŚCIOWA. Taki wpis **nadal
  obowiązuje**, a pole `scope` niesie zdanie mówiące, co dokładnie padło, a co nie
  (np. ADR-0076: „uchylony jest wyłącznie fixed cap 5 km; 25 km² i guardrail 15 km
  obowiązują dalej"). **Cytuj `scope` zamiast otwierać plik** — po to tam jest.
  Gdy `scope` milczy o Twoim parametrze, sprawdzasz go wg `lookup_order`: kod
  i `BUSINESS_RULES.yaml` przed nagłówkiem ADR, nigdy odwrotnie.
- `source: frontmatter` = status pochodzi ze strukturalnych metadanych pliku
  (`status`, `superseded_by`, `supersedes`, `scope`); `source: proza` = odczytany
  z nagłówka i jest mniej pewny.
- `problems.duplicate_ids` — jeden numer, dwa pliki (w juz-ide 13 takich par).
  Cytując ADR podawaj ścieżkę pliku, nie sam numer.
- `problems.missing_status` — brak czytelnego statusu ≠ nieaktualny; te wpisy
  wchodzą jako aktywne i wymagają ostrożności.

Stage `decision-gate` (`blocking: true`) NIE dostaje surowego pliku ani całej
tablicy `entries[]` (98 KB przy 150 aktywnych decyzjach w juz-ide — to właśnie ten
budżet miał chronić). Wstrzyknij do jego prompta:
- `brief[]` — jedna linia na wpis (kind/id/status/tagi/streszczenie do 200 znaków),
  pole istnieje w indeksie dokładnie po to (`index-decisions.mjs`, komentarz przy
  `brief:`); to jest pierwszy przebieg — "czy COKOLWIEK tu dotyczy taska".
- `entries[]` **przefiltrowane do `needs_scope_check: true`** (zwykle kilkanaście
  z kilkuset) — to jedyne wpisy, gdzie `scope` faktycznie trzeba zacytować (patrz
  bullet wyżej); resztę `entries` pomiń, `brief` już je pokrył.
- `problems` w całości (małe, strukturalne) i `open_questions`.

Stage odpowiada na jedno pytanie: czy task opiera się na parametrze czekającym na
decyzję albo uchylonym. Trafienie → **blokujące** `open_question` (`answer: null`)
w artefakcie, cytujące wpis i miejsce sporu. Stage jest tani (haiku, czyta JSON
tej wielkości, nie cały indeks), nie ma `when:` i nie wolno go pomijać.

## 0.9. Filtr kosztu dla slotów governance

Sloty z bloku `governance` (`strategy-fit`, `data-classification`) **pomijaj dla
tasków `type: refactor|bugfix|chore`** z pliku taska — to pierwsze i najskuteczniejsze
sito, `when:` jest dopiero drugim. Porządkowanie kodu nie potrzebuje perspektywy
biznesowej.

Gdy slot ma `corpus:` (lista kanonu z `params`), **nie wklejaj tych plików do
prompta** — 13 dokumentów kanonu juz-ide to ~284 KB. Zamiast tego: wąski
Explore/haiku przeszukuje `corpus` pod kątem taska i zwraca CYTATY z namiarami
(plik + sekcja), a cytaty wędrują do slotu. `inject:` to osobna półka — krótkie
fragmenty (np. apex §5) wklejane wprost, zawsze.

## 1. Panel — sloty z runtime.yml, agenci jako LIŚCIE

Iteruj `analyze.panel` W KOLEJNOŚCI z runtime.yml. Dla każdego slotu:

- `when:` obecne → regex vs treść/etykiety taska; brak trafienia = pomiń slot.
  **Zawsze wypisz, KTÓRE słowo trafiło**: `threat-model ← "auth"`. Dopasowanie idzie po
  podłańcuchu, więc `auth` łapie `author` i `geographic-auth`, `list` łapie `specjalista`,
  a `pin` łapie `mapping`. Gdy trafione słowo jest fragmentem innego wyrazu i sens slotu
  do taska nie pasuje — **powiedz to i pomiń slot**, zamiast odpalać panel „bo regex".
  Odwrotny błąd jest groźniejszy: `cross_context` z podkreśleniem NIE łapie „cross-context"
  pisanego z dywizem. Brak trafienia nie jest dowodem, że tematu nie ma — gdy widzisz
  w tasku ryzyko, którego żaden `when:` nie złapał, potraktuj to jak trafienie i zgłoś lukę
  w regexie bloku.
- `model:` / `effort:` obecne → **wywołaj agenta z tym modelem**, nadpisując jego
  frontmatter. Slot istnieje po to, żeby dało się podnieść model agentowi, którego
  definicji nie kontrolujemy (np. `ecc:*`). Gdy slot milczy, obowiązuje domyślna
  polityka: zbieranie i odczyt → haiku, przygotowanie materiału i implementacja →
  sonnet, **ocena i synteza → opus**.
- Wołaj agenta **BEZ narzędzia Task** (liść — research zrobiła TA komenda
  w 0.5-0.7, nie panel) i **BEZ parametru `name`** (mailbox gubi wyniki).
- **Budżet (z runtime.yml `budgets`, default `max_tool_calls: 15`)** wstrzyknij
  do KAŻDEGO prompta: „masz budżet ~N wywołań narzędzi; gdy się zbliża,
  NATYCHMIAST wypisz raport w obecnej formie — częściowy output > brak outputu".
- Wstrzykuj: spec taska + Rule Cards (0.5) + **STRESZCZENIE poprzednich stage'ów**
  (ustalenia + otwarte pytania, kilkanaście linii) — NIGDY pełny surowy output
  (anty-pattern kwadratowego wzrostu; incydent 2026-07-04/WL6).
- Stage przerwany → jego niezweryfikowane tezy WYŁĄCZNIE jako `open_questions`.

**Synteza** (szkielet silnika, nie slot): `tech-lead` zbiera całość, wskazuje
kierunek, wypisuje OTWARTE PYTANIA. **Wołaj go z `model: opus`** — jego frontmatter
mówi `haiku`, co jest właściwe dla `/pulse` i `/sprint`, ale nie dla ostatniego
osądu w analizie: to tutaj wejście z Opusa i Sonneta zamienia się w `decisions[]`
i listę pytań, na których stanie implementacja. Fallback: gdy środowisko przerywa liście,
syntezę robi główny agent (ma pełen kontekst) — odnotuj w artefakcie.

**Weryfikacja nazwanych symboli PRZED zapisem**: każdą funkcję/klasę/ścieżkę
wymienioną w checklistach/decisions zgrepuj (wąski Explore, jawny limit
tool-calli). Nie istnieje → jawnie oznacz „TO TRZEBA STWORZYĆ" (incydent
TS-SEC-ONBEHALF-001: aspiracyjna nazwa czytana jako fakt = implementer w pętli
do klifu maxTurns).

## 2. Artefakt (jedyny Write)

`project-orchestration/analysis/{TASK-ID}.analysis.md` wg
`templates/task-analysis-template.md`: frontmatter `task`, `status:
awaiting-human` (gdy exit=PAUSE) / `status: ready` (inaczej), `threat_model:`,
`open_questions[]` (`answer: null`), `decisions[]`, `patterns[]` (z 0.5),
`rag:` (0.6), `stack_blocks:` (kopia z runtime.yml — audytowalność doboru
panelu). Odpowiedzi żyją WYŁĄCZNIE we frontmatter; body co najwyżej odsyła.

### 2a. Dwa rejestry: co czyta człowiek, co czytają agenci

Artefakt ma dwóch odbiorców o rozbieżnych potrzebach. Agent chce namiaru bez
szukania: nazwy klasy, ścieżki, numeru ADR. Człowiek zatwierdzający analizę chce
wiedzieć, o co go pytasz — te same namiary są dla niego kosztem, nie pomocą. Jeden
tekst nie obsłuży obu, więc pola są dwa:

| pole | odbiorca | reguła |
|---|---|---|
| `open_questions[].ask` | człowiek | pytanie, na które da się odpowiedzieć bez otwierania repo |
| `open_questions[].q` | agent, audyt | pełny kontekst techniczny, jak dotąd |
| `decisions[].means` | człowiek | co ta decyzja zmienia dla produktu albo użytkownika |
| `decisions[].choice` / `rationale` | agent | wybór i jego techniczne uzasadnienie |

**`ask` i `means` są obowiązkowe** — artefakt bez nich jest niekompletny tak samo
jak bez `answer: null`. Rejestr weź z `human_voice` w runtime.yml (`language`,
`register`, `max_sentences`, `avoid[]`). Sekcji brak (projekt sprzed tej zmiany,
runtime.yml jeszcze nieprzeliczony) → przyjmij domyślne: polski, biznesowy, do
2 zdań, bez nazw klas, ścieżek plików i numerów ADR/BDR.

Test, czy `ask` jest napisane dobrze: **czy człowiek, który nie zna tego kodu,
odpowie na nie sam?** Jeśli musi najpierw zapytać, co znaczy nazwa w pytaniu, to
nie jest jeszcze `ask` — to skrócone `q`.

```yaml
# ŹLE — q przebrane za ask
ask: "Czy zamknąć B9/B10 w rejestrze wpisem BDR, skoro ADR-0094 i AuthorTierClassifierDomainService już to rozstrzygają?"

# DOBRZE — decyzja ta sama, próg wejścia żaden
ask: >-
  Stara decyzja z rejestru jest już rozwiązana w kodzie, ale formalnie wisi jako
  otwarta. Zamykamy ją teraz, czy zostawiamy do osobnego przeglądu?
```

Nie chowaj w `ask` konsekwencji wyboru. „Szybciej znaczy drożej", „to opóźni
wydanie o tydzień", „bez tego nie wyjdziemy poza jeden kraj" — to jest ta część,
dla której człowiek w ogóle czyta pytanie.

To samo dotyczy prozy w body: `## Synteza` i `## Ryzyka / uwagi` pisz rejestrem
`human_voice`, a szczegół techniczny zostaw polom frontmattera. Przed zapisem
przepuść te sekcje przez skill `humanizer` (`skills/quality/humanizer/`) — ma
osobną sekcję o rejestrze biznesowym.

**Sekcje są warunkowe, nie stałe.** Artefakt dostaje sekcję tylko od slotu, który
faktycznie wszedł. Projekt bez bloku `governance` (np. biblioteka) nie ma widzieć
nagłówka „Zgodność ze strategią: n/d" w każdej analizie. Gdy weszły sloty
governance, dopisz do frontmattera:

```yaml
governance:
  strategy_fit: { verdict: wzmacnia-rdzeń | obok-rdzenia | sprzeczne, cytaty: ["apex §5: …"] }
  decision_gate: { blocking: false, sprawdzone: [BDR-004, ADR-0106] }
  data_classification: { poziom: wewnętrzne | publiczne, uzasadnienie: "…" }
```

## 3. Wyjście wg runtime.yml

  `status: approved`, dopiero wtedy `/orchestrate {TASK-ID}`. **KONIEC —
  nie wołaj orchestracji, nie implementuj.**
- Inaczej → wypisz: „Analiza gotowa (bez twardej bramki — brak bloku ddd/core).
  Rekomendowany następny krok: /orchestrate {TASK-ID}." i zakończ.
