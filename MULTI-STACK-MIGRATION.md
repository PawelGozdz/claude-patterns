# Multi-Stack Architecture Migration Plan

> **Status**: PLANNED (nie implementować gdy inne sesje Claude Code są aktywne!)
> **Created**: 2026-02-10
> **Updated**: 2026-02-13 (skonsolidowany z RFC-001-CRITICAL-RULES-INJECTION)
> **Affects**: claude-patterns, local-hero-3, local-hero-4, universal-learning-system

---

## 1. Problemy (dwa, jedno rozwiązanie)

### Problem A: Brak multi-stack (oryginalny MULTI-STACK-MIGRATION)

claude-patterns działa dla TypeScript/NestJS, ale:
- Wszystkie agents/skills/patterns są NestJS-specific i globalnie widoczne (`~/.claude/` symlinks)
- Nie da się dodać Flutter/Python projektu bez zaśmiecania go NestJS agentami
- Brak mechanizmu "ten projekt używa tych narzędzi, tamten innych"

### Problem B: Pomijanie patterns (oryginalny RFC-001)

Claude Code wielokrotnie łamie architekturę mimo pełnej dokumentacji w patterns/:
- Kontrolery w `src/contexts/` zamiast `src/app/api/`
- Brakujące schema testy z 6 kategoriami
- Pattern: Claude implementuje → pomija czytanie patterns → błędy → user pyta "sprawdziłeś patterns?" → "nie"

### Dlaczego jedno rozwiązanie

RFC-001 proponował nowy system injection (snippety, lib/, docs symlinki). Ale **infrastruktura już istnieje**:

```
templates/core.md              → %%RULES%% + %%STACK_CONTENT%% placeholders
templates/stacks/nestjs-ddd.md → "Key Architecture Rules" sekcja (niepełna)
project.yml                    → rules: [...] + stack_profile: nestjs-ddd
generate-claude-md.sh          → składa core + stack + local → CLAUDE.md
```

RFC-001 = **rozszerz `stacks/nestjs-ddd.md`** o brakujące krytyczne reguły. Żadnych nowych plików.

---

## 2. Cel

Architektura **stack_profile-based**: każdy projekt deklaruje `stack_profile: nestjs-ddd` w `project.yml`, a `setup-project.sh`:
1. Linkuje **tylko właściwe** agents/patterns/skills do `.claude/` projektu
2. Generuje `settings.json` z właściwymi permissions per stack
3. Generuje `CLAUDE.md` z **krytycznymi regułami** widocznymi w system prompt

---

## 3. Architektura docelowa

### 3.1 Struktura repo

```
claude-patterns/
├── agents/
│   ├── universal/                         ← global: ~/.claude/agents/
│   │   ├── technical-architecture-lead.md
│   │   └── security-privacy-architect.md
│   │
│   └── stacks/
│       └── nestjs-ddd/                    ← per-project: .claude/agents/shared/
│           ├── backend-technology-expert.md
│           ├── ddd-application-expert.md
│           ├── code-quality-verifier.md
│           └── security-e2e-verifier.md
│
├── skills/                                ← ZASTĘPUJE commands/
│   ├── universal/                         ← global: ~/.claude/skills/
│   │   └── progress/
│   │       └── SKILL.md
│   │
│   └── stacks/
│       └── nestjs-ddd/                    ← per-project: .claude/skills/shared/
│           ├── orchestrate/
│           │   └── SKILL.md
│           └── scaffold/
│               └── SKILL.md
│
├── hooks/                                 ← global: ~/.claude/hooks/
│   ├── cost-optimizer.sh
│   ├── session-monitor.sh
│   └── state-manager.sh
│
├── patterns/
│   └── nestjs-ddd/                        ← PRZENIESIONE z patterns/ (bez zmian wewnątrz!)
│       ├── domain/
│       │   ├── aggregate-pattern.md
│       │   ├── value-object-pattern.md
│       │   ├── entity-pattern.md
│       │   ├── domain-event-pattern.md
│       │   ├── specification-policy-pattern.md
│       │   └── domain-service-pattern.md
│       ├── application/
│       │   ├── command-handler-pattern.md
│       │   ├── query-handler-pattern.md
│       │   ├── application-service-pattern.md
│       │   └── audit-handler-pattern.md
│       ├── infrastructure/
│       │   ├── repository-pattern.md
│       │   ├── repository-events-pattern.md
│       │   ├── mapper-pattern.md
│       │   └── controller-schema-pattern.md
│       ├── architecture/
│       │   ├── acl-registry-pattern.md
│       │   ├── dual-identity-pattern.md
│       │   ├── transactional-pattern.md
│       │   ├── user-projection-pattern.md
│       │   ├── bullmq-queue-pattern.md
│       │   ├── integration-event-pattern.md
│       │   └── entity-event-emission-pattern.md
│       ├── testing/
│       │   ├── testing-pyramid-pattern.md
│       │   ├── schema-testing-pattern.md
│       │   ├── context-isolation-pattern.md
│       │   ├── e2e-hybrid-fixture-pattern.md
│       │   ├── test-seeding-performance-guide.md
│       │   ├── rate-limit-testing-pattern.md
│       │   └── redis-test-isolation-pattern.md
│       └── cross-layer/
│           ├── domain-errors-pattern.md
│           ├── logger-pattern.md
│           ├── error-handler-chain-pattern.md
│           └── conventions-pattern.md
│
├── templates/
│   ├── core.md                            ← BEZ ZMIAN (universal CLAUDE.md template)
│   ├── project.yml.example                ← BEZ ZMIAN
│   ├── CLAUDE-LOCAL.md.example            ← BEZ ZMIAN
│   ├── README.md                          ← BEZ ZMIAN
│   ├── stacks/                            ← ZAKTUALIZOWAĆ (critical rules)
│   │   ├── nestjs-ddd.md                     ← rozszerzyć o reguły z RFC-001
│   │   ├── flutter.md                        ← istniejący
│   │   └── python.md                         ← istniejący
│   ├── settings/                          ← NOWE
│   │   ├── base.json                         ← wspólne: hooks, permissions, mcp
│   │   ├── nestjs-ddd.json                   ← Bash: pnpm, psql; paths: src/**
│   │   └── flutter.json                      ← Bash: flutter, dart; paths: lib/**
│   └── examples/                          ← BEZ ZMIAN
│       ├── flutter-project.yml
│       └── python-project.yml
│
├── mcp-server/                            ← zachować
├── tooling/                               ← zachować
│
├── scripts/
│   ├── generate-claude-md.sh              ← BEZ ZMIAN (działa z %%STACK_CONTENT%%)
│   ├── setup-global.sh                    ← PRZEPISAĆ
│   ├── setup-project.sh                   ← PRZEPISAĆ
│   └── validate-metadata.sh              ← zaktualizować ścieżki
│
└── MULTI-STACK-MIGRATION.md              ← ten plik
```

### 3.2 Co WYRZUCAMY vs oryginalne plany

| Element | Werdykt | Dlaczego |
|---------|---------|----------|
| `presets.yml` | Nie robimy | Konwencja `stack_profile` → nazwa katalogu wystarczy |
| `patterns/_shared/` | Nie robimy | Z jednym stackiem nie ma co współdzielić; dodamy przy 2+ |
| Puste placeholdery flutter/python | Nie robimy | Dodamy katalogi gdy będą potrzebne |
| `templates/critical-rules/*.snippet.md` | Nie robimy | `stacks/nestjs-ddd.md` już pełni tę rolę |
| `templates/docs/` symlinki | Nie robimy | `patterns/` już jest w knowledge/ via symlink |
| `lib/inject-critical-rules.sh` | Nie robimy | `generate-claude-md.sh` + `%%STACK_CONTENT%%` wystarczy |

### 3.3 Jak `stack_profile` steruje wszystkim

`project.yml` ma pole `stack_profile: nestjs-ddd`. To jest jedyny "routing key":

```
stack_profile: nestjs-ddd
  │
  ├─ generate-claude-md.sh  → templates/stacks/nestjs-ddd.md  → %%STACK_CONTENT%%
  ├─ setup-project.sh       → agents/stacks/nestjs-ddd/       → .claude/agents/shared/
  ├─ setup-project.sh       → skills/stacks/nestjs-ddd/       → .claude/skills/shared/
  ├─ setup-project.sh       → patterns/nestjs-ddd/            → .claude/knowledge/patterns/
  └─ setup-project.sh       → templates/settings/nestjs-ddd.json → .claude/settings.json
```

### 3.4 Rezultat w projekcie

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
├── knowledge/
│   ├── patterns/         → claude-patterns/patterns/nestjs-ddd/       (dir symlink)
│   ├── patterns-local/                    (project-specific overrides)
│   └── learned/                           (project-specific discoveries)
│
├── config/
│   └── project.yml
│
└── settings.json                          (wygenerowany z templates)
```

---

## 4. Rozwiązanie RFC-001: rozszerzenie stacks/nestjs-ddd.md

### 4.1 Obecna treść (niepełna)

```markdown
## Key Architecture Rules
- **ACL Registry**: NEVER import between contexts...
- **Dual Identity**: NEVER accept userId from request body...
```

### 4.2 Docelowa treść (rozszerzona o critical rules)

```markdown
## Implementation Workflow (MANDATORY)

BEFORE any implementation:
1. Read relevant pattern from `.claude/knowledge/patterns/`
2. Find existing example in codebase (Glob/Grep)
3. THEN implement following the pattern

## Key Architecture Rules

- **Controllers:** `src/app/api/{domain}/` — NEVER in `src/contexts/{context}/infrastructure/`
- **Schemas:** `src/shared/validation/schemas/{domain}/` — NEVER in contexts
- **Schema tests:** ALL schemas MUST have `__tests__/` with 6-category security tests
- **Contexts:** ONLY `domain/`, `application/`, `infrastructure/` (repos, ACL)
- **Module Organization**: If file imports from `./index`, it CANNOT be exported from that `./index`
- **ACL Registry**: NEVER import between contexts. Use `aclRegistry.getGlobalRequired()`
- **Hybrid Events**: Domain events in aggregates, Integration events from handlers only
- **PolicyBuilder**: ALWAYS use `.must(spec)`. NEVER `BusinessRuleValidator.addRule()`
- **Dual Identity**: NEVER accept userId from request body. Extract from `RequestContextService`
- **@Transactional**: `Result.fail()` rollback, `Result.ok()` commit

## Testing Strategy

- **Test Pyramid:** L1 ~50%, L2 ~30%, L3 ~20%
- **E2E tests:** `test/app/api/{domain}/` — happy path + auth + rate limits (SEPARATE files)
- **Rate limit tests:** ALWAYS in separate `*-rate-limits.e2e.spec.ts` files
```

### 4.3 Dlaczego to rozwiązuje problem RFC-001

1. `generate-claude-md.sh` wstawia tę treść do `%%STACK_CONTENT%%` w CLAUDE.md
2. CLAUDE.md jest w system prompt → Claude WIDZI te reguły przy każdej odpowiedzi
3. Zero nowych plików, zero nowej infrastruktury — rozszerzenie istniejącego mechanizmu
4. Update: edytuj `stacks/nestjs-ddd.md` → uruchom `generate-claude-md.sh` → gotowe

### 4.4 Odrzucone alternatywy (z RFC-001)

| Podejście | Dlaczego odrzucone |
|-----------|-------------------|
| **Osobne snippety** (`templates/critical-rules/*.snippet.md`) | Duplikacja — `stacks/nestjs-ddd.md` + `%%STACK_CONTENT%%` już robi to samo |
| **Referencja do pliku** ("see .claude/WORKFLOW_RULES.md") | Wymaga aktywnego czytania — ten sam failure mode co patterns |
| **Enforcement przez /orchestrate** | Nie działa gdy user mówi "implement X" bez /o |
| **Post-implementation validation** (`validate-structure.sh`) | Łapie błędy PO fakcie — marnuje czas na rework |
| **Auto-ekstrakcja MUST z patterns** | Sekcje MUST są zbyt verbose (60+ linii); CLAUDE.md potrzebuje zwięzłej ściągi, nie podręcznika |

---

## 5. Klasyfikacja agentów

| Agent | Kategoria | Stack | Model |
|-------|-----------|-------|-------|
| technical-architecture-lead | **UNIVERSAL** | global | Opus |
| security-privacy-architect | **UNIVERSAL** | global | Opus |
| backend-technology-expert | nestjs-ddd | stack | Opus |
| ddd-application-expert | nestjs-ddd | stack | Sonnet |
| code-quality-verifier | nestjs-ddd | stack | Sonnet, VETO |
| security-e2e-verifier | nestjs-ddd | stack | Opus, VETO |

---

## 6. Skills (zastępują commands/)

### 6.1 Dlaczego skills > commands

- **Auto-detection**: Claude sam rozpoznaje "implement aggregate" i odpala skill
- **Modularność**: SKILL.md + helpery w katalogu
- **Per-stack**: orchestrate/scaffold mają inny workflow per stack
- **Model per skill**: haiku dla scaffold, sonnet dla orchestrate

### 6.2 Migracja

| Źródło | Cel | Kategoria |
|--------|-----|-----------|
| `commands/progress.md` | `skills/universal/progress/SKILL.md` | universal |
| `commands/orchestrate.md` | `skills/stacks/nestjs-ddd/orchestrate/SKILL.md` | per-stack |
| `commands/scaffold.md` | `skills/stacks/nestjs-ddd/scaffold/SKILL.md` | per-stack |

### 6.3 orchestrate — nestjs-ddd delegation chain

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

### 6.4 scaffold — nestjs-ddd routing table

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

---

## 7. Settings templates

### 7.1 base.json (wspólne dla wszystkich)

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

### 7.2 nestjs-ddd.json (merge z base)

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

---

## 8. Scripts

### 8.1 setup-global.sh

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
echo "  ~/.claude/agents/ -> agents/universal/"

# Universal skills
rm -f ~/.claude/skills 2>/dev/null
ln -sfn "$REPO/skills/universal" ~/.claude/skills
echo "  ~/.claude/skills/ -> skills/universal/"

# Hooks (all universal)
rm -f ~/.claude/hooks 2>/dev/null
ln -sfn "$REPO/hooks" ~/.claude/hooks
echo "  ~/.claude/hooks/ -> hooks/"

echo ""
echo "=== Done ==="
echo "Global resources linked. Run setup-project.sh per project for stack-specific setup."
```

### 8.2 setup-project.sh

```bash
#!/bin/bash
# setup-project.sh <project-path>
# Reads stack_profile from project.yml, links stack-specific resources,
# generates settings.json, generates CLAUDE.md

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="${1:-.}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
PROJECT_YML="$PROJECT_DIR/.claude/config/project.yml"

echo "=== Claude Patterns: Project Setup ==="
echo "Project: $PROJECT_DIR"
echo "Repo: $REPO"

# Read stack_profile from project.yml
if [ ! -f "$PROJECT_YML" ]; then
  echo "Missing: $PROJECT_YML"
  echo "  Copy from: $REPO/templates/project.yml.example"
  exit 1
fi

STACK=$(grep 'stack_profile:' "$PROJECT_YML" | head -1 | awk '{print $2}')
if [ -z "$STACK" ]; then
  echo "No 'stack_profile:' in project.yml"
  exit 1
fi

echo "Stack profile: $STACK"
echo ""

# Validate stack directories exist
MISSING=0
for dir in "agents/stacks/$STACK" "skills/stacks/$STACK" "patterns/$STACK"; do
  if [ ! -d "$REPO/$dir" ]; then
    echo "Missing: $REPO/$dir"
    MISSING=1
  fi
done
[ $MISSING -eq 1 ] && exit 1

# 1. Stack agents
mkdir -p "$PROJECT_DIR/.claude/agents"
rm -f "$PROJECT_DIR/.claude/agents/shared" 2>/dev/null
ln -sfn "$REPO/agents/stacks/$STACK" "$PROJECT_DIR/.claude/agents/shared"
echo "  .claude/agents/shared/ -> agents/stacks/$STACK/"

# 2. Stack skills
mkdir -p "$PROJECT_DIR/.claude/skills"
rm -f "$PROJECT_DIR/.claude/skills/shared" 2>/dev/null
ln -sfn "$REPO/skills/stacks/$STACK" "$PROJECT_DIR/.claude/skills/shared"
echo "  .claude/skills/shared/ -> skills/stacks/$STACK/"

# 3. Stack patterns
mkdir -p "$PROJECT_DIR/.claude/knowledge"
rm -f "$PROJECT_DIR/.claude/knowledge/patterns" 2>/dev/null
ln -sfn "$REPO/patterns/$STACK" "$PROJECT_DIR/.claude/knowledge/patterns"
echo "  .claude/knowledge/patterns/ -> patterns/$STACK/"

# 4. Settings (merge base + stack, only if not exists)
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
  BASE="$REPO/templates/settings/base.json"
  STACK_SETTINGS="$REPO/templates/settings/$STACK.json"
  if [ -f "$BASE" ] && [ -f "$STACK_SETTINGS" ]; then
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
      ' "$BASE" "$STACK_SETTINGS" > "$SETTINGS_FILE"
      echo "  .claude/settings.json <- merged(base + $STACK)"
    else
      echo "  jq not found - copying base settings only"
      cp "$BASE" "$SETTINGS_FILE"
    fi
  fi
else
  echo "  .claude/settings.json exists (not overwriting)"
fi

# 5. Generate CLAUDE.md
"$REPO/scripts/generate-claude-md.sh" "$PROJECT_DIR"

# 6. Ensure patterns-local exists for project overrides
mkdir -p "$PROJECT_DIR/.claude/knowledge/patterns-local"

echo ""
echo "=== Setup Complete ==="
echo "Stack: $STACK"
echo ""
echo "Next steps:"
echo "  1. Add project-specific agents to .claude/agents/ (orchestrator, implementers)"
echo "  2. Review .claude/settings.json"
echo "  3. Open Claude Code in this project"
```

---

## 9. Kroki migracji (SEQUENTIAL!)

> **UWAGA**: Wykonuj gdy ZADNE inne sesje Claude Code nie sa aktywne!
> Zmiana symlinków w trakcie sesji może powodować błędy.

### Krok 1: Backup

```bash
ls -la ~/.claude/agents ~/.claude/commands ~/.claude/hooks ~/.claude/skills > ~/claude-symlinks-backup.txt
```

### Krok 2: Rozszerz stacks/nestjs-ddd.md o critical rules (RFC-001)

Edytuj `templates/stacks/nestjs-ddd.md`:
- Dodaj sekcję "Implementation Workflow (MANDATORY)"
- Rozszerz "Key Architecture Rules" o reguły z sekcji 4.2 tego dokumentu
- Dodaj pełniejszą sekcję "Testing Strategy"

```bash
# Zweryfikuj rezultat:
./scripts/generate-claude-md.sh ~/projects/local-hero-4
# Sprawdź czy critical rules pojawiają się w CLAUDE.md
grep -A5 "Implementation Workflow" ~/projects/local-hero-4/CLAUDE.md
```

### Krok 3: Reorganizacja agents/

```bash
cd ~/projects/claude-patterns

# Universal agents
mkdir -p agents/universal
mv agents/specialists/technical-architecture-lead.md agents/universal/
mv agents/specialists/security-privacy-architect.md agents/universal/

# NestJS stack agents
mkdir -p agents/stacks/nestjs-ddd
mv agents/specialists/backend-technology-expert.md agents/stacks/nestjs-ddd/
mv agents/specialists/ddd-application-expert.md agents/stacks/nestjs-ddd/
mv agents/verifiers/code-quality-verifier.md agents/stacks/nestjs-ddd/
mv agents/verifiers/security-e2e-verifier.md agents/stacks/nestjs-ddd/

# Przenieś metadata
mv agents/agents-universal.yml tooling/

# Cleanup
rm -rf agents/specialists agents/verifiers agents/README.md
```

### Krok 4: Reorganizacja patterns/

```bash
cd ~/projects/claude-patterns

# Przenieś CALA strukturę do nestjs-ddd/ (wewnętrzny układ BEZ ZMIAN!)
mkdir -p patterns/nestjs-ddd
mv patterns/domain patterns/nestjs-ddd/
mv patterns/application patterns/nestjs-ddd/
mv patterns/infrastructure patterns/nestjs-ddd/
mv patterns/architecture patterns/nestjs-ddd/
mv patterns/testing patterns/nestjs-ddd/
mv patterns/cross-layer patterns/nestjs-ddd/
mv patterns/README.md patterns/nestjs-ddd/
```

### Krok 5: Migracja commands/ -> skills/

```bash
cd ~/projects/claude-patterns

# Universal skill
mkdir -p skills/universal/progress
mv commands/progress.md skills/universal/progress/SKILL.md

# NestJS stack skills
mkdir -p skills/stacks/nestjs-ddd/orchestrate
mkdir -p skills/stacks/nestjs-ddd/scaffold
mv commands/orchestrate.md skills/stacks/nestjs-ddd/orchestrate/SKILL.md
mv commands/scaffold.md skills/stacks/nestjs-ddd/scaffold/SKILL.md

# Cleanup
rm -f commands/README.md
rmdir commands/
```

### Krok 6: Utwórz settings templates

```bash
mkdir -p templates/settings
# Utwórz base.json i nestjs-ddd.json
# -> zdefiniowane w sekcji 7 tego dokumentu
```

### Krok 7: Nowe scripts

```bash
# Zastąp scripts/setup-global.sh i scripts/setup-project.sh
# -> zdefiniowane w sekcji 8 tego dokumentu
```

### Krok 8: Aktualizuj globalne symlinki

```bash
# Usuń stare
rm -f ~/.claude/agents ~/.claude/commands ~/.claude/skills ~/.claude/hooks

# Uruchom nowy setup
~/projects/claude-patterns/scripts/setup-global.sh
```

### Krok 9: Uruchom setup-project.sh na istniejących projektach

```bash
~/projects/claude-patterns/scripts/setup-project.sh ~/projects/local-hero-3
~/projects/claude-patterns/scripts/setup-project.sh ~/projects/local-hero-4
~/projects/claude-patterns/scripts/setup-project.sh ~/projects/universal-learning-system
```

### Krok 10: Weryfikacja

```bash
# Sprawdź symlinki w kazdym projekcie
for proj in local-hero-3 local-hero-4 universal-learning-system; do
  echo "=== $proj ==="
  ls -la ~/projects/$proj/.claude/agents/shared/ 2>/dev/null
  ls -la ~/projects/$proj/.claude/skills/shared/ 2>/dev/null
  ls -la ~/projects/$proj/.claude/knowledge/patterns 2>/dev/null
  echo ""
done

# Sprawdź globalne
ls -la ~/.claude/agents/ ~/.claude/skills/ ~/.claude/hooks/

# Sprawdź CLAUDE.md zawiera critical rules
grep "Implementation Workflow" ~/projects/local-hero-4/CLAUDE.md
grep "Controllers:" ~/projects/local-hero-4/CLAUDE.md
```

### Krok 11: Git commits (osobne per krok!)

```bash
cd ~/projects/claude-patterns

# Commit 1: RFC-001 fix (stack template update)
git add templates/stacks/nestjs-ddd.md
git commit -m "fix: add critical rules to nestjs-ddd stack template (resolves RFC-001)"

# Commit 2: Agents reorganization
git add agents/
git commit -m "refactor: reorganize agents into universal/ + stacks/nestjs-ddd/"

# Commit 3: Patterns reorganization
git add patterns/
git commit -m "refactor: move patterns into patterns/nestjs-ddd/ (internal structure unchanged)"

# Commit 4: Commands -> Skills migration
git add skills/ commands/
git commit -m "refactor: migrate commands/ to skills/ (SKILL.md format)"

# Commit 5: Settings templates + scripts
git add templates/settings/ scripts/
git commit -m "feat: add settings templates and rewrite setup scripts for multi-stack"

# Commit 6: Cleanup
git add -A
git commit -m "chore: remove RFC-001 (consolidated into migration plan), cleanup"
```

---

## 10. Zachowanie istniejącej funkcjonalności — checklist

- [ ] Pattern paths w agent definitions — nadal `patterns/domain/`, `patterns/application/` (symlink wskazuje na patterns/nestjs-ddd/ z tą samą wewnętrzną strukturą)
- [ ] orchestrate skill — ta sama delegation chain co commands/orchestrate.md
- [ ] scaffold skill — ta sama routing table co commands/scaffold.md
- [ ] Hooks — te same ścieżki w settings.json (`/home/node/.claude/hooks/`)
- [ ] settings.json — istniejące NIE nadpisywane (tworzy tylko jeśli brak)
- [ ] Project-specific agents (orchestrator, implementers) — nietknięte
- [ ] cost-optimizer, session-monitor, state-manager — działają bez zmian
- [ ] VETO chain (code-quality-verifier -> security-e2e-verifier) — zachowana
- [ ] Model tiers (Haiku/Sonnet/Opus) — zachowane (model w .md files)
- [ ] compilation system (tooling/compile-agents.js) — nadal działa
- [ ] Critical rules widoczne w CLAUDE.md — stacks/nestjs-ddd.md content via %%STACK_CONTENT%%
- [ ] generate-claude-md.sh — BEZ ZMIAN (template pipeline działa)

---

## 11. Ryzyka i mitygacje

| Ryzyko | Prawdop. | Mitygacja |
|--------|----------|-----------|
| Broken symlinks po migracji | Średnie | Krok 10 weryfikacja, backup w kroku 1 |
| Pattern paths w agent definitions nie zgadzają się | Niskie | Wewnętrzna struktura nestjs-ddd/ NIE zmienia się |
| Claude Code nie odkrywa skills z .claude/skills/shared/ | Niskie | Testować przed pełną migracją |
| Aktywne sesje Claude Code podczas migracji | Wysokie | **NIE migrować gdy sesje aktywne!** |
| jq nie zainstalowane (settings merge) | Niskie | Fallback: kopiuj base.json |
| Critical rules za długie w CLAUDE.md | Niskie | Trzymać <20 linii, reszta w patterns/ |

---

## 12. Przyszłe rozszerzenia (gdy będą potrzebne, NIE teraz)

- **Flutter stack**: `agents/stacks/flutter/`, `patterns/flutter/`, `skills/stacks/flutter/`, `templates/settings/flutter.json`
- **Python stack**: analogicznie
- **`patterns/_shared/`**: gdy 2+ stacki mają wspólne koncepty (np. testing pyramid concept)
- **`presets.yml`**: jeśli konwencja nazw nie wystarczy (>5 stacków, niestandardowy routing)
- **Preset inheritance**: np. `python-ml` inherits from `python` base
- **MCP server**: opcjonalnie aktywować dla claude.ai / team access
