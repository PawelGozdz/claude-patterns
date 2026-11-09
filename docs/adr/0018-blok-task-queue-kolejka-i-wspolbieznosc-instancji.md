# ADR 0018 — Blok `task-queue`: kolejka zadań i współbieżność instancji jako opt-in

**Status**: proposed (2026-11-08), do decyzji właściciela przed implementacją.
**Zmienia**: nic. Dopełnia [ADR 0008](0008-stack-blocks-composition.md) o nowy blok osi `process` i [ADR 0016](0016-rozstrzyganie-otwartych-pytan-w-analyze.md)/[0017](0017-auto-przyjecie-pytan-ze-zrodlem-i-krotki-raport.md), które są już generyczne.
**Context source**: rozmowa z @founder 2026-11-08 („nowy wzorzec, idziemy w tym kierunku, żeby znacznie usprawnić współbieżność prac") oraz rekonesans `juz-ide-api-develop` i silnika tego samego dnia.

---

## Problem

W `juz-ide-api` osiem instancji pracuje równolegle nad jednym repozytorium. Konflikty ograniczają tam: kolejka zadań w plikach, jedno pytanie albo luka na plik, deklaracja `zakres_plikow` i walidator `docs:check`. Ta część nie jest w silniku. Leży w repozytorium `juz-ide-api` (`project-orchestration/kolejka/`, `scripts/docs-graph/`, `.claude/config/doc-graph.yml`, `KANBAN-ZASADY.md`), a silnik zna tylko znacznik: hook `pm-task-housekeeping.js` oraz skille `pulse` i `reprioritize` sprawdzają, czy istnieje `doc-graph.yml`.

Pozostałe elementy nowego wzorca są już generyczne i włączane przez `stack_blocks`: analiza z ADR 0016/0017 (`decision-registry`), PAUSE (`approval-gate`, `clean-arch`, `ddd/core`), kanon (`governance`). Brakuje wyłącznie kolejki. Wzorzec przechodzi więc od „jeden projekt" do „dwa", gdy `juz-ide-mobile-app` (cztery klony) go przyjmie, a to jest próg promocji z `CLAUDE.md`.

## Decyzja

Dodajemy blok `task-queue` (oś `process`, `requires: []`) i przenosimy do silnika to, co w `juz-ide-api` jest mechanizmem, a nie treścią.

1. **Blok** `blocks/task-queue.yml` z parametrami `queue_dir` (domyślnie `project-orchestration/kolejka`), `views_cmd` i `shared_files_owner` (linia, która jako jedyna zmienia pliki wspólne).
2. **Znacznik w `runtime.yml`** zamiast istnienia `doc-graph.yml`. Hook, dwa skille i `commands/pulse.md` czytają flagę z kompozycji. Do czasu migracji `juz-ide-api` honorujemy oba znaczniki.
3. **Narzędzie `docs-graph` w silniku**, w czystym Node, bez zależności od `tsx` i pnpm projektu. Projekt woła je przez `views_cmd`. `juz-ide-api` może zostać przy własnej kopii, dopóki nie przejdzie na wersję silnika.
4. **Szablony** `kolejka/*.yml` i pliku pytania w `templates/project-orchestration/`. `setup-project.sh` tworzy je tylko wtedy, gdy blok jest w kompozycji.
5. **`index-decisions.mjs`** czyta ścieżki z konfiguracji bloku, nie z założeń układu juz-ide.

Treść zostaje w projekcie: linie kolejki (I1–I4, GEO), zakresy numerów migracji, `KANBAN-ZASADY.md`, kanon. Silnik dostarcza mechanizm i pustą kolejkę.

## Co jest konwencją, a co egzekwowaną regułą

W `juz-ide-api` claim zadania (push `status: in-progress`), kolejność w linii i podział plików wspólnych to konwencja. Egzekwuje je `docs:check` (kolizje `zakres_plikow` między liniami, reguła `pliki_wspolne_tylko_linie`), nie blokada w gicie. Blok `task-queue` ma to powtórzyć, a nie wprowadzać twardych blokad. Twarda blokada claimu to osobna decyzja i nie wchodzi w ten ADR.

## Rozważone alternatywy

- **Zostawić kolejkę w `juz-ide-api` i skopiować do mobile-app.** Odrzucone: druga kopia `docs-graph` w TypeScripcie dla projektu we Flutterze, dwa miejsca do utrzymania, znacznik `doc-graph.yml` dalej zgadywany po nazwie pliku.
- **Dołożyć kolejkę do `decision-registry`.** Odrzucone: to inna odpowiedzialność (rejestr decyzji kontra porządek pracy), a projekt bez kolejki nie powinien płacić za jej parametry.
- **Twardy lock claimu (plik blokady albo rezerwacja w zdalnym repozytorium).** Odroczone: brak dowodu, że konwencja z `docs:check` zawodzi przy ośmiu instancjach.

## Konsekwencje

- Zmiana w `hooks/pm-task-housekeeping.js`, skillach i komendzie propaguje się symlinkami do wszystkich projektów od razu. Dlatego znacznik musi być wsteczne zgodny (oba warianty), a prace idą w worktree.
- Nowy blok wymusza ponowną materializację `runtime.yml` w projektach, które go włączą. Bramka `audit-projects --gate` to sprawdzi.
- Projekty z jedną instancją nie mają powodu go włączać. Dla nich wystarcza warstwa 1 (analiza, ADR/BDR).
- `ddd/core` i `monorepo-layers` pozostają związane z NestJS. Nowy blok ich nie wymaga.

## Otwarte

- Czy `docs-graph` da się wyodrębnić bez zależności od struktury NestJS w `juz-ide-api` (rozmiar i zależności nieprzejrzane).
- Co jest odpowiednikiem plików wspólnych we Flutterze: `pubspec.yaml`, `pubspec.lock`, rejestr routingu, pliki generowane (l10n, codegen). Do ustalenia z właścicielem mobile-app.
- Czy mobile-app ma własny kanon produktu i właściciela decyzji biznesowych, czy BDR mają wskazywać na te z API. Bez tego blok `governance` tam nie ruszy.
