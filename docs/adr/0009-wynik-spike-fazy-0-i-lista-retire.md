# ADR 0009 — Wynik spike'a Fazy 0 (ECC jako baza) i wiążąca lista RETIRE / KEEP

**Status**: accepted (2026-09-07) — decyzja GO ze spike'a Fazy 0 (2026-06-27/28) przeniesiona
do repo i uzupełniona o weryfikację odpowiedników ECC oraz listę konsumentów w kodzie.
**Context source**: `/opt/projects/_spike/notes/` (S0-S6, notatki 00, 02-06), w szczególności
`06-decision.md` (werdykt **GO**, live potwierdzone 2026-06-28), `02-overlap-matrix.md`
(macierz pokrycia) i `03-hook-collisions.md` (kolizje hooków). Punkt wyjścia do rewizji:
[`docs/REFACTOR-ANALYSIS.md`](../REFACTOR-ANALYSIS.md) §8. Zamawiający: audyt
`docs/audits/2026-09-07-repo-audit.md` §2.5 (pozycja K72 w `TASK-KAIZEN-002`).

> **Po co ten ADR.** Wynik spike'a leżał od czerwca poza repozytorium, w katalogu roboczym
> `/opt/projects/_spike/`. Każda próba cięcia generyków zaczynała się więc od odtwarzania
> tego samego researchu, a §8 analizy refaktoru — jedyna lista w repo — była w trzech
> punktach nieaktualna (patrz „Korekty względem §8"). Ten dokument jest jedynym miejscem,
> z którego wolno brać listę do wykonania.

---

## Kontekst

### Co ustalił spike Fazy 0

Sześć pytań badawczych, wszystkie z werdyktem pozytywnym (`06-decision.md`):

| Q | Pytanie | Werdykt | Dowód |
|---|---|---|---|
| Q1 | ECC instalowalny czysto i izolowalnie? | tak | `plugin.json`/`marketplace.json`, slug `ecc@ecc`; `CLAUDE_CONFIG_DIR` honorowany |
| Q2 | Overlap zmapowany, RETIRE bez dziur? | tak | `02-overlap-matrix.md` — 5 równoległych auditów treść-do-treści |
| Q3 | Kolizje hooków rozbrajalne? | tak | `03-hook-collisions.md` — `ECC_DISABLED_HOOKS` / `ECC_GATEGUARD=off` działa deterministycznie |
| Q4 | Moat działa obok ECC (E2E)? | tak | `04-overlay-e2e.md` + potwierdzenie live: `/agents` pokazuje `ecc:*` i nasze verifiery jednocześnie |
| Q5 | Loops działają, da się wpiąć domenę? | tak | `05-loops.md`; live: `/loop /verify` + `/ecc:loop-status` |
| Q6 | Koszt i złożoność akceptowalne? | tak (wstępnie) | overlay = symlinki + jeden `settings.json`; retire ~50% upraszcza utrzymanie |

Rdzeń wniosku: **ECC to konsultanci (advisory), my to egzekutorzy (VETO + grounding)**.
ECC nie ma ani mapowania plik→wzorzec, ani wymuszania delegacji, ani niczego na `SubagentStop`
(ten event jest u nich pusty). To jest granica, wzdłuż której przebiega całe cięcie: co jest
generyczną poradą — idzie do ECC; co blokuje przebieg albo zna nasz model domenowy — zostaje.

### Korekty względem `REFACTOR-ANALYSIS.md` §8

Trzy pozycje z §8 spike obalił i tu obowiązuje wersja z tego ADR-a:

1. **finance / legal / marketing → KEEP** (w §8 były w kolumnie AUDIT). ECC pokrywa inną
   domenę: billing i koszt zamiast doradztwa inwestycyjnego, sam HIPAA zamiast pełnego
   compliance, marketing bez CRO/paid/email. Zero powodu, żeby cokolwiek stamtąd oddawać.
2. **`adr`, `blog`, `capture`, `claude-updates` → KEEP** (w §8 w kolumnie RETIRE). ECC ma
   skill `architecture-decision-records` (jak pisać ADR), nie ma komendy, która zapisuje ADR
   w naszym formacie i katalogu; `blog`/`capture` zasilają się z KANBAN-u i completed-tasks;
   `claude-updates` czyta release notes platformy i pisze do `CLAUDE-UPDATES.md`.
3. **`rules/nestjs-ddd/` trzeba NAPISAĆ.** To nie jest retire, to luka u obu stron: ani my,
   ani ECC nie mamy reguł DDD-specyficznych (Aggregate/Entity/VO/Repository/`Result<T>`/ACL).
   Retire generycznych `rules/common/*` bez wcześniejszego napisania tych reguł zostawiłby
   projekty DDD bez jakichkolwiek reguł. Kolejność jest wiążąca: **najpierw napisać, potem ciąć.**

### Stan zastany w chwili pisania tego ADR-a (2026-09-07)

- ECC zainstalowany globalnie (`~/.claude/plugins/marketplaces/ecc/`), 92 komendy, 67 agentów,
  271 skilli, hooki sterowane `ECC_HOOK_PROFILE` (`minimal|standard|strict`) oraz
  `ECC_DISABLED_HOOKS` / `ECC_GATEGUARD`.
- `agents/universal/technical-architecture-lead.md` **już nie istnieje** — agenta usunięto
  przy zmianie nazwy 2026-07-09 (`agents/stacks/nestjs-ddd/code-quality-verifier.md:307`).
  W tabeli poniżej zostaje jako pozycja historyczna, żeby lista zgadzała się z audytem.
- Bloki (ADR 0008) referują dwóch agentów z listy: `backend-technology-expert`
  (`blocks/nestjs.yml:32`, `blocks/node.yml:32`, `blocks/ts-library.yml:62`) i `state-reader`
  (`blocks/decision-registry.yml:60`). To zmienia ich status z „do rozważenia" na load-bearing.

---

## Decyzja

Poniższe tabele są **wiążącą listą wykonawczą**. Kolumna „konsumenci w repo" to lista miejsc
do przepięcia — dopóki nie jest pusta, elementu nie wolno usunąć (symlinki propagują
natychmiast do wszystkich projektów; skasowanie z żywym konsumentem łamie każdy z nich naraz).

Legenda decyzji: **RETIRE** = usunąć u nas, konsumentów przepiąć na wskazany `ecc:*`.
**KEEP** = zostaje w claude-patterns, ECC nie pokrywa albo pokrywa co innego.

### Komendy

| element | decyzja | odpowiednik ECC | powód | konsumenci w repo (plik:linia) |
|---|---|---|---|---|
| `/code-review` | RETIRE → `ecc:code-review` | `~/.claude/plugins/marketplaces/ecc/commands/code-review.md` | Ten sam zakres (lokalny diff albo PR), ECC dodatkowo ma tryb PR po numerze i agenta `ecc:code-reviewer`. Nasza wersja niczego nie dokłada; `/review-panel` (15 person) to inna klasa narzędzia i zostaje. | `commands/README.md:37`, `commands/review-panel.md:50,56`, `commands/plan.md:123`, `commands/tdd.md:317`, `commands/pr-ops.md:39`, `skills/quality/review-panel/SKILL.md:18`, `templates/examples/CLAUDE.md:92`, `templates/examples/django-api-CLAUDE.md:297`, `templates/examples/saas-nextjs-CLAUDE.md:153`, `templates/examples/rust-api-CLAUDE.md:273`, `CLAUDE.md:159` |
| `/tdd` | RETIRE → `ecc:tdd-workflow` (skill) + `ecc:<lang>-test` | `ecc/skills/tdd-workflow/`, `ecc/commands/{react,go,rust,kotlin,cpp,flutter}-test.md` | ECC **nie ma komendy `/tdd`** — ma skill `tdd-workflow` i komendy testowe per język. Przepięcie jest więc zmianą kształtu, nie podmianą nazwy: konsumenci mają wskazywać skill. | `commands/README.md:29,120`, `commands/plan.md:121`, `hooks/README.md:270`, `templates/examples/CLAUDE.md:90`, `templates/examples/django-api-CLAUDE.md:292`, `templates/examples/saas-nextjs-CLAUDE.md:131,150`, `templates/examples/rust-api-CLAUDE.md:270`, `scripts/setup-global.sh:6,96`, `scripts/ci/validate-commands.js:115`, `CLAUDE.md:158` |
| `/verify` | RETIRE → `ecc:quality-gate` | `ecc/commands/quality-gate.md`, skill `ecc/skills/verification-loop/` | Te same bramki (typecheck/lint/test/build), ECC wykrywa system budowania sam. Uwaga: nazwa się zmienia, więc każde `/verify` w prozie trzeba przepisać ręcznie. | `commands/README.md:36,121`, `commands/checkpoint.md:17`, `skills/testing/verification-loop/SKILL.md:122`, `templates/examples/django-api-CLAUDE.md:300`, `templates/examples/rust-api-CLAUDE.md:277`, `CLAUDE.md:159`, `README.md:701,981` |
| `/plan` | RETIRE → `ecc:plan` | `ecc/commands/plan.md` | Pliki są funkcjonalnie tożsame (ten sam opis: restate → risks → plan → WAIT for CONFIRM). Utrzymywanie dwóch kopii tego samego promptu to czysty koszt. | `commands/README.md:28,119`, `commands/tdd.md:314`, `templates/examples/CLAUDE.md:91`, `templates/examples/go-microservice-CLAUDE.md:248`, `templates/examples/django-api-CLAUDE.md:289`, `templates/examples/saas-nextjs-CLAUDE.md:147`, `templates/examples/rust-api-CLAUDE.md:267`, `scripts/setup-global.sh:6,96`, `README.md:702` |
| `/test-coverage` | RETIRE → `ecc:test-coverage` | `ecc/commands/test-coverage.md` | Pokrycie z priorytetyzacją — ECC ma równoważnik. Nasza wersja nie zna naszego modelu domenowego (nie czyta `BUSINESS_RULES.yaml`), więc nic nie traci. | `commands/README.md:42`, `commands/tdd.md:318`, `agents/stacks/flutter-clean-arch/flutter-implementer.md:180`, `templates/examples/saas-nextjs-CLAUDE.md:133,158` |
| `/checkpoint` | RETIRE → `ecc:checkpoint` | `ecc/commands/checkpoint.md` | Snapshot stanu sesji — mechanika generyczna. Nasz tryb `handoff` pisze `SESSION_STATE.md`; przy przepięciu ten jeden tryb przenieść do `/progress` albo do szablonu, nie zgubić. | `commands/README.md:75`, `commands/progress.md:36`, `templates/SESSION_STATE.md.template:3` |
| `/sessions` | RETIRE → `ecc:sessions` | `ecc/commands/sessions.md` (+ `save-session.md`, `resume-session.md`) | Przeglądanie historii sesji to funkcja harnessu, nie naszej domeny. | `commands/README.md:74`, `hooks/session-start.js:61`, `hooks/lib/session-manager.js:5` |
| `/evolve` | RETIRE → `ecc:evolve` | `ecc/commands/evolve.md` | Klastrowanie instynktów w skille/komendy — cały mechanizm „continuous learning" jest u ECC pierwszej klasy (`ecc:learn`, `ecc:continuous-learning-v2`). | `commands/README.md:84`, `commands/skill-create.md:170`, `skills/learning/continuous-learning-v2/SKILL.md:93,168,178,215`, `skills/learning/continuous-learning-v2/config.json:34` |
| `/instinct-export` | RETIRE → `ecc:instinct-export` | `ecc/commands/instinct-export.md` | Jw. — ten sam format instynktów, ten sam katalog `~/.claude/homunculus/`. | `commands/README.md:82`, `skills/learning/continuous-learning-v2/SKILL.md:169,179` |
| `/instinct-import` | RETIRE → `ecc:instinct-import` | `ecc/commands/instinct-import.md` | Jw. | `commands/README.md:83`, `commands/skill-create.md:168`, `skills/learning/continuous-learning-v2/SKILL.md:170,180` |
| `/instinct-status` | RETIRE → `ecc:instinct-status` | `ecc/commands/instinct-status.md` | Jw. | `commands/README.md:81`, `commands/skill-create.md:169`, `commands/instinct-import.md:141`, `skills/learning/continuous-learning-v2/SKILL.md:167,177` |
| `/adr` | **KEEP** | `ecc:architecture-decision-records` (skill) — nie pokrywa | Skill ECC uczy, jak pisać ADR. Nasza komenda zapisuje ADR w naszym numerowaniu i szablonie do `docs/adr/`, i jest wołana przez `/analyze`. Reklasyfikacja ze spike'a względem §8. | — |
| `/blog` | **KEEP** | brak | Generuje research pod build-in-public z `git log` + `KANBAN.md` + `completed-tasks/`. Wejście jest nasze, ECC nie ma czego czytać. | — |
| `/capture` | **KEEP** | brak | Zapisuje insight z bieżącej rozmowy jako szkic do `docs/blog/`. Sprzężone z `/blog`. | — |
| `/claude-updates` | **KEEP** | brak | Czyta release notes platformy Claude i utrzymuje `CLAUDE-UPDATES.md` w repo. | — |
| `/security-review` | **KEEP** | `ecc:security-scan` — **inna domena** | Nasza komenda robi STRIDE + DREAD + LINDDUN na kodzie aplikacji (NestJS-DDD); `ecc:security-scan` skanuje AgentShieldem powierzchnię harnessu — agentów, hooki, MCP, uprawnienia i sekrety. | — |
| `/security-check` | **KEEP** | `ecc:security-scan` — **inna domena** | To szybki audyt naszych inwariantów DDD w diffie (np. `userId` w schemacie Zod zamiast z kontekstu auth), czego skaner konfiguracji harnessu nie widzi. | — |
| `/cost-report` | **KEEP** | `ecc:cost-report` — **inne źródło danych** | Nasza wersja pyta Analytics API organizacji (`ANTHROPIC_ADMIN_API_KEY`, rozliczenie całej org); `ecc:cost-report` czyta lokalny `~/.claude/metrics/costs.jsonl` z hooka `stop:cost-tracker` (tylko ta maszyna). | — |
| `/finance`, `/legal`, `/marketing` | **KEEP** | `ecc:marketing-campaign`, `ecc:hipaa-compliance` — nie pokrywają | Korekta względem §8 (były AUDIT). ECC = billing/koszt, sam HIPAA, marketing bez CRO/paid/email. 137 zvendorowanych skilli domenowych nie ma tam odpowiednika. | — |

### Agenci

| element | decyzja | odpowiednik ECC | powód | konsumenci w repo (plik:linia) |
|---|---|---|---|---|
| `technical-architecture-lead` | RETIRE (**już wykonane**) | `ecc:architect` | Plik nie istnieje — agenta usunięto przy zmianie nazwy na `backend-technology-expert` (2026-07-09). Została jedna wzmianka w changelogu. | `agents/stacks/nestjs-ddd/code-quality-verifier.md:307` (wpis changelogu — zostawić, to historia) |
| `changelog-bot` | RETIRE → `ecc:doc-updater` | `ecc/agents/doc-updater.md` | Mechaniczna zamiana `git log` (Conventional Commits) na `CHANGELOG.md`. Zero referencji w blokach, zero wywołań ze skilli — używany był ręcznie. | `agents/README.md:13,49`, `commands/cost-report.md:79` |
| `security-privacy-architect` | RETIRE → `ecc:security-reviewer` | `ecc/agents/security-reviewer.md` | Advisory (OWASP/GDPR/auth) — dokładnie profil agenta ECC. Zero referencji w blokach; VETO trzyma `security-e2e-verifier`, który zostaje. **Uwaga: 18 miejsc do przepięcia**, w tym prompty implementerów. | `agents/README.md:18,68`, `agents/universal/security-privacy-architect.md` (plik), `agents/stacks/nestjs-ddd/security-e2e-verifier.md:393`, `agents/stacks/nestjs-ddd/implementers/infrastructure-implementer.md:158,336`, `agents/stacks/nestjs-ddd/implementers/domain-application-implementer.md:200,401,491`, `agents/stacks/flutter-clean-arch/flutter-quality-verifier.md:162`, `agents/stacks/flutter-clean-arch/flutter-security-verifier.md:191`, `templates/security-checklists/b2g.md:86`, `templates/stacks/{nestjs-ddd,node-kysely,typescript-library,nextjs-app,sveltekit}.md:8-9`, `README.md:66,691` |
| `backend-technology-expert` | **KEEP** (load-bearing) | `ecc:code-architect` / `ecc:architect` — kandydat, nie decyzja | Siedzi w slocie `tech-analysis-specialist` trzech bloków. Podmiana na `ecc:*` jest możliwa, ale to zmiana zachowania `/analyze` w każdym projekcie na tych blokach — wymaga osobnej decyzji i przebiegu porównawczego, nie cięcia przy okazji. | `blocks/nestjs.yml:32`, `blocks/node.yml:32`, `blocks/ts-library.yml:62`, `agents/README.md:12,67`, `agents/stacks/nestjs-ddd/{code-quality-verifier.md:261,307, sql-postgres-optimizer.md:63,149,157, ddd-application-expert.md:57,252,272}`, `agents/stacks/nestjs-ddd/implementers/*`, `agents/stacks/python-ml/ml-inference-architect.md:168`, `templates/stacks/*.md`, `commands/cost-report.md:106` |
| `state-reader` | **KEEP** (load-bearing) | brak | Haiku, czysta ekstrakcja z plików stanu — 60× tańszy od Opusa na tej robocie. Wpięty w blok `decision-registry` jako blokujący `decision-gate` i w dwa skille PM. `workflow-conformance.mjs` zna go z nazwy jako agenta użytkowego. ECC nie ma taniego czytnika stanu. | `blocks/decision-registry.yml:60`, `skills/orchestration/task-health/SKILL.md:33,39,59,130`, `skills/orchestration/task-tidy/SKILL.md:20,57,60`, `scripts/workflow-conformance.mjs:31`, `scripts/WORKFLOW-METRICS.md:77`, `agents/README.md:19,48`, `agents/shared/README.md:21`, `templates/stacks/node-kysely.md:9` |

### Hooki sesyjne i formatujące

Warunek retire brzmiał: usuwamy tylko wtedy, gdy ECC ma odpowiednik. Sprawdzone w
`~/.claude/plugins/marketplaces/ecc/scripts/hooks/` — **wszystkie osiem ma odpowiednik**,
więc wszystkie osiem idzie do retire.

| element | decyzja | odpowiednik ECC (ścieżka) | powód | konsumenci w repo (plik:linia) |
|---|---|---|---|---|
| `hooks/session-start.js` | RETIRE | `ecc/scripts/hooks/session-start.js` + `session-start-bootstrap.js` (event `SessionStart`) | Ten sam event, ten sam cel; ECC dodatkowo limituje wstrzykiwany kontekst (`ECC_SESSION_START_MAX_CHARS`). Nasz `session-start-pm.js` (briefing PM) **zostaje** — to inna treść. | `hooks/hooks.json:63`, `CLAUDE.md:244,541` |
| `hooks/session-end.js` | RETIRE | `ecc/scripts/hooks/session-end.js` + `session-end-marker.js` (`SessionEnd`) | Jw. | `hooks/hooks.json:239` |
| `hooks/evaluate-session.js` | RETIRE | `ecc/scripts/hooks/evaluate-session.js` (`Stop`) | Jw.; u ECC batchowane w `Stop` razem z resztą. | `hooks/hooks.json:249`, `hooks/README.md:299` |
| `hooks/pre-compact.js` | RETIRE | `ecc/scripts/hooks/pre-compact.js` (`PreCompact`) | Jw. | `hooks/hooks.json:51`, `hooks/README.md:304` |
| `hooks/post-edit-format.js` | RETIRE | `ecc/scripts/hooks/post-edit-format.js` + `stop-format-typecheck.js` | Formatowanie po edycji — generyczne. ECC robi to zbiorczo na `Stop` (taniej niż per-edycja). | `hooks/hooks.json:127`, `hooks/README.md:303`, `templates/settings/nextjs-app.json:49`, `templates/settings/sveltekit.json:49`, `templates/settings/typescript-library.json:51` |
| `hooks/post-edit-console-warn.js` | RETIRE | `ecc/scripts/hooks/post-edit-console-warn.js` + `check-console-log.js` | Duplikat co do nazwy i zachowania. | `hooks/hooks.json:137`, `hooks/README.md:302` |
| `hooks/pre-write-doc-warn.js` | RETIRE | `ecc/scripts/hooks/doc-file-warning.js` (+ `pre-write-doc-warn.js`) | Duplikat; potwierdzony jako kolizja w `03-hook-collisions.md` (oba odpalają się na `Write`). | `hooks/hooks.json:10`, `hooks/README.md:306` |
| `hooks/git-push-reminder.js` | RETIRE | `ecc/scripts/hooks/pre-bash-git-push-reminder.js` | Jw. | `hooks/hooks.json:30` |
| `hooks/lib/session-manager.js`, `hooks/lib/session-aliases.js` | RETIRE razem z powyższymi | — | Biblioteki wyłącznie dla `session-*` i `/sessions`; po ich usunięciu bez konsumenta. | `hooks/session-start.js`, `commands/sessions.md` |
| `hooks/check-delegation.js`, `check-patterns-read.js`, `check-subagent-pattern-reads.js`, `hooks/lib/pattern-routing*.js` | **KEEP** (moat) | brak — potwierdzone jednoznacznie | ECC nie mapuje pliku na wzorzec, nie blokuje głównego agenta na plikach wzorcowych i nie ma **żadnego** hooka na `SubagentStop`. To jedyna rzecz, której nie da się odtworzyć z ECC. | cały `blocks/**` przez `pattern_routing:` |

**Warunek operacyjny (z `03-hook-collisions.md`, potwierdzony live):** projekty DDD muszą
wyłączyć bramkę ECC, żeby nie stała podwójna bramka na edycji pliku wzorcowego —
`ECC_GATEGUARD=off` albo `ECC_DISABLED_HOOKS=pre:edit-write:gateguard-fact-force,pre:bash:gateguard-fact-force`
(gateguard odpala się **także na `Bash`**, nie tylko na `Edit`/`Write` — to ustalenie z sesji
live, szersze niż pierwotny test). Ustawienie żyje w `env:` bloków — sprawdzone np. w
`/opt/projects/vytches-ddd/.claude/config/runtime.yml` (blok `ts-library` wnosi oba warianty).

### Broadcast (ADR 0006)

Poza zakresem tego ADR-a — rozstrzygnięte osobno, w [ADR 0006](0006-cross-instance-broadcast.md),
pozycja **K99** w `TASK-KAIZEN-002`. **Wynik: RETIRE (2026-09-07)** — kanał zebrał zero wpisów,
kill-switch padł 2026-08-09 na koszcie, a hooki mimo to chodziły w pięciu satelitach przez
kolejny miesiąc. Cały system (9 modułów `hooks/lib/broadcast/`, 3 hooki, 2 komendy, skill
stand-by, 47 testów, szablon manifestu, `docs/BROADCAST.md`) usunięty z repo; wpięcia wycięte
z `settings.local.json` sześciu instancji. Kod zostaje w historii gita — SHA i pełne
uzasadnienie w ADR 0006, sekcja „Wynik pilotu i powód retire".

---

## Konsekwencje

**Co zyskujemy.** Retire to 11 komend, 2 agentów (trzeci już usunięty) i 8 hooków plus dwie
biblioteki — grubo licząc połowa generycznej powierzchni. Każda z tych rzeczy jest dziś
utrzymywana przez nas i dryfuje niezależnie od ECC, który i tak ładuje swoją wersję do każdej
sesji. Po cięciu zostaje to, czego ECC nie ma: grounding wzorcami, wymuszanie delegacji,
verifiery z VETO, panel `/analyze` sterowany blokami i 137 skilli domenowych.

**Czego to nie robi.** Nie usuwa niczego samo z siebie. Kolumna „konsumenci" jest listą pracy
do wykonania w K96-K98 i dopóki nie jest pusta, plik zostaje na dysku. Symlinki propagują
natychmiast do wszystkich projektów, więc usunięcie z żywym konsumentem łamie je wszystkie
jednocześnie — kolejność „przepnij konsumentów → zweryfikuj → usuń" nie jest tu ostrożnością,
tylko warunkiem poprawności.

**Co musi się wydarzyć przed cięciem `rules/`.** Napisać `rules/nestjs-ddd/`. Retire
`rules/common/*` bez tego zostawia projekty DDD bez reguł w ogóle — luka jest u obu stron
i nikt jej nie zapełni sam.

**Koszt stały ECC.** Sama obecność pluginu to ~33k tokenów na sesję (metadane 271 skilli,
`docs/ECC-USAGE.md`). Retire naszych duplikatów ten koszt zmniejsza po stronie utrzymania,
ale nie po stronie kontekstu — to osobny problem (profile hooków, `ECC_HOOK_PROFILE=minimal`).

**Dług, który ten ADR ujawnia.** Trzy pozycje z listy mają konsumentów w prompcie agentów,
nie tylko w dokumentacji: `security-privacy-architect` w promptach implementerów DDD
i verifierów Fluttera, `changelog-bot` i `state-reader` w skillach PM. Przepięcie ich to
zmiana promptu, czyli objęta dyscypliną z `TASK-GUARDRAILS-001` sekcja 3 (wpis w `## Changelog`
agenta). To nie jest praca „przy okazji".

---

## Alternatywy odrzucone

**Aktualizacja `REFACTOR-ANALYSIS.md` §8 zamiast osobnego ADR-a.** Tak brzmiała pierwotna
propozycja z audytu („krótki ADR albo aktualizacja §8"). Odrzucona: §8 jest częścią analizy
z czerwca, opisującej architekturę sprzed ADR 0008 (presety, `/analyze-ddd`), i cały ten
dokument dostaje właśnie baner archiwalny. Lista wykonawcza nie może mieszkać w dokumencie
oznaczonym jako historyczny — czytelnik nie ma jak odróżnić, która część jest nadal wiążąca.

**Retire w jednym ruchu, bez listy konsumentów.** Kuszące, bo lista jest długa. Odrzucone
z powodu symlinków: propagacja jest natychmiastowa i globalna, więc pierwszy błąd nie objawia
się jako zepsuty test w tym repo, tylko jako martwa referencja w dziesięciu projektach naraz.
Dokładnie ten scenariusz opisuje zasada bezpieczeństwa z `docs/faza-1-plan.md`.

**Podmiana `backend-technology-expert` i `state-reader` na `ecc:*` razem z resztą.** Odrzucone:
oba są wpięte w bloki jako sloty, więc podmiana zmienia zachowanie `/analyze` w każdym projekcie,
który te bloki składa. `state-reader` dodatkowo nie ma odpowiednika (ECC nie ma taniego
czytnika stanu na Haiku), a `workflow-conformance.mjs:31` zna go z nazwy. To osobna decyzja
z własnym przebiegiem porównawczym, nie skutek uboczny sprzątania.

**Retire `security-review`/`security-check`/`cost-report` „bo ECC ma komendę o tej nazwie".**
Odrzucone po przeczytaniu obu stron. Zbieżność jest w nazwie, nie w zakresie: AgentShield
skanuje konfigurację harnessu, nie kod aplikacji; `ecc:cost-report` czyta lokalny plik
z hooka, nasz pyta Analytics API całej organizacji. Podmiana wyglądałaby na działającą
i cicho gubiłaby to, po co te komendy powstały.

**Odłożenie decyzji do czasu zebrania telemetrii (Fala 2).** Rozważone, bo dane o realnym
użyciu komend byłyby lepszą podstawą niż macierz pokrycia. Odrzucone dla tej listy: metryki
workflow stoją od 2026-08-15 (K76) i naprawa jest przed nami, a spike dał dowód pokrycia
funkcjonalnego — czego telemetria i tak by nie zastąpiła. Telemetria zostaje warunkiem dla
pozycji spornych (`backend-technology-expert`), nie dla jednoznacznych duplikatów.
