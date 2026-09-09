# Audyt claude-patterns — 2026-09-07

Zakres: całe repo (patterns, agents, skills, commands, hooks, blocks, scripts, tests, docs, mcp-server)
oraz stan w terenie (13 satelitów, ~/.claude, telemetria). Siedem audytów obszarowych + własne
czytanie silników `/analyze`, `/orchestrate`, ADR-ów i backlogu. Każde twierdzenie P1 zweryfikowane
osobno komendą na tej maszynie.

Legenda: P1 = aktywnie wprowadza w błąd albo psuje egzekwowanie; P2 = realny dług o ograniczonym
zasięgu; P3 = higiena. „Fix" = konkretny krok, nie kierunek.

---

## 0. Diagnoza ogólna (czym to repo jest naprawdę)

Repo deklaruje się jako „DDD-overlay na ECC" i ma silny, unikalny rdzeń: Rule Cards + hooki
groundingu/delegacji + VETO verifiers + kompozycja bloków (ADR 0008). Ten rdzeń jest realny i działa.

Wokół rdzenia narosły jednak trzy warstwy rozjazdu:

1. **Deklaracja vs egzekwowanie.** Kilka mechanizmów istnieje tylko jako opis: `hooks.json`
   „auto-install" (2/22 realnie wpięte), `overlay.rules` w blokach (zero konsumentów),
   `sync-runtime-hooks.mjs` (zbudowany, nigdzie nie wołany), wstrzykiwanie Rule Cards do
   implementerów (wymagane przez `orchestrate.md`, robione przez żaden skrypt).
2. **Decyzje podjęte, niewykonane.** Spike Fazy 0 dał GO 2026-06-28 (`/opt/projects/_spike/notes/`),
   zaplanowane „retire ~50% generyków" nie ruszyło; 16 komend i 5 agentów z listy RETIRE nadal żyją;
   `rules/common/` to niejawny fork ECC (4 pliki bajt-w-bajt identyczne, 2 okrojone).
3. **Ślepa telemetria.** Log użycia agentów: 36460/36461 wierszy `unknown` (hook czyta
   `subagent_type`, payload niesie `agent_type`). Metryki workflow urwały się 2026-08-15. Eval
   `library-reference-schema` pada 5/14 i nikt tego nie widzi. Bez tego każda decyzja RETIRE/KEEP
   i każde „to kosztuje X" jest zgadywaniem.

Do tego dochodzi dokumentacja, w której najważniejszy plik per sesję (`CLAUDE.md`, ~7,3k tokenów)
i główny dokument architektury (`docs/ARCHITECTURE.md`) opisują mechanizm usunięty 2026-08-12.

---

## 1. P1 — do zrobienia najpierw

### 1.1 Egzekwowanie i instalacja

| # | Znalezisko | Dowód | Fix |
|---|---|---|---|
| A1 | `hooks/hooks.json` nie jest nigdzie aplikowany do `settings.json` | `scripts/setup-global.sh:100-101` tylko symlinkuje katalog; `~/.claude/settings.json` ma 2 hooki (`block-root-grep`, `pre-workflow-lint`), `hooks.json` deklaruje 22 na 8 zdarzeniach; satelity brakuje 13-17 tych samych hooków | `scripts/sync-global-hooks.mjs` (wzór: `sync-runtime-hooks.mjs`), wołany z `setup-global.sh`; albo poprawić opis „auto-install" w CLAUDE.md/README/setup-global.sh na „katalog referencyjny" |
| A2 | `runtime.yml` nieaktualny w 10/11 skomponowanych projektów | `node scripts/audit-projects.mjs` → 12 projektów wymaga uwagi, 16 znalezisk; to powtórka incydentu z 2026-08-12 opisanego w `materialize-runtime.mjs` | `audit-projects.mjs` jako cykliczna bramka (`/loop` lub pre-commit w claude-patterns) + pre-commit w satelitach na zmianę `project.yml`/`.claude/blocks/*.yml`; rematerializować teraz |
| A3 | `sync-runtime-hooks.mjs` istnieje, ale nic go nie woła | `grep -rl sync-runtime-hooks commands/ skills/ hooks/ docs/ README.md CLAUDE.md` → pusto; `setup-project.sh:763-778` świadomie tylko ostrzega | wpiąć do `setup-project.sh` (tryb `--apply`) i do `audit-projects.mjs` |
| A4 | `overlay.rules` w 4 blokach to martwy config; reguły idą po `stack_profile` | `blocks/{python,ts-library,clean-arch}.yml`, `blocks/ddd/core.yml:44`; konsument: brak. `setup-project.sh:448-472` linkuje `rules/$STACK_PROFILE`, choć `templates/project.yml.example:17-19` mówi „stack_profile = tylko selektor szablonu" | dopisać `link_overlay_rules()` analogicznie do `link_overlay_agents()` (`setup-project.sh:356`), usunąć gałąź `$STACK_PROFILE` |
| A5 | Nowe hooki niewpięte nigdzie | `block-root-grep.js` (2026-09-04) i `check-focus-wrapper.js` (2026-09-04): brak w `hooks.json`, blokach, szablonach, `hooks/README.md`; `block-root-grep` działa tylko przez ręczny wpis w `~/.claude/settings.json` | `block-root-grep` → `hooks.json` PreToolUse/Bash; `check-focus-wrapper` → `blocks/flutter.yml` lub `clean-arch.yml`; README |
| A6 | `check-approval-before-impl.js` nie zwalnia subagentów | `hooks/check-approval-before-impl.js:50-82` brak `agent_id`; pozostałe 3 bramki (`check-delegation.js:111`, `check-patterns-read.js:134`, `productivity-watchdog.js:76`) mają wyjątek. Skanuje CAŁY katalog `analysis/`, więc w trybie `block` implementer z `/orchestrate` odbije się o cudzy, niezatwierdzony artefakt | 1 linia + helper `isSubagent(payload)` w `hooks/lib/utils.js` (dziś 4 kopie inline) |
| A7 | `templates/settings/nestjs-ddd.json` (ścieżka `migrate-v2.sh`) rozjechany z `blocks/ddd/core.yml` | brakuje `check-patterns-read`, kluczowej bramki groundingu; dwie równoległe ścieżki provisioningu settings (bloki vs szablony) | wycofać `migrate-v2.sh` + `templates/settings/*.json` na rzecz jednej ścieżki `setup-project.sh` + `sync-runtime-hooks --apply` |
| A8 | Parser `project.yml` w 4 kopiach (3× grep/sed w bashu, 1× `yaml` w Node) i już rozjechany | `setup-project.sh:79-99`, `generate-claude-md.sh:31-73`, `migrate-v2.sh:43-53`; kopia w `generate-claude-md.sh` obcina komentarz inline, kopia w `setup-project.sh` nie. ADR 0008 nazywa to „najsłabsze miejsce systemu" | jeden moduł Node (`scripts/lib/project-yml.mjs`) wołany z basha przez `node -e`; docelowo port `setup-project.sh` do Node |

### 1.2 Telemetria i evale

| # | Znalezisko | Dowód | Fix |
|---|---|---|---|
| B1 | Log użycia agentów bezużyteczny | `~/.claude/logs/agent-usage.jsonl`: 36460/36461 `"agent":"unknown"`; `hooks/subagent-stop-cost-log.js:155-157` czyta `subagent_type`/`agent_name`; realny payload ma `agent_type` (potwierdzone z `agent-usage-debug.jsonl`) | dodać `input.agent_type` do fallbacków; koszt/tokeny liczyć z `agent_transcript_path` (payload nie niesie `usage`) |
| B2 | Metryki workflow martwe od 2026-08-15 | `~/.claude/metrics/workflow-steps.jsonl` ostatni `ts` 2026-08-15T16:30; `workflow-metrics-postrun.js` jest w `hooks.json`, którego nikt nie aplikuje (A1) | A1 + check świeżości metryk vs aktywność sesji w `audit-projects.mjs` |
| B3 | Eval `library-reference-schema` pada i nikt nie wie | `node tests/flow-evals/library-reference-schema/run.js` → 5/14 FAIL (1007 pkt zamiast 982, `INV-LIBVER` 1007×); celowo poza pre-commit (wymaga Qdranta) | uruchamiać z `reseed-patterns.sh` (jak retrieval eval) i zapisywać wynik do `results.jsonl`; alert w `rag-freshness.mjs` |
| B4 | Retrieval kodu skażony między worktree (TASK-RAG-004 R1/R2, draft od 2026-08-02) | `mcp-server/knowledge-retriever/src/indexer.ts:23-33,47` nadal ścieżki absolutne; `reseed.config.json` seeduje `code_juz_ide_api` wyłącznie z `../juz-ide-api-1/src`, a 4 instancje mają różne zestawy commitów (`docs/KANON.md` tylko w api-1/3). `orchestrate.md` §2b′ od 2026-09-01 wprost każe używać `retrieve_code` | wykonać R1 (ścieżki repo-relative + snippet jako dowód) i R2 (indeks z kanonicznego refa) PRZED dalszym promowaniem retrievalu w promptach |

### 1.3 Prawda w dokumentacji (pliki ładowane do sesji)

| # | Znalezisko | Dowód | Fix |
|---|---|---|---|
| C1 | `CLAUDE.md` banner CURRENT DIRECTION opisuje nieistniejące komendy | `CLAUDE.md:11-16`: `/analyze-ddd + /orchestrate-ddd`, `preset requires_ecc:`; pliki usunięte 2026-08-12 (ADR 0008) | przepisać na `/analyze` + `/orchestrate` + `stack_blocks`; link do ADR 0008 + `blocks/README.md` |
| C2 | `docs/ARCHITECTURE.md` w całości opisuje `_stack-defaults`, `stack_profile`, `templates/stack-presets`, Phase 0.5 | cały plik, 228 linii, linkowany z CLAUDE.md jako „full architecture reference" | przepisać na 3 warstwy z blokami → runtime.yml → sloty; albo baner „historyczne, patrz ADR 0008" |
| C3 | `blocks/README.md:1-8` „F3 pilot, stare komendy chodzą równolegle na presets/" | edytowany dzień PO ADR 0008 (`9af20ad`), a `presets/` nie istnieje; `blocks/README.md:253`, `_aliases.yml:2`, `ddd/events.yml:9` referują usunięty `blocks-equivalence-check.mjs` (`af4bcd2`) | nagłówek → stan faktyczny; usunąć 3 martwe referencje |
| C4 | `docs/tasks/TASK-BLOCKS-001.md` (status `ready`) opisuje pilot zakończony miesiąc temu | linie 12,20,25,31,140 | zamknąć jako done, resztki F5/F6 do nowego taska |
| C5 | Liczniki sprzeczne w 3 miejscach | `CLAUDE.md:28` 100 patterns / `:580` 67 / realnie 104; `CLAUDE.md:30`+`README.md:518` 45 hooks / realnie 53; `README.md:3-4` v3.5.0 2026-05-07 vs METADATA 3.6.0; `patterns/README.md` 104 vs suma ASCII 92 vs Statistics 81 (architecture: 11/12/14) | `count-assets.mjs --check-docs` (grep `\d+ (patterns|hooks|…)` w CLAUDE.md/README/patterns/README) w pre-commit; usunąć sekcję Statistics |
| C6 | `README.md:585-596` Quick Setup opisuje presety po `stack_profile` | `setup-project.sh:620-621` sam mówi „presety usunięte 2026-08-12" | przepisać na `stack_blocks` |
| C7 | Wynik spike'a Fazy 0 poza repo, plan §8 przeterminowany | `/opt/projects/_spike/notes/06-decision.md` (GO 2026-06-28) reklasyfikuje: `adr`, `blog`, `capture`, `claude-updates` → KEEP; finance/legal/marketing → KEEP; `security-review/-check` i `cost-report` to inna domena niż `ecc:security-scan`/`ecc:cost-report`. `docs/REFACTOR-ANALYSIS.md:363-371` nadal ma starą listę | przenieść wnioski do REFACTOR-ANALYSIS §8 (albo krótki ADR 0009 „wynik Fazy 0"), potem wykonać retire realnej listy (patrz 2.5) |
| C8 | `docs/DECISIONS-LOG.md` zatrzymany 2026-07-05 | 64 dni luki: ADR 0008, TASK-OBS-002, GUARDRAILS/KAIZEN, nowe wzorce 09-04/09-07 bez wpisu; CLAUDE.md nazywa go „running rationale" | dopisać wpisy albo baner „wstrzymany od DD, patrz ADR/completed-tasks" |

### 1.4 Korpus wzorców

| # | Znalezisko | Dowód | Fix |
|---|---|---|---|
| D1 | `repository-pattern.md` to 20-liniowy stub, a routing kieruje na niego 6 reguł | `wc -l` = 20; `pattern-routing.generated.js` 6 dopasowań (`.repository.ts$`, `.cron.ts$`, `.scheduler.ts$`, `.job.ts$`…); `patterns/README.md:103` opisuje go jako „~700 linii, Production"; karta RP1-RP12 bogatsza niż rodzic | przywrócić pełną treść (z `repository-events-pattern.md`) albo przekierować routing + README |
| D2 | 14/14 wzorców routowanych przez hooki w baseline długu formatu | wszystkie `pattern_routing:` cele: aggregate, value-object, entity, domain-event, domain-service, specification-policy, repository, mapper, controller-schema, command-handler, query-handler, audit-handler, application-service, acl-registry; `command-handler`/`query-handler` edytowane 2026-09-04 bez naprawy | `lint-patterns.mjs`: czytać `pattern_routing.*` z bloków i eskalować brak sekcji do BŁĘDU niezależnie od baseline (analogicznie do checku `patterns.always`, linia 118) |
| D3 | `entity-event-emission-pattern.md` uczy zakazanego mechanizmu na martwym przykładzie | usunięty kontekst Trust BC + `eventDispatcher.dispatchEvent()`, który `integration-event-pattern.md` nazywa anty-wzorcem; identyczne Tags co `domain-event-pattern.md` → `retrieve_patterns` może zwrócić go jako alternatywę | scalić jako podsekcję w `domain-event-pattern.md`, usunąć plik |
| D4 | Dwa schematy `METADATA.yml`, błąd składni YAML, walidator zepsuty i poza pre-commit | `scripts/validate-metadata.sh` 6/10 FAIL; `patterns/python/METADATA.yml:5` niecytowany drugi dwukropek (każdy `yaml.parse` pada); 7/16 kategorii bez METADATA; walidator nie w `pre-commit-guards.mjs` | naprawić linię 5; wybrać jeden schemat (rekomendacja: nowy `category/maturity/patterns_count`), przepisać walidator, wpiąć w pre-commit |
| D5 | Brak `**Scope**` na wzorcach jawnie jednoprojektowych | `infrastructure/geo-spatial-query-pattern.md` (:10,15,83,126,…, `README.md:516` twierdzi, że oznaczony — nie jest), `testing/domain-colocated-fixture-mother-pattern.md`, `flutter/{design-token,component-creation,accessibility}-pattern.md` (`LocalHeroDesignTokens`, `elderMode`) | dodać `**Scope**` (plik + karta), README, METADATA |
| D6 | 5 kart reguł nieosiągalnych przez żaden mechanizm wymuszony | `try-confirm-cancel`, `dto-mapper`, `moderated-edit-buffer`, `named-policy`, `geo-spatial-query`: brak w `always`/`triggers`/`pattern_routing` | dopisać `triggers`/`pattern_routing` w odpowiednich blokach |
| D7 | `rules/` = niejawny fork ECC + duplikat kart | `rules/common/{git-workflow,hooks,patterns,security}.md` identyczne z `~/.claude/plugins/marketplaces/ecc`; `coding-style` 48 vs 90 linii, `testing` 29 vs 57; `rules/nestjs-ddd/repository.md` bez RP12/N7 obecnych w karcie; 11/41 plików rules nieprzywołanych w blokach | decyzja: `requires_ecc: rules/common` (usunąć kopie) albo jawny fork z `UPSTREAM_VERSION` + sync; `rules/nestjs-ddd/*` generować z kart albo usunąć |

### 1.5 Agenci i komendy

| # | Znalezisko | Dowód | Fix |
|---|---|---|---|
| E1 | 16 agentów z martwym `mcp__zen__*` w `tools:` | `grep -l "^tools:.*mcp__zen"` = 16; żaden satelita nie ma serwera `zen` w `.mcp.json`; wzorzec naprawy istnieje (`security-e2e-verifier.md:484` Changelog) | usunąć w 16 plikach; `validate-agents.js` sprawdza tylko `model`+`tools` (nazwy), dodać check istnienia MCP |
| E2 | Połowiczna naprawa incydentu fabrykowanych metryk | `tech-lead.md` `model: haiku` (README:57 mówi Sonnet); `product-owner` naprawiony (`4e2bc58`); `business-rules-auditor.md:232-234` ma wypełnione liczby (`32 total / 3 decorated / 29 missing (9%)`) — ten sam few-shot-as-data trap | `tech-lead` → sonnet; placeholdery `<N>` w auditorze; README model dla 6 agentów (marketing/finance/legal-strategist, reviewer-nitpicker, flutter-ui-verifier, tech-lead) |
| E3 | `templates/examples/nextjs-project.yml:8` deklaruje `stack_blocks: [nextjs]`, a `blocks/nextjs.yml` nie istnieje | `materialize-runtime.mjs:247` rzuci twardy błąd; 5 stacków (nextjs, sveltekit, python-modular, node-ts-claude-api, astro) nigdy nie wpięte w bloki → 10 agentów osiągalnych tylko przez `@mention` | dopisać `blocks/nextjs.yml` + `sveltekit.yml` (min. `overlay.agents` + `analyze.panel`) albo poprawić przykład i udokumentować „manual only" |
| E4 | 7 par komenda↔skill z tą samą procedurą, skille odjechały do przodu | `commands/{pulse,sprint,task-health,tech-debt,pm-status,reprioritize,task-tidy}.md` vs `skills/orchestration/*/SKILL.md`; `reprioritize` skill konsultuje 3 strategistów, komenda nie; `task-health` dwie różne ceny | skill = kanon, komenda = 5-liniowy wrapper na Skill tool |
| E5 | Pozorne bramki narzędzi | `skills/security/incident/SKILL.md:5` `Read, Write` bez Edit/Bash dla dziennika prowadzonego T+0→T+72h; `commands/{sprint,tech-debt}.md:6` Write bez Edit na TEAM-STATE; `reprioritize` Edit bez Write przy „create new task files"; `task-health` bez Edit przy „apply fixes with Edit"; `changelog-bot.md:6-7` Bash+Write z zakazem Edit | wyrównać (memory: `write-without-edit-fake-gate`) |
| E6 | Walidatory CI nie sprawdzają tego, co sugerują nazwy | `validate-commands.js` nie parsuje frontmatteru, referencje skilli WARN nigdy ERROR, regex łapie tylko 1. segment ścieżki; `validate-skills.js` = „SKILL.md istnieje i niepusty" | parser frontmatteru + wymagane pola + ERROR na martwą referencję |
| E7 | `commands/orchestrate.md` (543 l.) i `analyze.md` (290 l.) to dziennik incydentów, z którego LLM co przebieg odtwarza skrypt Workflow, a 16 reguł WL łapie błędy post factum | numeracja `2a′`/`2a″`/`2b′`/`2c′`; 7 ID przebiegów, 19 dat w treści reguł; §2b′ „wymaga tego od linii 148, a nie robi tego żaden skrypt"; skrypt Workflow nie ma FS, karty czyta koordynator ręcznie | (a) kanoniczny, testowany skrypt Workflow jako **named workflow** (`.claude/workflows/orchestrate.mjs`, parametry z `args`), (b) deterministyczny `scripts/orchestrate-prepare.mjs <TASK-ID>` → JSON args (warstwy, karty, checks, budżety, collection), (c) `orchestrate.md` → rejestr reguł `ORC-nnn | trigger | akcja | mechanizm | ref`, narracja incydentów → DECISIONS-LOG |

### 1.6 Broadcast (ADR 0006)

| # | Znalezisko | Dowód | Fix |
|---|---|---|---|
| F1 | Pilot martwy, kod nadal odpala się per prompt/edit w 5 projektach | `/opt/projects/.claude-swarm/STOP` z 2026-08-09 („koszt >20 USD"), `inbox/`/`claims/` puste, zero `events-*.jsonl`; 5 satelitów ma `broadcast.yml` z identycznym mtime 2026-08-08; go/no-go (termin ~2026-08-22) nierozstrzygnięte w ADR ani `TASK-BROADCAST-001` | decyzja: retire (9 plików `hooks/lib/broadcast/`, 3 hooki, 2 komendy, 1 skill, 47 testów) albo archiwum + wycięcie wpięć z 5 `settings.local.json`; wpis w ADR 0006 |

---

## 2. P2 — realny dług, ograniczony zasięg

### 2.1 Hooki
- Testy: 3/52 hooków ma fixtures (`productivity-watchdog`, `check-delegation`, `check-approval-before-impl`); 19 hooków treściowych (regexy) bez żadnego testu. `hooks/README.md:106` sugeruje pełne pokrycie.
- `hooks/README.md` opisuje 3 fantomowe hooki („Dev server blocker", „Tmux reminder", „Build analysis"), „Strategic compact" żyje w `skills/optimization/`, 2 martwe linki (`:325-326`).
- Env-var sprawl: 3 konwencje (`X_MODE=block|warn|off`, `X=off`, `NO_X=true`); `ORCHESTRATE_DDD_GATE` steruje plikiem `check-approval-before-impl.js`. Ujednolicić do `<NAZWA>_MODE`, jedna tabela w README.
- `post-edit-typecheck.js:46-51` pełny `tsc --noEmit` na całym projekcie przy każdej edycji `.ts` (30 s timeout, hot path). Incremental/cooldown.
- 8-9 hooków „config-driven regex scan" o identycznym szkielecie → `hooks/lib/rule-scanner.js`.
- Czwarta ścieżka wpięcia: `cost-optimizer.sh`/`session-monitor.sh`/`state-manager.sh` symlinkowane per projekt, nigdzie nierejestrowane. Wyjaśnić lub usunąć.
- `hooks/lib/{utils,session-manager,session-aliases,package-manager}.js` (571/442/481/431 linii): `session-manager` ma 0 konsumentów; `session-aliases`+`package-manager` tylko `session-start.js` (RETIRE→ECC). Kandydat do wycięcia razem z session-start/-end.

### 2.2 Agenci
- `agents/README.md`: 6 rozjazdów modelu, 3 implementery (`domain-application-`, `infrastructure-`, `test-implementer`) w ogóle nieobecne w tabeli mimo `blocks/ddd/layers.yml:29-38`.
- `content-reviewer.md:29-30` twierdzi VETO, README:171 „No".
- `business-rules-auditor` nieosiągalny z żadnego bloku ani implementera.
- Koszt kontekstu: 26 opisów universal ≈ 17,9k znaków; 4 strategiści = 50%; `security-privacy-architect` (2260 zn., RETIRE od 3 mies., 0 referencji w blokach) nadal globalny.
- 4 pliki > 500 linii (`backend-technology-expert` 603, `security-privacy-architect` 527, `domain-application-implementer` 511, `security-e2e-verifier` 493) wbrew własnej regule 200-400.
- `reviewer-*` (16 plików) = identyczny szkielet, różne persony → 1 agent parametryzowany + pliki person (redukcja długu, nie bug).
- `## Changelog` w 5/56; bramka pre-commit K15 wymusza go tylko przy edycji.

### 2.3 Komendy i skille
- `commands/blog.md:54` zła ścieżka runtime (`~/.claude/skills/marketing/dev-blog-generator` vs płaskie linkowanie).
- `evolve`/`instinct-*` referują `${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/` — istnieje tylko w ECC; lokalny duplikat `skills/learning/continuous-learning-v2/` (na liście RETIRE).
- `review-panel` (`commands/review-panel.md:26`, `SKILL.md:61,64`) wybiera persony po `stack_profile` — wbrew ADR 0008.
- `skills/decision-frameworks/adr/SKILL.md` opisuje kontrakt sprzed `decision-registry`; `commands/adr.md` już zmigrował.
- `skills/database/postgres-patterns/SKILL.md:13,145` goły `database-reviewer` zamiast `ecc:database-reviewer`.
- Vendorowane skille: `synced_at: 2026-05-07` (4 miesiące); `rsync --delete --exclude='LOCAL-*'` nie chroni plików z markerem `<!-- LOCAL -->`, którego uczy CLAUDE.md.
- Osierocone: `database/{postgres-patterns,database-migrations}`, `flutter/flutter-signature-animations`, `frontend/frontend-patterns`, `infrastructure/{cleanup-host-orphans,deployment-patterns,docker-patterns}`, `python/python-clean-arch`; `skills/integrations/grant-flow/` bez SKILL.md (duplikat `grantflow/`).
- `skills/README.md` (36 linii) twierdzi „każda kategoria ma README" — prawda dla 3/24 (vendorowanych).
- 11/45 komend bez `name`; 0/45 `effort`/`argument-hint`; `skill-create.md` `allowed_tools: [...]`; `evolve.md` `command: true`.
- `commands/{finance,legal}.md` zabraniają Bash, delegują do agentów z Bash.

### 2.4 Wzorce (ciąg dalszy)
- Duplikaty: `testing/context-isolation-pattern.md` ≈ `architecture/fresh-context-pattern.md` (retire pierwszy); `integration-event-pattern.md` (1440 l.): 237 linii martwego przykładu Trust BC + 183 linie BullMQ pokryte przez `bullmq-queue-pattern.md` + 118 linii outbox z `transactional-outbox-pattern.md`.
- `controller-schema-pattern.md` (1148 l.) = 3 wzorce (controller / Zod / rate-limit) → split.
- Tylko 5/104 deklaruje `**Level**`, 0 wśród 12 największych; 41/104 > 400 linii.
- `**Status**` niewalidowany: `ACTIVE` w 2 plikach (`e2e-hybrid-fixture:8`, `domain-colocated-fixture-mother:8`), druga linia Status w `transactional-outbox:252`.
- Taksonomia: `outbox` pod `api:events` i `api:data-access`; 4 warianty `auth` w `variants_seen` bez użyć; `economy`/`infra` zadeklarowane, nieużywane.
- `named-policy-pattern_summary.md:22` cytuje nieistniejącą regułę `D2`; `test-seeding-performance-guide.md` (1778 l.) 6 martwych linków + historyczny kod fixture obok nowszego wzorca (ryzyko dla RAG).
- Baseline 75: 37 tanich (Layer/Status/✅❌), 38 wymaga pisania; 17 (nextjs/python/sveltekit, 2 commity każdy) to „framework 101" do porównania z ECC przed decyzją keep/merge. `testing/` 0 kart przy 100% baseline; `architecture/` 2 karty/14.
- Prefiks `A1..` kolizja `aggregate` vs `flutter/accessibility`; 5 kart tabelarycznych vs bullet; podwójne `### 5.` w `aggregate-pattern.md:602,643`.

### 2.5 Retire (po C7)
Realna lista wg spike'a: RETIRE `code-review, tdd, verify, plan, test-coverage, checkpoint, sessions, evolve, instinct-{export,import,status}`; agenci `technical-architecture-lead`, `changelog-bot`, `security-privacy-architect` (0 referencji w blokach); `backend-technology-expert` i `state-reader` są load-bearing w blokach (`nestjs.yml:32`, `node.yml:32`, `ts-library.yml:62`, `decision-registry.yml:60`) → albo podmienić na `ecc:*`, albo formalnie KEEP. Hooki RETIRE: `session-start/-end`, `evaluate-session`, `pre-compact`, `post-edit-format`, `post-edit-console-warn`, `pre-write-doc-warn`, `git-push-reminder` (+ `hooks/lib/session-*`, `package-manager`).

### 2.6 Setup/tooling
- 0 testów dla `materialize-runtime.mjs` (914 l.) i `setup-project.sh` (1074 l.).
- `mcp-server/server.py` (Python, 2026-02-05, README z `~/projects/claude-patterns`, `local-hero-3`) instalowany do każdego satelity przez `setup-project.sh:847-880` obok `knowledge-retriever` → usunąć.
- `schemas/hooks.schema.json` 0 konsumentów; `business-rules.schema.json` tylko `existsSync`, nigdy ajv; brak schematu dla `blocks/*.yml`.
- `README.md` Scripts Reference: 9/33 skryptów; `:924` `cd ~/.claude-patterns`.
- `templates/`: 9/24 sierot (`bdr-template.md`, `commitlint.config.js`, `task-*.md`, `python-ml-hooks.json`, `python-pipeline-hooks.json` — glob w `setup-project.sh:660-676` zawsze bierze `python-hooks.json`); `BUSINESS_RULES.yaml.template` nigdy nie kopiowany mimo nakazu w CLAUDE.md.
- `iam`: kompozycja bloków nie ma semantyki override/subtract — `.claude/blocks/iam-verifiers.yml` (`extends` nadpisuje całe `orchestrate`) i `iam-security.yml` (dwa `security-invariants` w `always`, rozstrzyga komentarz). Nota/ADR zanim pojawi się drugi adopter.
- `~/.claude/CLAUDE.md` narzuca sekcję „DDD Projects (nestjs-ddd)" bezwarunkowo, choć 6/13 satelitów to nestjs-ddd, a linijkę niżej mówi „nie zakładaj NestJS".
- Twin-instancje `juz-ide-api-1..4` nie są klonami (różne zestawy commitów, `governance.canon` rozwiązuje się różnie) — check spójności w `verify-project-setup.mjs`.

### 2.7 ADR
- ADR 0002 nie ma `Superseded-by: 0008`; ADR 0006 go/no-go przeterminowane; ADR 0007 (`proposed`, 2026-08-02) miesza D4 wdrożone z D1/D2 hipotetycznymi — a właśnie D1 (manifest `installed.yml`) + D2 (`--check`) rozwiązałyby A2/A3. Rozstrzygnąć.
- `docs/{REFACTOR-ANALYSIS,ECC-USAGE,orchestrate-ddd-design,rag-design,spike-faza-0-plan,faza-1-plan}.md` bez banera archiwalnego (wzór: `ROADMAP.md:9-16`).
- `docs/tasks/{TASK-AGENTS-AUDIT-001,TASK-VYTCHES-BLOCKS-001,TASK-DDD-PANEL-SPLIT-001,TASK-RAG-004}.md` każą sprawdzać `presets/`, `analyze-ddd` — zaktualizować kroki przed startem. `TASK-EVAL-001` Faza 1 de facto zrobiona przez K11 — zamknąć/odchudzić.

---

## 3. P3 — higiena
- `CLAUDE.md`: 34% (~205 linii) to changelog v3.1-v3.5 → `CHANGELOG.md`; procedury „Adding a …" (~280 linii) → `docs/CONTRIBUTING.md`; cel ≤150 linii z generowanym blokiem liczników.
- `README.md` (1067 l.): tagi `[NEW v3.x]` sprzed 4 miesięcy; sekcje marketing/finance/legal (~360 l.) duplikują `skills/*/README.md`.
- Polityka języka (README/indeksy EN, ADR od 0002/ROADMAP/DECISIONS-LOG/design PL) — spisać jedno zdanie, nie przepisywać.
- `project-orchestration/TEAM-STATE.md`/`KANBAN.md` w repo = placeholdery szablonu (`{PROJECT_NAME}`) od 2026-08-08; `/pulse` nigdy nie odpalony tu.
- `screenshots/` pusty; `CLAUDE-UPDATES.md` 2026-04-27 mimo `/claude-updates`; `.gitignore` bez `screenshots/`, `.claude/worktrees`.
- Martwe symlinki `__pycache__` w `pcu`/`my-intelligence` (śmieci po worktree). `my-intelligence` z 11 hookami `.sh` sprzed migracji, `pcu` z 5 agentami poza kompozycją — projekty uśpione (1-6 sesji) flagowane tą samą wagą co api-1..4 (172-190 sesji) → heurystyka „dormant" w `audit-projects`.
- DE3 (`domain-errors-pattern_summary.md:17` „łamana w ~90%") ma już backstop CI — adnotacja „naprawione".
- 6 martwych linków w `test-seeding-performance-guide.md:1724-1742`, 1 w `security-privacy-architect.md:468`, 2 w `hooks/README.md:325-326`.

---

## 4. Proponowana kolejność

1. **Dzień 1 — jednolinijkowe poprawki o dużym efekcie**: B1 (`agent_type`), A6 (subagent w `check-approval-before-impl`), D4 (YAML `python/METADATA.yml:5`), A5 (wpiąć 2 hooki), E2 (`tech-lead` sonnet, placeholdery), E1 (16× `mcp__zen__`), E3 (przykład nextjs), C1 (banner CLAUDE.md), A2 (rematerializować 10 projektów).
2. **Tydzień 1 — prawda i egzekwowanie**: A1+A3+A4+A7 (jeden installer/reconciler w Node, `sync-global-hooks`, `link_overlay_rules`, wycofanie `migrate-v2`), A8 (jeden parser project.yml), C2-C6 (ARCHITECTURE, blocks/README, TASK-BLOCKS-001, liczniki generowane + `--check-docs` w pre-commit), C7 (wynik spike'a do repo), rozstrzygnięcie ADR 0007 D1/D2 (manifest instalacji domyka A2).
3. **Tydzień 2 — telemetria i RAG**: B2/B3 (metryki wpięte, eval lib-ref z reseedu), B4 (TASK-RAG-004 R1+R2). Bez tego kroku nie ma danych do decyzji RETIRE.
4. **Tydzień 3 — korpus**: D1, D2 (lint eskaluje routowane), D3, D5, D6, D7 (rules vs ECC), duplikaty z 2.4; `testing/` karty dla routowanych.
5. **Tydzień 4 — silnik**: E7 (named workflow + `orchestrate-prepare.mjs` + rejestr reguł). To największa dźwignia jakościowa: dziś każdy przebieg odtwarza 543 linie prozy w skrypt, a linter łapie tylko znane błędy.
6. **Potem — cięcie**: 2.5 retire wg spike'a (komendy, agenci, hooki session-*, `mcp-server/server.py`, broadcast F1), E4/E5 (komendy jako wrappery, bramki narzędzi), E6 (walidatory z zębami), testy dla `materialize-runtime`/`setup-project`/hooków regexowych.

## 5. Nakładanie się z otwartym backlogiem
- `TASK-AGENTS-AUDIT-001` (planned od 07-07): sekcje 1.5/2.2/2.3 tego raportu = jego Faza 1 wykonana. Zamknąć po wdrożeniu E1/E2/E6.
- `TASK-EVAL-001`: Faza 1 zrobiona przez K11 (pre-commit) — zaktualizować; Faza 2 (korpusy L2) pozostaje.
- `TASK-RAG-004`: B4 — podnieść z draft do ready, to warunek sensowności §2b′ w orchestrate.md.
- `TASK-DDD-PANEL-SPLIT-001`: przepisać na bloki (panel żyje w `blocks/ddd/core.yml`), rozważyć łącznie z E7.
- `TASK-BROADCAST-001`: F1 — domknąć go/no-go.
- `TASK-BLOCKS-001`: C4 — zamknąć.
