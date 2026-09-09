# Templates - Composable CLAUDE.md Generation

**Zero-dependency, pure bash CLAUDE.md generation** from `project.yml` config.

## How It Works

```
core.md                    # Universal sections (header, rules, contexts table)
  ↓
stacks/{profile}.md       # Stack-specific sections (agents, patterns, architecture)
  ↓
project.yml               # Your project config (name, stack, contexts, rules)
  ↓
CLAUDE-LOCAL.md           # Project-specific additions (optional)
  ↓
generate-claude-md.sh → CLAUDE.md (auto-generated)
```

---

## Supported Stacks

| Stack Profile | Template | Use Case |
|---------------|----------|----------|
| `nestjs-ddd` | stacks/nestjs-ddd.md | NestJS + DDD + CQRS + event sourcing |
| `nextjs-app` | stacks/nextjs-app.md | Next.js App Router |
| `sveltekit` | stacks/sveltekit.md | SvelteKit |
| `astro-static` | stacks/astro-static.md | Astro static sites |
| `flutter` | stacks/flutter.md | Cross-platform mobile (iOS/Android/Web) |
| `flutter-clean-arch` | stacks/flutter-clean-arch.md | Flutter with clean-architecture layering |
| `node-kysely` | stacks/node-kysely.md | Node service on Kysely |
| `node-ts-claude-api` | stacks/node-ts-claude-api.md | Node/TS service built on the Claude API |
| `typescript-library` | stacks/typescript-library.md | Published TS library — API surface is the product |
| `python` | stacks/python.md | Python backend with DDD layering (FastAPI/Django/Flask) |
| `python-modular` | stacks/python-modular.md | Python modular monolith — layered without DDD |
| `python-pipeline` | stacks/python-pipeline.md | Data pipelines, ML processing, collectors |
| `python-ml` | stacks/python-ml.md | Model training and inference, GPU budget enforcement |
| `docs-only` | stacks/docs-only.md | Documentation repos, no build |
| (omit) | core.md only | Generic — no stack-specific sections |

---------------|----------|----------|
| `nestjs-ddd` | stacks/nestjs-ddd.md | NestJS + DDD + CQRS + Event Sourcing |
| `flutter` | stacks/flutter.md | Cross-platform mobile apps (iOS/Android/Web) |
| `python` | stacks/python.md | Python backends with DDD layering (FastAPI/Django/Flask) |
| `python-modular` | stacks/python-modular.md | Python modular monolith — layered without DDD |
| `python-pipeline` | stacks/python-pipeline.md | Data pipelines, ML processing, collectors |
| (omit) | core.md only | Generic - no stack-specific sections |

---

## Quick Start

### 1. Copy example to your project

```bash
# NestJS/DDD project
cp templates/project.yml.example ~/my-project/.claude/config/project.yml

# Flutter project
cp templates/examples/flutter-project.yml ~/my-flutter-app/.claude/config/project.yml

# Python project
cp templates/examples/python-project.yml ~/my-api/.claude/config/project.yml
```

### 2. Edit project.yml

```yaml
project:
  name: MyApp
  description: "My awesome app"
  stack_profile: flutter  # or nestjs-ddd, python
  stack: "Flutter 3.x, Dart, Firebase"
  state_management: "Riverpod"
  platforms: "iOS, Android"

contexts:
  - name: auth
    status: production
    tests: 45
    notes: "Firebase Auth"

rules:
  - "Feature-first structure"
  - "BLoC pattern"
```

### 3. Generate CLAUDE.md

```bash
cd ~/projects/claude-patterns
./scripts/setup-project.sh ~/my-project
# or just regenerate CLAUDE.md:
./scripts/generate-claude-md.sh ~/my-project
```

---

## Adding New Stacks

**Zero changes to generator needed!** Just create `templates/stacks/{name}.md`:

```markdown
## Agent Ecosystem
...

## Key Architecture Rules
...

## Testing Strategy
...
```

Use markers like `%%COST_OPUS%%` for substitution. See existing stack templates for examples.

---

## Stack-Specific Fields

Each stack profile supports different fields in `project.yml`:

### NestJS-DDD
```yaml
stack_profile: nestjs-ddd
ddd_library: "@vytches/ddd"
database: "PostgreSQL 15, PostGIS 3.3"
```

### Flutter
```yaml
stack_profile: flutter
state_management: "Riverpod"  # or Bloc, Provider, etc.
platforms: "iOS, Android, Web"
```

### Python (DDD Backend)
```yaml
stack_profile: python
framework: "FastAPI"  # or Django, Flask, etc.
database: "PostgreSQL 15"
```

### Python (Modular Monolith)
```yaml
stack_profile: python-modular
framework: "FastAPI"  # or Django, Flask, etc.
database: "PostgreSQL 15, Neo4j, Redis"  # multi-database typical
architecture: "layered-modular-monolith"
```

### Python (Data Pipeline)
```yaml
stack_profile: python-pipeline
framework: "Custom (pipeline + MCP server)"
database: "PostgreSQL, Neo4j, Qdrant"  # multi-database typical
```

Only fields with values appear in the generated project table (no empty rows).

---

## Files

Every entry, and what actually reads it. An unlisted template is one nothing
consumes — if you add a file here, add its row, or the next audit will call it
an orphan and someone will delete it.

### CLAUDE.md generation

| File | Consumed by |
|------|-------------|
| `core.md` | `generate-claude-md.sh` — universal sections, all stacks |
| `stacks/*.md` (14) | `generate-claude-md.sh`, selected by `project.stack_profile` |
| `ddd-core-rules.md` | `generate-claude-md.sh`, emitted only when the composition includes the `ddd/core` block |
| `project.yml.example` | `setup-project.sh`, copied when a project has no `project.yml` |
| `CLAUDE-LOCAL.md.example` | Copied by hand into a project that wants additions the generator must not overwrite |
| `examples/*.yml`, `examples/*CLAUDE*.md` | Reference only — complete configs to copy from |

### Per-project scaffolding (`setup-project.sh`)

| File | Copied to | When |
|------|-----------|------|
| `settings/base.json` + `settings/{profile}.json` | `.claude/settings.json` | Always; profile file merges over base |
| `THREAT_MODEL_TEMPLATE.md` | `docs/security/` | Always; re-synced unless marked `<!-- LOCAL-CUSTOMIZED -->` |
| `task-analysis-template.md` | `project-orchestration/analysis/TEMPLATE.md` | Always; `/orchestrate` gates on its frontmatter, so the shape is a contract |
| `project-orchestration/` | `project-orchestration/` | When the project opts into the PM system |
| `knowledge-patterns-readme-template.md` | `.claude/knowledge/patterns/README.md` | Always |
| `gitignore-claude.template` | Appended to `.gitignore` | Always |
| `git-hooks/pre-commit-satellite.sh` | `.git/hooks/pre-commit` | Satellite projects |

### Hook configs

`*-hooks.json` are configs for the hook scripts, not hook registrations —
`ddd-config.js` looks for `ddd-hooks.json`, `python-config.js` for
`python-hooks.json`, and so on. `setup-project.sh` picks
`templates/{stack_profile}-hooks.json` when one exists and falls back to the
canonical name, then writes it under the name the hook searches for.

| File | Selected by `stack_profile` |
|------|------------------------------|
| `ddd-hooks.json` | `nestjs-ddd` |
| `flutter-hooks.json` | `flutter`, `flutter-clean-arch` |
| `python-hooks.json` | `python`, `python-modular` — FastAPI/SQLAlchemy layering |
| `python-ml-hooks.json` | `python-ml` — torch/transformers imports, GPU call budget |
| `python-pipeline-hooks.json` | `python-pipeline` |
| `PYTHON-HOOKS-GUIDE.md` | Prose: which variant to pick and what each field does |

Note that step 5 of `setup-project.sh` is gated on `project.stack_profile`
being set. A project configured only with `stack_blocks` gets none of these.

### Documents a project fills in

| File | Purpose |
|------|---------|
| `BUSINESS_RULES.yaml.template` | Scaffold for `docs/BUSINESS_RULES.yaml`; CLAUDE.md requires keeping it in sync with domain code. Copy by hand — `setup-project.sh` does not place it yet |
| `adr-template.md` | Architecture Decision Record; `/adr` writes this shape |
| `bdr-template.md` | Business Decision Record; sibling of the ADR, indexed by `scripts/index-decisions.mjs` and the `decision-registry` block's `bdr_dir` param |
| `task-standard.md`, `task-minimal.md`, `task-security-first.md` | Task file variants — pick by size and by whether the work touches auth, PII or a trust boundary |
| `SESSION_STATE.md.template` | Handoff note between sessions (`/checkpoint`) |
| `api-clients-context.md` | Describes a backend's consumers, for `/api-schema-sync` |
| `product-marketing-context.md` | Positioning document the marketing skills all read; the marketing equivalent of `BUSINESS_RULES.yaml` |
| `canonical-labels.yml` | Shared label vocabulary for tasks and issues |
| `mcp.json.template` | MCP server wiring for a project |
| `commitlint.config.js` | Conventional-commits config for projects that enforce it in CI. Nothing here installs it — copy it if you want it |

### Folders

| Folder | Purpose |
|--------|---------|
| `security-checklists/` | Per-topic review checklists (auth, PII, public API, accessibility, cross-context, B2G) |
| `dev-blog/` | Scaffolding for the build-in-public blog; read by the `dev-blog-generator` skill and `/blog` |
| `project-orchestration/` | The PM system: TEAM-STATE.md, KANBAN.md, TECH-DEBT.md, tasks/ |
| `settings/` | `.claude/settings.json` fragments, one per stack profile plus `base.json` |
| `stacks/` | CLAUDE.md sections per stack profile |
| `examples/` | Complete worked configs, reference only |

---

## Migration from Old Format

Old CLAUDE-SLIM.md is **deprecated**. New system:
- ✅ Composable (mix & match stacks)
- ✅ Zero generator changes for new stacks
- ✅ Dynamic project table (no empty rows)
- ✅ Cleaner separation (core vs stack-specific)

Configuration lives in `stack_blocks:` (ADR 0008) — that's what produces
`.claude/config/runtime.yml` and drives `/analyze` and `/orchestrate`.
`stack_profile` only selects which CLAUDE.md template sections and hook set
`setup-project.sh` uses; change either and regenerate.
