---
name: analyze
description: |
  Generyczna faza RESEARCH/ANALIZY sterowana kompozycją bloków (ADR 0008).
  Czyta .claude/config/runtime.yml (bramka: brak pliku = odmowa startu), odpala
  panel advisory ze slotów bloków (aktywacja warunkowa `when:`), pisze artefakt
  analizy i kończy wg `analyze.exit` (PAUSE = twarda bramka approval, wnosi ją
  blok ddd/core). NIGDY nie implementuje.

  Docelowo zastępuje /analyze-ddd (pilot: TASK-BLOCKS-001, juz-ide-api-4;
  do końca pilota /analyze-ddd działa równolegle na presets/).

  Usage: /analyze <TASK-ID>
tools: Task, Read, Write
disallowedTools: Edit, MultiEdit, Bash, Grep, Glob, NotebookEdit
---

# /analyze — research sterowany runtime.yml (silnik szkielet+sloty)

**ZERO IMPLEMENTACJI.** Jedyny własny `Write` = artefakt
`project-orchestration/analysis/{TASK-ID}.analysis.md` (+ warunkowo threat-model
przez stage). Silnik nie zna żadnego stacku — wszystko, co stackowe, przychodzi
z `runtime.yml`.

## 0. Bramka wejścia (twarda)

- `Read(".claude/config/runtime.yml")`. **Brak pliku → STOP**: wypisz
  „Projekt nie ma skomponowanego setupu bloków (ADR 0008). Dodaj `stack_blocks:`
  do project.yml i odpal setup-project.sh, albo użyj starych komend
  (/analyze-ddd)." i zakończ.
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

Jak w /analyze-ddd: `collection` z `.claude/config/knowledge.json`;
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

## 1. Panel — sloty z runtime.yml, agenci jako LIŚCIE

Iteruj `analyze.panel` W KOLEJNOŚCI z runtime.yml. Dla każdego slotu:

- `when:` obecne → regex vs treść/etykiety taska; brak trafienia = pomiń slot.
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
kierunek, wypisuje OTWARTE PYTANIA. Fallback: gdy środowisko przerywa liście,
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

## 3. Wyjście wg runtime.yml

- `analyze.exit: PAUSE` → baner STOP1 (jak /analyze-ddd): odpowiedz na pytania,
  `status: approved`, dopiero wtedy `/orchestrate-blocks {TASK-ID}`. **KONIEC —
  nie wołaj orchestracji, nie implementuj.**
- Inaczej → wypisz: „Analiza gotowa (bez twardej bramki — brak bloku ddd/core).
  Rekomendowany następny krok: /orchestrate-blocks {TASK-ID}." i zakończ.
