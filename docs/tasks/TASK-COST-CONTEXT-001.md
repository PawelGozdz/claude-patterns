---
id: TASK-COST-CONTEXT-001
title: 'Koszt orkiestracji: połowa rachunku to rozgrzewka agentów, nie praca — sonda jako skrypt, potem reguły warunkowe i katalog skilli, każdy krok warunkowany pomiarem'
type: epic
status: todo
priority: P2
story_points: 8
created_date: 2026-11-03
updated_date: 2026-11-03
assignee: '@unassigned'
labels: [cost, orchestration, context, telemetry, probe]
depends_on: []
related: [TASK-ORCH-VERIFY-BUDGET-001, TASK-ORCH-PROBE-NEW-FILES-001, TASK-OBS-014, TASK-OBS-017]
source: >
  Sesja fable-analysis-repo (2026-10-29 … 2026-11-03): analiza telemetry/events/*.jsonl
  (42 348 zdarzeń, 15 761 kroków z tokenami, lipiec–październik 2026) i transkryptów
  ~/.claude/projects (20 GB, 35 dni). Skrypty analizy były jednorazowe, w scratchpadzie sesji;
  liczby poniżej są jedynym trwałym zapisem.
---

# TASK-COST-CONTEXT-001: płacimy za rozgrzewkę agentów, nie za ich pracę

## 🎯 Goal

Pytanie wyjściowe brzmiało: wydajemy dużo, bo dużo pracujemy, czy bo źle dobieramy modele?
Pomiar mówi: ani jedno, ani drugie.

- Orkiestracja (`orchestrate` + `workflow` + `analyze`) kosztowała w badanym okresie ok. $6,0 tys.
  wg cen listowych; sesje interaktywne ok. $2,7 tys. w 35 dni (39% całości, poza telemetrią).
- Rozkład po typie tokenów: odczyt cache 41%, zapis cache 41%, output 18%, świeży input ~0%.
  Sesje używają cache z TTL 1 h (zapis 2×), więc realnie zapis cache to ok. połowa rachunku.
  Zgadza się to z zapisanym `costUsd`, który dla modeli 5.5 jest 1,5× wyższy niż przeliczenie
  po stawce 1,25×.
- Prompt zadania ma medianę 344 tokenów. Stała część kontekstu na starcie subagenta ma
  15–128 tys. tokenów, zależnie od projektu, nie od zadania. Dla sondy Haiku w `juz-ide-api-1`
  (prompt: 127 tokenów) to 79,6 tys.:

  | blok | tokeny | sonda tego potrzebuje? |
  | :-- | --: | :-- |
  | definicje 13 narzędzi | ~14,1 tys. | nie, tylko Bash |
  | lista skilli (~300, w tym 271 z pluginu ECC) | ~12,1 tys. | nie |
  | `rules/nestjs-ddd/*` + `rules/common/*` (26 plików) | ~17 tys. | nie |
  | CLAUDE.md projektu + globalny | ~5,2 tys. | częściowo |
  | `MEMORY.md` użytkownika | ~3,7 tys. | nie |

  Ten sam zestaw dostaje każdy implementer, verifier i agent doradczy. W `ai-gateway` (bez
  `.claude/rules/`) sonda startuje z 21,5 tys., z czego 12 tys. to nadal lista skilli.
- Cache prefiksu jest per model. Przebieg przeplata Haiku → Sonnet → Opus, więc ten sam prefiks
  jest zapisywany osobno dla każdego z nich, a między sondami Haiku bywa zimny mimo TTL 1 h.
- Sondy to 5 687 kroków (36% wszystkich) za ok. $210 bezpośrednio; ich koszt pośredni to zimne
  zapisy prefiksu i przeplatanie modeli.
- Przydział modeli jest poprawny: Haiku sondy (3% kosztu), Sonnet implementacja i weryfikacja,
  Opus tylko bramka i analizy (ok. 20%). Migracja Sonnet 5 → 5.5 (28.09) zbiegła się ze spadkiem
  `died` implementera z 16,5% do 2,2% kroków i kosztu kroku z $1,11 do $0,64.
- Bramka końcowa na Opusie daje NO_GO w 47% kroków po GO od verifiera na Sonnecie. Powtórne
  bramki w tym samym przebiegu kosztują tylko $144 łącznie, więc pieniądze nie leżą w powtórce,
  tylko w rundzie fixera, którą uruchamia pierwsze NO_GO.
- Sesje interaktywne: średni kontekst na wywołanie w głównym wątku to 207 tys. tokenów.
- Trend: W43 → W44 liczba przebiegów na dobę bez zmian (~21), koszt przebiegu $4,5 → $8,1,
  kroków na przebieg ~16 → 26, fixerów na przebieg 0,6 → 3,8. Zbiega się z bramkami
  TASK-ENGINE-GUARDRAILS-001; przyczyny nie sprawdzono, W44 to 4 dni danych.

Cel zadania: zmniejszyć koszt przebiegu o jedną trzecią do połowy bez zmiany przydziału
modeli i bez cięcia weryfikacji. Każdy krok poniżej ma warunek „idź dalej / zatrzymaj”
mierzony istniejącym mechanizmem claimów (`scripts/telemetry-report.mjs --engine <hash>`,
TASK-OBS-017; min. 20 przebiegów po każdej stronie).

## Warunek jakości dla całego zadania

Fałszywe GO i udział NO_GO bramki końcowej nie rosną względem okna „przed”. Jeśli rosną,
zmianę cofamy, choćby była tańsza.

## Kroki, w kolejności, każdy warunkowany poprzednim

- [ ] **K1. Sonda jako skrypt, nie agent.** `scripts/workflow/orchestrate.template.mjs` już
      traktuje wynik sondy jako fakty (`probe.typecheck`, `probe.tests`, `probe.lint`,
      `probe.conformance`, `probe.newTestBlocks`, `conformanceReport`). Haiku tylko przepisuje
      wyjście `tsc`/testów do JSON. Jeśli skrypt Workflow nie może wykonywać poleceń: wariant B,
      osobna definicja agenta sondy z `tools: Bash` (+ `Read` jeśli trzeba), bez reguł, bez
      katalogu skilli, bez `MEMORY.md`; cel: kontekst startowy sondy ≤ 15 tys. tokenów.
      Powiązane: ORC-149 (`tools/scoped-tests`), TASK-ORCH-PROBE-NEW-FILES-001.
      **Idź dalej, gdy:** koszt kroku sondy i liczba zimnych zapisów prefiksu Haiku spadły
      w raporcie tygodniowym, a warunek jakości trzyma. **Zatrzymaj, gdy:** koszt przebiegu
      nie spadł; wtedy diagnoza „rozgrzewka” jest błędna i K2–K3 nie mają sensu.
- [ ] **K2. Reguły ładowane warunkowo.** Każdy agent dostaje wszystkie `.claude/rules/*.md`
      (symlinki do `rules/nestjs-ddd` i `rules/common`), a implementer drugi raz te same treści
      jako karty z `hooks/inject-implementer-rule-cards.js`. Sprawdzić przez `claude-code-guide`,
      czy pliki reguł obsługują frontmatter `paths:`; jeśli tak, przypiąć reguły do globów
      (`repository.md` → `**/*.repository.ts` itd.). Ryzyko: verifier nie zobaczy reguły, której
      nie dotyka ścieżką. **Idź dalej, gdy:** fałszywe GO bez zmian.
- [ ] **K3. Katalog skilli poza orkiestracją.** 12 tys. tokenów w każdym kroku, głównie 271 skilli
      ECC, z których przebiegi nie używają żadnego. Sprawdzić, czy da się ukryć skille pluginu
      przed subagentami; jeśli nie, plugin tylko w sesjach interaktywnych albo vendorowana
      lista 10–20 skilli faktycznie używanych.
- [ ] **K4. Zimne starty mimo TTL 1 h.** Pomiar: dlaczego `cacheRead = 0` na pierwszej turze tak
      wielu agentów tego samego typu w tym samym projekcie. Podejrzenie: zmienne bloki wcześnie
      w prefiksie (`session_context`, `date`, `deferred_tools_delta`). Jeden dzień pomiaru;
      jeśli potwierdzone, poprawka może dać tyle co K1 bez cięcia treści.
- [ ] **K5. Kryteria bramki do verifiera.** Temat jakości, nie kosztu: prowadzony w
      TASK-ORCH-VERIFY-BUDGET-001 (dopisany tam odnośnik). Tu tylko miara: udział NO_GO bramki
      po GO verifiera, dziś 47%. Dane: pola `blamed`/`unblamed` w zdarzeniach bramki.
- [ ] **K6. Telemetria kosztu.** W W42 44% kroków bez kosztu (`stepsWithoutCost`); sesje
      interaktywne nieliczone wcale. Bez tego K1–K4 nie da się rozliczyć. Hook sesyjny ma
      zapisywać tylko liczniki z `usage`, nigdy treść; `exit 0`; bez czytania całych transkryptów
      (zob. `hooks/lib/transcript-usage.js`).
- [ ] **K7. Eksperyment `effort: medium` dla implementera na Sonnet 5.5.** Output to 18% kosztu,
      więc zysk ograniczony; tani test tym samym mechanizmem claimów. Ostatni, bo jako jedyny
      dotyka jakości generowania.

Poza zadaniem, zero kodu: krótsze sesje interaktywne (nowa sesja na zadanie, kompaktowanie
wcześniej niż przy 82%). Przeciętna tura przy 200 tys. kontekstu kosztuje $0,04 samego odczytu
cache, zanim model cokolwiek zrobi.

## Odrzucone na teraz

- **Zmiana przydziału modeli.** Dane jej nie uzasadniają; bez testu jakości to zgadywanie.
- **Cięcie weryfikacji.** Weryfikacja jest tania (verifier Sonnet 5.5: $0,25/krok); drogi jest
  kontekst, nie sprawdzanie.
- **Graphify (github.com/Graphify-Labs/graphify).** Graf kodu z tree-sitter, skill + hook
  PreToolUse + MCP. Nie dotyka rozgrzewki agentów w ogóle; może zmniejszyć tokeny rozpoznania
  (grep-heavy), ale graf odświeża się na commit, więc w trakcie przebiegu nie widzi nowych plików
  (ta sama klasa problemu co PROBE-NEW-FILES), a domyślny model do etykiet to Opus. Ewentualny
  pilot dopiero po K1–K3: jeden projekt (`juz-ide-api-1`), `GRAPHIFY_BACKEND=none`, tylko MCP
  `query_graph`, bez hooka, 20 przebiegów, próg 15% na kroku implementera.

## ✅ Kryterium ukończenia

K1 wdrożone i rozliczone claimem w `orchestrate-rule-history.md` (ORC-0NN); K2–K4 wykonane albo
świadomie zatrzymane z zapisanym powodem w tym pliku; K6 daje raport tygodniowy bez kroków bez
kosztu. Koszt przebiegu w raporcie tygodniowym niżej o co najmniej jedną trzecią względem
W43–W44 przy niezmienionych fałszywych GO.
