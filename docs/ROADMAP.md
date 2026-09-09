# Roadmap: claude-patterns improvements

Implementation plan for the architecture documented in
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) and decided in
[`docs/adr/0001-extension-architecture.md`](adr/0001-extension-architecture.md).

**Status legend**: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` cancelled ·
`[-] ADR 0008` superseded by block composition

> **⚠ Ten dokument jest częściowo historyczny (przegląd 2026-08-13).** Sprinty 1-5
> powstały przed [ADR 0008](adr/0008-stack-blocks-composition.md), który zastąpił
> presety i `_stack-defaults/` kompozycją bloków. Pozycje opisujące tamten mechanizm
> są oznaczone `[-] ADR 0008` wraz z tym, co je zastąpiło — zostają w tekście, bo
> uzasadnienie decyzji bywa potrzebne, ale **nie są planem pracy**.
>
> Aktualny stan składu: [`blocks/README.md`](../blocks/README.md).
> Otwarte pozycje: [`docs/tasks/`](tasks/).

---

## Sprint 1 — Foundation

> **Reality check (2026-05-10):** Research showed Sprint 1.1 and 1.4 are
> ~75% already implemented in current `setup-project.sh` / `setup-global.sh` /
> `migrate-v2.sh`. The actual gap is **1.3** (`_stack-defaults` + orchestrator
> update) — that's what unblocks declarative "always-include patterns per
> stack" and security integration.

- [x] **1.1 Selective per-project symlinks in `setup-project.sh`** (already done)
  - Universal agents → globally via `setup-global.sh`
  - Stack agents → per-project `.claude/agents/` via `setup-project.sh`
  - Patterns → per-project selective (per stack_profile in project.yml)
  - Skills → per-project (per skills list in project.yml)
  - Stale symlink cleanup when stack changes
  - **Outstanding (optional, low priority):** per-project `.claude/commands/` and
    `.claude/output-styles/` are not auto-symlinked but Claude Code reads them
    natively — projects can opt-in by placing files

- [-] **1.2 Stack-presets as declarative YAML** (deferred — refactor only)
  - Logic exists today but hard-coded as bash `case` in `setup-project.sh`
  - Refactor to `templates/stack-presets/<stack>.yml` would clean it up
  - **Defer until adding a 7th stack profile** — current 6 work fine in bash

- [-] **1.3 Create `patterns/_stack-defaults/<stack>.yml` + orchestrator integration**
      **ADR 0008**: zastąpione przez `patterns.always` / `patterns.triggers` w blokach.
      Dobór wzorców materializuje się do `.claude/config/runtime.yml`, katalog
      `_stack-defaults/` usunięty.
  - Schema: `always_include: [list of pattern paths relative to claude-patterns/patterns/]`
  - One YAML per stack (start with nestjs-ddd, others get stub)
  - Update `/orchestrate` Phase 0.5 to read stack-defaults YAML and merge into `{PATTERNS}` list
  - Unblocks security integration (Sprint 4) and declarative per-stack defaults
  - Investment: ~2h

- [x] **1.4 Migration helper script** (already done as `migrate-v2.sh` + `migrate-all.sh`)
  - 238-line `migrate-v2.sh` handles `.claude/rules/`, `.mcp.json`, `.worktreeinclude`, CLAUDE.md regen
  - `migrate-all.sh` for batch
  - **Outstanding:** verify idempotency with newest layout, document modes in README — defer to follow-up

---

## Backward compatibility

Existing projects keep working without re-configuration. The architecture is
designed so that:

- Old global symlinks in `~/.claude/agents/` remain functional after Sprint 1
- New hooks (Sprint 2.2, 2.3, 5.1, 5.2) are no-op when project lacks PM-system
  or relevant patterns
- Skill `model:`/`effort:` overrides (Sprint 2.1) propagate via existing
  symlinks — instant for all projects
- Selective per-project symlinks (Sprint 1.1) require opt-in re-run of
  `setup-project.sh` per project

**Required after rollout**:
1. Run `setup-global.sh` once after Sprint 2 to register new hooks globally
2. Run `setup-project.sh` (or `migrate-project.sh`) per project lazily —
   only when actively working on that project

---

## Sprint 2 — Cost optimization + PM automation

Cheap wins on cost (model overrides) + PM-system automation via hooks.

- [x] **2.1 Skill `model:` / `effort:` overrides** (12 skills updated)
  - Haiku + low: `pm-status`, `task-tidy`, `claude-updates-watcher` (read-only / deterministic)
  - Opus + high: `pulse`, `sprint`, `reprioritize`, `tech-debt`, `task-health`,
    `threat-model`, `security-review`, `cost-aware-llm-pipeline`, `api-design`
    (multi-perspective / deep analysis)
  - Rest stays at default (Sonnet) — no need to declare explicitly

- [x] **2.2 `SessionStart` hook — auto-load TEAM-STATE.md**
  - New hook `hooks/session-start-pm.js` walks up from cwd looking for
    `project-orchestration/TEAM-STATE.md`
  - If found: injects content into Claude context at session start with
    staleness note (>7d old)
  - If absent: silent
  - Registered as second SessionStart entry in `hooks.json` (alongside
    existing `session-start.js` for session continuity)

- [x] **2.3 PostToolUse hook — PM auto-housekeeping**
  - New hook `hooks/pm-task-housekeeping.js` fires after Edit/Write/MultiEdit
  - Detects task file in `project-orchestration/tasks/` with `status: done`
  - Moves to `completed-tasks/`, appends entry to KANBAN.md "Recently
    Completed" section
  - Disable via `PM_NO_AUTO_HOUSEKEEPING=true` (logs warning instead)
  - Silent on non-task files; never blocks
  - Used PostToolUse (not the proposed `TaskCompleted` event) because
    PostToolUse is well-tested, deterministic, and triggers on the actual
    file mutation that signals "done"

---

## Sprint 3 — Quality of life

Visual polish and developer ergonomics.

- [x] **3.1 Statusline PM script** (`hooks/statusline-pm.js`)
  - Reads stdin payload + walks up cwd to find `project-orchestration/TEAM-STATE.md`
  - PM mode: `⚡ model | 📁 project | 🎯 active-task | 🚫 blocked | 💰 cost | 📊 ctx%`
  - Fallback (no PM): shows git branch instead
  - Smoke-tested: PM mode + no-PM mode both work
  - Activate per-project via `settings.json` → `statusLine` key

- [x] **3.2 `!` injection in analytical skills**
  - `/pulse`: recent commits + blocked count + recent task changes
  - `/task-health`: total active, status distribution, stale tasks, missing priority
  - `/tech-debt`: major/minor counts, TECH-DEBT.md size + age, debt-tagged commits
  - Pre-loaded context section sits before agent invocations — agents inherit
    the data without re-Globbing

- [x] **3.3 Output styles for strategists** (`output-styles/`)
  - `marketing-strategist.md` — hedged data-driven voice for CRO/copy/SEO/paid/growth
  - `finance-strategist.md` — confidence-signalled with calibrated regulatory disclaimers
  - `legal-strategist.md` — jurisdiction-tagged with 4-category contextual disclaimers
  - `output-styles/README.md` documents activation (per-session, per-project, per-user)
  - `setup-global.sh` symlinks output-styles/ to `~/.claude/output-styles/`

---

## Sprint 4 — Security integration (juz-ide-api proof of concept)

Concrete application of the architecture to a real use case. Tests whether
the abstractions hold up under pressure.

### claude-patterns side

- [x] **4.1 `hooks/check-security-considerations.js`** (planning-time enforce)
  - Already staged in current working tree
  - Blocks task file save without `## Security Considerations`

- [x] **4.2 `agents/stacks/nestjs-ddd/security-e2e-verifier.md`** (verification gate)
  - Already exists, currently being enriched in working tree

- [x] **4.3 `patterns/cross-layer/security-invariants-pattern.md`** (universal NestJS-DDD)
      Istnieje wraz z kartą reguł; na półce `always` bloków `nestjs`, `node` i `python`.
  - 5-point checklist: Zod schemas, @Auth, rate limit, error.message, PII in logger
  - Applies to every NestJS-DDD project (not LocalHero-specific)

- [-] **4.4 `patterns/_stack-defaults/nestjs-ddd.yml`** lists security-invariants in always-include
      **ADR 0008**: cel osiągnięty inaczej — `patterns.always` w `blocks/nestjs.yml`.
  - Depends on Sprint 1.3

### juz-ide-api side (separate repo)

- [-] **4.5 `.claude/knowledge/patterns/security/`** (LocalHero-specific patterns)
      Poza tym repo — treść projektowa `juz-ide-api`, nie centrali.
  - `civic-audience-invariants.md`
  - `teryt-raw-input.md`
  - `dual-identity.md`

- [x] **4.6 `.claude/knowledge/patterns/README.md`** (discovery hub)
      `setup-project.sh` kopiuje go z `templates/knowledge-patterns-readme-template.md`.
  - Lists all pattern categories
  - Highlights security/ as MUST-READ before controller/handler implementation
  - Quick reference table: "writing X → read Y, Z"

- [x] **4.7 One-liner update in `domain-application-implementer.md`** (in claude-patterns)
      Sekcja „Patterns — the list comes from the orchestrator" (2026-08-12).
  - Add: *"Before writing any file: read `.claude/knowledge/patterns/README.md` to discover relevant patterns, including security/."*
  - Closes fast-path gap (direct agent invocation without /orchestrate)

### Template side (claude-patterns/templates/)

- [x] **4.8 szablon README wzorców**
      Wylądował jako `templates/knowledge-patterns-readme-template.md` (inna ścieżka niż planowana).
  - Template README new projects copy as starting point for their patterns directory
  - Ensures consistency across projects

---

## Sprint 5 — Tier 2

- [x] **5.1 `PreCompact` hook** — `hooks/pre-compact-pm-snapshot.js` saves
  `project-orchestration/TEAM-STATE.md` to `_archive/snapshots/{ISO-timestamp}.md`
  before context compaction. Silent for projects without PM-system.
  Registered as second PreCompact entry alongside existing `pre-compact.js`.

- [x] **5.2 `SubagentStop` cost log** — `hooks/subagent-stop-cost-log.js`
  appends per-agent token usage (input/output/cache) + estimated cost
  (Opus/Sonnet/Haiku 2026-05 pricing) + duration + project to
  `~/.claude/logs/agent-usage.jsonl`. Disable via `AGENT_USAGE_LOG=off`.
  Used by `/cost-report` for accurate per-agent breakdown.

- [x] **5.3 `ultrathink` keyword** — added to `/sprint`, `/reprioritize`,
  `/tech-debt` skill bodies. Triggers extended thinking during
  multi-perspective analysis where the genuine cost-benefit is non-trivial
  (sprint scope trade-offs, priority dependency unlocks, debt leverage
  ranking).

- [-] **5.4 `rules/` subfolder for complex skills** — DEFERRED with
  rationale: of the proposed candidates, only `tdd-workflow` (412 lines)
  qualifies as complex enough; `code-review` (44 lines) and `sprint`
  (99 lines) are short. Rules/ subfolder pattern in Claude Code is
  soft-supported (works but not first-class). Without a concrete pain
  point, refactor would be cosmetic. Revisit if a skill grows past
  600 lines or a real discovery problem emerges.

---

## Sprint 6 — Cross-instance broadcast (ADR-0006) — RETIRED 2026-09-07 (K99)

> Pilot zamknięty bez go: zero wpisów na kanale, kill-switch 2026-08-09. Kod w historii gita
> (`4d4eac5`), decyzja w ADR 0006 (`Status: retired`) i DECISIONS-LOG. Treść poniżej historyczna.

Task: [`docs/tasks/TASK-BROADCAST-001.md`](tasks/TASK-BROADCAST-001.md) (status `blocked`) ·
Spec: [`docs/adr/0006-cross-instance-broadcast.md`](adr/0006-cross-instance-broadcast.md)
— status `proposed`. Kanał wymiany informacji między równoległymi instancjami Claude Code
(`juz-ide-api-1..4` na czterech branchach dowiadują się o swoich decyzjach dopiero przy
merge). **Wszystko additive i domyślnie wyłączone**: brak `.claude/config/broadcast.yml`
(gitignored) = system nie istnieje dla danej instancji. Rollback = `rm -rf` jednego
katalogu poza repo.

Pilot: `juz-ide-api`, `juz-ide-mobile-app`, `claude-patterns` (OQ1 rozstrzygnięte —
tabela własności + gotowe manifesty w ADR).

**Cały kod powstaje w `claude-patterns`.** Repo serwisowe dostaje wyłącznie
`.claude/config/broadcast.yml` — plik nieśledzony przez gita (wykluczenie w
`.git/info/exclude`, per klon, więc **zero zmian śledzonych** w repo serwisowym).
Stan runtime leży w `/opt/projects/.claude-swarm/`, poza wszystkimi repozytoriami.

- [x] **6.1 Kanał + `/broadcast` + `/broadcast-status`** — ZAIMPLEMENTOWANE 2026-08-08
  (`hooks/lib/broadcast/{paths,ulid,yaml,manifest,schema,channel,cursor,claim,cli}.js`,
  `commands/broadcast{,-status}.md`, `hooks/broadcast-{session-start,task-emit}.js`,
  `templates/broadcast/broadcast.yml`, wpisy w `hooks/hooks.json`). Reguły D1/D4/D5/D9/D11
  wymuszane w CLI, nie w prompcie. **Kryterium go/no-go jeszcze NIE oceniane** — zegar
  dwóch tygodni startuje z chwilą włączenia manifestów w repach pilota (6.2).
  Oryginalny zakres: — `hooks/lib/broadcast/`
  (segmenty dzienne `events-YYYY-MM-DD.jsonl` w `/opt/projects/.claude-swarm/`, kursory,
  claim `O_EXCL`, walidacja schematu v1), `commands/broadcast.md`,
  `commands/broadcast-status.md`, `hooks/broadcast-session-start.js` (odczyt),
  `hooks/broadcast-task-emit.js` (`PostToolUse` na `tasks/` — przypomnienie o emisji).
  Blokada: **brak** — OQ4 rozstrzygnięte (D11: `severity` decyduje o torze dostarczenia).
  **Kryterium go/no-go po 2 tyg.**: ≥1 wpis, który realnie zapobiegł pracy na
  nieaktualnym założeniu, i ≥30% wpisów ocenionych jako trafne. Poniżej progu —
  porzucamy całość kosztem jednego katalogu i dwóch komend.

- [x] **6.2 `setup-project.sh` — wybór komponentów** — ZAIMPLEMENTOWANE 2026-08-08.
  Sekcja `[7b/8]`, trzy drogi włączenia (blok `broadcast:` w `project.yml`,
  `--with-broadcast`, `--interactive`), woła `cli.js init` + `cli.js install-hooks`.
  **Hooki wpinane PER PROJEKT** do `.claude/settings.local.json` (decyzja 2026-08-08),
  nie globalnie i nie do śledzonego `settings.json` — wycofanie: `install-hooks --remove`.
  Pilot włączony 2026-08-08 w 6 instancjach; zegar go/no-go liczy się od tej daty.
  Zweryfikowane: bez flag `stdout` i drzewo plików identyczne z wersją sprzed zmiany
  (jedyne różnice to timestamp generacji CLAUDE.md i nazwa katalogu testowego).
  **Uwaga do ADR**: sekcja dopisuje wpis do `.git/info/exclude`, **nie do `.gitignore`**
  (ADR w tym miejscu mówił „dopisująca wpis do `.gitignore`" — sprzeczność z własnym D3).
  Zostało: założenie manifestów w repach pilota.
  Oryginalny zakres:
  manifest z szablonu (`templates/broadcast/broadcast.yml`), dopisująca wpis do
  `.gitignore` i tworząca `/opt/projects/.claude-swarm/`. Trzy drogi: blok `broadcast:`
  w `project.yml`, flaga `--with-broadcast`, tryb `--interactive` z menu dodatków.
  **Warunek konieczny: uruchomienie bez flag zachowuje dzisiejsze zachowanie bit w bit.**

- [x] **6.3 Stand-by w `juz-ide-api-1` — TYLKO LOG DO TERMINALA** — ZAIMPLEMENTOWANE
  2026-08-08. `skills/orchestration/broadcast-standby/SKILL.md` (podlinkowany do
  `juz-ide-api-1/.claude/skills/`, katalog gitignorowany). Obie blokady zdjęte:
  **kill-switch** = `cli.js stop|resume` + plik `/opt/projects/.claude-swarm/STOP`
  sprawdzany przez `gate` PRZED manifestem (działa też jako gołe `touch STOP`);
  **granica uprawnień** = `claude --disallowed-tools Edit Write` — zweryfikowane, że
  narzędzia znikają z sesji całkowicie i `--permission-mode acceptEdits` tego nie omija
  (`--settings` okazał się niepotrzebny). Uruchomienie: `/loop 3m /broadcast-standby`.
  **Nie odpalony jeszcze na stałe** — czeka na materiał w kanale (ocena filtra na pustym
  kanale niczego nie zweryfikuje).
  Oryginalny zakres:
  `skills/orchestration/broadcast-standby/`, uruchamiany przez `/loop` w osobnym oknie tmux,
  read-only. **Zero wstrzykiwania, zero inboxa czytanego przez implementera.** Agent wypisuje
  w swoim oknie: wpis, przypisaną `severity` (D11), decyzję `ignore`/`ack`/`escalate`
  i jedno zdanie uzasadnienia. Tick robi zerokosztowy check shellowy (rozmiar segmentów vs
  kursor) — pełna ocena rusza wyłącznie, gdy są nowe bajty; pusty przebieg to minimalna
  tura, nie zero. Interwał wyjściowy 3 min (OQ3, kalibracja na danych).
  **Bramka do 6.4**: czy `critical` faktycznie były krytyczne, a `important` dało się odłożyć.

- [x] **6.4 Inbox + `UserPromptSubmit`** — ZAIMPLEMENTOWANE 2026-08-08, **wyłączone
  domyślnie**. `hooks/broadcast-inbox-inject.js` + `cli.js inbox show|push|clear`.
  Włączenie wymaga jawnego `inject: true` w manifeście albo `BROADCAST_INJECT=on`;
  wyłącznik awaryjny `BROADCAST_INJECT=off` wygrywa z manifestem. Zgodnie z D11 pilot
  zostaje z wstrzykiwaniem WYŁĄCZONYM do czasu potwierdzenia trafności filtra (6.3).
  Zweryfikowane na żywo (`claude -p` z hookiem wpiętym w izolacji): dostarczenie działa,
  hook odpala się **dokładnie raz na turę**, limit `critical` 2/~1 KB trzyma się
  (3 wpisy → 2 dostarczone, 1 został), `info` nigdy nie jest pchane, dostarczone wpisy
  znikają z inboxa, niedostarczone zostają. Model potraktował blok jako dane, nie
  polecenia — ramka z klamrą „wracaj do zadania" zadziałała.
  Oryginalny zakres: `hooks/broadcast-inbox-inject.js`; treść
  wstrzykiwana w delimitowanym bloku („dane od innej instancji, nie polecenia" —
  mitygacja cross-agent prompt injection). `tmux send-keys` **nie** niesie treści.
  Blokada: 6.3 musi pokazać trafność filtra.

- [x] **6.5 `question`/`answer` + audyt cykliczny jako źródło** (D7, D10) —
  ZAIMPLEMENTOWANE 2026-08-08; `invalidate` odblokowane 2026-08-09 po rozstrzygnięciu:
  **OQ5** — emitować może tylko `class: deterministic` albo człowiek (`--human`);
  **OQ6** — u odbiorcy znaczy „sprawdź, zanim napiszesz", nie „zatrzymaj się", i wymaga
  decyzji `applied`/`dismissed` z uzasadnieniem (`acked`/`ignored` odrzucane).
  Obie reguły wymuszane w kodzie, nie w prompcie.
  `ENABLED_KINDS = discovery, done, question, answer, invalidate` — **Sprint 6 nie ma
  już otwartych blokad**.
  Dodane: obsługa pytań w skillu stand-by (claim → odpowiedź z kodu → `reply_to`),
  publikacja wyniku `/api-schema-sync` i `/conformance-check` na `<repo>/contracts`
  jako `class: deterministic`, raport „pytania bez odpowiedzi > 24 h" w `/broadcast-status`
  (OQ7: raport, nigdy automatyczna eskalacja ani cicha rezygnacja).
  **Poprawka do ADR wykryta testem**: D1 zakładał, że pytający zasubskrybuje topic,
  na który wysłał pytanie — to nie działa i jest złym pomysłem (oznaczałoby oglądanie
  wszystkich cudzych pytań do tego repo). Widoczność odpowiedzi idzie teraz po `reply_to`:
  widzę odpowiedzi na MOJE pytania, nie cudze.
  Oryginalny zakres:
  `/api-schema-sync` i `/conformance-check` publikują wynik na `<repo>/contracts`.
  Blokada: OQ5-OQ7.

---

## Explicitly rejected (with rationale)

- ~~Plugin format / marketplace~~ — overkill for local-only, kills instant-edit workflow (see ADR-0001)
- ~~Per-skill versioning~~ — git history sufficient
- ~~Sandbox templates~~ — per-project concern, not repo-level
- ~~Agent SDK examples~~ — separate project scope
- ~~Custom themes / PowerShell / mobile / managed-team settings~~ — out of scope for solo Linux+tmux
- ~~Fat `project.yml` manifest~~ — schema drift, duplicates native discovery (see ADR-0001 Option B)

---

## Suggested order

> **Nieaktualne poza Sprintem 6.** Sprinty 1-5 są zamknięte albo zastąpione przez
> ADR 0008 — kolejność niżej opisuje, jak planowano dojść do stanu, który już jest.
> Bieżące priorytety trzymamy w [`docs/tasks/`](tasks/).

1. **Sprint 1 first** (foundation) — 1.1 → 1.2 → 1.3 in sequence
2. **Sprint 2** (cost wins) — 2.1 (cheapest) → 2.2 → 2.3
3. **Sprint 4** (security) — can run in parallel with Sprint 3 since it
   touches different files
4. **Sprint 3** (QoL) — when convenient
5. **Sprint 5** — opportunistic
6. **Sprint 6** (broadcast) — dopiero po odpowiedzi na OQ4. Twarda bramka: 6.1 nie
   przechodzi dalej bez spełnionego kryterium go/no-go — reszta sprintu nie ma wtedy
   czego przenosić.

---

## Poza tym repo — praca w `juz-ide-api` (NIE należy do Sprintu 6)

**Migracje bez sekwencyjności** (ADR-0006 D0) — timestamp/ULID w nazwie migracji zamiast
„następny wolny numer" + `migration-registration.guardian.spec.ts`. ADR mówi wprost, że
**migracje NIE są przypadkiem użycia broadcastu** (to alokacja współdzielonego zasobu, nie
deficyt informacji), więc ta praca nie należy ani do Sprintu 6, ani do tego repozytorium —
dotyczy konwencji migracji w `juz-ide-api` i tam powstaje task.

Pilność jest niezależna od broadcastu: w backlogu `juz-ide-api-1` udokumentowano **pięć
kolizji numeracji** rozwiązanych ręcznym przenumerowaniem (202→204, 211→219, 191-193→198-200,
175-177→176-178, 233/234→235/236 z 2026-08-02), a co najmniej cztery zaplanowane taski
(`TS-TOKEN-TOPUP-001`, `TS-GEO-026`, `TS-ORG-ACTOR-TYPE-ALPHABET-001`,
`TS-DB-DEAD-TABLES-AUDIT-001`) wezmą kolejne numery. Blokada: OQ2.

Each sprint should be a separate atomic milestone with its own commit.
