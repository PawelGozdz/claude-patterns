# Multi-Stack Architecture Migration Plan

> **Status**: PLANNED (nie implementować gdy inne sesje Claude Code są aktywne!)
> **Created**: 2026-02-10
> **Author**: Conversation analysis — claude-patterns multi-stack support
> **Affects**: claude-patterns, local-hero-3, local-hero-4, universal-learning-system

---

## 1. Problem

claude-patterns repo działa świetnie dla TypeScript/NestJS (local-hero-{3,4}, universal-learning-system), ale:
- Wszystkie agents/skills/patterns są NestJS-specific i globalnie widoczne (`~/.claude/` symlinks)
- Nie da się dodać Flutter/Python projektu bez zaśmiecania go NestJS agentami
- Brak mechanizmu "ten projekt używa tych narzędzi, tamten innych"

## 2. Cel

Architektura **preset-based**: każdy projekt deklaruje `preset: nestjs-ddd` lub `preset: flutter` w `project.yml`, a `setup-project.sh` linkuje **tylko to co potrzebne** do `.claude/` projektu.

---

## 3. Architektura docelowa

### 3.1 Struktura repo

```
claude-patterns/
├── presets.yml                            ← routing: preset → directories
│
├── agents/
│   ├── universal/                         ← global: ~/.claude/agents/
│   │   ├── technical-architecture-lead.md
│   │   └── security-privacy-architect.md
│   │
│   └── stacks/
│       ├── nestjs-ddd/                    ← per-project: .claude/agents/shared/
│       │   ├── backend-technology-expert.md
│       │   ├── ddd-application-expert.md
│       │   ├── code-quality-verifier.md
│       │   └── security-e2e-verifier.md
│       │
│       ├── flutter/
│       │   ├── flutter-architecture-expert.md
│       │   └── flutter-quality-verifier.md
│       │
│       └── python/                        ← przyszłość
│           └── ...
│
├── skills/                                ← ZASTĘPUJE commands/
│   ├── universal/                         ← global: ~/.claude/skills/
│   │   └── progress/
│   │       └── SKILL.md
│   │
│   └── stacks/
│       ├── nestjs-ddd/                    ← per-project: .claude/skills/shared/
│       │   ├── orchestrate/
│       │   │   └── SKILL.md                  (NestJS delegation chain)
│       │   └── scaffold/
│       │       └── SKILL.md                  (NestJS types & patterns)
│       │
│       ├── flutter/
│       │   ├── orchestrate/
│       │   │   └── SKILL.md                  (Flutter delegation chain)
│       │   └── scaffold/
│       │       └── SKILL.md                  (Flutter types & patterns)
│       │
│       └── python/                        ← przyszłość
│           └── ...
│
├── hooks/                                 ← global: ~/.claude/hooks/
│   ├── cost-optimizer.sh
│   ├── session-monitor.sh
│   └── state-manager.sh
│
├── patterns/
│   ├── _shared/                           ← universal concepts
│   │   ├── fresh-context-pattern.md
│   │   ├── testing-pyramid-concept.md
│   │   └── dual-identity-concept.md
│   │
│   ├── nestjs-ddd/                        ← PRZENIESIONE z patterns/ (bez zmian wewnątrz!)
│   │   ├── domain/
│   │   │   ├── aggregate-pattern.md
│   │   │   ├── value-object-pattern.md
│   │   │   ├── entity-pattern.md
│   │   │   ├── domain-event-pattern.md
│   │   │   ├── specification-policy-pattern.md
│   │   │   └── domain-service-pattern.md
│   │   ├── application/
│   │   │   ├── command-handler-pattern.md
│   │   │   ├── query-handler-pattern.md
│   │   │   ├── application-service-pattern.md
│   │   │   └── audit-handler-pattern.md
│   │   ├── infrastructure/
│   │   │   ├── repository-pattern.md
│   │   │   ├── repository-events-pattern.md
│   │   │   ├── mapper-pattern.md
│   │   │   └── controller-schema-pattern.md
│   │   ├── architecture/
│   │   │   ├── acl-registry-pattern.md
│   │   │   ├── dual-identity-pattern.md
│   │   │   ├── transactional-pattern.md
│   │   │   ├── user-projection-pattern.md
│   │   │   ├── bullmq-queue-pattern.md
│   │   │   ├── integration-event-pattern.md
│   │   │   └── entity-event-emission-pattern.md
│   │   ├── testing/
│   │   │   ├── testing-pyramid-pattern.md
│   │   │   ├── schema-testing-pattern.md
│   │   │   ├── context-isolation-pattern.md
│   │   │   ├── e2e-hybrid-fixture-pattern.md
│   │   │   ├── test-seeding-performance-guide.md
│   │   │   ├── rate-limit-testing-pattern.md
│   │   │   └── redis-test-isolation-pattern.md
│   │   └── cross-layer/
│   │       ├── domain-errors-pattern.md
│   │       ├── logger-pattern.md
│   │       ├── error-handler-chain-pattern.md
│   │       └── conventions-pattern.md
│   │
│   ├── flutter/                           ← NOWE (do napisania)
│   │   ├── state/
│   │   ├── data/
│   │   ├── presentation/
│   │   ├── testing/
│   │   └── architecture/
│   │
│   └── python/                            ← przyszłość
│       └── ...
│
├── templates/
│   ├── settings/
│   │   ├── base.json                      ← wspólne: hooks, context, mcp__zen, thinking
│   │   ├── nestjs-ddd.json                ← Bash: pnpm, psql; paths: src/**
│   │   ├── flutter.json                   ← Bash: flutter, dart; paths: lib/**
│   │   └── python.json                    ← Bash: pip, pytest; paths: src/**
│   │
│   ├── stacks/                            ← istniejące (do aktualizacji)
│   │   ├── nestjs-ddd.md
│   │   ├── flutter.md
│   │   └── python.md
│   │
│   └── project.yml.example               ← zaktualizować o preset field
│
├── mcp-server/                            ← zachować, ale nie aktywny
│
├── tooling/                               ← zachować (kompilacja project-specific agents)
│
├── scripts/
│   ├── setup-global.sh                    ← PRZEPISAĆ
│   ├── setup-project.sh                   ← PRZEPISAĆ
│   ├── setup-all.sh                       ← USUNĄĆ lub redirect do nowych
│   ├── extract-patterns.sh                ← zachować
│   └── validate-metadata.sh              ← zaktualizować ścieżki
│
├── test-compilation/                      ← zaktualizować
│
└── MULTI-STACK-MIGRATION.md              ← ten plik
```

### 3.2 presets.yml

```yaml
version: "3.0"

# Convenience presets — project.yml references these by name
presets:
  nestjs-ddd:
    agents_dir: nestjs-ddd
    skills_dir: nestjs-ddd
    patterns_dir: nestjs-ddd
    settings_template: nestjs-ddd

  flutter:
    agents_dir: flutter
    skills_dir: flutter
    patterns_dir: flutter
    settings_template: flutter

  python:
    agents_dir: python
    skills_dir: python
    patterns_dir: python
    settings_template: python
```

### 3.3 project.yml format (per project)

```yaml
project:
  name: LocalHero
  preset: nestjs-ddd
  # opcjonalnie:
  # description: "Neighborhood platform for Starachowice"
  # extra fields per stack...

contexts:
  - name: auth
    status: production
  # ...

rules:
  - "NEVER import between contexts."
  # ...
```

### 3.4 Symlinking — co gdzie idzie

```
setup-global.sh:
  ~/.claude/agents/     → claude-patterns/agents/universal/
  ~/.claude/skills/     → claude-patterns/skills/universal/
  ~/.claude/hooks/      → claude-patterns/hooks/

setup-project.sh (czyta preset z project.yml):
  .claude/agents/shared/          → claude-patterns/agents/stacks/{preset}/
  .claude/skills/shared/          → claude-patterns/skills/stacks/{preset}/
  .claude/knowledge/patterns/     → claude-patterns/patterns/{preset}/
  .claude/knowledge/patterns-shared/ → claude-patterns/patterns/_shared/
  .claude/settings.json           ← merge(base.json + {preset}.json) — tylko jeśli nie istnieje
```

### 3.5 Rezultat w projekcie

```
local-hero-4/.claude/
├── agents/
│   ├── shared/           → claude-patterns/agents/stacks/nestjs-ddd/  (dir symlink)
│   ├── orchestrator.md                    (project-specific, own file)
│   ├── customer-value-guardian.md         (project-specific)
│   └── implementers/                      (project-specific)
│
├── skills/
│   └── shared/           → claude-patterns/skills/stacks/nestjs-ddd/  (dir symlink)
│
├── hooks/
│   └── (opcjonalnie project-specific hooks)
│
├── knowledge/
│   ├── patterns/         → claude-patterns/patterns/nestjs-ddd/       (dir symlink)
│   ├── patterns-shared/  → claude-patterns/patterns/_shared/          (dir symlink)
│   ├── patterns-local/                    (project-specific overrides)
│   └── learned/                           (project-specific discoveries)
│
├── config/
│   └── project.yml
│
└── settings.json                          (wygenerowany z templates lub own)
```

---

## 4. Klasyfikacja agentów

| Agent | Kategoria | Preset | Model |
|-------|-----------|--------|-------|
| technical-architecture-lead | **UNIVERSAL** | global | Opus |
| security-privacy-architect | **UNIVERSAL** | global | Opus |
| backend-technology-expert | nestjs-ddd | stack | Opus |
| ddd-application-expert | nestjs-ddd | stack | Sonnet |
| code-quality-verifier | nestjs-ddd | stack | Sonnet, VETO |
| security-e2e-verifier | nestjs-ddd | stack | Opus, VETO |
| flutter-architecture-expert | flutter | stack | Sonnet |
| flutter-quality-verifier | flutter | stack | Sonnet, VETO |
| python-api-expert | python | stack | Sonnet |
| ml-pipeline-expert | python | stack | Sonnet |

---

## 5. Skills (zastępują commands)

### 5.1 Dlaczego skills > commands

- **Auto-detection**: Claude sam rozpoznaje "implement aggregate" i odpala skill
- **Modularność**: SKILL.md + helpery w katalogu
- **Opis w kontekście**: per-stack description → trafniejsze auto-detection
- **Model per skill**: haiku dla scaffold, sonnet dla orchestrate

### 5.2 Skill definitions

| Skill | Kategoria | Model | Opis |
|-------|-----------|-------|------|
| progress | **UNIVERSAL** | Haiku | Czyta STATE.md, git log, formatuje raport |
| orchestrate | **per-stack** | Sonnet | Delegation chain specyficzny dla stacku |
| scaffold | **per-stack** | Haiku | Routing table + pattern paths per stack |

### 5.3 orchestrate — per-stack delegation chains

**nestjs-ddd:**
```
Phase 1: Context Discovery       → Task(subagent_type='Explore')
Phase 2A: Business Validation    → Task(subagent_type='customer-value-guardian')  [project-specific]
Phase 2B: DDD Modeling           → Task(subagent_type='ddd-application-expert')
Phase 2C: Technology Decisions   → Task(subagent_type='backend-technology-expert')
Phase 3A: Domain + Application   → Task(subagent_type='domain-application-implementer')  [project-specific]
Phase 3B: Infrastructure + Tests → Task(subagent_type='infrastructure-testing-implementer')  [project-specific]
Phase 4A: Code Quality           → Task(subagent_type='code-quality-verifier')
Phase 4B: Security + E2E (VETO)  → Task(subagent_type='security-e2e-verifier')
Phase 5: Schema Testing          → Zod schema tests (Haiku)
```

**flutter:**
```
Phase 1: Context Discovery       → Task(subagent_type='Explore')
Phase 2: Architecture Review     → Task(subagent_type='flutter-architecture-expert')
Phase 3: Implementation          → Task(subagent_type='flutter-implementer')  [project-specific]
Phase 4: Quality Verification    → Task(subagent_type='flutter-quality-verifier')
Phase 5: Widget/Golden Tests     → Flutter test verification
```

### 5.4 scaffold — per-stack routing tables

**nestjs-ddd (istniejące):**
| Type | Pattern File |
|------|-------------|
| dto | patterns/application/command-handler-pattern.md |
| query-dto | patterns/application/query-handler-pattern.md |
| event | patterns/domain/domain-event-pattern.md |
| integration-event | patterns/architecture/integration-event-pattern.md |
| value-object | patterns/domain/value-object-pattern.md |
| specification | patterns/domain/specification-policy-pattern.md |
| handler | patterns/application/command-handler-pattern.md |
| query-handler | patterns/application/query-handler-pattern.md |
| test | patterns/testing/schema-testing-pattern.md |

**flutter (nowe):**
| Type | Pattern File |
|------|-------------|
| bloc | patterns/state/bloc-pattern.md |
| cubit | patterns/state/cubit-pattern.md |
| repository | patterns/data/repository-pattern.md |
| model | patterns/data/freezed-model-pattern.md |
| widget-test | patterns/testing/widget-test-pattern.md |
| feature | patterns/architecture/feature-structure-pattern.md |

---

## 6. Settings templates

### 6.1 base.json (wspólne dla wszystkich)

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "sonnet",
  "thinking": {
    "enabled": false,
    "useSelectiveThinking": true
  },
  "context": {
    "maxTokens": 128000,
    "compressionThreshold": 0.8,
    "prioritizeRecentMessages": true
  },
  "permissions": {
    "allow": [
      "mcp__zen__*",
      "mcp__ide__*",
      "WebSearch",
      "Bash(git:*)",
      "Bash(echo:*)",
      "Bash(cat:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(grep:*)",
      "Bash(find:*)",
      "Bash(ls:*)",
      "Bash(tree:*)",
      "Bash(mv:*)",
      "Bash(cp:*)",
      "Bash(rm:*)",
      "Bash(mkdir:*)",
      "Bash(chmod:*)",
      "Bash(sed:*)",
      "Bash(tee:*)",
      "Bash(xargs:*)",
      "Read(.claude/**)",
      "Read(/home/node/projects/**)",
      "Read(/tmp/**)",
      "Edit(.claude/**)",
      "Write(.claude/**)",
      "Glob(**/)",
      "Grep(**/)"
    ],
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/**)",
      "Read(**/*.key)",
      "Read(**/*.pem)",
      "Bash(curl --upload:*)",
      "Bash(wget --post:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "/home/node/.claude/hooks/cost-optimizer.sh" }]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "/home/node/.claude/hooks/state-manager.sh show" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "/home/node/.claude/hooks/session-monitor.sh" }]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "/home/node/.claude/hooks/session-monitor.sh" }]
      }
    ]
  }
}
```

### 6.2 nestjs-ddd.json (merge z base)

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(docker:*)",
      "Bash(docker-compose:*)",
      "Bash(timeout:*)",
      "Bash(psql:*)",
      "Bash(redis-cli:*)",
      "Bash(ss:*)",
      "Bash(lsof:*)",
      "Bash(pkill:*)",
      "Bash(python3:*)",
      "Read(src/**)",
      "Read(test/**)",
      "Read(docs/**)",
      "Read(project-orchestration/**)",
      "Edit(src/**)",
      "Edit(test/**)",
      "Write(src/**)",
      "Write(test/**)",
      "Write(docs/**)",
      "Write(project-orchestration/**)"
    ]
  },
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 6.3 flutter.json (merge z base)

```json
{
  "permissions": {
    "allow": [
      "Bash(flutter:*)",
      "Bash(dart:*)",
      "Bash(pub:*)",
      "Bash(adb:*)",
      "Bash(xcrun:*)",
      "Bash(pod:*)",
      "Read(lib/**)",
      "Read(test/**)",
      "Read(integration_test/**)",
      "Read(android/**)",
      "Read(ios/**)",
      "Edit(lib/**)",
      "Edit(test/**)",
      "Edit(integration_test/**)",
      "Write(lib/**)",
      "Write(test/**)",
      "Write(integration_test/**)"
    ]
  }
}
```

---

## 7. Scripts

### 7.1 setup-global.sh

```bash
#!/bin/bash
# setup-global.sh — symlink universal resources to ~/.claude/
# Run ONCE per machine (or after git pull with new universal agents)

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Claude Patterns: Global Setup ==="
echo "Repo: $REPO"

# Universal agents
rm -f ~/.claude/agents 2>/dev/null
ln -sfn "$REPO/agents/universal" ~/.claude/agents
echo "✅ ~/.claude/agents/ → agents/universal/"

# Universal skills
rm -f ~/.claude/skills 2>/dev/null
ln -sfn "$REPO/skills/universal" ~/.claude/skills
echo "✅ ~/.claude/skills/ → skills/universal/"

# Hooks (all universal)
rm -f ~/.claude/hooks 2>/dev/null
ln -sfn "$REPO/hooks" ~/.claude/hooks
echo "✅ ~/.claude/hooks/ → hooks/"

echo ""
echo "=== Done ==="
echo "Global resources linked. Run setup-project.sh per project for stack-specific setup."
```

### 7.2 setup-project.sh

```bash
#!/bin/bash
# setup-project.sh <project-path>
# Reads project.yml preset, links stack-specific agents/skills/patterns, generates settings.json

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
PROJECT_YML="$PROJECT_DIR/.claude/config/project.yml"

echo "=== Claude Patterns: Project Setup ==="
echo "Project: $PROJECT_DIR"
echo "Repo: $REPO"

# Read preset from project.yml
if [ ! -f "$PROJECT_YML" ]; then
  echo "❌ Missing: $PROJECT_YML"
  echo "   Create it with: preset: nestjs-ddd (or flutter, python)"
  exit 1
fi

PRESET=$(grep 'preset:' "$PROJECT_YML" | head -1 | awk '{print $2}')
if [ -z "$PRESET" ]; then
  echo "❌ No 'preset:' field in project.yml"
  exit 1
fi

echo "Preset: $PRESET"
echo ""

# Validate preset directories exist
for dir in "agents/stacks/$PRESET" "skills/stacks/$PRESET" "patterns/$PRESET"; do
  if [ ! -d "$REPO/$dir" ]; then
    echo "❌ Missing preset directory: $REPO/$dir"
    exit 1
  fi
done

# 1. Stack agents
mkdir -p "$PROJECT_DIR/.claude/agents"
rm -f "$PROJECT_DIR/.claude/agents/shared" 2>/dev/null
ln -sfn "$REPO/agents/stacks/$PRESET" "$PROJECT_DIR/.claude/agents/shared"
echo "✅ .claude/agents/shared/ → agents/stacks/$PRESET/"

# 2. Stack skills
mkdir -p "$PROJECT_DIR/.claude/skills"
rm -f "$PROJECT_DIR/.claude/skills/shared" 2>/dev/null
ln -sfn "$REPO/skills/stacks/$PRESET" "$PROJECT_DIR/.claude/skills/shared"
echo "✅ .claude/skills/shared/ → skills/stacks/$PRESET/"

# 3. Stack patterns
mkdir -p "$PROJECT_DIR/.claude/knowledge"
rm -f "$PROJECT_DIR/.claude/knowledge/patterns" 2>/dev/null
ln -sfn "$REPO/patterns/$PRESET" "$PROJECT_DIR/.claude/knowledge/patterns"
echo "✅ .claude/knowledge/patterns/ → patterns/$PRESET/"

# 4. Shared patterns
rm -f "$PROJECT_DIR/.claude/knowledge/patterns-shared" 2>/dev/null
if [ -d "$REPO/patterns/_shared" ]; then
  ln -sfn "$REPO/patterns/_shared" "$PROJECT_DIR/.claude/knowledge/patterns-shared"
  echo "✅ .claude/knowledge/patterns-shared/ → patterns/_shared/"
fi

# 5. Settings (merge base + preset, only if not exists)
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
  BASE="$REPO/templates/settings/base.json"
  STACK="$REPO/templates/settings/$PRESET.json"
  if [ -f "$BASE" ] && [ -f "$STACK" ]; then
    # Deep merge: base + stack overlay
    if command -v jq &> /dev/null; then
      jq -s '
        def deepmerge(a;b):
          a as $a | b as $b |
          if ($a | type) == "object" and ($b | type) == "object" then
            reduce ($b | keys[]) as $k ($a;
              if ($a[$k] | type) == "array" and ($b[$k] | type) == "array"
              then .[$k] = ($a[$k] + $b[$k])
              elif ($a[$k] | type) == "object" and ($b[$k] | type) == "object"
              then .[$k] = deepmerge($a[$k]; $b[$k])
              else .[$k] = $b[$k]
              end
            )
          else $b
          end;
        deepmerge(.[0]; .[1])
      ' "$BASE" "$STACK" > "$SETTINGS_FILE"
      echo "✅ .claude/settings.json ← merged(base + $PRESET)"
    else
      echo "⚠️  jq not found — copying base settings only"
      cp "$BASE" "$SETTINGS_FILE"
    fi
  fi
else
  echo "⏭️  .claude/settings.json exists (not overwriting)"
fi

# 6. Ensure patterns-local exists
mkdir -p "$PROJECT_DIR/.claude/knowledge/patterns-local"

# Summary
echo ""
echo "=== Setup Complete ==="
echo "Preset: $PRESET"
echo ""
echo "Linked:"
echo "  agents/shared/          → $PRESET agents"
echo "  skills/shared/          → $PRESET skills"
echo "  knowledge/patterns/     → $PRESET patterns"
echo "  knowledge/patterns-shared/ → shared patterns"
echo ""
echo "Next steps:"
echo "  1. Add project-specific agents to .claude/agents/ (orchestrator, implementers)"
echo "  2. Review .claude/settings.json and customize if needed"
echo "  3. Test: open Claude Code in this project"
```

---

## 8. Kroki migracji (SEQUENTIAL!)

> **UWAGA**: Wykonuj gdy ŻADNE inne sesje Claude Code nie są aktywne!
> Zmiana symlinków w trakcie sesji może powodować błędy.

### Krok 1: Backup

```bash
# Backup obecnych symlinków
ls -la ~/.claude/agents ~/.claude/commands ~/.claude/hooks ~/.claude/skills > ~/claude-symlinks-backup.txt
```

### Krok 2: Reorganizacja agents/

```bash
cd ~/projects/claude-patterns

# Przenieś do universal/
mkdir -p agents/universal
# UWAGA: sprawdź które pliki są truly universal przed przeniesieniem!
# Na podstawie analizy:
mv agents/specialists/technical-architecture-lead.md agents/universal/
mv agents/specialists/security-privacy-architect.md agents/universal/

# Przenieś do stacks/nestjs-ddd/
mkdir -p agents/stacks/nestjs-ddd
mv agents/specialists/backend-technology-expert.md agents/stacks/nestjs-ddd/
mv agents/specialists/ddd-application-expert.md agents/stacks/nestjs-ddd/
mv agents/verifiers/code-quality-verifier.md agents/stacks/nestjs-ddd/
mv agents/verifiers/security-e2e-verifier.md agents/stacks/nestjs-ddd/

# Przenieś agents-universal.yml i README do bezpiecznego miejsca
mv agents/agents-universal.yml tooling/
mv agents/README.md agents/README.md.bak

# Utwórz placeholder dla flutter
mkdir -p agents/stacks/flutter
# (agentów flutter trzeba napisać)

# Cleanup puste katalogi
rmdir agents/specialists agents/verifiers 2>/dev/null || true
```

### Krok 3: Reorganizacja patterns/

```bash
cd ~/projects/claude-patterns

# Przenieś CAŁĄ obecną strukturę do nestjs-ddd/ (zachowując wewnętrzny układ!)
mkdir -p patterns/nestjs-ddd
mv patterns/domain patterns/nestjs-ddd/
mv patterns/application patterns/nestjs-ddd/
mv patterns/infrastructure patterns/nestjs-ddd/
mv patterns/architecture patterns/nestjs-ddd/
mv patterns/testing patterns/nestjs-ddd/
mv patterns/cross-layer patterns/nestjs-ddd/
mv patterns/README.md patterns/nestjs-ddd/

# Zachowaj METADATA.yml
# (są w subdirach domain/, application/ etc. — przeniosły się automatycznie)

# Utwórz _shared/ z universal concepts
mkdir -p patterns/_shared
cp patterns/nestjs-ddd/architecture/fresh-context-pattern.md patterns/_shared/
# Dodaj inne shared concepts wg potrzeby

# Utwórz placeholder dla flutter
mkdir -p patterns/flutter/{state,data,presentation,testing,architecture}

# Utwórz placeholder dla python
mkdir -p patterns/python
```

### Krok 4: Migracja commands/ → skills/

```bash
cd ~/projects/claude-patterns

# Utwórz skills structure
mkdir -p skills/universal/progress
mkdir -p skills/stacks/nestjs-ddd/orchestrate
mkdir -p skills/stacks/nestjs-ddd/scaffold
mkdir -p skills/stacks/flutter/orchestrate
mkdir -p skills/stacks/flutter/scaffold

# Migruj progress (universal)
# Zmień format: .md → SKILL.md w katalogu
# Treść: dodaj/zachowaj frontmatter z name + description
mv commands/progress.md skills/universal/progress/SKILL.md

# Migruj orchestrate i scaffold (nestjs-ddd)
mv commands/orchestrate.md skills/stacks/nestjs-ddd/orchestrate/SKILL.md
mv commands/scaffold.md skills/stacks/nestjs-ddd/scaffold/SKILL.md

# Flutter orchestrate i scaffold — NAPISAĆ NOWE
# (placeholder: skopiuj nestjs i dostosuj)

# Zachowaj deprecated/ na wszelki wypadek
mv commands/deprecated/ skills/deprecated/
mv commands/README.md skills/README.md

# Usuń pusty commands/
rmdir commands/
```

### Krok 5: Utwórz presets.yml

```bash
# Plik już zdefiniowany w sekcji 3.2 tego dokumentu
# → claude-patterns/presets.yml
```

### Krok 6: Utwórz settings templates

```bash
mkdir -p templates/settings
# Utwórz base.json, nestjs-ddd.json, flutter.json
# → zdefiniowane w sekcji 6 tego dokumentu
```

### Krok 7: Utwórz nowe scripts

```bash
# Zastąp scripts/setup-global.sh i scripts/setup-project.sh
# → zdefiniowane w sekcji 7 tego dokumentu
```

### Krok 8: Aktualizuj globalne symlinki

```bash
# Usuń stare symlinki
rm ~/.claude/agents ~/.claude/commands ~/.claude/skills ~/.claude/hooks

# Uruchom nowy setup-global.sh
~/projects/claude-patterns/scripts/setup-global.sh
```

### Krok 9: Aktualizuj project.yml w istniejących projektach

```bash
# local-hero-3
echo "  preset: nestjs-ddd" >> ~/projects/local-hero-3/.claude/config/project.yml

# local-hero-4
echo "  preset: nestjs-ddd" >> ~/projects/local-hero-4/.claude/config/project.yml

# universal-learning-system
echo "  preset: nestjs-ddd" >> ~/projects/universal-learning-system/.claude/config/project.yml
```

### Krok 10: Uruchom setup-project.sh na istniejących projektach

```bash
~/projects/claude-patterns/scripts/setup-project.sh ~/projects/local-hero-3
~/projects/claude-patterns/scripts/setup-project.sh ~/projects/local-hero-4
~/projects/claude-patterns/scripts/setup-project.sh ~/projects/universal-learning-system
```

### Krok 11: Weryfikacja

```bash
# Sprawdź symlinki w każdym projekcie
for proj in local-hero-3 local-hero-4 universal-learning-system; do
  echo "=== $proj ==="
  ls -la ~/projects/$proj/.claude/agents/shared/ 2>/dev/null
  ls -la ~/projects/$proj/.claude/skills/shared/ 2>/dev/null
  ls -la ~/projects/$proj/.claude/knowledge/patterns 2>/dev/null
  echo ""
done

# Sprawdź globalne
ls -la ~/.claude/agents/ ~/.claude/skills/ ~/.claude/hooks/
```

### Krok 12: Git commit

```bash
cd ~/projects/claude-patterns
git add -A
git commit -m "feat: multi-stack architecture with preset-based resource selection

- Reorganize agents/ into universal/ + stacks/{preset}/
- Migrate commands/ to skills/ (SKILL.md format, auto-detection)
- Reorganize patterns/ into {preset}/ dirs (internal structure unchanged)
- Add presets.yml for preset → directory mapping
- Add settings templates (base + per-preset merge)
- Rewrite setup-global.sh and setup-project.sh
- Support: nestjs-ddd (existing), flutter (new), python (placeholder)"
```

---

## 9. Co trzeba NAPISAĆ (nie przenieść)

### 9.1 Flutter agents (agents/stacks/flutter/)

| Agent | Model | Odpowiedzialność |
|-------|-------|------------------|
| flutter-architecture-expert.md | Sonnet | Feature-first structure, state management choice, navigation, DI |
| flutter-quality-verifier.md | Sonnet, VETO | Widget test coverage, golden tests, BLoC pattern compliance |

### 9.2 Flutter skills (skills/stacks/flutter/)

| Skill | Model | Do napisania |
|-------|-------|-------------|
| orchestrate/SKILL.md | Sonnet | Flutter delegation chain (Phase 1-5 z Flutter agents) |
| scaffold/SKILL.md | Haiku | Flutter routing table (bloc, cubit, repository, widget-test, feature) |

### 9.3 Flutter patterns (patterns/flutter/)

| Dir | Patterns do napisania |
|-----|----------------------|
| state/ | bloc-pattern.md, cubit-pattern.md, riverpod-pattern.md |
| data/ | repository-pattern.md, freezed-model-pattern.md, dio-client-pattern.md |
| presentation/ | widget-composition-pattern.md, navigation-pattern.md |
| testing/ | widget-test-pattern.md, golden-test-pattern.md, integration-test-pattern.md |
| architecture/ | feature-structure-pattern.md, di-pattern.md |

### 9.4 Settings template (templates/settings/flutter.json)

Zdefiniowany w sekcji 6.3.

---

## 10. Zachowanie istniejącej funkcjonalności — checklist

- [ ] Pattern paths w nestjs-ddd agent definitions — nadal `patterns/domain/`, `patterns/application/` (bo symlink wskazuje na patterns/nestjs-ddd/ który ma tę samą wewnętrzną strukturę)
- [ ] orchestrate skill dla nestjs-ddd — ta sama delegation chain co obecny commands/orchestrate.md
- [ ] scaffold skill dla nestjs-ddd — ta sama routing table co obecny commands/scaffold.md
- [ ] Hooks — te same ścieżki w settings.json (nadal `/home/node/.claude/hooks/`)
- [ ] settings.json — istniejące NIE nadpisywane (setup-project.sh tworzy tylko jeśli brak)
- [ ] Project-specific agents (orchestrator, implementers) — nietknięte, zostają w .claude/agents/
- [ ] cost-optimizer, session-monitor, state-manager — działają bez zmian
- [ ] VETO chain (code-quality-verifier → security-e2e-verifier) — zachowana
- [ ] Haiku for search, Sonnet for implementation, Opus for strategic — zachowane (model w .md files)
- [ ] compilation system (tooling/compile-agents.js) — nadal działa (dla project-specific agents)

---

## 11. Ryzyka i mitygacje

| Ryzyko | Prawdopodobieństwo | Mitygacja |
|--------|-------------------|-----------|
| Broken symlinks po migracji | Średnie | Krok 11 weryfikacja, backup w kroku 1 |
| Pattern paths w agent definitions nie zgadzają się | Niskie | Wewnętrzna struktura nestjs-ddd/ NIE zmienia się |
| Claude Code nie odkrywa skills z .claude/skills/shared/ | Niskie | Testować przed pełną migracją |
| Aktywne sesje Claude Code podczas migracji | Wysokie | **NIE migrować gdy sesje aktywne!** |
| jq nie zainstalowane (settings merge) | Niskie | Fallback: kopiuj base.json |

---

## 12. Przyszłe rozszerzenia

- **Python preset**: agents/stacks/python/, patterns/python/, skills/stacks/python/
- **AI/ML preset**: rozszerzenie python o ML-specific agents i patterns
- **MCP server**: opcjonalnie aktywować dla claude.ai / team access
- **Registry.yml + feature tags**: jeśli ilość presetów > 5, rozważyć granularną kompozycję
- **Preset inheritance**: np. `python-ml` inherits from `python` base
