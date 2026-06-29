# Refactor Analysis — claude-patterns → ECC-inspired + Loops

> Status: ANALIZA (nie implementacja). Data: 2026-06-27.
> Cel: ocena obecnego setupu vs ECC (affaan-m/ECC, 211K★), wskazanie kierunku
> refaktoru ze skłonieniem ku ECC, oraz wprowadzenie konceptu **loops**.

---

## 1. Stan obecny — claude-patterns (v3.5)

**Czym jest:** lokalne single-source-of-truth, dystrybuowane przez **symlinki**
do `~/.claude/` i `project/.claude/`. Mocno wyspecjalizowane pod **nestjs-ddd**.

**Inwentarz:** 72 patterns, 25 agentów (11 universal + 14 stack), 178 skills
(większość vendorowana: 41 marketing + 84 finance + 12 legal), ~30 hooks,
25 commands, stack profiles via `project.yml`.

### Mocne strony (realne, warte zachowania)
- **Symlink propagation** — edycja raz, natychmiast we wszystkich projektach. Zero publish-cycle.
- **Stack-awareness** — selektywne linkowanie patterns/agentów/hooków per `stack_profile`.
- **Grounding + delegation enforcement** — `check-patterns-read.js` + `check-delegation.js`
  + `lib/pattern-routing.js` + Pattern Rule Cards (`_summary.md`). To nasz najmocniejszy,
  unikalny wynalazek — wymusza, że implementacja jest osadzona w kanonicznych wzorcach.
- **/orchestrate** — dojrzały pipeline Phase 0–4 (security pre-flight → pattern discovery →
  implement → verify (VETO) → security (VETO) → docs gate). Zero-implementation delegator.
- **Cost discipline** — Haiku dla read-only (state-reader, changelog-bot), Opus dla architektury.
- **PM system** — TEAM-STATE.md jako wspólny mózg + event-driven hooks.

### Słabe strony / luki
- **Single-harness** — działa tylko na Claude Code. Brak portability.
- **Pattern routing prymitywny** — `.includes()` string-matching, kruchy dla nested paths.
- **Hook sprawl** — 30+ hooków, dużo zmiennych env, trudne debugowanie, brak profili (minimal/strict).
- **Learning niedojrzały** — instinct system zaprojektowany, ale deployment/integracja niejasne.
- **Brak loops** — to największa luka funkcjonalna (patrz §4). Mamy `verification-loop` skill,
  ale to liniowy checklist, nie autonomiczna pętla.
- **Brak security scanningu** — żadnego odpowiednika AgentShield (skan promptów/hooków/MCP).
- **Stack defaults niekompletne** — tylko nestjs-ddd ma pełny `_stack-defaults/*.yml`.
- **Brak walidacji** — żadnych JSON Schema dla agentów/skills/hooków → ciche błędy formatu.

---

## 2. ECC — co czyni go masterpiece

**Czym jest:** **harness-native operator system** — nie kolekcja configów, lecz
**system operacyjny dla agentów**. 67 agentów, 271 skills, 92 commands, działa na
**7+ harnessach** (Claude Code, Codex, Cursor, OpenCode, Gemini, Zed, Copilot).
Dystrybucja przez **npm** (`ecc-universal`, `ecc-agentshield`) + GitHub App + plugin.

### Architektoniczne wyróżniki (czego nam brakuje)

1. **Cross-harness portability layer.** Jedno `SKILL.md` działa na wszystkich harnessach.
   Adaptery (`.codex/`, `.cursor/`, `.opencode/`, `.zed/`…) tylko na *krawędzi*.
   Reguła: jeśli zmiana wymaga edycji 3 kopii → shared source w `skills/`, adapter na brzegu.

2. **Manifest-driven install** (`manifests/install-modules.json`). Modularna instalacja:
   `rules-core`, `agents-core`, `hooks-runtime`, `capability:*`. Profile (minimal/standard/strict),
   per-target, dependency graph, SQLite state-store. My mamy bash `case $STACK`.

3. **Schemas-as-contracts** (`schemas/*.json`, 10 plików). JSON Schema waliduje install,
   hooki, MCP, plugin metadata, provenance. Format-błędy łapane wcześnie.

4. **Memory & continuous learning jako first-class.** `hooks/memory-persistence/`:
   `session:start` (bounded context, `ECC_SESSION_START_MAX_CHARS`), `pre:compact` (save state),
   `pre:observe` (capture tool intent), `session:end` (persist). **Instincts** =
   curated knowledge z repo-curation (confidence-scored, inherited + personal).

5. **AgentShield** (osobny npm). Security scanning: secrets, prompt-injection,
   MCP poisoning, taint analysis, sandbox, policy packs, SARIF/HTML/JSON reports,
   fleet-level aggregation. **Research-first** (CVE-2025-59536, Snyk ToxicSkills 36%, Hunt.io).

6. **Hook profiles + dispatcher.** `ECC_HOOK_PROFILE=minimal|standard|strict`,
   `ECC_DISABLED_HOOKS`, jeden `pre-bash-dispatcher.js` zamiast wielu rozproszonych hooków.
   Bootstrap resolver (`CLAUDE_PLUGIN_ROOT` → install → cache → homedir).

7. **Governance & SOUL.** `SOUL.md` (5 zasad: Agent-First, Test-Driven, Security-First,
   Immutability, Plan-Before-Execute), `RULES.md`, `WORKING-CONTEXT.md` (current execution state),
   `RULES.md` Must-Always/Must-Never. Tożsamość systemu, nie luźne instrukcje.

8. **Multi-LLM abstraction** (`src/llm/`): Claude, OpenAI, Ollama, Atlas, Astraflow.
   Loops mogą używać różnych modeli/dostawców per stage.

9. **ecc2** — alpha Rust control-plane (operator surface dla sesji, kolejek, evidence).

---

## 3. Porównanie head-to-head

| Wymiar | claude-patterns | ECC | Werdykt |
|---|---|---|---|
| Dystrybucja | symlinki (lokalne) | npm + plugin + manifest | ECC skaluje, my prostsi |
| Harness | tylko Claude Code | 7+ (cross-harness) | **ECC** |
| Grounding/delegation | **silny** (rule-cards + hooki) | słabszy (instinct/rules) | **MY** ⭐ |
| Orchestration | /orchestrate Phase 0–4 (dojrzały) | orch-pipeline + loops | remis / ECC w loops |
| Stack specjalizacja | **głęboka** (DDD, VETO verifiers) | szeroka, płytsza | **MY** dla DDD |
| Loops / autonomia | **brak** | 6 patterns + loop-operator | **ECC** ⭐ |
| Memory/learning | zaprojektowane, niedojrzałe | first-class, działające | **ECC** |
| Security scanning | brak | AgentShield | **ECC** |
| Walidacja (schemas) | brak | 10 JSON Schema | **ECC** |
| Hook management | sprawl, env-vary | profile + dispatcher | **ECC** |
| Vendored skills | 178 (marketing/finance/legal) | 271 (szeroki ekosystem) | remis |
| Tożsamość/governance | CLAUDE.md | SOUL/RULES/WORKING-CONTEXT | **ECC** |

**Wniosek:** ECC wygrywa systemowo (infrastruktura, skala, loops, memory, security).
My wygrywamy w **głębi domenowej** (DDD-grounding + delegation enforcement + VETO verifiers) —
to nasz moat, którego ECC NIE ma i którego nie wolno zgubić w refaktorze.

---

## 4. LOOPS — koncept, mechanizm, dlaczego to game-changer

### 4.1 Czym jest loop (rynek, 2026)
"Loop engineering" to nowa meta agentowego kodowania (po prompt-engineering →
context-engineering → **loop-engineering**). Rdzeń to technika **Ralph** (Geoffrey Huntley,
early 2026): uruchom agenta w zwykłym `while`-loop, podawaj **ten sam prompt** względem
spisanego spec/PRD, agent robi **jedno zadanie i commit**, potem **świeża instancja z czystym
kontekstem** dostaje identyczny prompt — aż success criteria spełnione.

**Kluczowa intuicja:** nie zmuszaj jednego agenta do pracy w coraz dłuższym, zaśmieconym
kontekście. Każda iteracja = nowy czysty kontekst + jedno zadanie = czysta historia git +
punkty rollback. W **czerwcu 2026 Claude Code dodał natywne `/loop`, `/goal`, `/batch`** —
zamieniając hand-rolled hack w wspieraną funkcję.

**5 filarów dobrego loopa:** (1) cel z **testowalnym** warunkiem stopu, (2) narzędzia,
(3) zarządzanie kontekstem (świeży per iteracja), (4) jawne exit-y (anty-infinite),
(5) error-handling + **weryfikator oddzielony od wykonawcy**.

> "Done" musi być zdefiniowane PRZED napisaniem loopa. "All tests pass + no lint errors"
> to warunek stopu. "Code looks good" — nie. LLM nie ma wbudowanego pojęcia "done".

### 4.2 Jak ECC realizuje loops (6 wzorców, od prostego do RFC-DAG)

1. **Sequential pipeline** (`claude -p` chain) — każdy krok izolowany kontekst, brak bleedu.
2. **NanoClaw REPL** — session-aware, historia w `~/.claude/claw/{session}.md`.
3. **Infinite agentic loop** — two-prompt orchestrator → N równoległych sub-agentów.
4. **Continuous PR loop** — branch → `claude -p` → CI → auto-fix → merge → repeat;
   limity `--max-runs/--max-cost/--max-duration`; `SHARED_TASK_NOTES.md` jako most kontekstu.
5. **De-sloppify** — dedykowany cleanup-pass (dwa focused agenty > jeden constrained).
6. **Ralphinho / RFC-DAG** (zaawansowany) — RFC → dekompozycja na work-units z dependency DAG →
   **Ralph loop (max 3 passes)** per warstwa → quality pipeline per unit w **osobnym worktree**
   (research→plan→implement→test→review, głębokość wg tieru) → **merge queue z eviction**
   (konflikt/fail → eviction z pełnym kontekstem → re-run w następnym passie).

**Krytyczna zasada ECC:** każdy stage w **innym context window / innym modelu** →
reviewer nigdy nie pisał kodu, który recenzuje → **eliminacja author-bias**.

### 4.3 Sterowanie i bezpieczeństwo loopów (to robi ECC dojrzale)
- **loop-operator agent**: required checks przed startem (quality gates ON, eval baseline,
  rollback path, branch/worktree isolation). Escalation gdy: brak progresu przez 2 checkpointy,
  powtarzalne identyczne stack-trace, cost-drift poza budżet, merge-conflict blokuje kolejkę.
- **Stall detection** (`scripts/loop-status.js`): pending Bash > 1800s, overdue wakeup,
  transcript parse errors → status `attention` + rekomendacja interwencji.
- **Evals jako bramka**: pass@k vs pass^k, binary/scalar/rubric graders, verification-loop
  6-fazowy (build→type→lint→test→security→diff), **Santa loop** (dual-model adversarial,
  obaj muszą PASS, świeży reviewerzy co rundę, max 3).

### 4.4 Dlaczego to "wynosi tworzenie kodu na wyższy poziom"
Nasz `/orchestrate` to **jeden przebieg** (implement→verify→review). Loop dokłada
**iterację do skutku** z czystym kontekstem i automatycznym recovery: agent pracuje
"while you sleep", a quality-gate + eval + human-at-leverage-point gwarantują, że
"done" coś znaczy. To naturalne rozszerzenie naszego pipeline'u, nie zastąpienie.

---

## 5. Docelowa architektura — ECC jako baza, my jako overlay domenowy

> Rewizja po analizie modelu rozszerzalności ECC. Wcześniejszy pomysł "ewolucja in-place +
> cherry-pick" jest **odrzucony**: skazywałby nas na wieczne reimplementowanie tego, co
> full-timer (222k★) i tak robi lepiej. Skoro ECC jest *zaprojektowany* jako rozszerzalna baza,
> właściwy ruch to się na nim **oprzeć**, nie konkurować z nim.

### 5.1 Decyzja fundamentalna: NIE hard-fork, lecz OVERLAY

ECC (MIT) używa **namespaced overlay model** + **install-state z `ownership: managed`**:
- ECC instaluje się do namespace'ów `/ecc` (`~/.claude/skills/ecc/`, `agents/ecc/`, `rules/ecc/`…).
- Upgrade dotyka **wyłącznie** plików `ownership: managed`. Wszystko poza `/ecc` jest **nietykalne**.
- → Możemy nadążać za upstream ECC, a nasze rzeczy żyją obok i przeżywają każdy update.

**Werdykt o forku:** hard-fork = śmierć przez staranie (hobby vs full-time). Overlay = jeździmy
na ciągłym rozwoju ECC za darmo. Fork rozważyć **tylko** gdyby ECC zmienił licencję lub umarł.

### 5.2 Nowa tożsamość claude-patterns

> **claude-patterns przestaje być samodzielnym systemem. Staje się opinionated
> DDD/domain capability-pack (overlay) nad ECC.**

```
WARSTWA 1 — ECC (baza, upstream, npm/plugin)        ← nie utrzymujemy, konsumujemy
  agents/ecc/  skills/ecc/  rules/ecc/  hooks(ecc)
  loops (loop-operator, autonomous-loops, /loop-start)
  memory/instincts, schemas, hook-profiles, AgentShield, cross-harness

WARSTWA 2 — nasz overlay (claude-patterns v4 = "ddd-pack")   ← TO utrzymujemy
  agents/ddd/        VETO verifiers (nestjs-ddd, flutter, next…)
  skills/ddd-*/      /orchestrate-ddd, threat-model, finance/legal/marketing packs
  rules/nestjs-ddd/  patterns + Pattern Rule Cards (_summary.md)
  hooks/ddd-*        check-delegation, check-subagent-pattern-reads, pattern-routing

WARSTWA 3 — projekt (per-repo)                        ← instance data
  project.yml (stack_profile), TEAM-STATE.md, tasks/
```

### 5.3 Co przeżywa, co retiré, co weryfikujemy

**KEEP — to nasz moat, portujemy na prymitywy ECC jako overlay:**
- Pattern Rule Cards + `check-delegation.js` + `check-subagent-pattern-reads.js` + `pattern-routing.js`
  (ECC tego NIE ma — kandydat do PR upstream, patrz §5.5).
- VETO verifiers per stack — głębsze niż generyczne reviewery ECC.
- 72 patterns DDD + threat-model + security-review (STRIDE/DREAD/LINDDUN) — domenowe, nie ma w ECC.
- /orchestrate Phase 0–4 — ale przebudowany jako **specjalizacja**, która deleguje do loopów ECC (§5.4).

**RETIRE — przestajemy utrzymywać, bierzemy z ECC:**
- Generyczni agenci (planner/architect/code-reviewer/language-reviewers) → ECC ma lepszych.
- Loops (cały) → ECC `loop-operator` + 6 wzorców. NIE reimplementujemy.
- Memory/instincts/learning → dojrzałe w ECC. Porzucamy nasz niedojrzały.
- Hook-profiles/dispatcher, schemas, install/manifest, security-scan, cross-harness → ECC.
- Generyczne rules (coding-style/git/testing) → `rules/ecc/common`.

**VERIFY przed retiré (overlap audit):**
- Vendored skills (marketing 41 / finance 84 / legal 12) vs 271 skills ECC — sprawdzić pokrycie.
  Prawdopodobnie **zostają jako nasz overlay** (to domain-packs), ale potwierdzić brak duplikacji.
- Symlink vs ECC install — patrz §5.6 (hybryda).

### 5.4 Headline win: loops × nasze domain-enforcement

To jest sedno "next-level". Łączymy **silnik loopów ECC** z **naszym egzekwowaniem domeny**:

> **Autonomiczny DDD-loop**: Ralphinho RFC-DAG (worktree isolation, merge-queue z eviction,
> stall-detection, multi-model stages) ZE STAGE'AMI = nasze: research grounded w Rule Cards,
> implement gated przez `check-delegation`/`check-subagent-pattern-reads`, review = nasze **VETO
> verifiers**, eval = nasz security-review jako warunek stopu.

ECC daje pętlę i recovery; my dajemy "co znaczy *poprawnie* w DDD". Żadne z osobnych repo tego
nie ma — to kombinacja jest masterpiece. Plus natywne CC `/loop` `/goal` `/batch` jako warstwa UX.

### 5.5 Dźwignia strategiczna: kontrybucja upstream

Generyczne innowacje (Pattern Rule Cards grounding, delegation enforcement) → **PR do ECC**.
Wtedy full-timer utrzymuje je za nas, a nasz overlay chudnie do czysto-domenowego DDD.
Niszowe DDD/VETO zostają lokalne. Maksymalna dźwignia: pushujemy generyczne w górę, trzymamy niszę u siebie.

### 5.6 Dystrybucja (rewizja decyzji "local-only")

Hybryda: **ECC przez npm/plugin** (managed, `/ecc` namespaces, upgrade `ecc install`); **nasz overlay
przez własny install-script/symlink** do własnych namespace'ów (zachowuje instant-propagation dla
NASZYCH rzeczy). To unieważnia starą notatkę "local-only / no plugin" — baza idzie z plugin/npm,
overlay zostaje lokalny.

### 5.7 Kształt migracji (fazy architektoniczne, nie taski)

1. **Faza 0 — Spike & overlap audit.** Zainstalować ECC obok (test sandbox), zmierzyć realne pokrycie
   ECC vs nasze skills/agents/patterns. Potwierdzić listę KEEP/RETIRE empirycznie.
2. **Faza 1 — Baza.** ECC jako warstwa 1. Nasze rzeczy do namespace'ów overlay (`agents/ddd/` itd.).
   Retiré generyków. Wszystko nadal działa na Claude Code.
3. **Faza 2 — Loops × domena.** Spiąć nasze VETO verifiers + Rule Cards jako stage'e w loopach ECC.
   Przebudować /orchestrate na specjalizację delegującą do `loop-operator`.
4. **Faza 3 — Upstream & polish.** PR generyków do ECC. Dokumentacja overlay. Opcjonalnie cross-harness
   (jeśli realnie używamy Codex/Cursor). SOUL/RULES dla overlay.

---

## 6. Otwarte decyzje (moja rekomendacja + co naprawdę wymaga Twojego głosu)

Nie pytam już o szczegóły taktyczne — kierunek jest jasny (overlay na ECC). Realnie otwarte:

1. **Overlap audit przed cięciem.** REKOMENDACJA: zacząć od Fazy 0 (spike), zanim cokolwiek
   wyrzucimy. Empiria > założenia o tym, co ECC pokrywa. (To naturalny następny krok — bez ryzyka.)
2. **Cross-harness: in/out.** REKOMENDACJA: out na start (zostajemy Claude Code), wejść później
   jeśli realnie sięgniesz po Codex/Cursor. Nie blokuje overlayu.
3. **Upstream PR generyków:** czy chcesz w ogóle kontrybuować do ECC (dźwignia, ale cedujesz kontrolę
   i ujawniasz know-how), czy trzymać Rule Cards jako prywatny moat overlayu. To decyzja "wartości".
4. **Tempo:** Faza 0 jako następny krok teraz, czy najpierw dopracować samą analizę/ADR.

---

## 7. Integracja techniczna — jak fizycznie połączyć ECC + nasz overlay

### 7.1 Warstwy ładowania w Claude Code (kontrakt, na którym budujemy)
Claude Code rozwiązuje zasoby w 3 warstwach, precedence rośnie w dół:
```
PLUGINY (~/.claude/plugins/)   → agenci/skille/komendy NAMESPACED (ecc:tdd), hooki z hooks.json
USER GLOBAL (~/.claude/)        → agents/ skills/ commands/ settings.json(hooks) CLAUDE.md
PROJEKT (<repo>/.claude/)       → to samo, NAJWYŻSZY priorytet; hooki MERGOWANE z wyższymi
```
Hooki ze WSZYSTKICH warstw się sumują (plugin + user + projekt). To klucz: ECC jako plugin
wnosi hooki globalnie, my wnosimy DDD-hooki **per-projekt** (project settings.json).

### 7.2 Model docelowy: ECC=plugin (globalnie) + nasz overlay=per-project installer
- **ECC = plugin** (potwierdzone: `.claude-plugin/plugin.json`, `marketplace.json`, slug `ecc@ecc`):
  ```
  /plugin marketplace add affaan-m/ECC
  /plugin install ecc@ecc            # baza dla wszystkich projektów; update: /plugin update ecc
  ```
  ECC żyje w `~/.claude/plugins/ecc/`, namespaced `ecc:*`, hooki samo-rozwiązują `CLAUDE_PLUGIN_ROOT`.
- **Nasz overlay = preset-materializer** (ewolucja istniejącego `setup-project.sh`): czyta `project.yml`,
  i dla danego `stack_profile` symlinkuje NASZE rzeczy do `<repo>/.claude/` + pisze project `settings.json`
  z DDD-hookami. Per-projekt → DDD-hooki odpalają się TYLKO w projektach DDD (nie globalnie).

**Dlaczego nie nasz-overlay-też-jako-plugin:** pluginy są globalne i nie robią per-projektowej
selekcji presetu (nestjs-ddd vs flutter). Nasza wartość = właśnie per-project specjalizacja, którą
już mamy. (Overlay można dodatkowo wystawić jako plugin później, do dzielenia się — opcjonalnie.)

### 7.3 Jak to wygląda w projekcie (fizycznie)
```
~/.claude/
  plugins/ecc/…                         ← ECC plugin (managed /plugin, ecc:*)
  CLAUDE.md                             ← cienki: "ECC base + DDD overlay"

<repo>/.claude/
  config/project.yml                    ← stack_profile: nestjs-ddd; ecc_profile: developer
  agents/ddd/*        → symlink → claude-patterns/agents/stacks/nestjs-ddd/   (nasze VETO verifiers)
  knowledge/patterns/ → symlinks → claude-patterns/patterns/{domain,application,…} (+ _summary cards)
  rules/nestjs-ddd/   → symlink → claude-patterns/rules/nestjs-ddd/
  skills/ddd-*        → symlinks (tylko nasze; skille ECC przychodzą z pluginu)
  settings.json                         ← nasze DDD-hooki (check-delegation…) PROJECT-SCOPED
```
Brak kolizji nazw: ECC = `ecc:*`, nasze = `ddd-*`. Gdzie chcemy nadpisać opinię ECC — projekt-level
shadowuje plugin (lub wyłączamy konkretny hook ECC przez `ECC_DISABLED_HOOKS`).

### 7.4 Presety jako deklaratywny manifest (nasz "produkt")
Zamiast `case $STACK_PROFILE` w bashu — deklaratywny plik per preset (wzorem manifestów ECC):
```yaml
# claude-patterns/presets/nestjs-ddd.yml
name: nestjs-ddd
requires_ecc:                       # czego oczekujemy od bazy ECC
  profile: developer
  modules: [lang:typescript, capability:orchestration, hooks-runtime]
overlay:                            # co materializujemy do <repo>/.claude/
  agents:   [stacks/nestjs-ddd/]
  patterns: [domain/, application/, infrastructure/, architecture/]
  rules:    [nestjs-ddd/]
  skills:   [security/threat-model, orchestration/orchestrate-ddd]
  hooks:    [check-delegation, check-subagent-pattern-reads, pattern-routing]
loop:                               # jak domena wpina się w pętle ECC (§7.5)
  engine: ecc:loop-operator
  stages:
    review: [ddd-code-quality-verifier, ddd-security-e2e-verifier]   # nasze VETO
    gate:   security-review                                          # warunek stopu
```
Installer (`setup-project.sh` v2) czyta to → symlinkuje overlay → pisze project `settings.json`.
Nowy preset (flutter/next/python) = nowy plik YAML, ta sama maszyneria.

### 7.5 Wpięcie domeny w loops ECC (headline)
ECC-plugin daje `ecc:loop-operator` + skill `autonomous-loops` + `/loop-start` (+ natywne CC `/loop`/`/goal`).
Nasz `/orchestrate-ddd` (komenda w overlay) staje się **cienką specjalizacją**:
- buduje runbook pętli (continuous-PR lub RFC-DAG z ECC), ale wstrzykuje NASZE stage'e:
  research grounded w Rule Cards (`_summary.md`), review = nasze VETO verifiers (Task →),
  warunek stopu = nasz `/security-review` PASS.
- mechanicznie: skill wywołuje `Task(ecc:loop-operator, …)` z naszymi agentami jako stage'ami,
  albo ustawia natywny `/goal` z acceptance = security-review-pass i używa silnika pętli ECC.

### 7.6 Update / propagacja
- ECC: `/plugin update ecc` → nowa baza, overlay nietknięty (inne katalogi/namespace).
- Overlay: `git -C claude-patterns pull` → symlinki działają natychmiast; nowe agenty/skille wymagają
  re-runu `setup-project.sh` (dodaje brakujące symlinki).

### 7.7 Realne ryzyko do rozbrojenia w Fazie 0
Podwójne bramki PreToolUse: ECC ma `gateguard-fact-force` (blok pierwszego Edit per plik) + my mamy
`check-delegation`. Oba odpalą → agent może trafić na dwie bramki. Decyzja w Fazie 0: które gate'y ECC
wyłączyć (`ECC_DISABLED_HOOKS`), a które nasze zostawić dla plików wzorcowych.

---

## 8. Dyspozycja obecnego dobytku (RETIRE → ECC / KEEP → overlay / AUDIT)

> Zasada: generyczne → ECC, domenowe/moat → overlay. **Żelazna kolejność: NIE kasować przed
> potwierdzeniem pokrycia ECC w Fazie 0.** AUDIT = do empirycznego potwierdzenia.

| Kategoria | RETIRE → ECC | KEEP → overlay | AUDIT |
|---|---|---|---|
| Agents | security-privacy-architect, technical-architecture-lead, backend-technology-expert, state-reader, changelog-bot | wszystkie `stacks/*` (VETO verifiers + implementers), tech-lead, product-owner | marketing/finance/legal-strategist |
| Commands | code-review, tdd, verify, plan, adr, security-review/-check, test-coverage, capture, blog, checkpoint, sessions, evolve, instinct-*, claude-updates, cost-report | orchestrate→orchestrate-ddd, threat-model, incident, scaffold, pm-* (pulse/sprint/…), grantflow/log-time | finance/legal/marketing |
| Hooks | session-start/-end, evaluate-session, subagent-stop-cost-log, post-edit-format, post-edit-console-warn, pre-write-doc-warn, git-push-reminder, strategic-compact | **check-delegation, check-subagent-pattern-reads, check-patterns-read, lib/pattern-routing** (unikat), pm-task-*, security-impl-feedback | — |
| Rules | common/* + per-language (ts, python, dart) | rules/nestjs-ddd/ (DDD-specyficzne) | — |
| Skills | learning/*, decision-frameworks, optimization, generic quality/arch/backend/frontend/db/infra | security/threat-model, PM skills, scaffold, stack-pattern skills, integrations | marketing(41)/finance(84)/legal(12) vs 271 ECC |
| Patterns | — | **wszystkie 72 + _summary cards** (rdzeń overlayu) | — |

Bilans: retiré ~50–60% (generyki), zostaje ~40% (domena + moat).

## 9. Loops — jak używać (od zera)

**Czym jest:** ten sam cel iterowany, świeży kontekst co iterację, jedno zadanie+commit,
aż **testowalny** warunek stopu (`testy+lint`, nie „wygląda dobrze").

- **Poziom 1 — natywne CC `/loop` `/goal`** (od tego zacząć, z nadzorem):
  `/loop 5m /verify` (poll), `/loop /code-review` (self-pace), `/goal` z acceptance-criteria.
- **Poziom 2 — Ralph ręcznie** (zrozumienie): `while ! npm test; do claude -p "zrób JEDNO zadanie z SPEC, commit, stop"; done`.
- **Poziom 3 — ECC `loop-operator`** (produkcyjnie): `/loop-start continuous-pr --mode safe`,
  `/loop-status --watch`. Pre-checks (gates/baseline/rollback/worktree) + escalation.
- **Headline — `/orchestrate-ddd`**: pętla ECC, stage'e = nasze (Rule Cards grounding →
  check-delegation → VETO verifiers → stop gdy `/security-review` PASS).

**Drabina adopcji:** (1) `/loop` na „napraw testy aż zielone" → (2) continuous-PR z `--max-cost/-runs/-duration`
→ (3) RFC-DAG autonomicznie. Human review zmergowanych zmian ZAWSZE w pętli; pilnuj kosztu tokenów.

---

## Źródła (loops, kontekst rynkowy)
- Ralph autonomous loop — https://knightli.com/en/2026/04/27/ralph-autonomous-agent-loop-claude-code-amp/
- Loop Engineering Guide — https://lushbinary.com/blog/loop-engineering-ai-coding-agents-guide/
- Ralph Wiggum /loop guide — https://awesomeclaude.ai/ralph-wiggum
- Anthropic /loop /goal as feature — https://ai-checker.webcoda.com.au/articles/loop-driven-development-claude-code-loops-goals-2026
- Agentic loops ReAct→Loop Engineering — https://datasciencedojo.com/blog/agentic-loops-explained-from-react-to-loop-engineering-2026-guide/
- Claude Code agent loop docs — https://code.claude.com/docs/en/agent-sdk/agent-loop
- ECC repo (lokalnie) — /opt/projects/ecc (affaan-m/ECC)
