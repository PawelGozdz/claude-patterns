---
id: TASK-KAIZEN-001
title: 'Kaizen backlog: drobne usprawnienia setupu claude-patterns + projekty satelitarne'
type: task
status: planned
priority: P1
story_points: TBD
created_date: 2026-08-27
updated_date: 2026-08-27
assignee: unassigned
labels: [kaizen, hooks, security, cost, dx, docs]
source: >
  Sesja 2026-08-27: trzy równoległe audyty (repo claude-patterns,
  /opt/projects/juz-ide-api-1/.claude, /opt/projects/iam/.claude).
  Każde znalezisko zweryfikowane w plikach, ścieżki przy pozycjach.
---

# TASK-KAIZEN-001 — kaizen backlog setupu

## Cel

Lista drobnych, samodzielnych usprawnień do odhaczania jedna po drugiej. Każda pozycja
mieści się w jednej krótkiej sesji, ma własny commit i nie zależy od pozostałych, chyba
że zaznaczono inaczej. Kolejność wewnątrz fali = sugerowana kolejność pracy (koszt × zysk).

Zasada: nie robimy kilku pozycji naraz. Jedna pozycja → weryfikacja → commit → następna.

---

## Fala 0 — higiena natychmiastowa (każda pozycja < 30 min)

- [ ] **K01. Domknąć wiszący stan gita w claude-patterns.** 5 zmodyfikowanych plików
      (spójny zestaw broadcast+orchestrate z przerwanej sesji) plus nietrackowany
      `agents/stacks/nestjs-ddd/business-rules-auditor.md`, który jest już wpisany do
      `agents/README.md` — commit go zgubił. Do `.gitignore` dopisać
      `tests/flow-evals/retrieval/results.jsonl` (artefakt runtime z `run.js`) oraz
      `.claude/settings.local.json`. *(audyt repo §7)*
- [ ] **K02. iam, BLOKER: wzorzec z półki `always` fizycznie nieosiągalny.**
      `iam/.claude/blocks/iam-security.yml` podaje ścieżkę względem roota repo, konsument
      rozwija ją względem `.claude/knowledge/patterns/` → każdy agent czytający
      `patterns.always` dostaje ENOENT na `security-invariants-fastify.md`.
      `verify-project-setup.mjs` już to łapie („setup niekompletny"). Poprawić ścieżkę,
      dopisać brakującą kartę `_summary.md`, przematerializować. *(audyt iam §5A)*
- [ ] **K03. iam: `CLAUDE-LOCAL.md` cicho gubiony przez generator.**
      `generate-claude-md.sh:22` szuka `.claude/config/CLAUDE-LOCAL.md`, w iam plik leży
      w roocie — 5.7 KB krytycznych nadpisań („NOT NestJS/DDD", kontrakt `AuthzClient`)
      nigdy nie trafia do `CLAUDE.md`. Przenieść plik LUB nauczyć generator obu
      lokalizacji (druga opcja chroni pozostałe repo przed tym samym błędem). *(audyt iam §5B)*
- [ ] **K04. juz-ide-api-1: martwa lokalna kopia `check-patterns-read.js`.** Trzy różne
      wersje hooka (lokalna 2026-05-29 śledzona w git, biblioteczna 2026-06-18 która
      faktycznie działa, `.bak` 2026-05-24). Usunąć kopię lokalną i `-debug.js`, usunąć
      `hooks/check-patterns-read.js.bak` z biblioteki. *(audyt juz-ide §5.1, repo §1)*
- [ ] **K05. juz-ide-api-1: reklamowana komenda `/orchestrate-blocks` nie istnieje.**
      `CLAUDE.md:24` i `project.yml:114` wskazują entry point, którego nie ma w
      `commands/` (jest `/orchestrate`). Poprawić nazwy + wyczyścić komentarze o pilocie
      ADR 0008 (`analyze-ddd`, `orchestrate-ddd`). *(audyt juz-ide §5.2)*
- [ ] **K06. iam: pusta tabela Entry Points w `CLAUDE.md`.** Brak sekcji `entry_points:`
      w `iam/.claude/config/project.yml` (wszystkie inne repo ją mają). Dodać i
      przegenerować. *(audyt iam §5C)*

## Fala 1 — naprawa istniejących strażników (istnieją, ale kłamią albo śpią)

- [ ] **K10. Fixture'y `tests/flow-evals/workflow-lint/` przechodzą 1/10.** Reguła WL14
      (2026-08-14) nie została uwzględniona w oczekiwaniach 9 fixture'ów, WL15 wyskakuje
      w `tsc-buried-in-prose-warns-wl7`. Eval nie jest w pre-commit, więc nikt tego nie
      widział. Naprawić fixture'y, potem K11. *(audyt repo §3)*
- [ ] **K11. Wpiąć deterministyczne evale do `scripts/pre-commit-guards.mjs`.**
      Brakuje: `tests/flow-evals/{hooks,watcher,workflow-lint,workflow-metrics}/run.js`
      i `scripts/ci/validate-*.js` (wszystko < 2 s łącznie). Ujawni 18 realnych błędów:
      2 agenty bez pola `tools` (`infrastructure-implementer`, `test-implementer`),
      16 martwych referencji w `commands/{finance,legal,marketing,orchestrate}.md` —
      naprawić je w tej samej pozycji. Zależy od K10. *(audyt repo §3)*
- [ ] **K12. `scripts/validate-metadata.sh`: gałąź błędu nieosiągalna.** Pod `set -e`
      test `$?` po `python3 -c "import yaml"` nigdy się nie wykona — skrypt nigdy nie
      wypisze „Invalid YAML syntax". Przy okazji: `set -euo pipefail` w 23 skryptach
      shell (dziś: 0 z 23, część nie ma nawet `set -e`). *(audyt repo §2)*
- [ ] **K13. Jedno źródło prawdy dla liczników.** README twierdzi „22 commands / 12 hooks
      / 67 patterns / 19 agents", faktycznie 45 / 45 / 100 / 56; `METADATA.yml` 3.6.0 vs
      `package.json` 3.5.0. Napisać `scripts/count-assets.mjs` (find + porównanie z
      METADATA/README), wpiąć do pre-commit, wyrównać liczby i wersje. *(audyt repo §4)*
- [ ] **K14. Broadcast (ADR 0006): 1079+ LOC czystej deterministycznej logiki, 0 testów.**
      L1 eval dla `hooks/lib/broadcast/{schema,cursor,claim,ulid,manifest}.js` w
      konwencji `tests/flow-evals/`. *(audyt repo §1)*
- [ ] **K15. Bramka „changelog agentów" chroni 3,5% powierzchni.** `pre-commit-guards.mjs`
      pomija agentów bez sekcji `## Changelog`, a ma ją 2 z 56. Zdecydować: dodać sekcję
      wszystkim agentom stackowym (tam gdzie zmiany bolą) albo zmienić mechanizm na
      wymuszony bump w METADATA. *(audyt repo §3)*

## Fala 2 — security

- [ ] **K20. `claude-patterns/.claude/settings.local.json`: `Bash(node -e ":*)` w allow.**
      To zgoda na wykonanie dowolnego kodu bez promptu; obok 82 jednorazowe wpisy,
      `deny: []`, martwa reguła z nierozwiniętym `$proj`. Wyczyścić, przejechać
      `/fewer-permission-prompts`. To samo w `juz-ide-api-1/.claude/settings.local.json`
      (artefakty sesji: `Bash(kill 1439071)`, `Bash(do)`, `Bash(done)`, literówki
      `Read(//home/**)`). *(audyt repo §5, juz-ide §6.4)*
- [ ] **K21. Baseline `permissions.deny` w `templates/settings/base.json`.** Wszystkie
      szablony mają dziś `permissions: {}` — projekty satelitarne startują bez żadnego
      deny na `.env*`, `**/secrets/**`, `rm -rf`. *(audyt repo §5)*
- [ ] **K22. juz-ide-api-1: `Read(**)` + `Grep(**)` na końcu allowlisty.** Unieważniają
      20 precyzyjnych wpisów przed sobą i robią z `deny` jedyną barierę; obok szeroki
      allow na `rm/mv/chmod/pkill/sed/tee`. Przyciąć do realnie używanych ścieżek.
      *(audyt juz-ide §6.1–6.2)*
- [ ] **K23. `grantflow-log-time.sh`: hasło w `ps` i brak escapowania JSON.** Hasło
      interpolowane wprost do `curl -d` (widoczne w liście procesów, znak `"` psuje
      payload); config zapisywany przed `chmod 600`. Przejść na `--data @-` + heredoc
      + `jq -n --arg`, `umask 077` przed zapisem. *(audyt repo §5)*
- [ ] **K24. No-op sekcje w `settings.json` obu projektów.** `thinking`, `context`,
      `agents`, `costOptimization`, `worktree`, `autoMode` nie występują w schemacie
      claude-code-settings — ~40 linii konfiguracji dającej fałszywe poczucie, że budżet
      kontekstu i routing modeli są ustawione. Zweryfikować wobec aktualnej dokumentacji
      (`/claude-updates`), usunąć albo przenieść treść `autoMode` (dobry brief!) do
      CLAUDE-LOCAL. Dotyczy `juz-ide-api-1` i `iam`. *(audyt juz-ide §6.3, iam §3)*

## Fala 3 — koszty (deterministyczny skrypt zamiast LLM, mniejszy kontekst)

- [ ] **K30. `scripts/tasks-digest.mjs`: frontmatter → tabela.** `/pulse` każe dziś
      „Read all files in tasks/" (pełne pliki do kontekstu Opusa); cała potrzebna
      informacja siedzi we frontmatterze. Digest podpiąć w `/pulse`, `/task-health`,
      `/reprioritize`. Warunek wstępny: frontmatter w 14 z 17 tasków tego repo, które go
      nie mają (przez to narzędzia PM widzą tu zero zadań) + usunięcie 5 bajtowo
      identycznych duplikatów z `completed-tasks/`. Po tym `/pulse` realnie wypełni
      KANBAN.md i TEAM-STATE.md (dziś: nietknięte szablony z placeholderami). *(audyt repo §6, §9)*
- [ ] **K31. `validate-tasks.mjs` zamiast agenta do audytu zadań.** „Broken deps / stuck
      / missing fields / orphaned" w `/task-health` to w 90% walidacja schematu, nie
      rozumowanie. Precedens już jest: `scripts/ci/validate-*.js`. *(audyt repo §6)*
- [ ] **K32. Przegląd modeli agentów.** 44× sonnet, 9× haiku, 3× opus. Kandydaci na
      haiku: `state-reader` (deklaruje „60× cheaper", wart potwierdzenia w frontmatter),
      `changelog-bot`, `reviewer-nitpicker`, `reviewer-newbie`. *(audyt repo §6)*
- [ ] **K33. `hooks/statusline-pm.js`: potrójny przelot po tasks/ przy każdym odświeżeniu
      statusline.** `readdirSync` + `readFileSync` każdego taska do 3× w jednym przebiegu
      + `execSync(git rev-parse)`. Jeden przelot + cache po mtime katalogu. *(audyt repo §1)*
- [ ] **K34. juz-ide-api-1: odchudzić kontekst startowy.** `CLAUDE.md` 22.5 KB w każdej
      sesji; sekcja „Available Skills" (37 wierszy) dubluje rejestr komend — wyciąć w
      generatorze. `decisions-index.json` 166 KB przy budżecie decision-gate 12 tool-calls
      — dodać wariant digest. `knowledge/learned/` 280 KB bez żadnej referencji — wpiąć
      w RAG albo zarchiwizować. *(audyt juz-ide §6.5–6.6)*
- [ ] **K35. Retencja agent-memory.** `juz-ide-api-1/.claude/agent-memory/security-e2e-verifier/`:
      96 plików, 660 KB, wszystko w gicie, MEMORY.md 16.7 KB ładowany przy każdym spawnie.
      Zasada kompakcji/retencji (np. limit rozmiaru MEMORY.md + archiwum poza gitem),
      najlepiej jako hook w bibliotece, nie ręcznie per projekt. *(audyt juz-ide §6.7)*

## Fala 4 — DX i spójność biblioteki

- [ ] **K40. Dedup boilerplate'u hooków.** 29 z 45 hooków ręcznie powtarza blok stdin
      (4 różne limity MAX_STDIN), `security-impl-feedback.js` ma komentarz „Mirror logic
      from statusline-pm.js", parser frontmattera zadań istnieje w 4 kopiach. Wyciągnąć
      `hooks/lib/pm-tasks.js`, użyć `readStdinJson` z `lib/utils.js` wszędzie. *(audyt repo §1)*
- [ ] **K41. Dedup skryptów shell.** Blok kolorów ANSI w 14 plikach, szkielet
      `sync-*-skills.sh` w 3 kopiach. `scripts/lib/common.sh` + `vendor-sync.sh`;
      przy okazji `--help` dla dużych skryptów (`setup-project.sh` 1033 LOC,
      `materialize-runtime.mjs` 878 LOC — dziś bez pomocy). *(audyt repo §2)*
- [ ] **K42. Indeksy vs rzeczywistość.** Poza katalogami: 10 agentów (agents/README),
      16 komend (commands/README), 34 patterny (patterns/README — całe katalogi flutter/
      nextjs/typescript-library/sveltekit/python), 34 z 45 hooków (hooks/README). Brak
      `skills/README.md` przy 190 skillach w 24 kategoriach. Po K13 licznik złapie
      przyszły dryf; tu trzeba jednorazowo nadrobić treść. *(audyt repo §4, §8)*
- [ ] **K43. Martwe/niedowiezione hooki.** `check-human-voice.js` nigdzie niepodpięty,
      mimo że `runtime.yml` projektów ma pełną sekcję `human_voice` (deklaracja bez
      egzekucji — w iam hook akurat jest wpięty, w juz-ide-api-1 nie); 4 hooki flutter
      (`check-design-tokens` itd.) opisane w `rules/dart/*` ale nieobecne w
      `templates/settings/flutter.json`; `check-pumpandsettle.js` bez referencji;
      5 inline'owych `node -e` w `hooks.json` wyciągnąć do plików. *(audyt repo §1)*
- [ ] **K44. Silnik bloków: `patterns.remove` + test dryfu forka.** iam ładuje dwa
      wzorce security naraz (NestJS + Fastify), bo bloku nie da się odjąć; `iam-verifiers.yml`
      kopiuje całą sekcję `orchestrate` z `flat-service`, więc zmiany bazowego bloku
      nigdy tam nie dotrą i nikt tego nie zauważy. Dodać `patterns.remove` w
      materializatorze + check dryfu fork-vs-baza w `audit-projects.mjs`. *(audyt iam §5G–H)*
- [ ] **K45. Skille referencjonowane przez agentów a niesymlinkowane.**
      `security-e2e-verifier.md` deklaruje `skills: [security/security-review, …]`,
      a `setup-project.sh` pomija skille z `disable-model-invocation: true` — referencja
      wisi w powietrzu we wszystkich projektach. Rozstrzygnąć kontrakt (symlinkować mimo
      flagi albo zmienić deklaracje agentów). *(audyt iam §5I)*
- [ ] **K46. iam: dopiąć brakujące klocki.** Blok `decision-registry` (10 ADR-ów w
      `docs/adr/` bez indeksu), sekcja `knowledge:` w runtime (kolekcja `code_iam` wisi
      w `knowledge.json` poza materializacją), `pattern_routing:` w `iam-security.yml`
      (bramka `check-patterns-read` w trybie block jest ślepa na wzorzec Fastify —
      dokładnie tam, gdzie mogłaby coś złapać). *(audyt iam §5E–F, J)*
- [ ] **K47. Jawne zależności projektów od agentów globalnych.** Panel `/analyze`
      juz-ide-api-1 wymaga `state-reader`/`product-owner`/`backend-technology-expert`
      dostępnych tylko przez `~/.claude/agents` — na czystej maszynie setup cicho rozwali
      panel. Dodać check do `verify-project-setup.mjs` (agent ze slotu istnieje w
      projekcie LUB globalnie) i uruchamiać go cyklicznie dla wszystkich satelitów —
      dziś złapałby problemy K02/K03/K06 zanim ugryzą. *(audyt juz-ide §5.7, iam §5A)*
- [ ] **K48. Sprzątanie reliktów w satelitach.** juz-ide-api-1: katalogi z maja bez
      referencji (`roles/`, `memory/`, `env/`, `vytches-ddd/` 31 KB, `ARCHITECTURE.md`,
      `AGENT_TEAMS_GUIDE.md`, `MIGRATION_SUMMARY.md`, pusty `worktrees/`, porzucony
      workflow w `run-state/`); w obu projektach 3 nieużywane symlinki hooków `.sh`;
      25 ręcznych linii `.gitignore` per-stack do zastąpienia jednym wzorcem. *(audyt juz-ide §5.3–5.4, §6.8, iam §5J)*

---

## Notatki

- Duplikaty tasków `tasks/` ↔ `completed-tasks/` (K30) to skutek symlinku
  `project-orchestration/tasks -> ../docs/tasks`: pięć ukończonych zadań widnieje
  jednocześnie jako aktywne i zakończone.
- KANBAN.md celowo nie wypełniany ręcznie (nagłówek: „regenerated on each pulse") —
  wypełni się po K30, gdy `/pulse` będzie miał frontmatter do czytania.
- Rozjazd rejestru decyzji juz-ide-api-1 (15 zdublowanych numerów wg
  `verify-project-setup.mjs`) zostawiony poza tym backlogiem — wymaga decyzji
  właściciela rejestru, nie mechanicznej poprawki.
