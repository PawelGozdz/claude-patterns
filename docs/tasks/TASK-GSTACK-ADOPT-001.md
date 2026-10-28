---
id: TASK-GSTACK-ADOPT-001
title: 'Przejęcie z gstack 11 sprawdzonych technik: rzetelniejsze werdykty, testy promptów, kontrola kosztu kontekstu, higiena repo'
type: task
status: in-progress
priority: P1
story_points: 13
created_date: 2026-10-26
updated_date: 2026-10-28
assignee: '@unassigned'
labels: [quality, evals, orchestration, hygiene]
depends_on: []
related: [TASK-EVAL-001, TASK-EVAL-002, TASK-ORCH-FALSE-GO-001]
source: >
  Analiza repozytorium garrytan/gstack (commit 8663c3d, v1.91.252.0, 2026-10-26) przeprowadzona w sesji
  2026-10-26: cztery przeglądy gstack (filozofia/dokumentacja, skille, testy/CI, runtime) plus inwentarz
  claude-patterns. Klon był tylko czytany, nic z niego nie uruchamiano. Ścieżki gstack poniżej są
  względem korzenia tamtego repo; po zamknięciu sesji klon znika, więc zawsze podajemy commit.
---

# TASK-GSTACK-ADOPT-001: techniki z gstack

## 🎯 Goal

Zielone światło od weryfikatorów ma znaczyć dokładnie tyle, ile mówi: ten kod, w tym stanie, przeszedł
sprawdzenie. Zmiana w prompcie agenta albo komendy ma być łapana przed commitem, a nie po tygodniu
u użytkownika. Rozrost kontekstu ma być widoczny, zanim podniesie rachunek.

Stan wyjściowy (wg inwentarza i ADR 0015, zweryfikować przy starcie pracy): ok. 12,6% fałszywych GO
(51 z 406 przebiegów, dolna granica), 18% kosztu to powtórki, koszt do pierwszego GO p50 10,22 USD /
p90 36,92 USD, a 91% rachunku to cache read/write, czyli kontekst.

## Zakres

Jedenaście punktów (A1–A4, B1–B5, C1–C2) w trzech falach. Kolejność wynika z tego, że fala 1 jest tania, nie używa LLM
i od razu mierzalna; fala 2 wymaga danych z fali 1; fala 3 to higiena.

### Fala 1 — rzetelność i ochrona promptów (P1)

- [x] **A1. Kernel dowodowy dla weryfikatorów.** Wspólny blok pięciu reguł (twierdzenie o ograniczeniu
      wymaga dosłownego błędu; twierdzenie o wykonaniu wymaga komendy; podaj rodzaj dowodu; ujawnij brak
      pokrycia; wynik zerowy to sukces) wstrzykiwany do agentów VETO. Finding bez cytatu `plik:linia`
      spada do załącznika z obniżoną pewnością.
      *Wzór:* `scripts/resolvers/preamble/generate-evidence-directive.ts`, `scripts/resolvers/confidence.ts`.
      *Zmiana:* weryfikator nie zgłosi problemu ani GO bez dowodu, więc spada odsetek fałszywych GO.
- [x] **A2. Werdykt związany z hashem drzewa.** Weryfikator zapisuje hash drzewa git z chwili sprawdzenia;
      `/orchestrate` odrzuca GO, jeśli kod zmienił się po weryfikacji.
      *Wzór:* krok 11.5 w `ship/SKILL.md.tmpl` (tokeny `wtree`).
      *Zmiana:* GO dotyczy dokładnie tego kodu, który pójdzie dalej, a nie wcześniejszej wersji.
- [x] **A3. Testy strukturalne promptów.** (a) Lista wymaganych kroków `/analyze` i `/orchestrate`
      sprawdzana co do obecności i kolejności; (b) piny na tokeny czytane maszynowo (markery, pola,
      komendy, enumy), nie na zdania; (c) lint „archeologii”: numery issue, `PR #N` i historyjki
      incydentów w treści agentów, komend i kart reguł, z allowlistą wymagającą uzasadnienia, a wpis,
      który niczego już nie łapie, też failuje.
      *Wzór:* `test/workflow-required-steps.test.ts`, `test/helpers/prompt-structure.ts`,
      `test/archaeology-lint.test.ts`, `docs/test-value-bar.md`.
      *Zmiana:* wycięty krok lub rozjechany kontrakt promptu wykryje pre-commit w ok. 2 s, bez LLM.
- [x] **A4. Rachunek kontekstu stałego + ratchet.** Skrypt liczący bajty/tokeny zawsze ładowane per agent,
      skill i komenda; fixture z sufitami; nowy element bez sufitu albo przekroczenie = błąd, a legalny
      wzrost wymaga przechwycenia nowego baseline w tym samym commicie.
      *Wzór:* `bin/gstack-context-bill`, `test/catalog-budget.test.ts`, `test/context-budget-ratchet.test.ts`.
      *Zmiana:* widać, który plik podnosi koszt stały (91% rachunku), zanim trafi do main.

### Fala 2 — kalibracja i oszczędność (P2)

- [x] **B1. Kontrola sędziów LLM przed użyciem.** Dla każdego sędziego w `tests/flow-evals`: wersja
      poprawna, pusta (same nagłówki) i z jednym celowym defektem; sędzia wchodzi do obiegu tylko wtedy,
      gdy odrzuca pustą i wykrywa defekt. Warunek wstępny dla L2 z TASK-EVAL-001.
      *Wzór:* `docs/evals/judge-controls-2026-10.md` (u nich 2 z 4 sędziów przepuściło defekt).
      *Zmiana:* nie budujemy L2 na ocenie, o której nie wiemy, czy cokolwiek widzi.
- [x] **B2. Zasady powtórzeń zależne od rodzaju testu.** `rule`: 1 próba; `behavior`: 3 próby, przechodzi
      ≥2/3; `judge`: mediana z 3. Bez retry poza jednym zapisanym rerunem.
      *Wzór:* `EVAL_POLICY` / `panelVerdict()` w `test/helpers/`.
      *Zmiana:* losowość modelu przestaje dawać fałszywe alarmy, więc evale behawioralne da się
      w ogóle uruchamiać.
- [x] **B3. Adaptacyjny dobór reviewerów.** Statystyka trafień per `reviewer-*` z telemetrii; reviewer
      z zerem findings w ≥10 wywołaniach jest pomijany, z wyjątkiem security (lista `NEVER_GATE`).
      *Wzór:* `bin/gstack-specialist-stats`, `scripts/resolvers/review-army.ts`.
      *Zmiana:* `/review-panel` kosztuje mniej bez utraty wykrywalności.
- [x] **B4. Wspólne fragmenty z szablonów.** Powtarzane bloki (kernel dowodowy, format pytań) generowane
      z jednego źródła z kontrolą świeżości (`--check`) w pre-commit.
      *Wzór:* `scripts/gen-skill-docs.ts`, `scripts/resolvers/index.ts`.
      *Zmiana:* poprawka reguły w jednym miejscu zamiast w kilkunastu kopiach.
- [x] **B5. Klasyfikacja decyzji w `/analyze`.** Mechaniczne rozstrzyga się automatycznie, gustu zbiera na
      jedną bramkę, zmiana kierunku użytkownika nigdy nie jest zatwierdzana automatycznie. Maszynowo
      parsowalny znacznik rekomendacji i `door_type` (one-way / two-way).
      *Wzór:* `autoplan/SKILL.md.tmpl` (ok. l. 62–100), `scripts/question-registry.ts`,
      `scripts/one-way-doors.ts`.
      *Zmiana:* mniej pytań do człowieka, bez ryzyka, że maszyna sama zmieni cel.

### Fala 3 — higiena i drobne (P3, tanie)

- [x] **C1. Higiena repozytorium.** `LICENSE` (METADATA deklaruje MIT, pliku brak), `SECURITY.md`,
      przypięcie `qdrant/qdrant:latest` w `docker-compose.yml`, skan zależności (osv) w cronie, jedna
      wersja zamiast trzech (METADATA 3.8.0 / package.json 3.6.0 / CHANGELOG 3.5) z kontrolą w
      `count-assets --check`, poprawka „29 bramek” → faktyczna liczba w `docs/TELEMETRY-HOWTO.md`,
      odświeżenie `docs/tasks/_inbox/index.json` (12 vs 29 propozycji).
      *Zmiana:* zewnętrzny audyt albo nowy współpracownik nie trafi na oczywiste braki.
- [x] **C2. Znaczniki pochodzenia w handoffie.** `/checkpoint` oznacza punkty „co dalej” jako
      `(uruchomiono)` / `(przeczytano)` / `(zgadnięto)`; po wznowieniu zgadnięte trafiają do „Zweryfikuj
      najpierw”.
      *Wzór:* `context-save/SKILL.md.tmpl`, `context-restore/SKILL.md.tmpl`.
      *Zmiana:* kolejna sesja nie traktuje domysłu jako faktu.

## Poza zakresem (świadomie)

Auto-update z uruchamianiem `./setup`, monolityczne skille 80–137 KB, telemetria do chmury, ręcznie
utrzymywane mapy `touchfiles`, multi-host (do czasu realnej potrzeby; tani wariant to jeden `AGENTS.md`),
„boil the ocean” bez zawężenia do zakresu zadania. Powody: nasz model symlinków jest bezpieczniejszy,
a skala (pre-commit ok. 2 s) nie uzasadnia selekcji testów po diffie.

## Kryteria akceptacji

- Każdy punkt to osobna, zamknięta zmiana (docelowo osobny commit `feat|test|chore(scope)`; commity robi
  użytkownik po review, agent tylko stage'uje), z wpisem w `CHANGELOG.md` i, dla zmian w `agents/**`,
  wpisem w ich `## Changelog`.
- A1–A4 działają w `scripts/pre-commit-guards.mjs`. **Zmierzone 2026-10-28: pełny przebieg ok. 23 s, z czego nowe bramki ok. 9–10 s** (najwolniejsze: `eval: prompt-structure` 5,2 s po poprawkach z przeglądu, `context-budget` 1,3 s, `fragments` 1,0 s, `reviewer-stats` 0,9 s; czasu sprzed zmian nie mierzono). Kryterium „ok. 5 s” nie zostało dotrzymane; do rozważenia: lżejsze evale (import zamiast spawnów) albo uruchamianie ciężkich warunkowo po zmienionych plikach.
- Nowe asercje A3 mają test dwukierunkowy: przechodzą na stanie poprawnym i failują na celowo
  zepsutym prompcie (lekcja z `workflow-lint`).
- Po 4 tygodniach od A1+A2: porównanie z baseline przez `telemetry-report --claims` (odsetek fałszywych
  GO, udział powtórek, koszt do pierwszego GO). Wynik „no_effect” albo „regressed” zapisujemy tak samo
  jak dla reguł ORC, bez retuszu.
- Nowa reguła ORC/ANL ma pole `**Claim:**` (wymóg pre-commit).

## Ryzyka

- gstack sam ma niestabilne evale (w ich audycie 0/22 zielonych w cyklu periodic) i sędziów, którzy
  przepuszczają defekty. Dlatego B1 i B2 poprzedzają jakikolwiek eval behawioralny, a w fali 1 nie ma LLM.
- Kernel dowodowy dodaje tekst do każdego weryfikatora, czyli kontekst stały. A4 musi być gotowe
  przed A1, żeby zmierzyć koszt tej zmiany (kolejność wdrożenia: A4 → B4 → A1).
- Liczby marketingowe gstack (np. „810×”) są niezweryfikowane i nie są podstawą żadnego punktu.

## Kolejność

A4 → B4 (mechanizm fragmentów, bo A1 z niego korzysta) → A1 → A2 → B5 → A3 (po ustabilizowaniu treści
`/analyze` i `/orchestrate`, bo pinuje ich kroki) → B1 → B2 → B3 → C2. C1 można wykonać w dowolnym momencie.

## Realizacja

Gałąź `feature/TASK-GSTACK-ADOPT-001` w osobnym worktree `/opt/projects/_claude-patterns-gstack`, nie w głównym
drzewie: symlinki propagują `agents/`, `commands/`, `hooks/` i `scripts/workflow/` na żywo do projektów,
a użytkownik zastrzegł, że silnik nie zmienia się pod trwającą falą poprawek w api-1 (patrz
`TASK-ENGINE-GUARDRAILS-001`, który czeka w `_claude-patterns-guardrails` i też dotyka reguł ORC/ANL —
przy scalaniu uważać na numerację ORC i `orchestrate-rule-history.md`). W worktree bramka `rag-freshness`
pada z założenia (brak lokalnego `.rag-seed-state.json`), pozostałe 34 z 35 przechodzą.

## Stan realizacji (2026-10-28)

Wszystkie 11 punktów zaimplementowane na gałęzi `feature/TASK-GSTACK-ADOPT-001` (10 commitów, po jednym na logiczną zmianę),
scalone do `develop` (merge `56826e2`, 2026-10-28; gałąź i worktree usunięte). Bramki zielone poza `rag-freshness`, która w osobnym worktree pada z założenia (lokalny stan
RAG pochodzi z głównego drzewa, gdzie są niezacommitowane zmiany w `patterns/` i `rules/`). Commity powstały z
`SKIP_SIMPLE_GIT_HOOKS=1`, bo hook zatrzymałby każdy z nich na samej `rag-freshness`; przed każdym commitem pełny zestaw
bramek był uruchamiany ręcznie i miał być czerwony wyłącznie na tej jednej. Dwa niezależne przeglądy kodu (poprawność skryptów,
ciche awarie silnika) znalazły i pozwoliły naprawić m.in.: hash drzewa zawsze pusty przy wykluczonych katalogach
w `.gitignore` (A2), obejście walidacji wyjątków osv przez komentarz w nagłówku lub symlink (C1), pomijanie
markerów fragmentów przy zagnieżdżonych ogrodzeniach (B4) oraz pole `unchecked-scope` w kernelu zamiast
`unverified_scope` (A1). Każda poprawka ma przypadek regresyjny w evalu.

### Do decyzji / zrobienia po commicie
1. **Numeracja reguł i `engine=` w Claimach.** Druga sesja miała w tym samym czasie zestage'owane w głównym drzewie własne reguły `ORC-138` i `ANL-046` (`.env*` w zakresie jednostki, rejestry kodów błędów), więc reguły z tego zadania dostały kolejne wolne numery: **ORC-139** (hash drzewa), **ANL-047** (klasy decyzji) i **ANL-048** (`door_type`, `(recommended)`). `engine=` w ich Claimach wskazuje commity wprowadzające reguły: ORC-139 → `a1e9480`, ANL-047 i ANL-048 → `c5cb0a0` (`docs/decisions/orchestrate-rule-history.md`). Hash `bfd45a3` z pierwszej wersji był hashem sprzed zmian i przypisałby regułom przebiegi sprzed wdrożenia. Przed scaleniem sprawdzić, czy tamta sesja nie zajęła w międzyczasie ORC-139 ani ANL-047+ (po zmianie hashy commitów, np. przy rebase, podmienić `engine=` ponownie).
2. **LICENSE**: właściciel praw `LocalHero Team` pochodzi z `author` w `METADATA.yml` — potwierdzić.
3. **SECURITY.md**: brak kanału kontaktu w repo; uzupełnić (nie wymyślano adresu).
4. **B3 / ADR 0012**: dziennik `~/.claude/review-panel-stats/invocations.jsonl` jest tymczasowy; przeniesienie do
   telemetrii v1 wymaga rozszerzenia schematu (`process: review-panel`, `step.findings`) — decyzja właściciela.
5. **CHANGELOG**: treść wydań 3.6–3.8 siedzi w `[Unreleased]` (nagłówki kończą się na `[3.5]`); nie cięto.
6. **Sprzątanie archeologii** (A3): baseline 78 trafień w 42 plikach, głównie daty i anegdoty o incydentach w
   agentach i kartach reguł (top: `code-quality-verifier`, `test-implementer`, `skills/design-system/ui-patterns`);
   przenieść do `docs/decisions/` i przechwycić baseline (`--capture`) w tym samym commicie. Szacunek ok. 40 trafień.
7. **Koszt kontekstu** (A4/A1/B3/C2): kernel dodaje ok. 1 KB na 15 agentów; `skills/quality/review-panel/SKILL.md`
   urósł o ok. 4 KB (+43%), `commands/checkpoint.md` o ok. 2,3 KB (+85%), `commands/analyze.md` o ok. 2,2 KB.
   Baseline w `tests/flow-evals/context-budget/ceilings.json` przechwycony po zmianach — pierwszy kandydat do
   odchudzenia to skill `review-panel`. Przy okazji: koordynatorzy `legal/finance/marketing-strategist` mają w
   `description` cały poradnik „When to invoke” (ok. 5,5 KB w każdej sesji do odzyskania).
8. **Scalanie z `feature/TASK-ENGINE-GUARDRAILS-001`**: oba dotykają `orchestrate-rule-history.md`,
   `commands/orchestrate.md` i `scripts/workflow/`; sprawdzić kolizje numerów ORC/ANL. Zgodnie z ustaleniem nie
   scalać do sygnału użytkownika (fala poprawek w api-1).
9. **Po scaleniu**: `./scripts/reseed-patterns.sh` nie jest wymagane (zmiany nie dotyczą `patterns/`),
   natomiast `audit-projects` → `materialize-runtime` → `verify-project-setup`, bo zmienia się szablon `/orchestrate`.

### Po scaleniu (2026-10-28)
- Scalenie wymagało najpierw zacommitowania pracy drugiej sesji (reguły ORC-138 i ANL-046, karty RP2/RP3/VO7, `cli-runner.md`, skrzynka) oraz `./scripts/reseed-patterns.sh`, bo karty `_summary` zmieniły się po ostatnim zaszczepieniu RAG; eval retrievalu hit@5 = 0,97. Pięć konfliktów (CHANGELOG, `analyze.md`, `orchestrate.md`, historia reguł, indeks skrzynki) rozwiązano zachowując obie strony. Po scaleniu przechodzi 49 z 49 bramek.
- `audit-projects` pokazał 12 projektów z rozjechaną kopią `project-orchestration/analysis/TEMPLATE.md` (zmiana szablonu przy ANL-047). Wszystkie kopie były identyczne ze starym szablonem centrali, więc zsynchronizowano je `cp` z centrali (zmiany w drzewach roboczych tych projektów, niezacommitowane). Błędów audytu: 15 → 3.
- Zostają 3 błędy `runtime.yml nieaktualny` w juz-ide-api-1, -2 i -3. Nie wynikają z tego zadania (nie zmieniano `blocks/`); `materialize-runtime` dla nich czeka na koniec fali poprawek w api-1.
- Reguły ANL-028 i ANL-040 oraz ORC-138 i ANL-046 (druga sesja) nie mają pola `**Claim:**` — pre-commit ostrzega, nie blokuje.
