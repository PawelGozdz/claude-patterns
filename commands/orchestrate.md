---
name: orchestrate
description: |
  Generyczna faza IMPLEMENTACJI sterowana kompozycją bloków (ADR 0008): pętla
  po warstwach z runtime.yml (implement→verify→fix aż GO), bramka końcowa ze
  slotu, kończy w stanie "staged, not committed". Bramka wejścia: brak
  .claude/config/runtime.yml = odmowa. Gdy analyze.exit=PAUSE (blok ddd/core),
  ODMAWIA startu bez {TASK-ID}.analysis.md ze status: approved.

  Usage: /orchestrate <TASK-ID>
tools: Task, Read, Write, Bash, Workflow
disallowedTools: Edit, MultiEdit, NotebookEdit
---

# /orchestrate — implementacja sterowana runtime.yml

**ZERO WŁASNEJ IMPLEMENTACJI.** Silnik deleguje do agentów ze slotów; sam nie
pisze kodu produkcyjnego. Wszystko stackowe przychodzi z `runtime.yml`.

## 0. Bramki wejścia (twarde, w tej kolejności)

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
  w artefakcie (Write po Read albo Bash; jedyna modyfikacja artefaktu przez tę
  komendę) — to checkpoint, dzięki któremu wznowienie nie płaci za zrobione.
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
- Raport MUSI wskazać: które sloty/agenci działali (z `# source:` bloku),
  ile prób zjadła każda warstwa, czy budżety zadziałały miękko.
