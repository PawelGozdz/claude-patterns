# docs/tasks/_inbox/ — surowe zgłoszenia odstępstw od zasad /orchestrate

To **nie jest backlog**. Pliki tutaj (`DEV-*.md`) to automatyczne, best-effort zgłoszenia
zapisywane przez `scripts/report-deviation.mjs`, wołany z Kroku 5 `/orchestrate`
(`commands/orchestrate.md`, ORC-066) za każdym razem, gdy przebieg w projekcie-satelicie
natrafi na `ESCALATE_AND_HALT`, `BLOCKED_BY_PRIOR`, `NO_GO` bramki końcowej, naruszenie
`workflow-lint` przy `--emit-script`, albo agent sam zaznaczy (`deviation_note`), że trafił
na sytuację nieopisaną w zasadach.

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

## Jak triage'ować

1. `node scripts/report-deviation.mjs --list` — przegląd, posortowany wg `occurrences`.
2. **Zanim uznasz to za błąd silnika claude-patterns — sprawdź po kolei 3 alternatywne
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
   3. **Silnik claude-patterns** — dopiero gdy 2.1 i 2.2 nie tłumaczą problemu, i da się
      go odtworzyć z generycznej logiki (`orchestrate.template.mjs`/`commands/
      orchestrate.md`) niezależnie od treści bloku konkretnego projektu.
   Przykład z 2026-09-26: `DEV-orc-062` (marketing-hub) i `DEV-agent_note-...` (ai-os-bot)
   okazały się być 2.1 (config projektu), nie punktem 3 — zamknięte tutaj jako
   `dismissed` z odesłaniem do konkretnej poprawki w tamtym repo, żadna zmiana w
   claude-patterns nie była potrzebna.
3. Realny, powtarzający się problem, potwierdzony jako punkt 3 (silnik) → skopiuj treść do nowego
   `docs/tasks/TASK-ORCH-NNN.md`, wg wzorca istniejących plików (`TASK-ORCH-FALSE-GO-001.md`
   itp.): frontmatter `id/title/type/status/priority/story_points/created_date/
   updated_date/assignee/labels/depends_on/related/source` (w `source:` wklej sekcję
   `## Occurrences` z tego pliku — to gotowa treść pola), body `## 🎯 Goal` →
   `## ✅ Kryterium ukończenia` → (po naprawie) `## Wynik`. Potem usuń plik z `_inbox/`.
4. Szum / false positive / już naprawione gdzie indziej / przyczyna to 2.1 albo 2.2 (config
   projektu albo baza wiedzy, nie silnik) → ustaw `status: dismissed` + `dismissed_reason:`
   wskazujący konkretną poprawkę i gdzie (zamiast usuwać — zostaw ślad, że ktoś to widział
   i świadomie odrzucił, wraz z uzasadnieniem).
5. Chcesz zobaczyć realny koszt konkretnego wystąpienia → w `## Occurrences` jest
   `run_id`, dociągnij `node scripts/workflow-metrics-report.mjs --run <id>` (o ile
   skrypt istnieje w Twojej wersji repo).

## Dlaczego nie automatyczne promowanie

Zobacz `docs/adr/0006-cross-instance-broadcast.md` — podobny w duchu mechanizm (współdzielony
inbox między instancjami) padł po 11 miesiącach z zerem realnych wpisów, bo nikt go nie
czytał. Ten katalog jest węższy (jeden typ zdarzenia) i ma dedup-po-sygnaturze, ale wciąż
wymaga, żeby *ktoś* od czasu do czasu odpalił `--list` i podjął decyzję — stąd pasywne
podsumowanie w `scripts/pre-commit-guards.mjs` przy każdym commicie w tym repo, zamiast
kolejnego osobnego nawyku do zapamiętania.
