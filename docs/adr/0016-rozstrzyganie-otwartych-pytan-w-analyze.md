# ADR 0016 — Rozstrzyganie otwartych pytań w `/analyze`: źródło z dokumentów, decyzja człowieka

**Status**: accepted (2026-11-07). Etap 1 zaimplementowany w gałęzi `feature/TASK-ANALYZE-RESOLVE-001`, niescalony i bez rollout-u do projektów. Etap 2 tylko zaprojektowany.
**Zmienia**: kontrakt „`/analyze` nigdy nie implementuje" (ANL-001): wąski wyjątek po odpowiedzi człowieka (ANL-058).
**Nie zmienia**: ANL-034 (`approved` plus `answer: null` to exit 2), `orchestrate-prepare.mjs`, zamka `premise_failed`/`card_conflict` (ANL-049/050).
**Context source**: rozmowa właściciela z sesją orkiestratora juz-ide-api-1, 2026-11-07. Reguły: [ANL-054..059](../decisions/orchestrate-rule-history.md#anl-054).

---

## Problem

Po `/analyze` człowiek dostaje listę otwartych pytań. Część ma odpowiedź w dokumentach projektu (BDR, KANON, ADR), część to prawdziwa decyzja. Nic ich nie odróżnia, a pytania są pisane językiem, w którym je znaleziono. Człowiek czyta dokumenty, żeby sprawdzić, czy agent miał rację.

## Decyzja

Krok „rozstrzygnij otwarte pytania" w ramach `/analyze`, po panelu. Nie ma nowej komendy.

1. **Źródło i precedens z cytatem.** Dla każdego pytania szukamy w dokumentach wg `lookup_order`, indeksu decyzji i kanonu: źródła, które odpowiada wprost (`canon`), i analogicznej decyzji (`precedent`). Cytat (`plik:linia` plus dosłowny tekst) sprawdza `scripts/verify-answer-sources.mjs` bez tokenów.
2. **Decyzję podejmuje człowiek, zawsze.** Rekomendacja jest propozycją. Nie ma `answered_by: auto`, nie ma zmiany w `prepare`, pytanie nigdy nie dostaje `answer` bez słów człowieka.
3. **Format pytania.** Linia 1 (`ask`): jedno proste pytanie. Linia 2 (`rec`): „Rekomendacja: … (zgodne z BDR-xx / KANON §y)" albo „… (nowy wzorzec, oparty o …)". Razem najwyżej 2 zdania. Numer BDR/ADR wolno tylko w `rec`.
4. **Prezentacja.** Najwyżej 5 pytań naraz, wg tego, ile punktów zadań blokują. Odpowiedź: „ok wszystkie", „ok poza 3 i 5", „2: nie", „ok 4". Hurtem przechodzą tylko pytania dwudrzwiowe ze zweryfikowanym źródłem.
5. **Utrwalenie po odpowiedzi.** `/analyze` zapisuje decyzję tylko w ścieżkach z configu (`resolution_sink`): nowy BDR/ADR, edycja jawnie wskazanych plików kanonu, usunięcie pliku pytania po sprawdzeniu, że dokument decyzji istnieje. Bez commita.
6. **Konfiguracja per projekt**, bez kopiowania komendy: parametry bloku `decision-registry` (`questions_format: file|index|none`, `questions_dir`, `resolution_sink`, `question_task_link`, `resolve_max_questions`, `resolve_batch_size`) i sekcja `analyze.resolve`. Domyślnie `none`: projekt zachowuje dzisiejszy flow.

## Wznawianie po odpowiedzi

Odpowiedzi żyją we frontmatterze artefaktu, jak dotąd. Człowiek odpowiada w tej samej sesji albo po czasie przez `/analyze <TASK-ID> --resume` (bez panelu, tylko dla `status: awaiting-human`). `verify-answer-sources.mjs --reply` rozbiera odpowiedź na konkretne `answer:`, więc agent niczego nie interpretuje. `status: approved` ustawia agent wyłącznie na wprost polecenie człowieka („zatwierdzam"); ANL-034 działa bez zmian.

## Zabezpieczenia

- `USER_CHALLENGE`, `one-way` (brak `door_type` znaczy one-way), `new-pattern`: mają rekomendację, ale nigdy nie idą hurtem. „Ok 4" na takie pytanie jest jawną zgodą człowieka.
- Produkt, prawo i `one-way` bez zweryfikowanego źródła nie dostają zgadniętej wartości; w formacie `file` powstaje plik pytania.
- Zapis: `resolve-finalize.mjs check-write` (nowe wpisy tak, edycja istniejącej decyzji nie, glob w `canon_edit` odrzucany, `.env*` i `..` odrzucane). Uchylenie decyzji to nowy wpis, starego się nie edytuje.
- Limit pytań i budżet `resolve` kończą się jak ANL-051: reszta idzie do człowieka bez rekomendacji.

## Telemetria

Koszt: osobny `step` o roli `resolve` (istniejące pola schematu v1). Jakość: `resolve_stats` w frontmatterze artefaktu (`rec_rejected_ratio`, `by_basis`), liczone skryptem. Odsetek rekomendacji odrzuconych przez człowieka to miara, czy krok pomaga; wysoki znaczy złe rekomendacje. Do zdarzenia v1 nie trafia: schemat jest zamknięty, a zmiana wymaga osobnej decyzji (ADR 0012/0015).

## Odrzucone

- **Ścieżka „auto-odpowiedź bez człowieka"** (`answered_by: auto`, ANL-052 w pierwszej propozycji, luz w `prepare`): odrzucona przez właściciela. Decyzja zawsze jego.
- **Nowa komenda `/resolve-questions`**: wykluczona przez właściciela; krok żyje w `/analyze`.
- **Klucz `analyze.auto_resolve`**: nazwa sugeruje odpowiadanie za człowieka. Jest `analyze.resolve`.
- **Numer BDR w `ask`**: psuje test „czy człowiek nieznający kodu odpowie sam". Dlatego osobne pole `rec`.
- **Edycja istniejących wpisów BDR/ADR przy uchyleniu**: BDR są niezmienne; uchylenie to nowy wpis z `supersedes`.

## Etap 2 — zaprojektowany, niezaimplementowany

1. **Doradcy.** `analyze.advisors: { rola: [agent, …] }` (np. `domain`, `product`, `security`), wnoszone przez bloki (`ddd/core` → `domain`, `governance` → `product`). Rola wchodzi tylko wtedy, gdy agent jest dostępny w projekcie; logikę `findAgent` z `scripts/verify-project-setup.mjs` (linie 44–78) wydzielamy do `scripts/lib/agent-lookup.mjs`, żeby weryfikacja setupu i `/analyze` miały jedną definicję. Dzięki temu iam, ai-gateway i mobile-app (bez agenta DDD) dostają inny zestaw niż juz-ide-api, grant-flow i marketing-hub, bez kopiowania komendy.
2. **Doradca przygotowuje, nie decyduje.** Wynik doradcy (rekomendowana opcja, `basis`, kandydaci na cytat) przechodzi przez te same `verify-answer-sources.mjs` i te same limity formatu. ANL-056 bez zmian.
3. **Batching.** Około jednego wywołania na doradcę na grupę (do 8 pytań). Najpierw reużywamy wyniki panelu (ANL-024: streszczenia, nie surowy output). Model sonnet. Brak agenta dla roli: `general-purpose` z promptem roli albo pytanie bez rekomendacji doradczej.
4. **Limity.** `analyze.resolve.max_advisor_calls`; wyczerpanie jak ANL-051.
5. **Szkice dokumentów decyzji.** Dla `domain: tech` doradca (np. `backend-technology-expert`) szkicuje treść ADR według szablonu projektu; szkic trafia do artefaktu jako sekcja do wglądu, a zapis następuje dopiero po odpowiedzi (ANL-058).
6. **Zapis wymuszony hookiem.** `PreToolUse` na `Write`/`Edit`/`Bash` pilnujący tego samego zakresu co `check-write`, zamiast samego promptu.
7. **Telemetria.** Pole `recRejected` w zdarzeniu v1 (zmiana schematu, ADR 0012/0015) i metryka w `telemetry-report`.
8. **Adapter `index`.** Dziś tylko zakres zapisu; usuwanie wiersza z indeksu pytań i test na realnym projekcie z indeksem.

## Decyzje właściciela (2026-11-07)

1. Pytanie, na które kanon odpowiada wprost, zostaje u człowieka z rekomendacją (tak jak wdrożono).
2. `status: approved` tylko po wprost „zatwierdzam" człowieka.
3. „Ok wszystkie" pomija `one-way`, `USER_CHALLENGE` i „nowy wzorzec".
4. `question_task_link` włączony w juz-ide-api (`question_task_link: true` = `project-orchestration/tasks`, pole `awaits_question`).
5. Rollout: tak, bez podbijania wersji w `METADATA.yml`. Wykonany tylko w czystych repo bez aktywnego agenta; reszta czeka (patch i skrypt poza repo).

## Rollout (nie wykonany, wymaga zgody)

`audit-projects --gate` na gałęzi jest czerwony o 16 błędów więcej niż na `develop` (4 → 20), wszystkie z rollout-u: 13 projektów ma starą kopię `project-orchestration/analysis/TEMPLATE.md` (`cp templates/task-analysis-template.md …`), a 2 (framework-polityczny, grant-flow) mają przez zmianę bloku nieaktualny `runtime.yml` (`node scripts/materialize-runtime.mjs <projekt>`; juz-ide-api-1..4 były nieaktualne już na `develop`). Szesnasty błąd (`brak .rag-seed-state.json`) pochodzi z samego worktree i zniknie po scaleniu. Dla juz-ide-api-1 trzeba też dopisać w `project.yml → block_params.decision-registry`: `questions_format: file`, `questions_dir: docs/decisions/questions`, `resolution_sink: { canon_edit: [docs/KANON.md] }`. Sucha materializacja tej konfiguracji w katalogu tymczasowym przeszła.
