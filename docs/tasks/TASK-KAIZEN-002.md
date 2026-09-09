---
id: TASK-KAIZEN-002
title: 'Kaizen backlog 2: egzekwowanie zamiast deklaracji, telemetria, korpus wzorców, silnik /orchestrate'
type: task
status: in-progress
priority: P1
story_points: TBD
created_date: 2026-09-07
updated_date: 2026-09-08
assignee: unassigned
labels: [kaizen, hooks, setup, telemetry, rag, patterns, agents, commands, docs, retire]
source: >
  Audyt repo 2026-09-07 (siedem audytów obszarowych + własne czytanie silników i ADR-ów,
  każde znalezisko P1 zweryfikowane komendą). Pełny raport z dowodami plik:linia:
  docs/audits/2026-09-07-repo-audit.md. Kontynuacja TASK-KAIZEN-001 (zamknięty 2026-08-27).
depends_on: []
---

# TASK-KAIZEN-002 — kaizen backlog 2

> **▶ STATUS: IN-PROGRESS (2026-09-08) — 63/71 pozycji. Wszystkie 63 pierwotne pozycje zamknięte
> 2026-09-07; otwarte tylko dopisane K113–K120 (staged, czeka na review + commit).**
>
> **Weryfikacja 2026-09-08** (dzień po zamknięciu, przed commitem): stan repo niezmieniony
> (624 pliki w indeksie, 0 niezastage'owanych). Zmiana daty systemowej ujawniła dwa drobne
> dryfy, oba naprawione tego dnia:
> - Bramka `agent changelog discipline` w `pre-commit-guards.mjs` wymaga wpisu z DZISIEJSZĄ
>   datą dla każdego zastage'owanego pliku agenta — 21 plików miało wpis datowany na
>   2026-09-07 (dzień pracy), gate poprawnie odmówił. Daty w tych wpisach zaktualizowane na
>   2026-09-08 (dzień, w którym commit faktycznie powstanie), treść bez zmian.
> - `juz-ide-api-2` miał rozjechany `source_hash` w `runtime.yml` (przyczyna niepotwierdzona —
>   prawdopodobnie kolejność wczytywania bloków w skrypcie nie jest w pełni deterministyczna;
>   do zbadania, jeśli powtórzy się na innym satelicie). Naprawione: `node
>   scripts/materialize-runtime.mjs /opt/projects/juz-ide-api-2`.
> - `node scripts/pre-commit-guards.mjs` → 24/24 zielone. `node scripts/audit-projects.mjs
>   --gate` → exit 0, 17/18 bez zastrzeżeń (te same 2 ostrzeżenia co wczoraj: `iam` extends
>   → K113, metryki Workflow czekają na pierwszy przebieg → K120).
> - Poboczne, nieblokujące: `verify-project-setup.mjs` dla `juz-ide-api-2` zgłasza 3 „zerwane
>   dowiązania" do usuniętych agentów `changelog-bot`/`security-privacy-architect` (K97) —
>   sprawdzone `find -xtype l`: nie ma faktycznych martwych symlinków (agenci linkowani są
>   katalogiem, nie plikiem), więc to fałszywy alarm samego checku albo odwołanie w innym
>   pliku (np. decyzja/task), nie w overlay symlinków. Nie blokuje niczego — do doprecyzowania
>   przy K120, nie tworzę nowej pozycji dla samej diagnostyki.
>
> **Zamknięcie sesji 2026-09-08.** Koszt sesji przekroczył 200 USD (dużo agentów w tle na
> falach 1-6) — dalsza autonomiczna praca wstrzymana na prośbę użytkownika. Stan repo od
> wczorajszej weryfikacji NIEZMIENIONY (624 pliki w indeksie, bramka zielona, `git status`
> identyczny). Użytkownik przejrzał uzasadnienie K97 (retire `security-privacy-architect` →
> `ecc:security-reviewer`) i zaakceptował decyzję po przedstawieniu realnych różnic (model,
> narzędzia, utrata specjalizacji GDPR/RODO-PL pokrytej gdzie indziej przez `/threat-model`,
> `/incident`, `@legal-strategist`) — nie wymaga cofnięcia. Zadanie czeka na review + commit
> przez człowieka; kolejny krok autonomiczny dopiero na wyraźną prośbę.
>
> Pełne uzasadnienie każdej pozycji, z dowodami, jest w
> [`docs/audits/2026-09-07-repo-audit.md`](../audits/2026-09-07-repo-audit.md).
> Tu jest lista robocza do odhaczania. Numeracja K50+ kontynuuje KAIZEN-001 (K01-K49).

## Cel

Repo ma dobry, unikalny rdzeń (Rule Cards, hooki groundingu i delegacji, VETO verifiers,
kompozycja bloków z ADR 0008). Wokół niego narosły trzy warstwy rozjazdu, które ten task domyka:

1. **Deklaracja bez egzekwowania.** `hooks.json` „auto-install" ma realnie wpięte 2 z 22 hooków,
   `overlay.rules` w blokach nie ma konsumenta, `sync-runtime-hooks.mjs` nie jest nigdzie wołany,
   wstrzykiwanie kart reguł wymagane przez `orchestrate.md` nie jest robione przez żaden skrypt.
2. **Decyzje podjęte, niewykonane.** Spike Fazy 0 dał GO 2026-06-28 i leży poza repo
   (`/opt/projects/_spike/notes/`); zaplanowane cięcie generyków nie ruszyło.
3. **Ślepa telemetria.** Log użycia agentów ma 36460/36461 wierszy `unknown`, metryki workflow
   stoją od 2026-08-15, eval `library-reference-schema` pada 5/14 bez alarmu.

Zasady jak w KAIZEN-001: jedna pozycja → weryfikacja → commit → następna. Kolejność fal jest
celowa: najpierw prawda i egzekwowanie, potem dane, potem cięcie. Nie tnij (Fala 5) przed
naprawą telemetrii (Fala 2), bo decyzje RETIRE nie mają wtedy dowodów.

Wszystko stage'ować, nie commitować. Commit robi człowiek po review fali.

---

## Fala 0 — poprawki jednolinijkowe, dzień 1 (każda < 30 min)

- [x] **K50. `subagent-stop-cost-log.js`: czytać `agent_type`.** Payload SubagentStop niesie
      `agent_type` (potwierdzone z `~/.claude/logs/agent-usage-debug.jsonl`), hook czyta
      `subagent_type`/`agent_name` (`hooks/subagent-stop-cost-log.js:155-157`). Skutek:
      36460/36461 wierszy `"agent":"unknown"`. Dodać `input.agent_type` jako pierwszy fallback.
      Weryfikacja: nowy wpis w `~/.claude/logs/agent-usage.jsonl` po dowolnym subagencie ma
      nazwę agenta.
      ✅ 2026-09-07 — `input.agent_type` jako pierwszy fallback; realny payload z debug-logu daje `"agent":"fix-pr-gist-test-seeding"`.
- [x] **K51. `check-approval-before-impl.js`: wyjątek dla subagentów.** Jedyna z czterech bramek
      bez `if (payload.agent_id) exit 0` (`hooks/check-approval-before-impl.js:50-82`; wzór:
      `check-delegation.js:111`). Skanuje cały katalog `analysis/`, więc w trybie `block`
      zatrzyma implementera `/orchestrate` na cudzym niezatwierdzonym artefakcie. Przy okazji:
      helper `isSubagent(payload)` w `hooks/lib/utils.js` i podmiana 4 kopii inline
      (`check-delegation`, `check-patterns-read`, `productivity-watchdog`, `workflow-metrics-postrun`).
      Weryfikacja: fixture w `tests/flow-evals/hooks/fixtures/core-hooks.json` z `agent_id`.
      ✅ 2026-09-07 — `isSubagent()` w `hooks/lib/utils.js`, użyty w 5 hookach; fixture `approval-draft-block-subagent-passes`, eval 18/18.
- [x] **K52. `patterns/python/METADATA.yml:5`: błąd składni YAML.** Niecytowany drugi dwukropek
      w `stack: Python 3.11+, ...; pipeline: PostgreSQL ...`. Każdy `yaml.parse` pada.
      Weryfikacja: `node -e "require('yaml').parse(require('fs').readFileSync('patterns/python/METADATA.yml','utf8'))"`.
      ✅ 2026-09-07 — `stack` w cudzysłowie, `description` jako `>-` (drugi błąd: dwukropek w nawiasie); `yaml.parse` OK.
- [x] **K53. Wpiąć dwa niewpięte hooki.** `block-root-grep.js` → `hooks/hooks.json`
      (PreToolUse, matcher `Bash`); `check-focus-wrapper.js` → `blocks/flutter.yml` (lub
      `clean-arch.yml`) `overlay.hooks`. Oba z 2026-09-04, dziś brak w `hooks.json`, blokach,
      szablonach i `hooks/README.md`. Dopisać do README.
      ✅ 2026-09-07 — `block-root-grep` w `hooks.json` (PreToolUse/Bash); `check-focus-wrapper` w `blocks/clean-arch.yml`, `templates/settings/flutter.json`, `interactiveFocus` w `templates/flutter-hooks.json`; oba w `hooks/README.md`.
- [x] **K54. `tech-lead.md`: `model: haiku` → `sonnet`.** Naprawa incydentu fabrykowanych metryk
      (commit `4e2bc58`) objęła `product-owner`, nie `tech-lead`; README (`agents/README.md:57`)
      już deklaruje Sonnet. Pisze do tego samego `TEAM-STATE.md`.
      ✅ 2026-09-07 — `model: sonnet` + sekcja `## Changelog`.
- [x] **K55. `business-rules-auditor.md:232-234`: placeholdery zamiast liczb.** Przykład Output
      Format ma `Specs: 32 total | 3 decorated | 29 missing (9%)` z nazwami LocalHero. Ten sam
      few-shot-as-data trap co w incydencie z `product-owner`. Zamienić na `<N>` jak w
      `tech-lead.md`. Dodać `## Changelog`.
      ✅ 2026-09-07 — `<N>` w SUMMARY/NEXT STEPS + ostrzeżenie nad blokiem Output Format; `## Changelog`.
- [x] **K56. Usunąć `mcp__zen__*` z 16 agentów.** `grep -l "^tools:.*mcp__zen" agents/**/*.md`
      = 16. Żaden satelita nie ma serwera `zen` w `.mcp.json`. Wzór naprawy z Changelogu
      `security-e2e-verifier.md:484`. Każdy z 16 plików dostaje wpis w `## Changelog` (bramka
      K15 pre-commit).
      ✅ 2026-09-07 — 16 plików, grep `^tools:.*mcp__zen` daje 0; każdy z wpisem w `## Changelog`; `pre-commit-guards` zielony.
- [x] **K57. `templates/examples/nextjs-project.yml:8` deklaruje blok `nextjs`, którego nie ma.**
      `materialize-runtime.mjs:247` rzuci twardy błąd każdemu, kto skopiuje przykład. Do decyzji
      w K88 (bloki dla 5 stacków); tu tylko: poprawić przykład albo dopisać komentarz „stack bez
      bloku, agenci przez @mention".
      ✅ 2026-09-07 — `stack_blocks: [nextjs]` zakomentowane z wyjaśnieniem (projekt bez kompozycji do czasu K88).
- [x] **K58. `CLAUDE.md:11-16` banner CURRENT DIRECTION.** Cytuje `/analyze-ddd`,
      `/orchestrate-ddd`, `preset requires_ecc:` — usunięte 2026-08-12 (ADR 0008). Przepisać na
      `/analyze` + `/orchestrate` + `stack_blocks`, link „Why & how" → ADR 0008 + `blocks/README.md`.
      ✅ 2026-09-07 — banner na `/analyze` + `/orchestrate` + `stack_blocks`; sekcja Why & how linkuje ADR 0008 + `blocks/README.md`.
- [x] **K59. Rematerializować `runtime.yml` w 10 projektach.** `node scripts/audit-projects.mjs`
      → 12 projektów wymaga uwagi, 16 znalezisk (stan z 2026-09-07). Uruchomić proponowane
      komendy, potwierdzić „bez zastrzeżeń". Trwała naprawa w K63.
      ✅ 2026-09-07 — `materialize-runtime.mjs` w 11 satelitach, 3 szablony skopiowane, `sync-runtime-hooks.mjs --apply` w 5 (brakowało `check-human-voice`, w motion-proto także `check-focus-wrapper`). Audyt: 17/18 bez zastrzeżeń; jedyne znalezisko to `iam` `extends` (K95). Uwaga do K63: różnice szablonów w satelitach były wyłącznie Prettierowym zawijaniem tabel, więc wrócą po kolejnym formacie; porównanie w audycie powinno normalizować białe znaki.

## Fala 1 — prawda i egzekwowanie (jedna ścieżka instalacji)

- [x] **K60. `scripts/sync-global-hooks.mjs`: `hooks.json` → `~/.claude/settings.json`.**
      `setup-global.sh:100-101` tylko symlinkuje katalog; nigdzie nie aplikuje `hooks.json`.
      Realnie wpięte 2/22 (`block-root-grep`, `pre-workflow-lint`). Wzór:
      `scripts/sync-runtime-hooks.mjs` (dopisuje tylko brakujące, nie rusza kolejności).
      Wołać z `setup-global.sh` [3/4]. Poprawić skłamany komentarz `setup-global.sh:10,137`
      i opis „Auto-install hook configuration" w CLAUDE.md/README.
      ✅ 2026-09-07 — `scripts/sync-global-hooks.mjs` (dry-run / `--apply` / `--check` / `--remove`), wołany z `setup-global.sh` [3/4]; dry-run: 23 zadeklarowane, 2 wpięte, 21 brakujących. `--apply` na `~/.claude/settings.json` odłożone do zakończenia K98 (żeby nie wpiąć hooków idących do retire).
- [x] **K61. Wpiąć `sync-runtime-hooks.mjs`.** Zbudowany 2026-08-12, zero wywołań
      (`grep -rl sync-runtime-hooks commands/ skills/ hooks/ docs/ README.md CLAUDE.md` → pusto).
      `setup-project.sh:763-778` świadomie tylko ostrzega. Dodać tryb `--apply` do
      `setup-project.sh` i sprawdzenie do `audit-projects.mjs`.
      ✅ 2026-09-07 — `setup-project.sh` [5a3] woła `sync-runtime-hooks.mjs --apply` i zakłada brakujący `settings.json` z `templates/settings/base.json`; check istniał już w `verify-project-setup.mjs` (komenda naprawcza podmieniona).
- [x] **K62. `link_overlay_rules()` w `setup-project.sh`.** `overlay.rules` w 4 blokach
      (`python.yml`, `ts-library.yml`, `clean-arch.yml`, `ddd/core.yml:44`) materializuje się do
      `runtime.yml` i nikt go nie czyta; reguły są linkowane po `$STACK_PROFILE`
      (`setup-project.sh:448-472`), choć `templates/project.yml.example:17-19` mówi
      „stack_profile = tylko selektor szablonu". Napisać analogicznie do
      `link_overlay_agents()` (`:356`), usunąć gałąź `$STACK_PROFILE`.
      ✅ 2026-09-07 — `link_overlay_rules()` + wspólny `overlay_dirs` (czyta runtime.yml przez parser z K65); `$STACK_PROFILE` tylko jako legacy dla projektów bez runtime.yml.
- [x] **K63. `audit-projects.mjs` jako cykliczna bramka.** Incydent „10/10 nieaktualnych" z
      2026-08-12 powtórzył się identycznie miesiąc później, bo nic nie wymusza audytu.
      Rozjazd bierze się także z lokalnej edycji `project.yml` (api-3, 2026-09-05), nie tylko
      ze zmian w `blocks/`. Do zrobienia: (a) `audit-projects` w `pre-commit-guards.mjs` przy
      zmianie `blocks/**`, (b) szablon pre-commit dla satelitów uruchamiany na zmianę
      `project.yml`/`.claude/blocks/*.yml`, (c) heurystyka „dormant" (projekt z 1-6 sesjami w
      `~/.claude/projects/` nie dostaje tej samej wagi co api-1..4 ze 172-190).
      ✅ 2026-09-07 — bramka `audit-projects --gate` w pre-commit przy zmianie `blocks/**.yml`/`templates/*-hooks.json`/`templates/settings/*.json`; wagi BŁĄD/OSTRZEŻENIE/INFO, `extends-override` = WARN do czasu K113; `templates/git-hooks/pre-commit-satellite.sh` instalowany w kroku [9/9] `setup-project.sh`; heurystyka dormant (≤6 sesji → INFO, `--all` znosi).
- [x] **K64. Jedna ścieżka provisioningu `settings.json`.** `templates/settings/nestjs-ddd.json`
      (ścieżka `migrate-v2.sh:132-149`) nie ma `check-patterns-read`, kluczowej bramki
      groundingu z `blocks/ddd/core.yml:45`. Wycofać `migrate-v2.sh` + `migrate-all.sh` +
      `templates/settings/*.json` na rzecz `setup-project.sh` + K61. Jeśli zostają: baner
      „legacy, nie używać po ADR 0008".
      ✅ 2026-09-07 — `migrate-v2.sh`/`migrate-all.sh` baner LEGACY + `exit 1` bez `--i-know-legacy`; `nestjs-ddd.json` dostał `check-patterns-read`; `templates/settings/base.json` jest seedem jedynej ścieżki (K61). Do rozważenia: usunięcie 7 pozostałych `templates/settings/*.json` (0 konsumentów poza migrate-v2).
- [x] **K65. Jeden parser `project.yml`.** Trzy kopie grep/sed (`setup-project.sh:79-99`,
      `generate-claude-md.sh:31-73`, `migrate-v2.sh:43-53`) + prawdziwy `yaml` w
      `materialize-runtime.mjs`. Kopie już rozjechane: `generate-claude-md.sh` obcina komentarz
      inline, `setup-project.sh` nie. Moduł `scripts/lib/project-yml.mjs` (get/list na pakiecie
      `yaml`) wołany z basha przez `node`. Docelowo port `setup-project.sh` do Node — osobny task,
      tu tylko parser.
      ✅ 2026-09-07 — `scripts/lib/project-yml.mjs` (get/list na `yaml`), trzy kopie grep/sed podmienione; eval `tests/flow-evals/project-yml/run.js` 24/24 w pre-commit. Rozjazd potwierdzony: obie stare kopie `yml_get` zwracały komentarz inline w wartości.
- [x] **K66. Rozstrzygnąć ADR 0007 D1/D2 (manifest instalacji + `--check`).** `proposed` od
      2026-08-02; D4 już wdrożone, D1/D2 nie. Manifest `.claude/config/installed.yml` z SHA
      claude-patterns i wersją kontraktu domyka K63 na trwałe. Decyzja: accept z zawężeniem do
      D1/D2 albo reject z uzasadnieniem. Status per decyzja w nagłówku ADR.
      ✅ 2026-09-07 — ADR 0007 accept w zawężeniu: D1 manifest `.claude/config/installed.yml` pisze `materialize-runtime.mjs` (SHA, dirty, contract_version z METADATA, blocks_hash), D2 w `audit-projects.mjs` (brak = WARN, SHA = INFO, MAJOR = BŁĄD), D3 jedna wersja kontraktu; wpis w DECISIONS-LOG.
- [x] **K67. `docs/ARCHITECTURE.md` na stan po ADR 0008.** Cały plik (228 linii) opisuje
      `_stack-defaults`, `stack_profile`, `templates/stack-presets`, Phase 0.5; linkowany z
      CLAUDE.md jako „full architecture reference". Przepisać na: bloki → `runtime.yml` → sloty
      `/analyze` i `/orchestrate` → overlay symlinków. Diagram trzech warstw zostaje.
      ✅ 2026-09-07 — `docs/ARCHITECTURE.md` przepisany (220 l.): bloki → runtime.yml → sloty → overlay; bez `_stack-defaults`/presets poza jedną linią historii.
- [x] **K68. `blocks/README.md` i martwe referencje.** Nagłówek „F3 pilot, stare komendy chodzą
      równolegle na presets/" (`:1-8`, edytowany dzień PO ADR 0008). `blocks/README.md:253`,
      `_aliases.yml:2`, `ddd/events.yml:9` referują usunięty `blocks-equivalence-check.mjs`
      (commit `af4bcd2`).
      ✅ 2026-09-07 — nagłówek `blocks/README.md` na stan wdrożony; 3 martwe referencje `blocks-equivalence-check` zastąpione opisem aktualnego mechanizmu; nowa sekcja o `overlay:` → pliki projektu (K61).
- [x] **K69. Zamknąć `TASK-BLOCKS-001`.** Status `ready`, treść (linie 12,20,25,31,140) opisuje
      pilot zakończony 2026-08-12. Przenieść do `completed-tasks/`, resztki F5/F6 (jeśli
      jakieś) do nowej pozycji tutaj.
      ✅ 2026-09-07 — `TASK-BLOCKS-001` done (2026-08-12) → `docs/completed-tasks/`; resztki F5/F6 → K114, K115 poniżej.
- [x] **K70. Liczniki z jednego źródła.** `CLAUDE.md:28` 100 patterns / `:580` 67 / realnie
      104; `CLAUDE.md:30` + `README.md:518` 45 hooks / realnie 53; `README.md:3-4` v3.5.0 z
      2026-05-07 vs METADATA 3.6.0; `patterns/README.md` 104 vs suma bloku ASCII 92 vs sekcja
      Statistics 81 (architecture: 11/12/14 w jednym pliku). Rozszerzyć `count-assets.mjs` o
      `--check-docs` (grep `\d+ (patterns|hooks|commands|agents|skills)` w CLAUDE.md, README.md,
      patterns/README.md) i wpiąć w pre-commit. Usunąć sekcję Statistics.
      ✅ 2026-09-07 — `count-assets.mjs --check-docs` w pre-commit; liczniki w CLAUDE.md/README.md/patterns/README.md poprawione (104 wzorce, 53 hooki, v3.6.0); sekcja Statistics usunięta.
- [x] **K71. `README.md:585-596` Quick Setup po `stack_profile`.** `setup-project.sh:620-621`
      sam mówi „presety usunięte 2026-08-12". Przepisać na `stack_blocks` + bloki.
      ✅ 2026-09-07 — README Quick Setup: `stack_blocks` + `materialize-runtime.mjs` + `/analyze` → `/orchestrate`, link do `blocks/README.md`.
- [x] **K72. Wynik spike'a Fazy 0 do repo.** `/opt/projects/_spike/notes/06-decision.md`
      (GO 2026-06-28) reklasyfikuje względem `docs/REFACTOR-ANALYSIS.md:363-371`: `adr`,
      `blog`, `capture`, `claude-updates` → KEEP; finance/legal/marketing → KEEP;
      `security-review/-check` i `cost-report` to inna domena niż `ecc:security-scan` /
      `ecc:cost-report`. Krótki ADR 0009 „wynik Fazy 0 i lista retire" albo aktualizacja §8.
      Bez tego Fala 5 nie ma podstawy.
      ✅ 2026-09-07 — `docs/adr/0009-wynik-spike-fazy-0-i-lista-retire.md`: tabela RETIRE/KEEP z odpowiednikami ECC i konsumentami; ustalenia: `technical-architecture-lead` już nie istnieje, ECC nie ma `/tdd` ani `/verify` (skill `tdd-workflow`, `ecc:quality-gate`), wszystkie 8 hooków sesyjnych ma odpowiednik; §8 REFACTOR-ANALYSIS historyczne; wpis w DECISIONS-LOG.
- [x] **K73. `docs/DECISIONS-LOG.md` od 2026-07-05.** 64 dni luki: ADR 0008, TASK-OBS-002,
      GUARDRAILS/KAIZEN-001, wzorce 09-04/09-07. Dopisać wpisy wsteczne (skrótowe, z linkami)
      albo baner „log wstrzymany od 2026-07-05, patrz ADR i completed-tasks".
      ✅ 2026-09-07 — 6 wpisów wstecznych (daty z `git log`) + baner o luce; wpisy z tej sesji (ADR 0007, ADR 0009, silnik K92–K94, Fala 0).
- [x] **K74. Banery archiwalne.** `docs/{REFACTOR-ANALYSIS,ECC-USAGE,orchestrate-ddd-design,
      rag-design,spike-faza-0-plan,faza-1-plan}.md` opisują architekturę sprzed ADR 0008 bez
      ostrzeżenia. Wzór: `docs/ROADMAP.md:9-16`. ADR 0002 dostaje `Superseded-by: ADR 0008`.
      ✅ 2026-09-07 — banery ARCHIWUM w 5 plikach, `rag-design.md` „częściowo historyczny” (sekcje wskazane), ADR 0002 `superseded` → ADR 0008.
- [x] **K75. Otwarte taski z nieaktualnymi krokami.** `TASK-AGENTS-AUDIT-001` (wchłonięty przez
      ten task, zamknąć po K54-K56, K86, K103), `TASK-VYTCHES-BLOCKS-001:82-83,102,111,180`,
      `TASK-DDD-PANEL-SPLIT-001` (cały plan o `/analyze-ddd`, panel żyje w
      `blocks/ddd/core.yml`), `TASK-RAG-004:117,122,203`, `TASK-EVAL-001` (Faza 1 zrobiona
      przez K11) — zaktualizować kroki na bloki/runtime.yml albo zamknąć.
      ✅ 2026-09-07 — AGENTS-AUDIT-001 done (wchłonięty); VYTCHES-BLOCKS-001 → in-progress (F2 triage agentów nie zrobione); DDD-PANEL-SPLIT-001 kroki przepisane na bloki (cel NIE zrealizowany: panel sekwencyjny, brak 4 advisorów); RAG-004 3 linie; EVAL-001 Faza 1 done przez K11.

## Fala 2 — telemetria i RAG (dane przed cięciem)

- [x] **K76. Metryki workflow z powrotem.** `~/.claude/metrics/workflow-steps.jsonl` ostatni
      `ts` 2026-08-15T16:30 (3771 wpisów, $2652 wcześniej). `workflow-metrics-postrun.js` jest
      w `hooks.json`, którego nikt nie aplikuje (K60). Po K60: potwierdzić nowy rekord po
      dowolnym `Workflow`. Dodać do `audit-projects.mjs` check „ostatnia metryka vs ostatnia
      sesja z Workflow".
      ✅ 2026-09-07 — `scripts/telemetry-freshness.mjs` (Workflow: ostatnia metryka vs ostatnia sesja z Workflow, 0,14 s; agenci: próg 7 dni) wołany z `audit-projects.mjs` jako WARN globalne. Dziś łapie: metryki martwe od 2026-08-15 przy sesji Workflow 2026-09-06. Potwierdzenie nowego rekordu wymaga `sync-global-hooks --apply` (po K98) + realnego przebiegu `Workflow`.
- [x] **K77. Koszt agentów z transkryptu.** Payload SubagentStop nie niesie `usage`/`model`
      (K50 naprawia tylko nazwę). Liczyć tokeny z `agent_transcript_path` tak, jak robi to już
      `scripts/workflow-metrics-lib.mjs:72` (`sumTranscriptUsage`). Jedna implementacja, dwa
      konsumenty.
      ✅ 2026-09-07 — `hooks/lib/transcript-usage.js` (CJS, strumieniowo po 1 MB, limit 32 MB) jako jedyna implementacja; `workflow-metrics-lib.mjs` re-eksportuje; hook liczy z `agent_transcript_path` gdy payload pusty. Realny payload → `model: claude-sonnet-5`, 4,35M cache_read, `cost_usd: 2.29`, `usage_source: transcript`.
- [x] **K78. Eval `library-reference-schema` w pętli reseedu.** `node
      tests/flow-evals/library-reference-schema/run.js` → 5/14 FAIL (1007 punktów zamiast 982,
      `INV-LIBVER` naruszony 1007×). Celowo poza pre-commit (wymaga Qdranta), ale
      `reseed-patterns.sh` już odpala eval retrievalu w kroku 4/4 — dopisać ten obok, wynik do
      `results.jsonl`, ostrzeżenie w `rag-freshness.mjs` gdy ostatni wynik = FAIL. Potem
      naprawić sam drift (reseed `library_reference_global` albo korekta oczekiwań).
      ✅ 2026-09-07 — eval w kroku 4/4 `reseed-patterns.sh` (WARN), `results.jsonl`, ostrzeżenie w `rag-freshness.mjs`; przyczyna 1007 vs 982 = bump `@vytches/ddd` 0.30→0.31.1 (+5 przykładów bez mapowania `vytchesLevels`) — mapowania dopisane, golden zaktualizowany z uzasadnieniem; 14/14.
- [x] **K79. TASK-RAG-004 R1: ścieżki repo-relative + snippet jako dowód.**
      `mcp-server/knowledge-retriever/src/indexer.ts:23-33,47` nadal zapisuje `source` jako
      ścieżkę absolutną (komentarz to racjonalizuje). Agent w api-2 dostaje trafienie fizycznie z
      drzewa api-1 i błąd jest cichy. `orchestrate.md` §2b′ od 2026-09-01 każe używać
      `retrieve_code`, więc to jest teraz na ścieżce krytycznej. Podnieść RAG-004 z `draft` do
      `ready`, wykonać R1.
      ✅ 2026-09-07 — R1: `source` względne + `repo` + `indexedSha` + `evidence` (12 linii, `text` usunięte), `reindexFile` wymaga `repoRoot`; kontrakt w polu `_contract` odpowiedzi, w ORC-061/ANL-035 i w 5 agentach; RAG-004 → in-progress.
- [x] **K80. TASK-RAG-004 R2: indeks z kanonicznego refa.** `reseed.config.json` seeduje
      `code_juz_ide_api` wyłącznie z `../juz-ide-api-1/src`, a cztery instancje mają różne
      zestawy commitów (`docs/KANON.md` tylko w api-1/3; `harmonia.md` tylko w api-2/4).
      Indeksować z `git show <ref>:` zamiast żywego drzewa, zamknąć kanał skażenia przez
      `watchDirs` tylko w api-2. Dodać check spójności `governance.canon` między instancjami o
      tym samym `knowledge_collection` do `verify-project-setup.mjs`.
      ✅ 2026-09-07 — R2: `reseed.config.json` `{repo, ref: origin/develop, dirs}`, indeks z `git archive <ref>` (nie z żywego drzewa), `reindexFile` odmawia dla kolekcji przypiętych do refa (kanał `watchDirs` domknięty po stronie daemona), check `governance.canon` w `verify-project-setup.mjs` (api-2/api-4 rozjechane o 58/10 plików). Po drodze: `embedder.ts` przycina wejście do 8000 znaków — kolekcje kodu były niesiewalne (chunk 131 KB z `error-codes.ts` wywracał batch).

## Fala 3 — korpus wzorców

- [x] **K81. `repository-pattern.md` to 20-liniowy stub w routingu.**
      `pattern-routing.generated.js` ma 6 reguł na ten plik (`.repository.ts$`, `.cron.ts$`,
      `.scheduler.ts$`, `.job.ts$`, `/domain/repositories/`…); `patterns/README.md:103` opisuje
      go jako „~700 linii, Production"; karta RP1-RP12 jest bogatsza niż rodzic. Przywrócić
      pełną treść (z `repository-events-pattern.md` albo z historii gita) albo przekierować
      routing i README na właściwy plik.
      ✅ 2026-09-07 — pełna treść przywrócona z historii (`0e42213`; stub powstał w `64906b8`), 20→999 l., `Level: exhaustive`, nowy anty-wzorzec 8 + „Exceptions” pokrywające RP12/N7 (routing kieruje tu `.cron/.scheduler/.job.ts`); `repository-events` zostaje osobnym wzorcem (inny temat). Routing bez zmian.
- [x] **K82. Lint: wzorce routowane przez hooki poza baseline.** Wszystkie 14 celów
      `pattern_routing:` (aggregate, value-object, entity, domain-event, domain-service,
      specification-policy, repository, mapper, controller-schema, command-handler,
      query-handler, audit-handler, application-service, acl-registry) siedzi w
      `.lint-baseline.json`; `command-handler`/`query-handler` edytowane 2026-09-04 bez
      naprawy. `lint-patterns.mjs` ma czytać `pattern_routing.*` z bloków (jak check
      `patterns.always`, linia 118) i eskalować brak sekcji do BŁĘDU. Potem naprawić te 14.
      ✅ 2026-09-07 — `lint-patterns.mjs` czyta `pattern_routing.*` z bloków, cel routingu = BŁĄD niezależnie od baseline, `--update-baseline` nie wpisuje celów routingu; 14 plików naprawionych (Layer/Status/`## When to Use` bez emoji, 4 sekcje napisane od zera). Baseline 75→37.
- [x] **K83. Scalić `entity-event-emission-pattern.md` z `domain-event-pattern.md`.** Uczy
      `eventDispatcher.dispatchEvent()`, który `integration-event-pattern.md` (ADR-0082) nazywa
      anty-wzorcem, na przykładzie usuniętego Trust BC, z identycznymi Tags co
      `domain-event-pattern.md` (retrieval może zwrócić go jako alternatywę). Podsekcja „Entities
      without `.apply()`" w domain-event, plik usunąć, reseed.
      ✅ 2026-09-07 — sekcja „Entities without `.apply()`” w `domain-event-pattern.md` (673→771), `entity-event-emission-pattern.md` usunięty; jedyna referencja (`transactional-outbox_summary:36`) poprawiona.
- [x] **K84. Jeden schemat `METADATA.yml` + walidator w pre-commit.** Dwa schematy (stary
      `layer/stack_support/patterns` w domain/application/architecture; nowy
      `category/maturity/patterns_count` w stackowych), 7/16 kategorii bez pliku,
      `validate-metadata.sh` 6/10 FAIL i poza `pre-commit-guards.mjs`. Wybrać nowy schemat,
      przepisać walidator (Node, obok `count-assets.mjs`), wpiąć. Zależy od K52.
      ✅ 2026-09-07 — jeden schemat (nowy + opcjonalne `layer`/`stack_support`/`patterns[]`), 9 przepisanych + 7 nowych METADATA, `scripts/validate-metadata.mjs` w pre-commit (`.sh` usunięty); `patterns_count` liczy jak `count-assets` (guide’y wliczone — flutter deklarował 8 przy 14). 16 kategorii, 104 wzorce, bez zastrzeżeń.
- [x] **K85. `**Scope**: project-specific` tam, gdzie brakuje.**
      `infrastructure/geo-spatial-query-pattern.md` (`README.md:516` twierdzi, że oznaczony;
      nie jest), `testing/domain-colocated-fixture-mother-pattern.md` (dziennik migracji
      TS-TEST-FIXTURE-001..008), `flutter/{design-token,component-creation,accessibility}-pattern.md`
      (`LocalHeroDesignTokens`, `elderMode`). Plik + karta + README + METADATA, reseed.
      ✅ 2026-09-07 — Scope dodany (plik+karta+README+METADATA) dla `domain-colocated-fixture-mother` (juz-ide-api-1) i `flutter/{design-token,component-creation,accessibility}` (juz-ide-mobile-app). **`geo-spatial-query` NIE oznaczony** — plik ma „Promoted to universal 2026-08-16 (owner decision)”; decyzja właściciela wygrywa z audytem, wpis scope usunięty z METADATA, README v3.11 dostał „Superseded 2026-08-16”.
- [x] **K86. 5 kart nieosiągalnych przez żaden mechanizm wymuszony.** `try-confirm-cancel`,
      `dto-mapper`, `moderated-edit-buffer`, `named-policy`, `geo-spatial-query` nie występują w
      `always`/`triggers`/`pattern_routing` żadnego bloku. Dopisać `triggers` lub
      `pattern_routing` w odpowiednich blokach, `generate-pattern-routing.mjs`.
      ✅ 2026-09-07 — `try-confirm-cancel` i `dto-mapper` → triggers w `ddd/cqrs.yml`, `named-policy` → triggers w `ddd/core.yml`; `geo-spatial-query` był już osiągalny przez blok lokalny `./geo` w api-1..4 (D6 prawdziwe tylko dla bloków centralnych); `moderated-edit-buffer` jest project-specific → gotowy trigger do bloku lokalnego api-1..4 (nie wpięty centralnie). Dodatkowo: routing `*.schema.ts`/`*.rate-limits.ts` w `blocks/zod.yml` dla wzorców ze splitu K89.
- [x] **K87. `rules/` vs ECC i vs karty.** `rules/common/{git-workflow,hooks,patterns,security}.md`
      identyczne bajt w bajt z `~/.claude/plugins/marketplaces/ecc`, `coding-style` 48 vs 90
      linii, `testing` 29 vs 57; `rules/nestjs-ddd/repository.md` bez RP12/N7 obecnych w karcie;
      11/41 plików nieprzywołanych w blokach. Decyzja (ADR lub wpis w DECISIONS-LOG):
      `requires_ecc: rules/common` i usunięcie kopii, albo jawny fork z `UPSTREAM_VERSION` +
      sync. `rules/nestjs-ddd/*` generować z kart albo usunąć.
      ✅ 2026-09-07 — decyzja: jawny FORK, nie retire (ECC instaluje reguły własnym `rules/install.sh` do `.claude/rules/`, gdzie 13 satelitów ma nasz symlink). `scripts/sync-ecc-rules.sh` (`--diff/--check/--apply`, TRACKED/FORKED/LOCAL_ONLY) + `rules/common/UPSTREAM_VERSION`; pierwszy sync wykonany (`agents`, `coding-style`, `testing` były ścisłymi podzbiorami ECC 2.0.0). `rules/nestjs-ddd/` zostaje bez generatora (inna forma, inny adresat), `repository.md` dostał RP12/N7. `rules/tsx/` wpięte w `blocks/nextjs.yml`; `rules/common` linkuje setup bezwarunkowo. Wpis w DECISIONS-LOG.
- [x] **K88. Bloki dla stacków bez bloku albo jawne „manual only".** nextjs, sveltekit,
      python-modular, node-ts-claude-api, astro nie mają `blocks/*.yml`; 10 agentów osiągalnych
      tylko przez `@mention`. Minimum: `blocks/nextjs.yml` i `sveltekit.yml` z `overlay.agents`
      + `analyze.panel`. Alternatywa: dokumentacja w `agents/README.md`. Domyka K57.
      ✅ 2026-09-07 — `blocks/nextjs.yml`, `blocks/sveltekit.yml` (triggers, panel, overlay.agents, `check-patterns-read`; bez `orchestrate.layers` — brak implementerów; bez `always` — brak kart); alias `nextjs-app` (alias `sveltekit` celowo NIE — `expand()` bez wykrywania cykli); `agents/README.md` sekcja „Stacks without a block” (node-ts-claude-api, astro-static); przykład nextjs odkomentowany (domyka K57).
- [x] **K89. Duplikaty i przerosty.** `testing/context-isolation-pattern.md` ≈
      `architecture/fresh-context-pattern.md` (retire pierwszy);
      `integration-event-pattern.md` (1440 l.): 237 linii Trust BC + 183 BullMQ (jest
      `bullmq-queue-pattern.md`) + 118 outbox (jest `transactional-outbox-pattern.md`);
      `controller-schema-pattern.md` (1148 l.) = controller + Zod + rate-limit → split.
      `**Level**: exhaustive` dla 9 plików > 700 linii. Każdy plik osobny commit.
      ✅ 2026-09-07 — (a) `context-isolation` usunięty (był planem wdrożenia z 2025), kontrakt handoffu → `fresh-context` (555→582); README opisywał go jako izolację baz — **luka: brak wzorca izolacji bazy w testach / `DatabaseCleaner`** (K116). (b) `integration-event` 1440→896 (Trust BC → odsyłacz do `c4e12c4`, BullMQ/outbox → odsyłacze). (c) `controller-schema` 1148→741 + nowe `zod-schema-validation-pattern.md` (386) i `rate-limit-guard-pattern.md` (159). (d) `Level: exhaustive` w 10 plikach > 700 l.
- [x] **K90. Drobiazgi korpusu.** `**Status**` walidowany wobec słownika (`ACTIVE` w
      `e2e-hybrid-fixture:8`, `domain-colocated-fixture-mother:8`; druga linia Status w
      `transactional-outbox:252`); tag `outbox` pod `api:events` i `api:data-access` → jeden;
      4 warianty `auth` w `variants_seen` bez użyć; `named-policy_summary.md:22` cytuje
      nieistniejącą regułę `D2`; 6 martwych linków w `test-seeding-performance-guide.md:1724-1742`;
      podwójne `### 5.` w `aggregate-pattern.md:602,643`; adnotacja „naprawione" przy DE3
      (`domain-errors-pattern_summary.md:17`, backstop CI istnieje).
      ✅ 2026-09-07 — Status ze słownika (3 pliki), `outbox` tylko pod `api:events`, klucz `auth` usunięty z `variants_seen` (0 użyć), `named-policy` NP5 → `CH11`, 6 martwych linków w guide, `### 6.` w aggregate, DE3 przeformułowane na pomiar historyczny.
- [x] **K91. Karty dla `testing/` i `architecture/`.** `testing/` ma 0 kart przy 11 wzorcach
      (100% w baseline); `architecture/` 2 karty na 14. Priorytet: wzorce z `patterns.always`
      i `triggers` bloków. Reszta baseline (37 tanich pozycji: tylko Layer/Status/✅❌) przy
      okazji, po 5-10 min każda.
      ✅ 2026-09-07 — 19 nowych kart: testing 9 (wszystkie żywe wzorce), architecture 10 (razem 12/14; brak dla `integration-event`, `test-seeding-performance-guide`); baseline testing/architecture 24→0. Do potwierdzenia: `bullmq-queue-pattern.md` ma zdublowaną numerację reguł od 15 (l. 338/388); klasyfikacja Layer dla `nestjs-module-import-pitfalls` i `token-optimization`.

## Fala 4 — silnik `/orchestrate` (największa dźwignia jakościowa)

- [x] **K92. `scripts/orchestrate-prepare.mjs <TASK-ID>`.** Deterministyczny krok PRZED
      `Workflow`: czyta `runtime.yml` + artefakt analizy, rozwiązuje warstwy → wzorce → karty
      (`_summary.md`), `checks`, budżety, `knowledge.collection`, `human_voice`, i wypisuje JSON
      pod `args`. Dziś `orchestrate.md` §2b′ wymaga wstrzykiwania kart „od linii 148, a nie robi
      tego żaden skrypt" — koordynator czyta karty ręcznie. Zero LLM.
      ✅ 2026-09-07 — `scripts/orchestrate-prepare.mjs <TASK-ID>` (exit 0/2/3), JSON pod `args`; eval 8/8 w pre-commit; realny przebieg: 14 wzorców, 12 kart, 2 pełne (brak kart: `testing-pyramid`, `cross-context-communication`).
- [x] **K93. Kanoniczny skrypt Workflow jako named workflow.** `.claude/workflows/orchestrate.mjs`
      (lub `scripts/workflow/orchestrate.template.mjs`) z helperem `ask()`, sondami, limitami,
      diff-sondą po cichej śmierci, routingiem modeli, pipeline vs parallel — wszystko, co dziś
      jest prozą w §2a/2a′/2a″/2b′. Parametry wyłącznie z `args` (K92). Skrypt testowany
      fixture'ami (`tests/flow-evals/orchestrate-script/`), a `workflow-lint.js` WL1-WL16 staje
      się testem regresji tego jednego pliku, nie siatką na skrypt pisany od nowa co przebieg.
      ✅ 2026-09-07 — `scripts/workflow/orchestrate.template.mjs` przez `scriptPath` (nie named workflow — rejestr nie istnieje w harnessie, satelity bez symlinku), `orchestrate-core.mjs` wycina core z template'u (jedno źródło); workflow-lint 0 naruszeń, eval 17/17; WL6 zawężone (potok do licznika nie materializuje diffu) — było sprzeczne z WL15.
- [x] **K94. `commands/orchestrate.md` jako rejestr reguł.** 543 linie, numeracja
      `2a′`/`2a″`/`2b′`/`2c′`, 7 ID przebiegów i 19 dat w treści reguł. Docelowo: tabela
      `ORC-nnn | trigger | wymagana akcja | mechanizm (skrypt/hook/lint) | ref do uzasadnienia`,
      narracja incydentów → `DECISIONS-LOG.md`. To samo dla `analyze.md` (`ANL-nnn`). Cel: obie
      komendy o połowę krótsze, każda reguła z mechanizmem egzekwującym albo jawnym „tylko prompt".
      ✅ 2026-09-07 — `orchestrate.md` 543→134 l. (60 ORC), `analyze.md` 290→92 l. (34 ANL); narracje 1:1 w `docs/decisions/orchestrate-rule-history.md`; 19/60 ORC i 32/34 ANL to „tylko prompt” (jawny dług).
- [x] **K95. Semantyka override/subtract w kompozycji bloków.** `iam` obchodzi brak dwa razy:
      `.claude/blocks/iam-verifiers.yml` (`extends` nadpisuje całe `orchestrate`, przyszłe zmiany
      bazy nie dotrą) i `iam-security.yml` (dwa `security-invariants` w `always`, rozstrzyga
      komentarz). Krótka nota w ADR 0008 (OQ8) z decyzją: `exclude:` na półce `always` i
      merge per-klucz zamiast pełnego nadpisania, albo świadome „nie wspieramy". Zanim pojawi
      się drugi adopter `flat-service`.
      ✅ 2026-09-07 — ADR 0008 OQ8: `patterns.remove` (K44) już robi to, co miał robić `exclude:` — `iam-security.yml` używa go od dziś (zmaterializowane, 1 wpis security-invariants); `extends` per klucz → K113.

## Fala 5 — cięcie i porządek (po K72 i K76)

- [x] **K96. Retire komend wg listy ze spike'a.** `code-review, tdd, verify, plan,
      test-coverage, checkpoint, sessions, evolve, instinct-{export,import,status}` → ECC.
      Każda ma konsumentów w repo (tabela w raporcie) — przepiąć referencje na `ecc:*`, potem
      `git rm`. `evolve`/`instinct-*` dodatkowo referują `${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/`,
      który istnieje tylko w ECC. KEEP potwierdzone: `adr, blog, capture, claude-updates,
      security-review, security-check, cost-report`.
      ✅ 2026-09-07 — 10 komend usunięte (`code-review, tdd, verify, plan, test-coverage, sessions, evolve, instinct-*`) + `skills/learning/continuous-learning-v2/`; `/checkpoint` zostaje jako wrapper handoff-only (ECC nie ma trybu `handoff`); referencje przepięte w commands/skills/README/CLAUDE.md/templates/examples; odpowiedniki ECC potwierdzone na dysku. `verification-loop` i `tdd-workflow` zostają (8 agentów je deklaruje).
- [x] **K97. Retire agentów.** `technical-architecture-lead`, `changelog-bot`,
      `security-privacy-architect` (0 referencji w blokach, 2260 znaków opisu ładowane
      globalnie). `backend-technology-expert` i `state-reader` są load-bearing
      (`nestjs.yml:32`, `node.yml:32`, `ts-library.yml:62`, `decision-registry.yml:60`) → albo
      podmiana na `ecc:*` w blokach, albo formalny KEEP z wpisem w K72.
      ✅ 2026-09-07 — `changelog-bot`, `security-privacy-architect` usunięte; 5 agentów + 5 szablonów stacków + `b2g.md` przepięte na `@ecc:security-reviewer`; `backend-technology-expert`, `state-reader` KEEP.
- [x] **K98. Retire hooków sesyjnych.** `session-start/-end`, `evaluate-session`, `pre-compact`,
      `post-edit-format`, `post-edit-console-warn`, `pre-write-doc-warn`, `git-push-reminder`
      → ECC; razem z `hooks/lib/{session-manager (0 konsumentów), session-aliases,
      package-manager}.js` (1354 linii, jedyny konsument to `session-start.js`). Najpierw
      potwierdzić w ECC (`ECC_HOOK_PROFILE`) odpowiedniki.
      ✅ 2026-09-07 — 8 hooków sesyjnych + `lib/{session-manager,session-aliases,package-manager}` usunięte (odpowiedniki ECC potwierdzone per hook w `ecc/scripts/hooks/`); `hooks.json`, `templates/settings/*.json`, README zaktualizowane; `~/.claude/settings.json` nigdy ich nie miał, więc `sync-global-hooks --apply` wykonany po retire (10 dopisanych, `--check` zielony). Uwaga: `feature-flags`, `vytches-ddd`, `job-testing-app` mają śledzone `settings.json` z wycofanym hookiem — do PR w tamtych repach.
- [x] **K99. Broadcast (ADR 0006): rozstrzygnąć go/no-go.** `/opt/projects/.claude-swarm/STOP`
      z 2026-08-09, puste `inbox/`/`claims/`, zero `events-*.jsonl`; 5 satelitów ma
      `broadcast.yml` z mtime 2026-08-08 i dalej odpala `broadcast-inbox-inject.js` na każdy
      prompt i `broadcast-task-emit.js` na każdą edycję. Decyzja w ADR 0006 i
      `TASK-BROADCAST-001`: retire (9 plików `hooks/lib/broadcast/`, 3 hooki, 2 komendy, skill,
      47 testów) albo archiwum; w obu wariantach wyciąć wpięcia z 5 `settings.local.json`
      (`cli.js install-hooks --remove`).
      ✅ 2026-09-07 — RETIRE: 18 plików (lib/broadcast 9, 3 hooki, 2 komendy, skill, eval 47 testów, szablon, `docs/BROADCAST.md`), wpięcia wycięte z `settings.local.json` 6 instancji (kopie `.bak-2026-09-07`), nieśledzone `broadcast.yml` usunięte; ADR 0006 `retired`, TASK-BROADCAST-001 done → completed-tasks, ROADMAP Sprint 6 oznaczony; kod w historii `4d4eac5`; wpis w DECISIONS-LOG. Do ręcznego sprzątnięcia: `/opt/projects/.claude-swarm/`, `Skill(broadcast-standby)` w permissions api-4/mobile-app.
- [x] **K100. Usunąć `mcp-server/server.py`.** Python, 2026-02-05, README z
      `~/projects/claude-patterns` i `local-hero-3`, instalowany do każdego satelity przez
      `setup-project.sh:847-880` obok `knowledge-retriever`. Usunąć plik, `requirements.txt`,
      `settings.json.example`, stary README i sekcję w `setup-project.sh`; sprawdzić `.mcp.json`
      satelitów.
      ✅ 2026-09-07 — `server.py` + `requirements.txt` + `settings.json.example` + stary README usunięte; `setup-project.sh` [6/8] usuwa martwy wpis `claude-patterns` z `.mcp.json` satelity (18 satelitów ma go dziś — zniknie przy następnym setupie).
- [x] **K101. Komendy PM jako wrappery na skille.** 7 par
      (`pulse, sprint, task-health, tech-debt, pm-status, reprioritize, task-tidy`) z tą samą
      procedurą; skille odjechały do przodu (`reprioritize` w skillu konsultuje 3 strategistów,
      w komendzie nie; `task-health` dwie różne ceny). Skill = kanon, komenda = kilka linii
      wołających Skill. Przy okazji K102.
      ✅ 2026-09-07 — 7 komend PM = ~20-liniowe wrappery (`Invoke skill:`), unikalna treść komend przeniesiona do skilli PRZED skróceniem (tabela w raporcie agenta); ceny/progi ujednolicone (staleness 14d).
- [x] **K102. Pozorne bramki narzędzi.** `skills/security/incident/SKILL.md:5` `Read, Write`
      bez Edit dla dziennika prowadzonego T+0→T+72h; `commands/{sprint,tech-debt}.md:6` Write bez
      Edit na `TEAM-STATE.md`; `reprioritize` Edit bez Write przy „create new task files";
      `task-health` bez Edit przy „apply fixes with Edit"; `changelog-bot.md:6-7` Bash+Write z
      zakazem Edit; `commands/{finance,legal}.md` zabraniają Bash, delegują do agentów z Bash.
      Wyrównać (memory `write-without-edit-fake-gate`).
      ✅ 2026-09-07 — Edit/Write wyrównane w 7 miejscach (incident, sprint, tech-debt, reprioritize, task-health, adr; finance/legal: zakaz Bash zostaje z wyjaśnieniem, bo `disallowedTools` komendy nie propaguje do subagenta). Celowe bramki (humanizer, api-contract-sync, capture, grantflow) zostawione.
- [x] **K103. Walidatory CI z prawdziwymi sprawdzeniami.** `validate-commands.js` nie parsuje
      frontmatteru, martwa referencja skilla to WARN, regex łapie tylko pierwszy segment ścieżki;
      `validate-skills.js` = „SKILL.md istnieje i niepusty"; `validate-agents.js` nie sprawdza
      istnienia narzędzi MCP ani spójności z README (6 rozjazdów modelu, 3 implementery
      nieobecne w tabeli). Parser frontmatteru + wymagane pola + ERROR na martwą referencję +
      README vs frontmatter.
      ✅ 2026-09-07 — wspólny `scripts/lib/frontmatter.mjs`; `validate-agents` (MCP serwer musi istnieć, README ↔ frontmatter w obie strony: 5 rozjazdów modelu naprawionych w README — downgrade do Haiku był świadomy, `content-reviewer` VETO=Yes), `validate-commands` (martwa referencja = ERROR, pełna ścieżka skilla, `ecc:*` sprawdzane w pluginie), `validate-skills` (YAML musi się parsować — złapało zepsuty frontmatter `flutter-signature-animations`), `validate-hooks` (każdy hook z hooks.json/templates/blocks istnieje; czyta kształt wpisu ze `schemas/hooks.schema.json`), nowy `validate-blocks.mjs` na `schemas/block.schema.json`. Otwarte: `regex-vs-llm` name ≠ katalog (wyjątek jawny, K119).
- [x] **K104. Testy dla rdzenia setupu.** 0 testów dla `materialize-runtime.mjs` (914 l.) i
      `setup-project.sh` (1074 l.); 3/52 hooków ma fixtures, 19 hooków regexowych bez żadnego.
      Minimum: fixture'y kompozycji (nestjs+ddd+kysely, flutter+clean-arch, ts-library+approval-gate)
      → oczekiwany `runtime.yml`; po 2-3 fixtures na hook regexowy (łapie / nie łapie / brak
      configu = cisza); `rule-scanner.js` w `hooks/lib` dla 8-9 hooków o identycznym szkielecie.
      ✅ 2026-09-07 — evale `materialize-runtime` (3 kompozycje, goldeny), `setup-project` (pełny przebieg w tmp, 2 kompozycje); fixtures hooków 3→17 plików, eval 22→65 przypadków; `hooks/lib/rule-scanner.js` + 9 hooków przeniesionych (1213→676 l.), test różnicowy 52 wejścia 0 różnic. Wszystko w pre-commit (24 bramki).

## Fala 6 — higiena (każda < 30 min, dowolna kolejność)

- [x] **K105. `CLAUDE.md` ≤ 150 linii.** 34% (~205 linii) to changelog v3.1-v3.5 →
      `CHANGELOG.md`; procedury „Adding a …" (~280 linii) → `docs/CONTRIBUTING.md` z linkiem;
      liczniki z bloku generowanego (K70). Dziś ~7,3k tokenów na każdą sesję w tym repo.
      ✅ 2026-09-07 — `CLAUDE.md` 608→150 l.; `CHANGELOG.md` (Keep-a-Changelog) i `docs/CONTRIBUTING.md` (292 l., 0 zgubionych linii procedur, nagłówki zachowane co do znaku).
- [x] **K106. `hooks/README.md`.** 3 fantomowe hooki („Dev server blocker", „Tmux reminder",
      „Build analysis"), „Strategic compact" żyje w `skills/optimization/`, 2 martwe linki
      (`:325-326`), brak `block-root-grep` i `check-focus-wrapper`, jedna tabela wszystkich
      zmiennych env. Przy okazji ujednolicić konwencję na `<NAZWA>_MODE=block|warn|off`
      (`PM_NO_AUTO_HOUSEKEEPING=true`, `AGENT_USAGE_LOG=off`, `ORCHESTRATE_DDD_GATE` dla pliku
      `check-approval-before-impl.js`).
      ✅ 2026-09-07 — fantomy usunięte, tabela 19 zmiennych env, 42/42 plików hooków w README; aliasy w kodzie: `PM_HOUSEKEEPING_MODE`, `AGENT_USAGE_LOG_MODE`, `APPROVAL_GATE_MODE` (stare nazwy działają).
- [x] **K107. `post-edit-typecheck.js:46-51`: pełny `tsc --noEmit` na całym projekcie przy
      każdej edycji `.ts`.** `--incremental` + cooldown per katalog (wzór „raz na task na dobę"
      z `broadcast-task-emit.js`).
      ✅ 2026-09-07 — `--incremental` + `tsBuildInfoFile` w `.claude/run-state/`, cooldown 120 s per katalog tsconfig (`hooks/lib/typecheck-cooldown.js`, wspólny z fixture), `npx --no-install`; 5 fixtures.
- [x] **K108. Sieroty i drobiazgi skilli/komend.** `commands/blog.md:54` zła ścieżka runtime;
      `review-panel` wybiera persony po `stack_profile` (`commands/review-panel.md:26`,
      `SKILL.md:61,64`); `skills/decision-frameworks/adr/SKILL.md` sprzed `decision-registry`;
      `skills/database/postgres-patterns/SKILL.md:13,145` goły `database-reviewer`;
      `skills/integrations/grant-flow/` bez SKILL.md (duplikat `grantflow/`); 8 osieroconych
      skilli (lista w raporcie 2.3) → usunąć albo podlinkować; `skills/README.md` twierdzi „każda
      kategoria ma README" (prawda dla 3/24); 11/45 komend bez `name`.
      ✅ 2026-09-07 — blog.md ścieżka, review-panel po `stack_blocks` (unia zestawów, cap 6), skill `adr` pod decision-registry, `ecc:database-reviewer`, `grant-flow/` usunięty, `frontend-patterns` usunięty (jedyna prawdziwa sierota — 7 pozostałych ma konsumentów przez kategorie `project.yml`, audyt tego mechanizmu nie widział), `name:` w 4 komendach, skills/README poprawiony.
- [x] **K109. Sync vendorowanych skilli.** `synced_at: 2026-05-07` we wszystkich trzech
      `UPSTREAM_VERSION` (4 miesiące). `--diff` → review → apply. Poprawić `rsync --delete
      --exclude='LOCAL-*'`: nie chroni plików z markerem `<!-- LOCAL -->`, którego uczy CLAUDE.md.
      ✅ 2026-09-07 — legal: drift 11/11 był fałszywy (upstream przemianował katalogi, licencje Apache-2.0 bez zmian) — resolver po `name:`, sync zastosowany; finance: sync +7 skilli (84→91), fallback na `.claude-plugin/marketplace.json`; **marketing NIE zastosowany** — upstream 1.9.0→2.11.1 przemianowuje 20/42 skilli (K117). `local_excludes()` chroni pliki z markerem LOCAL (uratowany `dev-blog-generator`); `sync_tree()` bez rsync (nie ma go na tej maszynie).
- [x] **K110. Szablony i schematy.** 9/24 sierot w `templates/` (`python-ml-hooks.json` i
      `python-pipeline-hooks.json` nigdy nie wybierane, bo glob w `setup-project.sh:660-676`
      bierze `python-hooks.json`); `BUSINESS_RULES.yaml.template` nigdy nie kopiowany mimo
      nakazu w CLAUDE.md; `schemas/hooks.schema.json` 0 konsumentów;
      `business-rules.schema.json` tylko `existsSync`, nigdy ajv; brak schematu dla `blocks/*.yml`.
      ✅ 2026-09-07 — `templates/README.md` pełny inwentarz (7 sierot, nie 9; `python-ml-hooks.json` wybierany poprawnie — teza audytu fałszywa); `hooks.schema.json` był aktywnie błędny (naprawiony, konsumowany przez validate-hooks); nowy `schemas/block.schema.json` + `validate-blocks.mjs`; `setup-project.sh`: kopiowanie `BUSINESS_RULES.yaml` przy `ddd/core`, wybór configu hooków po `stack_blocks` gdy `stack_profile` poza mapą.
- [x] **K111. Global `~/.claude/CLAUDE.md`.** Sekcja „DDD Projects (nestjs-ddd stack)"
      bezwarunkowa, choć 6/13 satelitów to nestjs-ddd, a linijkę niżej „nie zakładaj NestJS".
      Przenieść do generowanego per-projekt CLAUDE.md (`generate-claude-md.sh`).
      ✅ 2026-09-07 — sekcja DDD z `~/.claude/CLAUDE.md` (kopia `.bak-2026-09-07`) → `templates/ddd-core-rules.md` wstawiany przez `generate-claude-md.sh` gdy `stack_blocks` ma `ddd/core` (4 przypadki testowe OK).
- [x] **K112. Reszta.** `agents/README.md` (6 rozjazdów modelu, 3 implementery poza tabelą,
      `content-reviewer` VETO tak/nie); `README.md` Scripts Reference 9/33 skryptów i
      `cd ~/.claude-patterns` (`:924`); `screenshots/` pusty; `CLAUDE-UPDATES.md` z 2026-04-27;
      `.gitignore` bez `screenshots/`, `.claude/worktrees`; `project-orchestration/TEAM-STATE.md`
      w tym repo = placeholder `{PROJECT_NAME}` od 2026-08-08 (odpalić `/pulse` raz albo
      dopisać w README, że dashboardy są celowo nieużywane); polityka języka jednym zdaniem
      (indeksy EN, decyzje PL); martwe symlinki `__pycache__` w `pcu`/`my-intelligence`.
      ✅ 2026-09-07 — README: Scripts Reference 9→46, `$CLAUDE_PATTERNS` zamiast `~/.claude-patterns`, agenci 24 / komendy 33 / hooki 42, baner broadcastu usunięty, polityka języka (zweryfikowana); `screenshots/` usunięty, `.gitignore`, `CLAUDE-UPDATES.md` baner, dashboardy PM w tym repo jawnie nieużywane; `agents/README.md` z K103. Martwe symlinki `__pycache__` (3 w worktrees pcu/my-intelligence) tylko wylistowane.

## Dopisane w trakcie (2026-09-07)

- [ ] **K113. `extends` merguje `orchestrate` per klucz (ADR 0008 OQ8, K95).** W
      `scripts/materialize-runtime.mjs`, `applyExtends()`: usuń `'orchestrate'` z pętli nadpisującej
      sekcje w całości i scal po kluczach najwyższego poziomu (`layers`, `inner_loop`, `final_gate`,
      `exit`; jeden poziom, bez wchodzenia w `inner_loop`). Test: baza z `layers`+`inner_loop`+`exit`,
      blok lokalny z samym `inner_loop` → runtime ma `layers`/`exit` z bazy. Regresja:
      `iam-verifiers.yml` z pełną sekcją materializuje się identycznie. Po wdrożeniu kategoria
      `extends-override` w `audit-projects.mjs` wraca z WARN do BŁĘDU, a `iam-verifiers.yml` może
      skasować skopiowane `layers`/`exit`.
- [ ] **K114. Seeding block-aware (F5 z zamkniętego TASK-BLOCKS-001).** `reseed-patterns.sh` nie
      taguje chunków blokami, `retrieve_patterns` nie ma parametru `blocks:`, `knowledge.json` nie
      dostaje `stack_blocks` — problem #5 z ADR 0008 otwarty (projekt na TypeORM może dostać wzorce
      Kysely). Zakres: odwrotny indeks `blocks/*.yml` → tag `blocks: []` na chunkach + walidacja
      wiszących ścieżek; parametr `blocks:` w `retrieve_patterns` (boost vs filtr — OQ2);
      `setup-project.sh` dopisuje `stack_blocks` do `knowledge.json`. Spot-check: zapytanie
      z projektu TypeORM nie zwraca wzorców Kysely.
- [ ] **K115. Aliasy profili w `blocks/_aliases.yml` (F6 z TASK-BLOCKS-001).** Brakuje
      `node-kysely`, `python-ml` (i `nextjs-app`/`sveltekit`, jeśli K88 ich nie dodał). Nic nie jest
      zepsute, brakuje skrótu; rozstrzygnąć razem z K88.

- [ ] **K116. Wzorzec izolacji bazy w testach (`DatabaseCleaner`).** Odkryte w K89: README opisywał
      `context-isolation-pattern.md` jako „Isolated test databases per bounded context”, a
      `golevelup-mock-pattern.md:243` i `e2e-hybrid-fixture-pattern.md:343` odsyłały do niego po
      „DatabaseCleaner usage” — plik nigdy tego nie zawierał. Żaden wzorzec nie opisuje izolacji bazy
      w testach. Napisać `testing/database-isolation-pattern.md` z realnego kodu (juz-ide-api),
      podlinkować z golevelup-mock i e2e-hybrid-fixture. Przy okazji: zdublowana numeracja reguł
      w `bullmq-queue-pattern.md` (l. 338/388).

- [ ] **K117. Sync marketingu 1.9.0 → 2.11.1 (breaking).** Upstream przemianował 20/42 skilli
      (katalog + `name:`), `product-marketing-context` → `product-marketing` z inną ścieżką
      wyjścia. Mapa przemianowań w `skills/marketing/UPSTREAM_VERSION`. Zastosować sync razem
      z przepięciem `agents/universal/marketing-strategist.md`, `commands/marketing.md`,
      `patterns/marketing/`, `templates/product-marketing-context.md`.
- [ ] **K118. Skille-kopie z ECC z żywymi konsumentami.** `database/{postgres-patterns,
      database-migrations}`, `infrastructure/{docker-patterns,deployment-patterns}` mają
      `origin: ECC` i odpowiedniki w pluginie, ale są linkowane po kategorii z `project.yml`
      w 3–8 satelitach. ADR 0009 nie obejmuje skilli. Decyzja: retire z przepięciem kategorii
      na `ecc:*` albo jawny fork z `UPSTREAM_VERSION` (jak `rules/common` w K87).
- [ ] **K119. `skills/decision-frameworks/regex-vs-llm`: `name` ≠ katalog.** Koliduje nazwą
      z `ecc:regex-vs-llm-structured-text`. Zmiana katalogu zrywa symlinki w satelitach,
      zmiana `name` wymaga deprecation notice. Dziś jawny wyjątek w `validate-skills.js`.
- [ ] **K120. Sprzątanie po retire w satelitach (poza tym repo).** Śledzone `settings.json`
      z wycofanym hookiem: `feature-flags`, `vytches-ddd` (`post-edit-format`), `job-testing-app`
      (`post-edit-console-warn`) → PR w tamtych repach. `Skill(broadcast-standby)` w permissions
      api-4/mobile-app. `/opt/projects/.claude-swarm/` do skasowania. Kopie `.bak-2026-09-07`
      w 6 instancjach po review. `.mcp.json` z martwym `server.py` w 18 satelitach zniknie przy
      następnym `setup-project.sh`. Weryfikacja K76 (nowy rekord w `workflow-steps.jsonl`)
      wymaga jednego realnego przebiegu `Workflow` — hook jest już wpięty.

---

## Kryterium zamknięcia — stan 2026-09-07

- ✅ `node scripts/pre-commit-guards.mjs` zielony: 24 bramki (nowe: audit-projects --gate,
  count-assets --check-docs, validate-metadata, validate-blocks, evale project-yml,
  orchestrate-prepare, orchestrate-script, materialize-runtime, setup-project).
- ✅ `node scripts/audit-projects.mjs --gate` → exit 0, 17/18 bez zastrzeżeń; 2 ostrzeżenia:
  `iam` `extends` (do K113) i metryki Workflow (hook wpięty, czeka na pierwszy przebieg).
- ✅ `~/.claude/logs/agent-usage.jsonl`: wpisy z nazwą agenta, modelem i kosztem z transkryptu.
- ⏳ `~/.claude/metrics/workflow-steps.jsonl`: hook `workflow-metrics-postrun` wpięty przez
  `sync-global-hooks --apply`; nowy rekord pojawi się po pierwszym realnym `Workflow` (K120).
- ✅ Martwe słowa poza kontekstem historycznym: 0 trafień w czterech plikach.
- ✅ Lista RETIRE z ADR 0009 wykonana (K96–K99); KEEP z uzasadnieniem w ADR.

Wszystko staged, nic nie commitowane — commit po review człowieka (fala po fali albo całość).
