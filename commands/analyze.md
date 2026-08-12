---
name: analyze
description: |
  Generyczna faza RESEARCH/ANALIZY sterowana kompozycją bloków (ADR 0008).
  Czyta .claude/config/runtime.yml (bramka: brak pliku = odmowa startu), odpala
  panel advisory ze slotów bloków (aktywacja warunkowa `when:`), pisze artefakt
  analizy i kończy wg `analyze.exit` (PAUSE = twarda bramka approval, wnosi ją
  blok ddd/core). NIGDY nie implementuje.

  Usage: /analyze <TASK-ID>
tools: Task, Read, Write, Grep, Glob, Bash
disallowedTools: Edit, MultiEdit, NotebookEdit
---

# /analyze — research sterowany runtime.yml (silnik szkielet+sloty)

**ZERO IMPLEMENTACJI.** Jedyny własny `Write` = artefakt
`project-orchestration/analysis/{TASK-ID}.analysis.md` (+ warunkowo threat-model
przez stage). Silnik nie zna żadnego stacku — wszystko, co stackowe, przychodzi
z `runtime.yml`.

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
obok runtime i został zmigrowany);
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

Stage `decision-gate` (`blocking: true`) dostaje indeks + `open_questions` i
odpowiada na jedno pytanie: czy task opiera się na parametrze czekającym na
decyzję albo uchylonym. Trafienie → **blokujące** `open_question` (`answer: null`)
w artefakcie, cytujące wpis i miejsce sporu. Stage jest tani (haiku, czyta JSON
i jeden plik), nie ma `when:` i nie wolno go pomijać.

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
