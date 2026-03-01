# TS-ECC-INTEGRATION: Everything Claude Code Integration

**Status:** PLANNING
**Priority:** HIGH
**Source:** https://github.com/affaan-m/everything-claude-code
**Local clone:** ~/projects/everything-claude-code
**Created:** 2026-02-28
**Updated:** 2026-02-28 (v2 — full scope after deep analysis)
**Branch:** feature/ecc-integration (to create)

---

## 1. Executive Summary

Po dogłębnej analizie 535 plików z repo `everything-claude-code` (ECC) vs naszych 33 patterns + 9 agents + 4 hooks, identyfikujemy **masywną ilość** wartościowych funkcjonalności, których nam brakuje. ECC to pierwsze repo, które ma realnie lepsze rozwiązania operacyjne wokół Claude Code.

**Kluczowy wniosek:** Nasze `claude-patterns` jest silniejsze w GŁĘBOKOŚCI (DDD/CQRS, domain patterns, specialist agents). ECC jest silniejsze w SZEROKOŚCI OPERACYJNEJ (hooks, session management, token optimization, CI validation, rules system, commands, skills, decision frameworks).

**Scope integracji (v2):** Portujemy ~80% ECC. Pomijamy tylko stack-specific rzeczy (Swift, Spring Boot, C++, ClickHouse) i domain-specific content (investor outreach, article writing).

---

## 2. Strategic Decision: Selective Merge (Opcja A)

### REKOMENDACJA: Evolve claude-patterns, nie tworzyć nowego repo

**Uzasadnienie:**
1. Nasze 33 DDD patterns nie mają odpowiednika w ECC — to unikalna wartość
2. Nasz system kompilacji agentów (Handlebars) jest bardziej zaawansowany
3. Nasz MCP server to forward-looking distribution
4. ECC infrastructure jest ADDYTYWNA — wchodzi bez konfliktów
5. ECC jako ~/projects/everything-claude-code zostaje jako reference + upstream

---

## 3. PEŁNA INWENTARYZACJA: Co portujemy

### 3.1 COMMANDS (15 nowych komend)

| # | Command | Lines | Co robi | Priorytet |
|---|---------|-------|---------|-----------|
| 1 | `/plan` | 51 | Planning backbone z risk assessment, fazy, dependencies | P1 |
| 2 | `/verify` | 68 | Quality gate: typecheck → lint → test → build → coverage | P1 |
| 3 | `/code-review` | 69 | Structured review: 4 severity levels (CRITICAL/HIGH/MEDIUM/LOW) | P1 |
| 4 | `/security` | 90 | OWASP Top 10 audit + secrets + injection + auth | P1 |
| 5 | `/tdd` | 67 | RED-GREEN-REFACTOR enforcement, 80%+ coverage | P1 |
| 6 | `/learn` | 62 | Pattern extraction z bieżącej sesji → instincts | P1 |
| 7 | `/evolve` | 112 | Cluster instincts → promote do skills przy confidence >0.75 | P1 |
| 8 | `/eval` | 89 | Acceptance testing: Pass@K vs Pass^K, binary/scalar/rubric graders | P1 |
| 9 | `/skill-create` | 118 | Git history analysis → auto-generate SKILL.md | P1 |
| 10 | `/build-fix` | 57 | Minimal TS/build error fixes (zero-refactor) | P2 |
| 11 | `/test-coverage` | 81 | Coverage gap analysis, priorytetyzacja by criticality | P2 |
| 12 | `/checkpoint` | 68 | Session state snapshot (test status, coverage, changes, next steps) | P2 |
| 13 | `/instinct-status` | 76 | Dashboard: confidence scores, categories, recent additions | P2 |
| 14 | `/instinct-export` | 93 | Export z filtering (confidence, category) | P2 |
| 15 | `/instinct-import` | 88 | Import + deduplikacja + confidence adjustment (×0.8) | P2 |

**Opcjonalnie (P3):**
| `/update-docs` | 68 | Sync docs z kodem | P3 |
| `/update-codemaps` | 82 | Codemap generation | P3 |
| `/refactor-clean` | 103 | Dead code detection (knip/depcheck/ts-prune) | P3 |
| `/e2e` | 106 | Playwright E2E generation | P3 |
| `/setup-pm` | 68 | Package manager config | P3 |
| `/pm2` | 273 | Auto-detect serwisy, generuj ecosystem.config.cjs + komendy PM2 | P2 |
| `/sessions` | 305 | Zarządzanie sesjami: list, load, alias, info z pagination | P2 |
| `/multi-plan` | 262 | Multi-model planning (Claude+Codex+Gemini parallel) | P3 |
| `/multi-execute` | 311 | Multi-model execution (dirty prototype → refactor) | P3 |
| `/multi-workflow` | 183 | 6-fazowy workflow z multi-model collaboration | P3 |
| `/multi-backend` | ~80 | Backend-focused multi-model execution | P3 |
| `/multi-frontend` | ~80 | Frontend-focused multi-model execution | P3 |
| `/learn-eval` | ~60 | Evaluate learning effectiveness | P3 |
| `/python-review` | ~70 | Python-specific code review | P3 |
| `/claw` | ~50 | NanoClaw agent REPL launcher | P3 |

**Source:** `~/projects/everything-claude-code/.claude/commands/` (lub `.opencode/commands/`)
**Target:** `~/projects/claude-patterns/commands/`

---

### 3.2 SKILLS (15 MUST HAVE + 6 NICE TO HAVE)

#### MUST HAVE (5,747 lines total):

| # | Skill | Lines | Unikalna wartość | Target folder |
|---|-------|-------|-----------------|---------------|
| 1 | `security-review` | 858 | OWASP Top 10, secrets detection (7+ typów), cloud infra security, RLS | `skills/security/` |
| 2 | `backend-patterns` | 599 | Repository/Service pattern, N+1 prevention, caching, retry, rate limiting, structured logging | `skills/backend/` |
| 3 | `coding-standards` | 531 | KISS/DRY/YAGNI, immutability, code smells, TS/JS standards | `skills/quality/` |
| 4 | `api-design` | 524 | REST conventions, pagination (offset vs cursor), filtering, versioning, rate limiting | `skills/architecture/` |
| 5 | `deployment-patterns` | 428 | Rolling/blue-green/canary, multi-stage Docker, GitHub Actions CI/CD, health checks, 12-factor | `skills/infrastructure/` |
| 6 | `tdd-workflow` | 411 | User journey→tests→implementation, coverage requirements, framework patterns | `skills/testing/` |
| 7 | `docker-patterns` | 365 | Docker Compose, dev vs prod stages, volume strategies, container security | `skills/infrastructure/` |
| 8 | `database-migrations` | 336 | Migration safety, expand-contract, zero-downtime, batching, Prisma/Drizzle/Django workflows | `skills/database/` |
| 9 | `e2e-testing` | 327 | POM pattern, Playwright config, flaky test strategies, artifact management | `skills/testing/` |
| 10 | `regex-vs-llm-structured-text` | 221 | Decision framework: regex first → LLM for edge cases, hybrid pipeline | `skills/decision-frameworks/` |
| 11 | `iterative-retrieval` | 212 | DISPATCH→EVALUATE→REFINE→LOOP, solves subagent context problem | `skills/orchestration/` |
| 12 | `cost-aware-llm-pipeline` | 184 | Model routing, budget tracking, retry logic, prompt caching | `skills/optimization/` |
| 13 | `skill-stocktake` | 177 | Audit all skills/commands quality, quick scan vs full stocktake | `skills/meta/` |
| 14 | `search-first` | 162 | Research before coding: npm/PyPI/MCP/GitHub search systematic | `skills/decision-frameworks/` |
| 15 | `postgres-patterns` | 148 | Index strategy (B-tree/GIN/BRIN), RLS, cursor pagination, queue processing | `skills/database/` |

#### NICE TO HAVE:

| # | Skill | Lines | Wartość |
|---|-------|-------|---------|
| 16 | `frontend-patterns` | 643 | React hooks, state, a11y — jeśli mamy frontend |
| 17 | `continuous-learning-v2` | 296 | Bayesian confidence, instinct system — implementacja dla /learn /evolve |
| 18 | `verification-loop` | 127 | 6-phase verification — komplementarne z /verify |
| 19 | `content-hash-cache-pattern` | 162 | SHA-256 caching for file processing |
| 20 | `python-patterns` | ~200 | Decorators, concurrency, packaging |
| 21 | `golang-patterns` | ~200 | Interfaces, error handling, channels |

**Source:** `~/projects/everything-claude-code/skills/`
**Target:** `~/projects/claude-patterns/skills/` (NEW directory)

---

### 3.3 RULES FRAMEWORK (20+ plików — NOWY system)

#### Common Rules (universal):

| # | Rule | Co zawiera |
|---|------|-----------|
| 1 | `security.md` | Pre-commit checklist, secret management, security response protocol |
| 2 | `testing.md` | 80% coverage mandate, unit/integration/E2E breakdown, TDD workflow |
| 3 | `coding-style.md` | Immutability, file organization (200-400 lines), error handling, input validation |
| 4 | `git-workflow.md` | Conventional commits, PR analysis, branch strategy |
| 5 | `performance.md` | Model selection (Haiku/Sonnet/Opus), context management, extended thinking |
| 6 | `development-workflow.md` | Research phase → Planning → TDD → Code Review → Commit |
| 7 | `patterns.md` | Skeleton projects, Repository Pattern, API Response Format |
| 8 | `hooks.md` | PreToolUse/PostToolUse/Stop types, TodoWrite practices |
| 9 | `agents.md` | Agent usage matrix, when to invoke each, parallel execution |

#### TypeScript Rules:

| # | Rule | Co zawiera |
|---|------|-----------|
| 10 | `coding-style.md` | Prettier, tsc, console.log warnings |
| 11 | `testing.md` | Playwright E2E, Vitest/Jest patterns |
| 12 | `patterns.md` | Immutability with spread, Zod validation |
| 13 | `security.md` | TS-specific security patterns |
| 14 | `hooks.md` | Post-edit typecheck, format hooks |

#### Python Rules:

| # | Rule | Co zawiera |
|---|------|-----------|
| 15 | `coding-style.md` | black/ruff, mypy/pyright, no print() |
| 16 | `testing.md` | pytest, fixtures, parametrized |
| 17 | `patterns.md` | Protocol (duck typing), dataclasses, context managers |
| 18 | `security.md` | Python-specific security |

#### Go Rules:

| # | Rule | Co zawiera |
|---|------|-----------|
| 19 | `coding-style.md` | gofmt/goimports, go vet |
| 20 | `testing.md` | Table-driven tests, race detection |
| 21 | `patterns.md` | Functional Options, small interfaces |
| 22 | `security.md` | Go-specific security |

**Source:** `~/projects/everything-claude-code/rules/`
**Target:** `~/projects/claude-patterns/rules/` (NEW directory)

---

### 3.4 HOOKS (10 nowych hooków)

| # | Hook | Event | Co robi |
|---|------|-------|---------|
| 1 | `session-start.js` | SessionStart | Load previous session, detect skills, detect PM |
| 2 | `session-end.js` | SessionEnd | Parse transcript, create session summary |
| 3 | `pre-compact.js` | PreCompact | Save state before context loss |
| 4 | `suggest-compact.js` | PreToolUse | Tool-call counter, manual compaction at threshold |
| 5 | `post-edit-typecheck.js` | PostToolUse(Edit) | Auto tsc --noEmit, filter to edited file |
| 6 | `post-edit-format.js` | PostToolUse(Edit) | Auto Prettier/Biome detection and format |
| 7 | `post-edit-console-warn.js` | PostToolUse(Edit) | Warn about console.log (non-blocking) |
| 8 | `pre-write-doc-warn.js` | PreToolUse(Write) | Block non-standard .md files |
| 9 | `check-console-log.js` | Stop | Git-aware console.log audit on modified files |
| 10 | `evaluate-session.js` | Stop | Extract learnable patterns from session |

**Supporting libraries:**
| Lib | Co robi |
|-----|---------|
| `utils.js` | Cross-platform file I/O, git integration, hook I/O, command safety |
| `session-manager.js` | Session CRUD, metadata parsing, pagination |
| `session-aliases.js` | Atomic writes, alias management, backup/restore |
| `package-manager.js` | 5-step PM detection, command building, injection prevention |

**Source:** `~/projects/everything-claude-code/scripts/hooks/` + `scripts/lib/`
**Target:** `~/projects/claude-patterns/hooks/` (evolve from bash to Node.js)

---

### 3.5 INFRASTRUCTURE & META

| # | Component | Co to | Target |
|---|-----------|-------|--------|
| 1 | Token Optimization Pattern | Autocompact 50%, thinking 10K, Haiku subagents, strategic compaction | `patterns/architecture/` |
| 2 | Dynamic Context Modes | dev.md / research.md / review.md + CLI aliases | `templates/contexts/` |
| 3 | CI Validation Scripts (5) | validate-rules/skills/hooks/commands/agents z cross-ref checking | `scripts/ci/` |
| 4 | Stack-Specific CLAUDE.md Examples | Next.js, Go, Rust, Django — real-world examples | `templates/examples/` |
| 5 | Codemap Generation | Auto architectural docs per area (frontend, backend, db, workers) | `scripts/codemaps/` |
| 6 | Plugin Manifest | .claude-plugin/ z plugin.json + marketplace.json | `.claude-plugin/` |
| 7 | Commitlint Config | Conventional commits enforcement | `templates/` |
| 8 | hooks.json | Centralized hook event configuration | `hooks/` |

---

## 4. Co NIE portujemy (i dlaczego)

| ECC Component | Dlaczego SKIP |
|---------------|--------------|
| `.opencode/` | Nie używamy OpenCode |
| `skills/investor-*` | Domain-specific (investor outreach/materials) |
| `skills/market-research` | Domain-specific |
| `skills/article-writing`, `content-engine` | Content creation, nie nasz domain |
| `skills/swift-*` (3 skills) | Nie nasz stack |
| `skills/springboot-*` (4 skills) | Nie nasz stack |
| `skills/cpp-*` (2 skills) | Nie nasz stack |
| `skills/clickhouse-io` | Specialized database |
| `skills/liquid-glass-design` | Visual design |
| `skills/visa-doc-translate` | Domain-specific |
| `skills/nutrient-document-processing` | Domain-specific |
| `skills/configure-ecc` | ECC internal |
| `skills/frontend-slides` | Presentation tool |
| `scripts/claw.js` | Mamy własną orchestrację |
| `docs/zh-CN/` | Chinese translations |
| `assets/images/` | Marketing materials |
| `rules/golang/` | Opcjonalnie — tylko jeśli mamy Go projekty |
| `agents/chief-of-staff` | Personal communication triage |

---

## 5. Resulting Target Structure (PEŁNA)

```
~/projects/claude-patterns/
├── .claude-plugin/                    # NEW: Plugin manifest
│   ├── plugin.json
│   └── marketplace.json
│
├── patterns/                          # KEEP: 33 DDD/CQRS patterns + 2 NEW
│   ├── domain/                        # 6 patterns (untouched)
│   ├── application/                   # 4 patterns (untouched)
│   ├── infrastructure/                # 4 patterns (untouched)
│   ├── architecture/                  # 8 patterns + NEW:
│   │   ├── token-optimization-pattern.md      # NEW from ECC
│   │   └── iterative-retrieval-pattern.md     # NEW from ECC
│   ├── testing/                       # 8 patterns (untouched)
│   └── cross-layer/                   # 4 patterns (untouched)
│
├── agents/                            # KEEP + REVIEW
│   ├── specialists/                   # Our 4 specialists (untouched)
│   ├── utilities/                     # Our 3 utilities (untouched)
│   └── verifiers/                     # Our 2 verifiers (untouched)
│   # NOTE: ECC agents to review for overlap/complement with ours
│
├── commands/                          # KEEP 3 + ADD 15 NEW
│   ├── orchestrate.md                 # Existing (enhance)
│   ├── progress.md                    # Existing
│   ├── scaffold.md                    # Existing
│   ├── plan.md                        # NEW: Planning backbone
│   ├── verify.md                      # NEW: Quality gate
│   ├── code-review.md                 # NEW: Structured review
│   ├── security.md                    # NEW: OWASP audit
│   ├── tdd.md                         # NEW: TDD enforcement
│   ├── learn.md                       # NEW: Pattern extraction
│   ├── evolve.md                      # NEW: Instinct→skill
│   ├── eval.md                        # NEW: Acceptance testing
│   ├── skill-create.md                # NEW: Git→skills
│   ├── build-fix.md                   # NEW: TS error recovery
│   ├── test-coverage.md               # NEW: Coverage analysis
│   ├── checkpoint.md                  # NEW: State snapshot
│   ├── instinct-status.md             # NEW: Learning dashboard
│   ├── instinct-export.md             # NEW: Knowledge export
│   └── instinct-import.md             # NEW: Knowledge import
│
├── skills/                            # NEW DIRECTORY (15-21 skills)
│   ├── security/
│   │   └── security-review/SKILL.md              # 858 lines
│   ├── quality/
│   │   └── coding-standards/SKILL.md             # 531 lines
│   ├── testing/
│   │   ├── tdd-workflow/SKILL.md                 # 411 lines
│   │   └── e2e-testing/SKILL.md                  # 327 lines
│   ├── architecture/
│   │   └── api-design/SKILL.md                   # 524 lines
│   ├── backend/
│   │   └── backend-patterns/SKILL.md             # 599 lines
│   ├── database/
│   │   ├── postgres-patterns/SKILL.md            # 148 lines
│   │   └── database-migrations/SKILL.md          # 336 lines
│   ├── infrastructure/
│   │   ├── deployment-patterns/SKILL.md          # 428 lines
│   │   └── docker-patterns/SKILL.md              # 365 lines
│   ├── decision-frameworks/
│   │   ├── search-first/SKILL.md                 # 162 lines
│   │   └── regex-vs-llm/SKILL.md                 # 221 lines
│   ├── orchestration/
│   │   └── iterative-retrieval/SKILL.md          # 212 lines
│   ├── optimization/
│   │   └── cost-aware-llm-pipeline/SKILL.md      # 184 lines
│   ├── meta/
│   │   └── skill-stocktake/SKILL.md              # 177 lines
│   └── learning/
│       └── continuous-learning-v2/SKILL.md       # 296 lines
│
├── rules/                             # NEW DIRECTORY (20+ files)
│   ├── common/
│   │   ├── security.md
│   │   ├── testing.md
│   │   ├── coding-style.md
│   │   ├── git-workflow.md
│   │   ├── performance.md
│   │   ├── development-workflow.md
│   │   ├── patterns.md
│   │   ├── hooks.md
│   │   └── agents.md
│   ├── typescript/
│   │   ├── coding-style.md
│   │   ├── testing.md
│   │   ├── patterns.md
│   │   ├── security.md
│   │   └── hooks.md
│   └── python/
│       ├── coding-style.md
│       ├── testing.md
│       ├── patterns.md
│       └── security.md
│
├── hooks/                             # EVOLVE: 4 bash → 14 Node.js
│   ├── hooks.json                     # NEW: Central hook configuration
│   ├── cost-optimizer.sh              # KEEP (review for merge with suggest-compact)
│   ├── suggest-compact.js             # NEW
│   ├── post-edit-typecheck.js         # NEW
│   ├── post-edit-format.js            # NEW
│   ├── post-edit-console-warn.js      # NEW
│   ├── pre-write-doc-warn.js          # NEW
│   ├── check-console-log.js           # NEW
│   ├── evaluate-session.js            # NEW
│   ├── session/                       # NEW
│   │   ├── session-start.js
│   │   ├── session-end.js
│   │   └── pre-compact.js
│   └── lib/                           # NEW: Shared utilities
│       ├── utils.js
│       ├── session-manager.js
│       ├── session-aliases.js
│       └── package-manager.js
│
├── templates/                         # KEEP + EXTEND
│   ├── core.md                        # Existing (add token optimization refs)
│   ├── contexts/                      # NEW
│   │   ├── dev.md
│   │   ├── research.md
│   │   └── review.md
│   ├── stacks/                        # Existing
│   ├── examples/                      # EXTEND
│   │   ├── flutter-project.yml        # Existing
│   │   ├── python-project.yml         # Existing
│   │   ├── saas-nextjs-CLAUDE.md      # NEW
│   │   ├── go-microservice-CLAUDE.md  # NEW
│   │   ├── rust-api-CLAUDE.md         # NEW
│   │   └── django-api-CLAUDE.md       # NEW
│   └── commitlint.config.js           # NEW
│
├── schemas/                           # KEEP (untouched)
├── mcp-server/                        # KEEP (untouched)
│
├── scripts/                           # KEEP + EXTEND
│   ├── setup-global.sh                # Existing (add context aliases)
│   ├── setup-project.sh               # Existing
│   ├── generate-claude-md.sh          # Existing
│   ├── validate-metadata.sh           # Existing
│   ├── ci/                            # NEW
│   │   ├── validate-rules.js
│   │   ├── validate-skills.js
│   │   ├── validate-hooks.js
│   │   ├── validate-commands.js
│   │   └── validate-agents.js
│   ├── lib/                           # NEW
│   │   └── package-manager.js
│   └── codemaps/                      # NEW
│       └── generate.ts
│
├── tooling/                           # KEEP (untouched)
└── tasks/                             # Task tracking
    └── TS-ECC-INTEGRATION.md          # This file
```

---

## 6. Phased Implementation Plan

### Phase 1: FOUNDATIONS (Tier 1)
**Scope:** Core commands + hooks + rules framework
**Effort:** 2-3 sessions

1. Port 9 core commands: /plan, /verify, /code-review, /security, /tdd, /learn, /evolve, /eval, /skill-create
2. Create rules/ directory z common/ rules (9 files)
3. Port 10 Node.js hooks + 4 support libraries
4. Create hooks.json central configuration
5. Create templates/contexts/ (dev, research, review)
6. Create token-optimization-pattern.md

### Phase 2: SKILLS LIBRARY (Tier 1-2)
**Scope:** 15 MUST HAVE skills
**Effort:** 1-2 sessions

1. Create skills/ directory structure
2. Port all 15 MUST HAVE skills (adapt to our conventions)
3. Add METADATA.yml per skill category

### Phase 3: EXTENDED COMMANDS + CI (Tier 2)
**Scope:** Remaining commands, CI validation, instinct system
**Effort:** 1-2 sessions

1. Port 6 additional commands (/build-fix, /test-coverage, /checkpoint, /instinct-*)
2. Create scripts/ci/ with 5 validators
3. Port language-specific rules (typescript/, python/)
4. Create .claude-plugin/ manifest

### Phase 4: INFRASTRUCTURE (Tier 2-3)
**Scope:** Codemap, examples, nice-to-have skills
**Effort:** 1 session

1. Port scripts/codemaps/generate.ts
2. Port 4 stack-specific CLAUDE.md examples
3. Add NICE TO HAVE skills (frontend-patterns, verification-loop, etc.)
4. Port commitlint.config.js
5. Update setup-global.sh with context aliases

---

## 7. ECC Reference Files Index

### Commands
```
.claude/commands/*.md                   # or .opencode/commands/*.md
```

### Skills
```
skills/<name>/SKILL.md                  # Each skill is a directory with SKILL.md
```

### Rules
```
rules/common/*.md
rules/typescript/*.md
rules/python/*.md
rules/golang/*.md
```

### Hooks
```
scripts/hooks/session-start.js
scripts/hooks/session-end.js
scripts/hooks/pre-compact.js
scripts/hooks/suggest-compact.js
scripts/hooks/post-edit-typecheck.js
scripts/hooks/post-edit-format.js
scripts/hooks/post-edit-console-warn.js
scripts/hooks/pre-write-doc-warn.js
scripts/hooks/check-console-log.js
scripts/hooks/evaluate-session.js
```

### Libraries
```
scripts/lib/utils.js
scripts/lib/session-manager.js
scripts/lib/session-aliases.js
scripts/lib/package-manager.js
```

### CI Validators
```
scripts/ci/validate-rules.js
scripts/ci/validate-skills.js
scripts/ci/validate-hooks.js
scripts/ci/validate-commands.js
scripts/ci/validate-agents.js
```

### Contexts
```
contexts/dev.md
contexts/research.md
contexts/review.md
```

### Examples
```
examples/saas-nextjs-CLAUDE.md
examples/go-microservice-CLAUDE.md
examples/rust-api-CLAUDE.md
examples/django-api-CLAUDE.md
examples/user-CLAUDE.md
examples/CLAUDE.md
examples/statusline.json
```

### Token Optimization
```
docs/token-optimization.md
the-longform-guide.md
```

### Plugin
```
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
.claude-plugin/PLUGIN_SCHEMA_NOTES.md
```

---

## 8. NUMBERS SUMMARY

| Category | What we had | What we're adding | New total |
|----------|------------|-------------------|-----------|
| **Patterns** | 33 | +2 | 35 |
| **Commands** | 3 | +15 (P1-P2) + 5 (P3) | 23 |
| **Skills** | 0 | +15 MUST + 6 NICE | 21 |
| **Rules** | 0 (embedded in templates) | +20 files | 20 |
| **Hooks** | 4 (bash) | +10 (Node.js) + 4 libs | 18 |
| **CI Scripts** | 1 | +5 | 6 |
| **Context Modes** | 0 | +3 | 3 |
| **Stack Examples** | 2 (yml) | +4 (full CLAUDE.md) | 6 |
| **Total lines of content** | ~15K | **+12K** | ~27K |

---

## 9. What We Do NOT Port

| ECC Component | Reason |
|---------------|--------|
| `.opencode/` entirely | We don't use OpenCode |
| `skills/investor-*`, `market-research` | Domain-specific |
| `skills/article-writing`, `content-engine` | Content creation |
| `skills/swift-*` (3), `springboot-*` (4), `cpp-*` (2) | Not our stacks |
| `skills/clickhouse-io` | Specialized DB |
| `skills/liquid-glass-design`, `visa-doc-translate`, `nutrient-document-processing` | Domain-specific |
| `skills/configure-ecc`, `skills/frontend-slides` | ECC internal / niche |
| `scripts/claw.js` | We have our own orchestration |
| `docs/zh-CN/` | Chinese translations |
| `assets/images/` | Marketing |
| `agents/chief-of-staff` | Personal comms |
| `rules/golang/` | Optional — only if Go projects |

---

## 10. Success Criteria

- [ ] All Phase 1 items integrated and tested in local-hero-3
- [ ] CI validation passing for all agents, commands, hooks, rules, skills
- [ ] Session persistence working across 3+ consecutive sessions
- [ ] Post-edit hooks working without slowing workflow
- [ ] Context modes usable via shell aliases
- [ ] /learn → /evolve pipeline producing valid skills
- [ ] Token optimization guide referenced in generated CLAUDE.md
- [ ] Zero regression in existing 33 DDD patterns and 9 agents
