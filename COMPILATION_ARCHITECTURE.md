# Compilation Architecture & Strategy

**Version**: 2.0.0
**Created**: 2026-02-05
**Status**: APPROVED - Implementation in progress
**Decision**: Go DIRECTLY to compilation (skip pragmatic .md approach)

---

## 📋 Executive Summary

**Problem**: Need reusable DDD/CQRS agents across multiple projects (LocalHero, MarketPlace, future projects)

**Solution**: Template-based compilation system with project-specific parameterization

**ROI**: Break-even after 2 projects. Time savings: 5-8h after 4 projects.

**Timeline**: 9-13 hours initial setup, 30 minutes per new project thereafter

---

## 🏗️ Three-Repository Architecture

### 1. `claude-patterns` Repository (Universal - This Repo)

**Purpose**: Single source of truth for all reusable DDD/CQRS resources

**Contents**:
```
~/projects/claude-patterns/
├── patterns/                          # 30 DDD/CQRS patterns
│   ├── domain/ (6 patterns)
│   ├── application/ (4 patterns)
│   ├── architecture/ (3 patterns)
│   ├── infrastructure/ (5 patterns)
│   ├── testing/ (7 patterns)
│   └── cross-layer/ (5 patterns)
│
├── agents/                            # Universal agent templates
│   ├── agents-universal.yml           # Single template file (Handlebars)
│   ├── specialists.template.yml       # Specialist agents template
│   ├── implementers.template.yml      # Implementer agents template
│   ├── verifiers.template.yml         # Verifier agents template
│   └── utilities.template.yml         # Utility agents template
│
├── tooling/                           # Compilation tooling
│   ├── compile-agents.js              # Main compilation script
│   ├── package.json                   # Dependencies (Handlebars, etc.)
│   └── templates/                     # Helper templates
│
├── examples/                          # Reference implementations
│   ├── local-hero/
│   │   └── project.yml                # LocalHero config example
│   └── marketplace/
│       └── project.yml                # MarketPlace config example
│
├── mcp-server/                        # MCP server for patterns
├── commands/                          # Global commands
├── scripts/                           # Setup scripts
└── docs/
    ├── COMPILATION_GUIDE.md           # How to use compilation
    ├── AGENT_DEVELOPMENT.md           # How to create new agents
    └── PROJECT_SETUP.md               # How to setup new project
```

**Distribution**:
- Patterns: MCP Server (multi-project via config)
- Agents: Compiled from templates (per-project)
- Commands: Symlinks from `~/.claude/commands/`

---

### 2. Project Repositories (LocalHero, MarketPlace, etc.)

**Purpose**: Project-specific implementations using universal patterns/agents

**Contents**:
```
~/projects/local-hero-3/
├── .claude/
│   ├── config/
│   │   └── project.yml                # Project configuration
│   │
│   ├── roles/                         # COMPILED (git-ignored)
│   │   ├── implementers.yml
│   │   ├── verifiers.yml
│   │   └── specialists.yml
│   │
│   ├── agents/                        # COMPILED (git-ignored)
│   │   ├── specialists/
│   │   ├── implementers/
│   │   ├── verifiers/
│   │   └── utilities/
│   │
│   ├── knowledge/
│   │   ├── patterns/                  # SYMLINK → claude-patterns (optional)
│   │   ├── business/                  # Project-specific business rules
│   │   └── learned/                   # Project-specific learnings
│   │
│   └── settings.json                  # MCP config for patterns
│
├── src/contexts/                      # Implementation code
├── test/                              # Tests
└── project-orchestration/
    └── ddd/
        └── domains/                   # Domain models
```

**What's Git-Tracked**:
- ✅ `.claude/config/project.yml` - Project configuration
- ✅ `.claude/knowledge/business/` - Business rules
- ✅ `.claude/settings.json` - MCP config
- ❌ `.claude/roles/` - Compiled (ignored)
- ❌ `.claude/agents/` - Compiled (ignored)

**What's Symlinked** (optional):
- `.claude/knowledge/patterns/` → `~/projects/claude-patterns/patterns/`

---

### 3. Global User Config (`~/.claude/`)

**Purpose**: User-level global resources

**Contents**:
```
~/.claude/
├── agents/                            # SYMLINK → claude-patterns/agents/compiled/
├── commands/                          # SYMLINK → claude-patterns/commands/
└── settings.json                      # User-level settings
```

---

## 🔧 Compilation System

### Template Structure

**Universal Template** (`agents-universal.yml`):

```yaml
# Handlebars template with project-specific variables
version: "2.0"
project:
  name: "{{PROJECT_NAME}}"
  slug: "{{PROJECT_SLUG}}"

contexts: {{#each CONTEXTS}}
  - "{{this}}"{{/each}}

agents:
  specialists:
    ddd-application-expert:
      model: sonnet
      purpose: "Domain-Driven Design specialist for {{PROJECT_NAME}}"
      capabilities:
        - Bounded context modeling
        - Aggregate design
        - Event storming
      examples:
        {{#each CONTEXTS}}
        - context: "{{this}}"
          implementation: "{{../PROJECT_NAME}}/src/contexts/{{this}}"
        {{/each}}

  implementers:
    domain-application-implementer:
      model: sonnet
      purpose: "Domain + Application layer implementation for {{PROJECT_NAME}}"
      contexts: {{#each CONTEXTS}}"{{this}}"{{#unless @last}}, {{/unless}}{{/each}}
      patterns:
        - aggregate-pattern
        - command-handler-pattern
        - query-handler-pattern
      reference_paths:
        {{#each CONTEXTS}}
        - "{{../PROJECT_NAME}}/src/contexts/{{this}}/domain/"
        - "{{../PROJECT_NAME}}/src/contexts/{{this}}/application/"
        {{/each}}
```

**Project Config** (`local-hero-3/.claude/config/project.yml`):

```yaml
# LocalHero configuration
name: "LocalHero"
slug: "local-hero"
version: "3.0"

contexts:
  - auth
  - authorization
  - geographic-auth
  - community-communication
  - engagement
  - neighborhood-economy

tech_stack:
  framework: NestJS
  language: TypeScript
  database: PostgreSQL + PostGIS
  testing: Vitest
  ddd_library: "@vytches/ddd"

patterns_repo:
  path: "~/projects/claude-patterns"
  version: "1.0.0"
```

### Compilation Process

**1. Install Dependencies**:
```bash
cd ~/projects/claude-patterns/tooling
npm install
```

**2. Compile Agents** (in project):
```bash
cd ~/projects/local-hero-3

# Compile from universal template
pnpm compile-agents \
  ~/projects/claude-patterns/agents/agents-universal.yml \
  .claude/config/project.yml \
  .claude/roles/

# Output:
# ✅ Created .claude/roles/implementers.yml
# ✅ Created .claude/roles/verifiers.yml
# ✅ Created .claude/agents/specialists/ddd-application-expert.md
# ✅ Created .claude/agents/implementers/domain-application-implementer.md
# ... (15 agents total)
```

**3. Verification**:
```bash
# Verify compilation
pnpm verify-agents .claude/roles/

# Check for:
# - All placeholders replaced (no {{...}})
# - Valid YAML syntax
# - Required fields present
# - Paths exist
```

---

## 📊 What's Reusable vs Project-Specific

### 100% Reusable (Same Everywhere)

**From claude-patterns repo**:
- ✅ Agent responsibilities (DDD/CQRS/VytchesDDD principles)
- ✅ Pattern files (aggregate, value-object, command-handler, etc.)
- ✅ Verification checklists (extends AggregateRoot, returns Result, etc.)
- ✅ Tool assignments (Read/Write/Edit/Bash/Task)
- ✅ Model optimization strategy (Sonnet/Opus/Haiku)
- ✅ Dependency Cruiser rules (.dependency-cruiser.js)
- ✅ Testing pyramid ratios (L1 50%, L2 30%, L3 20%)
- ✅ Error handling patterns (Result<T>, hybrid exceptions)

**Key Insight**: LocalHero's patterns are ALREADY generic. "LocalHero" appears only in examples, not in rules.

### Project-Specific (Parameterized)

**In project.yml config**:
- 📝 Project name and slug
- 📝 Bounded contexts list
- 📝 Tech stack details (framework, database, testing library)
- 📝 DDD library version
- 📝 Reference implementation paths
- 📝 Business validation rules (optional)
- 📝 Custom constraints (optional)

**Compilation replaces**:
- `{{PROJECT_NAME}}` → "LocalHero" or "MarketPlace"
- `{{PROJECT_SLUG}}` → "local-hero" or "marketplace"
- `{{CONTEXTS}}` → [auth, geographic-auth, ...] or [seller-management, buyer-matching, ...]
- `{{REFERENCE_IMPLEMENTATIONS}}` → Project-specific file paths
- `{{TECH_STACK}}` → Project-specific technologies

---

## 🚀 Implementation Plan

### Phase 1: Tooling Setup (4-5 hours)

**Tasks**:
1. Create `tooling/` directory structure
2. Setup `package.json` with dependencies:
   - `handlebars` - Template engine
   - `yaml` - YAML parsing
   - `fs-extra` - File operations
   - `chalk` - Terminal colors
   - `yargs` - CLI argument parsing
3. Create `compile-agents.js` main script
4. Create helper functions:
   - `loadTemplate()` - Load Handlebars template
   - `loadProjectConfig()` - Parse project.yml
   - `compileAgent()` - Compile single agent
   - `writeOutput()` - Write compiled files
   - `verifyOutput()` - Validate compilation
5. Create CLI interface:
   ```bash
   compile-agents [template] [config] [output]
   compile-agents --verify [path]
   ```
6. Test with mock project config

**Deliverables**:
- ✅ `tooling/compile-agents.js` (working)
- ✅ `tooling/package.json`
- ✅ Unit tests for compilation
- ✅ CLI documentation

---

### Phase 2: Universal Template Creation (3-4 hours)

**Tasks**:
1. Extract current agent definitions from LocalHero:
   - `.claude/roles/implementers.yml`
   - `.claude/roles/verifiers.yml`
   - `.claude/agents/specialists/*.md`
   - `.claude/agents/utilities/*.md`
2. Identify all project-specific content:
   - Project names ("LocalHero")
   - Context names (auth, geographic-auth, etc.)
   - File paths (src/contexts/...)
   - Business rules (customer segments)
3. Replace with Handlebars variables:
   - `LocalHero` → `{{PROJECT_NAME}}`
   - `auth` → `{{CONTEXTS.[0]}}`
   - `src/contexts/auth/` → `{{PROJECT_SLUG}}/src/contexts/{{CONTEXTS.[0]}}/`
4. Create `agents-universal.yml` master template
5. Create category-specific templates:
   - `specialists.template.yml`
   - `implementers.template.yml`
   - `verifiers.template.yml`
   - `utilities.template.yml`
6. Add documentation:
   - Template syntax guide
   - Available variables
   - Example usage

**Deliverables**:
- ✅ `agents/agents-universal.yml`
- ✅ Category-specific templates
- ✅ Template documentation
- ✅ Variable reference guide

---

### Phase 3: LocalHero Migration (1 hour)

**Tasks**:
1. Create `.claude/config/project.yml` in local-hero-3
2. Add LocalHero-specific config:
   - name: "LocalHero"
   - contexts: [auth, authorization, geographic-auth, ...]
   - tech_stack: NestJS, PostgreSQL+PostGIS, Vitest
3. Add to `.gitignore`:
   ```
   .claude/roles/
   .claude/agents/
   ```
4. Compile agents:
   ```bash
   pnpm compile-agents
   ```
5. Verify output:
   - Check all 15 agents created
   - Verify no {{...}} placeholders remain
   - Test agent invocation in Claude Code
6. Commit:
   - ✅ `.claude/config/project.yml`
   - ✅ `.gitignore` updates
   - ❌ Compiled agents (ignored)
7. Remove old agents:
   - Delete `.claude/roles/*.yml` (now compiled)
   - Delete `.claude/agents/*.md` (now compiled)
   - Keep only project-specific agents

**Deliverables**:
- ✅ local-hero-3 using compiled agents
- ✅ Verified working in Claude Code
- ✅ Clean git history

---

### Phase 4: MarketPlace Setup (30 minutes)

**Tasks**:
1. Create `.claude/config/project.yml` in marketplace
2. Add MarketPlace config:
   ```yaml
   name: "MarketPlace"
   slug: "marketplace"
   contexts:
     - seller-management
     - buyer-matching
     - transaction-processing
     - payment-handling
   tech_stack:
     framework: NestJS
     database: PostgreSQL
     testing: Vitest
   ```
3. Compile agents:
   ```bash
   cd ~/projects/marketplace
   pnpm compile-agents
   ```
4. Add MCP config (`.claude/settings.json`)
5. Verify agents work with MarketPlace examples
6. Commit `.claude/config/project.yml`

**Deliverables**:
- ✅ MarketPlace with compiled agents
- ✅ 30-minute setup time (vs 2h manual)

---

### Phase 5: Documentation (1-2 hours)

**Tasks**:
1. Create `docs/COMPILATION_GUIDE.md`:
   - How to setup new project
   - How to compile agents
   - How to customize config
   - Troubleshooting
2. Create `docs/AGENT_DEVELOPMENT.md`:
   - How to add new agent to template
   - How to add new variable
   - How to test compilation
3. Create `docs/PROJECT_SETUP.md`:
   - New project checklist
   - Config file reference
   - Example configs
4. Update main `README.md`:
   - Add compilation section
   - Link to guides
   - Quick start with compilation
5. Create example configs:
   - `examples/local-hero/project.yml`
   - `examples/marketplace/project.yml`
   - `examples/generic-ddd/project.yml`

**Deliverables**:
- ✅ Comprehensive documentation
- ✅ Example configs
- ✅ Troubleshooting guide

---

## 📈 Benefits & ROI

### Time Savings

| Task | Without Compilation | With Compilation | Savings |
|------|---------------------|------------------|---------|
| **Initial setup** | 2-3h (create .md) | 9-13h (build tooling) | -7h to -10h |
| **Setup project 2** | 2h (manual edits) | 30min (config) | 1.5h |
| **Setup project 3** | 2h | 30min | 1.5h |
| **Setup project 4** | 2h | 30min | 1.5h |
| **Update all agents** | 2h × N projects | 30min (template) | 1.5h × (N-1) |
| **TOTAL (4 projects)** | 16-19h | 11-14h | **5-8h saved** |

**Break-even Point**: After 2 projects (LocalHero + MarketPlace)

**ROI After 1 Year** (assuming 6 projects):
- Without: ~28-31h
- With: ~13-16h
- **Savings: 15h** (+ ongoing maintenance savings)

### Quality Benefits

**Consistency**:
- ✅ All projects use identical agent behavior
- ✅ No drift between projects
- ✅ Single source of truth (template)

**Maintenance**:
- ✅ Update once, compile to all projects
- ✅ Version control for templates
- ✅ Semantic versioning (v1.0.0, v2.0.0)

**Scalability**:
- ✅ New project = 30 minutes
- ✅ 10 projects = same effort as 2
- ✅ Template improvements benefit all projects

**Collaboration**:
- ✅ Easy onboarding (compile from template)
- ✅ Clear separation (universal vs project-specific)
- ✅ Team can contribute to universal template

---

## 🎯 Success Metrics

### Immediate (Week 1-2)

- ✅ Compilation tooling working
- ✅ LocalHero using compiled agents
- ✅ MarketPlace setup in 30 minutes
- ✅ All 15 agents compile correctly
- ✅ No manual .md files needed

### Short-term (Month 1-2)

- ✅ 3+ projects using compiled agents
- ✅ Template improvements backported
- ✅ Documentation complete
- ✅ Team using compilation workflow

### Long-term (Month 3+)

- ✅ 5+ projects using template
- ✅ Community contributions to template
- ✅ Version 2.0 of template (with learnings)
- ✅ Compilation time < 10 seconds per project
- ✅ Zero manual agent maintenance

---

## 🔄 Migration Path (Other Projects)

### For Existing local-hero Folders

**local-hero, local-hero-2, local-hero-4**:

```bash
# Each folder (15 minutes):
cd ~/projects/local-hero-2

# 1. Copy config from local-hero-3
cp ../local-hero-3/.claude/config/project.yml .claude/config/

# 2. Update .gitignore
echo ".claude/roles/" >> .gitignore
echo ".claude/agents/" >> .gitignore

# 3. Compile
pnpm compile-agents

# 4. Commit
git add .claude/config/project.yml .gitignore
git commit -m "Migrate to compiled agents"

# 5. Remove old agents (now compiled)
rm -rf .claude/roles/*.yml .claude/agents/*.md
```

**Total Time**: 15 min × 3 folders = 45 minutes

---

## 🐛 Troubleshooting

### Compilation Fails

**Symptom**: `Error: Invalid YAML syntax`

**Solutions**:
1. Validate project.yml: `yamllint .claude/config/project.yml`
2. Check for missing required fields
3. Verify Handlebars syntax in template
4. Run with `--verbose` flag

### Agents Not Loading

**Symptom**: Claude Code doesn't see compiled agents

**Solutions**:
1. Verify output paths: `ls .claude/roles/`
2. Check file permissions
3. Restart Claude Code
4. Check compilation logs for errors

### Template Variables Not Replaced

**Symptom**: `{{PROJECT_NAME}}` appears in compiled output

**Solutions**:
1. Verify variable name in project.yml
2. Check template syntax (correct Handlebars)
3. Ensure compilation ran successfully
4. Check for typos in variable names

---

## 📚 References

**Related Documents**:
- Main README: `README.md`
- MCP Server: `mcp-server/README.md`
- Agents (post-compilation): `agents/README.md`
- Commands: `commands/README.md`

**External Resources**:
- [Handlebars Documentation](https://handlebarsjs.com/)
- [DDD Patterns](https://martinfowler.com/tags/domain%20driven%20design.html)
- [VytchesDDD Library](https://www.npmjs.com/org/vytches)

**Decision Records**:
- Why Compilation over .md files: ROI analysis (this document)
- Why Handlebars: Simple, widely-used, well-documented
- Why YAML: Human-readable, git-friendly, schema validation

---

## ✅ Approval & Next Steps

**Decision**: APPROVED - Go directly to compilation (skip pragmatic .md approach)

**Approved By**: User (2026-02-05)

**Rationale**:
- Already 2 different projects (LocalHero + MarketPlace)
- ROI break-even after 2 projects
- Avoids wasted work (creating .md files to replace later)
- Sets up scalable foundation for future projects

**Next Steps**:
1. Start Phase 1: Tooling Setup (4-5h)
2. Create universal template (3-4h)
3. Migrate LocalHero (1h)
4. Setup MarketPlace (30min)
5. Document everything (1-2h)

**Total Estimated Time**: 9-13 hours

**Expected Completion**: Week 1-2 (2026-02-05 to 2026-02-12)

---

**Version History**:
- v2.0.0 (2026-02-05): Compilation architecture approved, implementation starting
- v1.0.0 (2026-02-05): Initial strategy document (pragmatic approach - superseded)
