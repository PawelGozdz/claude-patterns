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

```
templates/
├── README.md                    # This file
├── core.md                      # Universal template (all stacks)
├── project.yml.example          # Full example with all options
├── CLAUDE-LOCAL.md.example      # Example project-specific additions
├── PYTHON-HOOKS-GUIDE.md        # Config variants for python-hooks.json
├── stacks/
│   ├── nestjs-ddd.md           # NestJS + DDD sections
│   ├── flutter.md              # Flutter sections
│   ├── python.md               # Python DDD backend sections
│   ├── python-modular.md       # Python modular monolith sections
│   └── python-pipeline.md      # Python data pipeline sections
└── examples/
    ├── flutter-project.yml     # Complete Flutter example
    ├── python-project.yml      # Complete Python example
    └── python-CLAUDE-LOCAL.md.example  # Python-specific CLAUDE-LOCAL template
```

---

## Migration from Old Format

Old CLAUDE-SLIM.md is **deprecated**. New system:
- ✅ Composable (mix & match stacks)
- ✅ Zero generator changes for new stacks
- ✅ Dynamic project table (no empty rows)
- ✅ Cleaner separation (core vs stack-specific)

Just update `stack_profile` in your project.yml and regenerate!
