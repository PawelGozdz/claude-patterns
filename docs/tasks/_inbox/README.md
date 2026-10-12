# docs/tasks/_inbox/ — surowe zgłoszenia odstępstw floty

To **nie jest backlog**. Pliki tutaj (`DEV-*.md`) to automatyczne, best-effort zgłoszenia
zapisywane przez `scripts/report-deviation.mjs` z czterech źródeł (`sources[]`, ADR 0011):

- `orchestrate` — Krok 5 `/orchestrate` (`commands/orchestrate.md`, ORC-066): `ESCALATE_AND_HALT`,
  `BLOCKED_BY_PRIOR`, `NO_GO` bramki końcowej, naruszenie `workflow-lint` przy `--emit-script`,
  albo agent sam zaznaczy (`deviation_note`), że trafił na sytuację nieopisaną w zasadach;
- `analyze` — krok 4 `/analyze`: odstępstwa maszyny (reguły `ANZ-*`, `DEV-anz-*`);
- `audit` — `audit-projects.mjs --report`, codziennie z crona: każdy BŁĄD audytu jako
  `setup_drift` z regułą `AUD-*` (`DEV-aud-*`);
- `setup` — ostrzeżenia `setup-project.sh` (częściowo wdrożone).

Pole `category` mówi, gdzie zwykle leży naprawa (lista = `cause` zdarzeń telemetrii, ADR 0012;
domyślna z triggera: `setup_drift`/`analyze_gate`/`workflow_lint` → `config`, `no_go` →
`verifier`, reszta → `other`).

Jeden plik na **sygnaturę** (`rule_ref` + `--layer` gdy oba podane, inaczej slug
trigger+reason — ORC-068, 2026-09-26: sam `rule_ref` zlewał różne przyczyny tej samej
ogólnej reguły na różnych warstwach w jeden plik), nie na zdarzenie — powtarzający się
problem zwiększa `occurrences` i dopisuje projekt do `projects[]` zamiast tworzyć duplikat.
To licznik częstości/kosztu, nie log.

**Jeśli widzisz `reopened_at`/`reopened_from_status` w frontmatterze** — ten rekord był
`dismissed` albo `promoted`, a przyszło nowe wystąpienie tej samej sygnatury, więc wrócił do
`proposed` automatycznie (ORC-068). Przeczytaj WSZYSTKIE wpisy w `## Occurrences`, nie tylko
stary `dismissed_reason`/`resolution` — nowe wystąpienie może być zupełnie innym problemem,
który tylko przypadkiem dzieli sygnaturę ze starym (patrz `docs/decisions/
orchestrate-rule-history.md#orc-068` dla przykładu).

Walidatory tego repo (`validate-tasks.mjs`, `tasks-digest.mjs`, `count-assets.mjs`,
`audit-projects.mjs`) celowo NIE widzą tego katalogu — czytają `docs/tasks/` płytko i
filtrują wszystko, co nie jest zwykłym `.md` bezpośrednio w `docs/tasks/`. Pliki tutaj nie
są więc taskami dopóki ktoś ich nie przetriage'uje.

**`index.json`** to widok maszynowy skrzynki (id, status, trigger, category, sources, occurrences,
projects, first_seen, last_seen), generowany z nagłówków rekordów: `node scripts/generate-inbox-index.mjs`
(ADR 0012, krok 5). Nie edytuj go ręcznie — `--check` to wykrywa, a pre-commit uruchamia go, gdy
commit rusza pliki w tym katalogu. Po triage (zmiana `status:`) odtwórz indeks
przed commitem.

## Jak triage'ować

### Zasady, zanim cokolwiek zmienisz

- **Rekord to historia, nie specyfikacja.** `## Occurrences` opisuje stan z dnia zgłoszenia,
  łącznie z ówczesną propozycją naprawy. Od tego czasu bloki mogły trafić do centrali, pliki
  zmienić nazwę, a reguła zostać poprawiona. Najpierw odtwórz problem na **obecnym** kodzie i
  obecnej kompozycji (`runtime.yml` projektu, ADR 0008 — bloki to jedyny tor konfiguracji).
  Nie da się odtworzyć → `dismissed` z powodem „nieaktualne po …”, nie wdrażaj starej propozycji.
- **Naprawy w claude-patterns robisz w tym repo**, na gałęzi z `develop` (w głównym katalogu,
  bez worktree). Nigdy przez plik w projekcie: `.claude/agents`, `.claude/rules`,
  `.claude/knowledge/patterns` w projektach to symlinki do tego repo, więc edycja „w projekcie”
  zmienia centralę dla całej floty po cichu i bez commita.
- **Naprawy w projekcie** (lokalny blok, `project.yml`, wzorzec lokalny) robisz w repo projektu,
  a potem `scripts/setup-project.sh <projekt>` i `node scripts/verify-project-setup.mjs <projekt>`.
  Po zmianie `stack_blocks` uruchom setup dwa razy — pierwszy przebieg linkuje wzorce overlay ze
  starego `runtime.yml` (znany błąd, TASK-ONBOARD-001).
- **Rekordu nie usuwasz.** Zamknięcie to zmiana `status:` (`promoted` albo `dismissed`) z
  uzasadnieniem. Tylko istniejący plik pozwala `report-deviation` ponownie otworzyć problem,
  gdy wróci (ORC-068).

### Kolejność

1. `node scripts/report-deviation.mjs --list` — przegląd, posortowany wg `occurrences`
   (albo `docs/tasks/_inbox/index.json` — status, kategoria, źródła, projekty).
2. **`category: config` ze źródła `audit` (`DEV-aud-*`)**: najpierw
   `node scripts/audit-projects.mjs <projekt>` dla każdego projektu z `projects[]`. Audyt nie
   zamyka rekordów sam — jeśli błąd zniknął (np. po ponownym setupie), ustaw `dismissed` z
   `dismissed_reason: "nieodtwarzalne <data>: audit-projects <projekt> czysty"`. Jeśli jest,
   napraw w projekcie (setup, `.gitignore`, `git rm --cached` symlinków) — to prawie nigdy nie
   jest błąd silnika, chyba że ten sam błąd wraca po setupie we wszystkich projektach (wtedy
   generator/setup → punkt 4).
3. **Zanim uznasz to za błąd silnika claude-patterns — sprawdź po kolei 3 alternatywne
   przyczyny** (kolejność 2026-09-26, po tym jak 2 z 4 pierwszych zgłoszeń okazały się
   być tym poniżej, nie błędem silnika):
   1. **Config projektu** — czy lokalny blok satelity (`<projekt>/.claude/blocks/*.yml`)
      ma to poprawnie ustawione? Typowe braki: `checks:` w warstwie to gołe nazwy
      skryptów zamiast zawężonych do pakietu w monorepo (ORC-016 — `pnpm --filter <pkg>
      run <script>`, nie goły `<script>`, gdy root-owy skrypt jest rekurencyjny
      `pnpm -r run ...`); brak `layers[].verify` per warstwa, więc warstwa dostaje
      niewłaściwego weryfikatora przez fallback `inner_loop.verify`; lokalny blok z
      `extends:` który sforkował sekcję z bazy i nie dostaje jej aktualizacji
      (`audit-projects.mjs` to wykrywa jako ostrzeżenie, nie błąd — łatwo przeoczyć).
   2. **Świeżość bazy wiedzy** — czy wzorzec/karta reguły istnieje i jest aktualna w
      `.claude/knowledge/patterns/` tego projektu i w kolekcji RAG (`knowledge.collection`
      w `runtime.yml`)? Edycja wzorca bez `./scripts/reseed-patterns.sh` jest niewidoczna
      dla każdego agenta, który by go użył.
   3. **Silnik claude-patterns** — dopiero gdy 3.1 i 3.2 nie tłumaczą problemu, i da się
      go odtworzyć z generycznej logiki (`orchestrate.template.mjs`/`commands/
      orchestrate.md`) niezależnie od treści bloku konkretnego projektu.
   Przykład z 2026-09-26: `DEV-orc-062` (marketing-hub) i `DEV-agent_note-...` (ai-os-bot)
   okazały się być 3.1 (config projektu), nie punktem 3.3 — zamknięte tutaj jako
   `dismissed` z odesłaniem do konkretnej poprawki w tamtym repo, żadna zmiana w
   claude-patterns nie była potrzebna.
4. Realny, powtarzający się problem, potwierdzony jako 3.3 (silnik) → nowy
   `docs/tasks/TASK-<OBSZAR>-NNN.md` wg wzorca istniejących plików (`TASK-ORCH-FALSE-GO-001.md`
   itp.): frontmatter `id/title/type/status/priority/story_points/created_date/
   updated_date/assignee/labels/depends_on/related/source` (w `source:` wklej sekcję
   `## Occurrences` z tego pliku — to gotowa treść pola), body `## 🎯 Goal` →
   `## ✅ Kryterium ukończenia` → (po naprawie) `## Wynik`. W rekordzie ustaw
   `status: promoted` i `resolution:` z id taska (albo numerem reguły ORC-NNN, gdy naprawione
   od ręki). **Nie usuwaj pliku** — patrz zasady wyżej.
5. Szum / false positive / już naprawione gdzie indziej / nieaktualne / przyczyna to 3.1 albo
   3.2 (config projektu albo baza wiedzy, nie silnik) → `status: dismissed` + `dismissed_reason:`
   wskazujący konkretną poprawkę i gdzie (repo, commit albo plik) — ślad, że ktoś to widział
   i świadomie odrzucił.
6. Po triage: `node scripts/generate-inbox-index.mjs` i commit tylko własnych plików (inna
   sesja może mieć w tym repo staged zmiany — `git commit -- <pliki>`).
7. Chcesz zobaczyć realny koszt konkretnego wystąpienia → w `## Occurrences` jest
   `run_id`, dociągnij `node scripts/workflow-metrics-report.mjs --run <id>` (o ile
   skrypt istnieje w Twojej wersji repo).

## Dlaczego nie automatyczne promowanie

Zobacz `docs/adr/0006-cross-instance-broadcast.md` — podobny w duchu mechanizm (współdzielony
inbox między instancjami) padł po 11 miesiącach z zerem realnych wpisów, bo nikt go nie
czytał. Ten katalog jest węższy (zgłoszenia odstępstw floty) i ma dedup-po-sygnaturze, ale wciąż
wymaga, żeby *ktoś* od czasu do czasu odpalił `--list` i podjął decyzję — stąd pasywne
podsumowanie w `scripts/pre-commit-guards.mjs` przy każdym commicie w tym repo, zamiast
kolejnego osobnego nawyku do zapamiętania.
