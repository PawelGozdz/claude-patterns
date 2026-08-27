---
id: TASK-KAIZEN-001
title: 'Kaizen backlog: drobne usprawnienia setupu claude-patterns + projekty satelitarne'
type: task
status: done
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

> **▶ STATUS: DONE (2026-08-27) — 33/33 pozycji zrobione.**
>
> Wszystkie fale (K01-K49, w tym dokończone K40/K41) w pełni domknięte i zweryfikowane.
>
> **Wszystko zestage'owane w `claude-patterns`, NIC nie commitowane** — czeka na review
> i commit (po falach albo całość naraz). W satelitach (`iam`, `juz-ide-api-1`) zmiany
> zostawione w working tree bez stage'owania (świadomie — te repo mają własną, niezależną
> pracę w gicie). Pre-commit repo ma 17 bramek, wszystkie przechodzą
> (`node scripts/pre-commit-guards.mjs`).

## Cel

Lista drobnych, samodzielnych usprawnień do odhaczania jedna po drugiej. Każda pozycja
mieści się w jednej krótkiej sesji, ma własny commit i nie zależy od pozostałych, chyba
że zaznaczono inaczej. Kolejność wewnątrz fali = sugerowana kolejność pracy (koszt × zysk).

Zasada: nie robimy kilku pozycji naraz. Jedna pozycja → weryfikacja → commit → następna.

---

## Fala 0 — higiena natychmiastowa (każda pozycja < 30 min)

- [x] **K01. Domknąć wiszący stan gita w claude-patterns.** ✅ 2026-08-27 — 5 zmodyfikowanych
      plików + `business-rules-auditor.md` domknięte commitem `5f73194` (poza tym
      backlogiem). Dopisano do `.gitignore`: `tests/flow-evals/retrieval/results.jsonl`
      (artefakt runtime z `run.js`) i `.claude/settings.local.json` (dotąd chroniony
      tylko globalnym `~/.config/git/ignore`, nie repo); odtrackowano `results.jsonl`,
      który przypadkiem wszedł do `5f73194`. *(audyt repo §7)*
- [x] **K02. iam, BLOKER: wzorzec z półki `always` fizycznie nieosiągalny.** ✅ 2026-08-27 —
      błąd był w bibliotece, nie w bloku iam: `verify-project-setup.mjs` sprawdzał wzorce
      TYLKO jako `.claude/knowledge/patterns/<p>` (poprawne dla wzorców współdzielonych),
      bez fallbacku na `<projectDir>/<p>` (konwencja lokalnych bloków, której już
      poprawnie używa `materialize-runtime.mjs`). Dodano `resolvePattern()` z dwiema
      próbami w `scripts/verify-project-setup.mjs`. Dopisano brakującą kartę
      `iam/.claude/knowledge/patterns-local/security-invariants-fastify_summary.md`
      (10 reguł SI1-SI10/N1-N10, wzorowana na `security-invariants-pattern_summary.md`).
      Zweryfikowano: `verify-project-setup.mjs /opt/projects/iam` → „✓ setup kompletny".
      *(audyt iam §5A)*
- [x] **K03. iam: `CLAUDE-LOCAL.md` cicho gubiony przez generator.** ✅ 2026-08-27 —
      naprawiono generator (`scripts/generate-claude-md.sh`): fallback na
      `PROJECT_DIR/CLAUDE-LOCAL.md`, gdy `.claude/config/CLAUDE-LOCAL.md` nie istnieje,
      z ostrzeżeniem sugerującym przeniesienie do lokalizacji kanonicznej. Wybrano
      wariant "napraw generator" zamiast przenosin pliku — chroni każdy przyszły
      projekt z tym samym błędem. Zregenerowano `iam/CLAUDE.md`, potwierdzono że treść
      lokalna (m.in. „NOT NestJS/DDD", kontrakt `AuthzClient`) faktycznie tam ląduje.
      **Przy weryfikacji odkryto nowy problem, dopisany jako K49** (brak szablonu
      `node-kysely`). *(audyt iam §5B)*
- [x] **K04. juz-ide-api-1: martwa lokalna kopia `check-patterns-read.js`.** ✅ 2026-08-27 —
      potwierdzono `settings.json:226` wskazuje hard-pathem na wersję biblioteczną;
      lokalna kopia i `-debug.js` usunięte przez `git rm` (staged w repo juz-ide-api-1,
      obok sporej niezwiązanej pracy w toku — dotknięto WYŁĄCZNIE tych dwóch plików).
      `hooks/check-patterns-read.js.bak` usunięty z dysku biblioteki (był nietrackowany,
      ignorowany przez `*.bak`). *(audyt juz-ide §5.1, repo §1)*
- [x] **K05. juz-ide-api-1: reklamowana komenda `/orchestrate-blocks` nie istnieje.**
      ✅ 2026-08-27 — poprawiono `project.yml` (`entry_points.orchestrate: "/orchestrate"`,
      usunięto martwe komentarze o „pilocie" i nieistniejących `/o`/`/analyze-ddd`/
      `/orchestrate-ddd`), zregenerowano `CLAUDE.md` — tabela Entry Points pokazuje
      teraz `/orchestrate`. Historyczne logi w `completed-tasks/` i `KANBAN.md`
      cytujące `/orchestrate-blocks` zostawione bez zmian — to zapis tego, jakiej
      nazwy faktycznie używano w tamtych przebiegach (2026-08-10/11), nie żywa
      konfiguracja. *(audyt juz-ide §5.2)*
- [x] **K06. iam: pusta tabela Entry Points w `CLAUDE.md`.** ✅ 2026-08-27 — dodano
      sekcję `entry_points:` (analyze/orchestrate/scaffold/progress) do
      `iam/.claude/config/project.yml` wzorem `juz-ide-api-1`, zregenerowano
      `CLAUDE.md` — tabela wypełniona. *(audyt iam §5C)*

## Fala 1 — naprawa istniejących strażników (istnieją, ale kłamią albo śpią)

- [x] **K10. Fixture'y `tests/flow-evals/workflow-lint/` przechodzą 1/10.** ✅ 2026-08-27 —
      owinięto wywołania `agent({schema})` w try/catch we wszystkich fixture'ach
      niecelujących w WL14 (zgodnie z tym, czego sama reguła wymaga). Przy okazji
      naprawiono dwa dodatkowe, wcześniej niezauważone problemy: (1) `BAD` fixture nigdy
      nie definiował `const IMPL_REPORT`, więc WL1 nie wykrywał self-oceny mimo że
      test nazywał się „wl1-wl2-wl3" — dopisano definicję z polem `verdict`; (2)
      `TSC_BURIED_IN_PROSE` używał fikcyjnego `agentType: 'infrastructure-testing-implementer'`,
      który przypadkiem pasował do regexu WL15 — zmieniono na realną nazwę
      `infrastructure-implementer`. `FULL_DIFF_INJECTED` faktycznie łamie też WL12
      (producent bez schema wklejany tekstowo) — to prawdziwe, zamierzone podwójne
      naruszenie, dopisane do oczekiwań zamiast tłumione. Dodano 2 nowe, dedykowane
      przypadki (WL14, WL15 pozytywne wykrycie) — dotąd żadna reguła nie miała testu
      wprost, stąd regresja przeszła niezauważona. **12/12 przechodzi.** *(audyt repo §3)*
- [x] **K11. Wpiąć deterministyczne evale do `scripts/pre-commit-guards.mjs`.**
      ✅ 2026-08-27 — dopięto 4 evale + 6 walidatorów (14 bramek łącznie, 0.93s).
      Naprawiono odkryte błędy: (1) 2 agenty ze zwyczajem `tools:` w stylu wieloliniowym
      zamiast konwencji jednoliniowej reszty 54 agentów — ujednolicono; (2) `validate-commands.js`
      miał DWIE własne wady, nie 15 błędnych referencji w treści komend: regex agentów łapał
      `.agents/<x>-context.md` (konwencja per-projektowego kontekstu finance/legal/marketing)
      jako podciąg `agents/*.md` — dodano negatywny lookbehind na `.`; regex komend sprawdzał
      `/<nazwa>` WYŁĄCZNIE przeciw plikom `commands/`, ignorując że `/<nazwa>` w tym harnessie
      może też wołać skill — rozszerzono o już istniejący `validSkills` + mały allowlist
      (`loop` — skill natywny harnessu, spoza `skills/` tego repo). Zero zmian w treści
      `finance.md`/`legal.md`/`marketing.md`/`orchestrate.md` — referencje były poprawne,
      walidator był ślepy. Zależało od K10. *(audyt repo §3)*
- [x] **K12. `scripts/validate-metadata.sh`: gałąź błędu nieosiągalna.** ✅ 2026-08-27 —
      naprawiono 3 miejsca `cmd; if [ $? ]` → `if ! cmd; then` (gałąź „Invalid YAML syntax"
      była martwa pod `set -e`); dodano `set -euo pipefail`. Realny stan „23 skryptów":
      8 już miało `set -euo pipefail`, 13 miało tylko `set -e` (dopięte forkiem, patrz
      niżej), 3 nie miały niczego (`cost-optimizer.sh`, `session-monitor.sh` — świadomie
      pominięte, oba martwe/niepodpięte per audyt §1; `suggest-compact.sh` poza zakresem
      tej pozycji). Fork podniósł 12 z 13 pozostałych do `set -euo pipefail`, naprawiając
      po drodze pułapki `grep|wc` / `$1` bez defaultu, i **znalazł realny bug**:
      `setup-project.sh` miał `$SKILLS_DIR` zamiast `$NATIVE_SKILLS_DIR` — pod starym
      `set -e` cicho globowało root systemu plików (test pokazał „Skills: 4866" przed
      poprawką, „Skills: 3" po). Wszystko zweryfikowane (syntax-check minimum, część
      end-to-end na jednorazowych katalogach w `/tmp`), nic nie uruchomione z realnymi
      skutkami ubocznymi (sync/migracje/setup-global na żywym `~/.claude/`). Staged,
      nie commitowane. *(audyt repo §2)*
- [x] **K13. Jedno źródło prawdy dla liczników.** ✅ 2026-08-27 — napisano
      `scripts/count-assets.mjs`: liczy realny stan drzewa (commands/hooks/agents/
      patterns/skills, w tym per-stack rozbicie agentów) i porównuje z polami
      liczbowymi `METADATA.yml`. Świadomie NIE parsuje README.md — liczby tam żyją
      wtopione w prozę ASCII-drzewa (kruche do regexowania, fałszywie failowałoby
      przy każdej redakcyjnej zmianie opisu); README poprawione ręcznie w tej samej
      sesji. Naprawiono: `METADATA.yml` (9 pól headline + pełna lista agentów
      per-stack — brakowało 3 stacków: astro-static, node-ts-claude-api, sveltekit),
      `package.json` 3.5.0→3.6.0 (zweryfikowano, że feature v3.6.0 z changeloga
      METADATA realnie istnieje w drzewie), nagłówkowe liczby w `README.md`,
      `CLAUDE.md` (blok „What's In This Repo"), `commands/README.md`. Pola wymagające
      klasyfikacji treści, nie prostego liczenia (`patterns.maturity`,
      `commands.categories`), zostawione z jawną notatką „niezweryfikowane" zamiast
      zgadywania. Wpięto `count-assets.mjs --check` do pre-commit (15 bramek, wciąż
      <1s). *(audyt repo §4)*
- [x] **K14. Broadcast (ADR 0006): 1079+ LOC czystej deterministycznej logiki, 0 testów.**
      ✅ 2026-08-27 — napisano `tests/flow-evals/broadcast/run.js`, 47 przypadków
      pokrywających `ulid.js` (generacja, format, roundtrip czasu, sortowalność),
      `manifest.js` (parsowanie topiców, subskrypcje implicit/wildcard, rejestr
      cross-repo), `schema.js` (wartości domyślne, wszystkie reguły `validate()`:
      hops, D1 cross-repo, OQ5 invalidate, D11 severity critical, D4 owner/rejestr,
      limity body/title), `claim.js` i `cursor.js` (prawdziwe I/O na tymczasowym
      `CLAUDE_SWARM_DIR`, sprzątane po teście — konwencja udokumentowana w
      `paths.js`: „używane przez testy"). **47/47 przeszło za pierwszym uruchomieniem**
      — kod zgodny z własną dokumentacją. Wpięto do pre-commit (16 bramek, 1.1s).
      *(audyt repo §1)*
- [x] **K15. Bramka „changelog agentów" chroni 3,5% powierzchni.** ✅ 2026-08-27 —
      decyzja: NIE fabrykować historii dla 54 plików naraz (nie mam podstaw, żeby ją
      rzetelnie odtworzyć). Zamiast tego brak `## Changelog` przy nietrywialnej zmianie
      jest teraz błędem, nie cichym pominięciem — pokrycie rośnie organicznie, dokładnie
      tam, gdzie agent jest faktycznie edytowany. Konsekwencja własnej zmiany domknięta
      w tej samej sesji: `infrastructure-implementer.md`/`test-implementer.md` (zmienione
      w K11) dostały sekcję `## Changelog` z prawdziwym wpisem o tej zmianie — inaczej
      własna bramka zablokowałaby commit użytkownika. Zweryfikowane end-to-end: pełny
      `git add -A` + `pre-commit-guards.mjs` → 16/16 bramek OK. *(audyt repo §3)*

## Fala 2 — security

- [x] **K20. `claude-patterns/.claude/settings.local.json`: `Bash(node -e ":*)` w allow.**
      ✅ 2026-08-27 — usunięto: `Bash(node -e ":*)` (dowolny kod bez promptu — `Bash(node:*)`
      zostawiony celowo, to aktywnie używany, szeroki wzorzec dla tego repo opartego na
      skryptach node, usunięcie zerwałoby bieżący workflow bez realnego zysku
      bezpieczeństwa na maszynie lokalnej operatora); martwą regułę `Read(//opt/projects/$proj/...)`
      (nierozwinięta zmienna); fragmenty składni pętli shell bez sensu jako osobne
      wzorce (`for proj:*`, `do echo:*`, `done`, `/dev/null echo:*`, `2`); dwa
      wieloliniowe wpisy z jednorazowych migracji sprzed miesięcy, wskazujące na
      nieistniejące już ścieżki (`agents/specialists/`, `agents/verifiers/`,
      `vytches-ddd/CLAUDE.md.bak` — zweryfikowano, że żadna nie istnieje). W
      `juz-ide-api-1/.claude/settings.local.json`: usunięto `Bash(kill 1439071)`
      (PID z konkretnej martwej sesji), `Bash(2)`, `Bash(do)`, `Bash(do echo:*)`,
      trzy jednorazowe komendy sprzątania scratchpadu, zdeduplikowano
      `Read(//home/dev/.local/bin/**)` (już pokryte przez szerszy `Read(//home/**)`).
      Oba pliki zweryfikowane jako poprawny JSON po edycji. *(audyt repo §5, juz-ide §6.4)*
- [x] **K21. Baseline `permissions.deny` w `templates/settings/base.json`.** ✅ 2026-08-27 —
      odkryto po drodze: `migrate-v2.sh` wybiera JEDEN plik na stack (nie nakłada
      stack-template na base.json), więc baseline trzeba dodać do WSZYSTKICH 8 plików,
      nie tylko base.json — zrobione (`base`, `flutter`, `nestjs-ddd`, `nextjs-app`,
      `python-ml`, `python`, `sveltekit`, `typescript-library`), ta sama treść co w
      żywym `juz-ide-api-1/.claude/settings.json` (`.env`, `**/secrets/**`, `*.key`,
      `*.pem`, `curl --upload`, `wget --post`). Ważne ograniczenie: merge dla ISTNIEJĄCYCH
      projektów w `migrate-v2.sh` explicite „nie dotyka permissions" — baseline działa
      tylko dla NOWYCH setupów (`cp` gdy `settings.json` jeszcze nie istnieje), nie
      retrofituje projektów już zmigrowanych. Wszystkie 8 plików zweryfikowane jako
      poprawny JSON. *(audyt repo §5)*
- [x] **K22. juz-ide-api-1: `Read(**)` + `Grep(**)` na końcu allowlisty.** ✅ 2026-08-27 —
      usunięto oba wildcardy, dodano `Grep(...)` lustrzane do istniejącej listy
      `Read(src/**|test/**|docs/**|project-orchestration/**|.claude/**|/opt/projects/**|
      /home/dev/.claude/**|/tmp/**)` — bez tego usunięcie `Grep(**)` cicho zepsułoby
      grepowanie wszędzie (drugi `Grep(*)` w pliku żyje w `autoMode.allow`, mechanizmie
      niepewnej legalności, patrz K24 — nie liczy się jako realna ochrona). Odkryto
      przy okazji realną lukę: `deny` miał tylko wzorce `Read(...)`, więc `Grep(**)`
      mógł czytać treść `.env`/sekretów mimo denylisty — dodano lustrzane `Grep(...)`
      w `deny`. Dodano też `Bash(rm -rf *)`/`git push --force*`/`git reset --hard*`
      do PRAWDZIWEGO `permissions.deny` (dotąd tylko w niepewnym `autoMode.soft_deny`)
      — retroaktywnie wzmocniono tym samym wzorcem 8 szablonów z K21. Świadomie
      NIE tknięto szerokiego `Bash(rm/mv/chmod/pkill/sed/tee:*)` w allow — to aktywnie
      rozwijane repo z realną pracą w toku, obcięcie tych uprawnień bez zweryfikowanego
      zamiennika ryzykowałoby złamanie codziennego workflow za mało pewny zysk
      bezpieczeństwa; zostawione jako świadomie odłożone. *(audyt juz-ide §6.1–6.2)*
- [x] **K23. `grantflow-log-time.sh`: hasło w `ps` i brak escapowania JSON.** ✅ 2026-08-27
      — nowa funkcja `json_build_login_payload()` (jq `env.VAR` / python3 `os.environ`,
      ten sam fallback co istniejące `json_get*`) czyta email/hasło ze zmiennych
      środowiskowych zamiast argv; `do_login()` wysyła payload przez `--data @-`
      (stdin), nie `-d "...$password..."` — hasło nigdy nie trafia do argumentów
      żadnego procesu, więc znika z `ps aux`. Zweryfikowano izolowanym testem: hasło
      z osadzonym `"` i `\` daje poprawnie zescapowany JSON (`\"`, `\\`) — dokładnie
      scenariusz, który wcześniej psuł/wstrzykiwał payload. `cmd_setup()`: `umask 077`
      przed zapisem configu zamiast `chmod 600` po nim — zamyka okno, w którym plik
      z hasłem istnieje z domyślnymi uprawnieniami. Syntax-checked (`bash -n`), bez
      uruchamiania wariantów dotykających realnego serwera grant-flow. *(audyt repo §5)*
- [x] **K24. No-op sekcje w `settings.json` obu projektów.** ✅ 2026-08-27 — **ważna korekta
      względem audytu**: zweryfikowano wobec żywego, autorytatywnego schematu (nie
      community schemastore.org, który dał niepełną odpowiedź) — `worktree` i `autoMode`
      są PRAWDZIWYMI, udokumentowanymi polami (`autoMode` = „Auto mode classifier prompt
      customization", dokładnie z kształtem `allow`/`soft_deny`/`environment` używanym w
      tych plikach). Harness sam to ujawnił, odrzucając moją pierwszą próbę usunięcia
      `autoMode` błędem walidacji z pełnym schematem w treści — nic nie zostało
      utracone. Faktycznie martwe (potwierdzone brakiem w schemacie): `thinking`,
      `context`, `agents` (liczba mnoga, `defaultModel`/...), `costOptimization` —
      usunięte z `iam/.claude/settings.json` i `juz-ide-api-1/.claude/settings.json`.
      Treść `autoMode.environment` w iam już duplikuje się w `CLAUDE-LOCAL.md`
      (zweryfikowano grepem) — nic do migracji. Oba pliki zweryfikowane jako
      poprawny JSON. *(audyt juz-ide §6.3, iam §3)*

## Fala 3 — koszty (deterministyczny skrypt zamiast LLM, mniejszy kontekst)

- [x] **K30. `scripts/tasks-digest.mjs`: frontmatter → tabela.** ✅ 2026-08-27 — dopisano
      frontmatter do 9 tasków (nie 14 — 5 z oryginalnej listy okazało się **symlinkami**
      `docs/tasks/*.md → project-orchestration/completed-tasks/*.md`, zamierzonym
      mechanizmem, nie przypadkowym dryfem; usunięto same symlinki z `docs/tasks/`,
      realne pliki w `completed-tasks/` nietknięte). Napisano `scripts/tasks-digest.mjs`
      — przetestowany na realnym drzewie: 13 tasków, 10 aktywnych poprawnie posortowanych
      (blocked → in-progress → ready/draft → planned), 3 stłumione (2 done, 1 approved).
      Wpięto w `pulse`/`task-health`/`reprioritize` SKILL.md — podmiana jednego kroku
      („Read all files…" → digest jako pierwszy przegląd, pełny plik tylko gdy digest
      niejednoznaczny), reszta instrukcji bez zmian. `KANBAN.md`/`TEAM-STATE.md`
      celowo nietknięte — wypełnią się przy najbliższym realnym `/pulse`. *(audyt repo §6, §9)*
- [x] **K31. `validate-tasks.mjs` zamiast agenta do audytu zadań.** ✅ 2026-08-27 —
      `scripts/ci/validate-tasks.mjs`: brakujące pola (`id`/`status`), zduplikowane id,
      `depends_on` wskazujące nieistniejący task, `id` niezgodny z nazwą pliku, stale
      in-progress (>14 dni, ten sam próg co szablon TEAM-STATE.md). Poprawnie wyklucza
      `*.analysis.md` (inny schemat — pole `task:`, nie `id:`, artefakty `/analyze`).
      12/12 realnych tasków przechodzi czysto. `depends_on` nie jest dziś nigdzie
      używane w tym repo — sprawdzenie działa, po prostu nic jeszcze nie ma do złapania;
      zostawione na przyszłość zamiast czekać aż konwencja powstanie. Wpięte do
      pre-commit (17 bramek). *(audyt repo §6)*
- [x] **K32. Przegląd modeli agentów.** ✅ 2026-08-27 — zweryfikowano wszystkie 4
      kandydatów z audytu: `state-reader` i `changelog-bot` już są na `haiku` (audyt
      się mylił, prawdopodobnie sprawdzał nieaktualny stan) — nic do zrobienia.
      `reviewer-nitpicker` → `haiku` (sam siebie opisuje jako „Deliberately
      low-severity — findings are almost never blocking", mechaniczne sprawdzanie
      stylu, dobrze pasuje do tańszego modelu). `reviewer-newbie` ŚWIADOMIE zostawiony
      na `sonnet` — ocena „czy nazwa jest niejasna"/„czy funkcja robi za dużo" wymaga
      subtelniejszego osądu językowego niż czyste sprawdzanie stylu, degradacja
      ryzykowałaby jakość jedynego lensu czytelności w panelu za niepewny zysk.
      *(audyt repo §6)*
- [x] **K33. `hooks/statusline-pm.js`: potrójny przelot po tasks/ przy każdym odświeżeniu
      statusline.** ✅ 2026-08-27 — scalono `countActiveBlocked()` + `readActiveTask()`
      (dwa niezależne pełne odczyty treści każdego pliku w `tasks/`) w jedną funkcję
      `scanTasksDir()` (jeden przelot, liczy active/blocked ORAZ zapamiętuje pierwszy
      task in-progress) + `resolveActiveTask()` (czyta tylko TEAM-STATE.md, korzysta
      z wyniku skanu bez ponownego czytania plików tasków). Cache po mtime katalogu
      pominięty świadomie — statusline to osobny proces per odświeżenie, cache
      wewnątrz-procesowy nic by nie dał, a cache międzyprocesowy (plik) ryzykowałby
      przestarzałe dane kosztem złożoności nieproporcjonalnej do zysku. Przetestowano
      na 3 realnych projektach (`juz-ide-api-1`, `claude-patterns`, `iam` — w tym
      przypadek bez systemu PM) — identyczny, poprawny output. `security-impl-feedback.js`
      ma NIEZALEŻNĄ kopię tej logiki (nie `require()`), nietknięta — to osobny problem
      (K40). *(audyt repo §1)*
- [x] **K34. juz-ide-api-1: odchudzić kontekst startowy.** ✅ 2026-08-27 — **1)** sekcja
      „Available Skills" (37 wierszy) usunięta u źródła w `generate-claude-md.sh`
      (nie w wygenerowanym pliku — zostałaby nadpisana), zastąpiona zwięzłym
      podsumowaniem liczbowym; `juz-ide-api-1/CLAUDE.md` 22571→21783 B, `iam/CLAUDE.md`
      219→186 linii, oba zregenerowane i zweryfikowane bez błędów. **2)** `decisions-index.json`:
      okazało się, że pole `brief` (zwięzłe streszczenia — DOKŁADNIE po to istniejące)
      już było w kodzie, ale `commands/analyze.md` §0.8 nigdy nie mówiło agentowi, żeby
      go użyć zamiast pełnych `entries[]` — naprawiono w dwóch miejscach: `brief` ucięty
      do 200 znaków (39→35 KB), i jawna instrukcja w `analyze.md` żeby prompt
      decision-gate dostawał `brief[]` + `entries` przefiltrowane do
      `needs_scope_check: true` + `problems`, NIGDY całego pliku. Zero pól usuniętych ze
      struktury. **3)** `knowledge/learned/` (280 KB) potwierdzone martwe (zero referencji,
      brak w `reseed.config.json`, każdy plik ma własny nagłówek „SUPPLEMENTARY — może
      być nieaktualne") — zarchiwizowane przez `git mv` do `knowledge/learned-archive/learned/`
      z README wyjaśniającym kontekst, historia gita zachowana. Przy okazji: fork wykrył
      świeży rozjazd K13 (nowy hook z K35 podbił `hooks.total` 45→46) — naprawiony od razu.
      *(audyt juz-ide §6.5–6.6)*
- [x] **K35. Retencja agent-memory.** ✅ 2026-08-27 — świadoma decyzja: NIE automatyczna
      kompaktacja/przenoszenie poza git (agent-memory jest tu git-tracked, przeglądalną
      historią — cicha reorganizacja treści przez hook byłaby większym, ryzykowniejszym
      posunięciem niż uzasadnia to sam problem). Zamiast tego nowy hook
      `hooks/agent-memory-size-guard.js` (SubagentStop, async, zawsze exit 0): ostrzega
      na stderr, gdy `MEMORY.md` danego agenta przekracza 10 KB — widoczność zamiast
      cichego rozrostu, decyzję co przyciąć zostawia człowiekowi. Zarejestrowany w
      `hooks/hooks.json` (manifest referencyjny biblioteki) i realnie wpięty w
      `juz-ide-api-1/.claude/settings.json`, gdzie problem faktycznie wystąpił.
      Przetestowano na prawdziwym `security-e2e-verifier/MEMORY.md` (16.3 KB) —
      ostrzeżenie się pojawia; na małym/nieistniejącym pliku — cisza. Oba
      zmodyfikowane pliki JSON zweryfikowane. *(audyt juz-ide §6.7)*

## Fala 4 — DX i spójność biblioteki

- [x] **K40. Dedup boilerplate'u hooków — DOKOŃCZONE.** ✅ 2026-08-27 — kontynuacja
      poprzedniej sesji: `readStdinJsonWithRaw()` (passthrough, dla hooków PreToolUse/
      PostToolUse) i `readStdinJson()` (bez passthroughu, dla SubagentStart/SubagentStop/
      WorktreeCreate/UserPromptSubmit i hooków bez `process.stdout.write`) rozstrzygane
      per-hook wg realnego kontraktu, nie zgadywane. **Wszystkie 48 plików w `hooks/*.js`
      przekonwertowane/zweryfikowane** — zero pozostałego ręcznego `process.stdin.on(...)`.
      Każda konwersja zweryfikowana: `node -c` (składnia) + diff zachowania stara/nowa
      wersja na 3+ scenariuszach stdin (pusty, niepoprawny JSON, realny `tool_input`) —
      identyczny stdout/stderr/exit code. **Przy okazji odkryto i naprawiono realny,
      wcześniej istniejący bug**: `evaluate-session.js`, `post-edit-console-warn.js`,
      `session-end.js` miały `require('../lib/utils')` (o jeden poziom za wysoko —
      moduł nie istnieje), więc każde wywołanie tych hooków rzucało
      `MODULE_NOT_FOUND` i kończyło się `exit 1` — bug pre-dating tę sesję (potwierdzone
      w `git show HEAD`, przez bezpośrednie wykonanie wersji z HEAD w kontekście
      `hooks/`), niezwiązany z K40, naprawiony przy okazji bo dotykało się tych
      samych linii. **Ten sam bug znaleziony i naprawiony niezależnie w 2 kolejnych
      plikach spoza konwersji stdin** (`pre-compact.js`, `session-start.js` — oba mają
      `require('../lib/utils')`, `session-start.js` dodatkowo `../lib/package-manager`
      i `../lib/session-aliases` z tym samym błędem), więc **wszystkie 5 dotkniętych
      hooków cyklu życia sesji** (SessionStart/PreCompact/SessionEnd) naprawione i
      zweryfikowane bezpośrednim uruchomieniem (`echo '{}' | node <hook>.js` — exit 0,
      bez crasha). `hooks/lib/pm-tasks.js` (z poprzedniej sesji) bez zmian. *(audyt repo §1)*
- [x] **K41. Dedup skryptów shell — DOKOŃCZONE.** ✅ 2026-08-27 — `scripts/lib/common.sh`
      (blok kolorów ANSI, superset wariantów widzianych w kodzie), źródłowane przez 15
      skryptów (`scripts/*.sh`, `hooks/state-manager.sh`, `mcp-server/knowledge-retriever/
      reseed.sh`). **Świadomie pominięte**: `grantflow-log-time.sh` i
      `grantflow-sync-projects.sh` — deployowane jako płaskie kopie do `~/.local/bin/`
      bez towarzyszącego `lib/`, `source` po ścieżce względnej by tam nie zadziałał
      (udokumentowane w komentarzu w pliku). **Szkielet `sync-*-skills.sh` w
      `vendor-sync.sh` — NIE zrobione świadomie**: przy próbie ekstrakcji okazało się,
      że poza blokiem kolorów te 3 skrypty różnią się fundamentalnie (finance/marketing:
      jedno repo źródłowe; legal: dwa repo + filtrowanie licencji `metadata.license`
      per-skill) — wymuszona wspólna abstrakcja byłaby sztuczna, więc ograniczono się
      do bezpiecznego wspólnego mianownika (kolory). `--help`/`-h` dodane do
      `setup-project.sh` (early-exit przed jakąkolwiek akcją) i `materialize-runtime.mjs`
      (exit 0, w odróżnieniu od dotychczasowego `exit 1` przy braku argumentu). Zero
      regresji: `bash -n` na wszystkich zmienionych `.sh`, smoke-test
      `state-manager.sh show` i `validate-metadata.sh` (kolory renderują się poprawnie
      po `source`), pełny `pre-commit-guards.mjs` (17/17 bramek) przed i po.
      **Uwaga uboczna** (poza zakresem K41, niezmienione): `validate-metadata.sh`
      zgłasza 6 realnych, wcześniej istniejących błędów treści w
      `patterns/{python,flutter,typescript-library}/METADATA.yml` (brakujące pola,
      błędny YAML) — ten skrypt nie jest wpięty do `pre-commit-guards.mjs`, więc to nie
      regresja tej sesji; wymaga osobnej pozycji backlogu. *(audyt repo §2)*
- [x] **K42. Indeksy vs rzeczywistość.** ✅ 2026-08-27 — `agents/README.md`: dopisano
      3 nowe sekcje stackowe + rozszerzono istniejące (26+19→26+30=56, zgodne z K13).
      `commands/README.md`: 16 komend w 4 nowych kategoriach. `patterns/README.md`:
      5 nowych sekcji stackowych + 2 wzorce architecture (po drodze naprawiono własny
      duplikat 2 plików już opisanych gdzie indziej). `hooks/README.md`: 31 wcześniej
      nieopisanych hooków dopisanych. `skills/README.md`: nowy plik, 24 kategorie,
      suma zgodna z `count-assets.mjs` (190). *(audyt repo §4, §8)*
- [x] **K43. Martwe/niedowiezione hooki.** ✅ 2026-08-27 — `check-human-voice.js`:
      realna, potwierdzona luka (`human_voice:` to bezwarunkowy wpis w KAŻDYM
      `runtime.yml`, ale hook go egzekwujący wchodził tylko przez opcjonalny blok
      `approval-gate`) — naprawione u ŹRÓDŁA w `materialize-runtime.mjs` (hook zawsze
      trafia do listy `hooks:`), wpięty też bezpośrednio w `juz-ide-api-1/.claude/settings.json`.
      `check-pumpandsettle.js`: **korekta audytu** — NIE jest martwy, wpięty przez
      `blocks/clean-arch.yml`, zostawiony bez zmian. 4 hooki flutter: pliki istnieją,
      dopisane do `templates/settings/flutter.json`. 5 inline'owych `node -e` w
      `hooks.json` wyciągnięte do osobnych plików (`git-push-reminder.js`,
      `pr-url-logger.js`, `subagent-start-log.js`, `subagent-stop-log.js`,
      `worktree-env-copy.js`), identyczna logika, syntax-checked. *(audyt repo §1)*
- [x] **K44. Silnik bloków: `patterns.remove` + test dryfu forka.** ✅ 2026-08-27 —
      `patterns.remove` dodane w `materialize-runtime.mjs` (zbierane per blok,
      aplikowane po scaleniu, niezależnie od kolejności `stack_blocks`), zastosowane w
      `iam-security.yml` — zweryfikowano: `runtime.yml` iam ma teraz WYŁĄCZNIE wersję
      fastify, `cross-layer/security-invariants-pattern.md` zniknął z sumy. Check dryfu
      fork-vs-baza dodany do `audit-projects.mjs` (uproszczony: porównanie top-level
      kluczy bez śledzenia hashów w czasie — świadomy kompromis) — zweryfikowano, że
      poprawnie łapie `iam-verifiers.yml` nadpisujący `orchestrate` z `flat-service.yml`.
      *(audyt iam §5G–H)*
- [x] **K45. Skille referencjonowane przez agentów a niesymlinkowane.** ✅ 2026-08-27 —
      rozstrzygnięcie: `disable-model-invocation: true` przestaje bezwarunkowo blokować
      symlinkowanie, gdy skill jest jawnie wymieniony w `skills:` frontmattera
      zsymlinkowanego agenta (naprawione w `setup-project.sh`). Zweryfikowane
      end-to-end na jednorazowym katalogu `/tmp`: agent `security-e2e-verifier`
      (nestjs-ddd) → `security/security-review` i `security/threat-model` faktycznie
      się symlinkują. *(audyt iam §5I)*
- [x] **K46. iam: dopiąć brakujące klocki.** ✅ 2026-08-27 — wszystkie 3 części zrobione,
      zweryfikowane `verify-project-setup.mjs /opt/projects/iam` → „✓ setup kompletny"
      na końcu: (1) `decision-registry` dodany do `stack_blocks` + `block_params`
      (tylko `adr_dir` — iam nie ma odpowiednika BDR/open-questions), `decisions-index.json`
      powstał (10 wpisów); po drodze naprawiony domyślny `lookup_order` bloku (zakładał
      strukturę DDD). (2) `knowledge_collection: code_iam` dodane do `project.yml`,
      `runtime.yml` ma teraz sekcję `knowledge:`. (3) `pattern_routing` dodany do
      `iam-security.yml` — **odkryto po drodze**, że `generate-pattern-routing.mjs`
      w ogóle nie czyta bloków lokalnych (inny mechanizm niż zakładano), a
      `materialize-runtime.mjs` (który faktycznie obsługuje lokalny routing) miał TĘ
      SAMĄ lukę ścieżki co K02, w trzeciej gałęzi rozwiązywania — naprawiona.
      `pattern-routing.local.json` w iam potwierdzony z 2 regułami. *(audyt iam §5E–F, J)*
- [x] **K47. Jawne zależności projektów od agentów globalnych.** ✅ 2026-08-27 —
      `verify-project-setup.mjs` już poprawnie sprawdzał obie lokalizacje agenta, ale
      wynik nigdy nie był drukowany (tylko surowy licznik) — niejawność, nie brak
      sprawdzenia. Naprawione: flaga `--verbose` + adnotacja źródła. Zweryfikowano:
      `verify-project-setup.mjs /opt/projects/iam --verbose` pokazuje
      `state-reader (globalny, ~/.claude/agents/)` obok `code-quality-verifier (lokalny)`.
      Cykliczność: dodany check #5 do `audit-projects.mjs`, wywołujący
      `verify-project-setup.mjs` per projekt skomponowany — zweryfikowane pełnym
      przebiegiem `audit-projects.mjs`. *(audyt juz-ide §5.7, iam §5A)*
- [x] **K48. Sprzątanie reliktów w satelitach.** ✅ 2026-08-27 — usunięto (zweryfikowane
      grepem, zero żywych referencji poza szumem w `decisions-index.json`): `roles/`,
      `memory/`, `env/`, `vytches-ddd/`, pusty `worktrees/`, `ARCHITECTURE.md`,
      `AGENT_TEAMS_GUIDE.md`, `knowledge/MIGRATION_SUMMARY.md`, porzucony
      `run-state/ts-reach-boost-001-testing.workflow.js` (zostawione: `halt.json` i
      `workflows/` — aktywne). 3 nieużywane symlinki hooków `.sh` usunięte.
      `.gitignore`: 27 ręcznych linii per-agent → `.claude/agents/*.md` +
      `!geo-postgres-specialist.md` (jedyny realny lokalny plik), zweryfikowane
      `git check-ignore`. *(audyt juz-ide §5.3–5.4, §6.8, iam §5J)*

---

- [x] **K49 (nowo odkryty przy K03). Brak szablonu `templates/stacks/node-kysely.md`.**
      ✅ 2026-08-27 — napisano krótki `templates/stacks/node-kysely.md`
      (Fastify+Zod+Kysely, bez DDD). Zregenerowano `iam/CLAUDE.md` — ostrzeżenie „Stack
      profile not found" zniknęło. **Ważna korekta**: sekcje „Bounded Contexts"/
      „Documentation" zostają puste z INNEGO powodu niż brak szablonu —
      `project.yml` iam w ogóle nie deklaruje `contexts:`/`docs:` (te sekcje w
      `core.md` są zasilane z `project.yml`, nie z szablonu stacku). Świadomie NIE
      wymyślono listy bounded-contextów dla płaskiego serwisu, żeby nie fabrykować
      treści — to osobna decyzja właściciela iam, nie coś do zgadnięcia.
      *(odkryte 2026-08-27 przy weryfikacji K03, nieujęte w oryginalnym audycie iam)*

## Notatki

- Duplikaty tasków `tasks/` ↔ `completed-tasks/` (K30) to skutek symlinku
  `project-orchestration/tasks -> ../docs/tasks`: pięć ukończonych zadań widnieje
  jednocześnie jako aktywne i zakończone.
- KANBAN.md celowo nie wypełniany ręcznie (nagłówek: „regenerated on each pulse") —
  wypełni się po K30, gdy `/pulse` będzie miał frontmatter do czytania.
- Rozjazd rejestru decyzji juz-ide-api-1 (15 zdublowanych numerów wg
  `verify-project-setup.mjs`) zostawiony poza tym backlogiem — wymaga decyzji
  właściciela rejestru, nie mechanicznej poprawki.
