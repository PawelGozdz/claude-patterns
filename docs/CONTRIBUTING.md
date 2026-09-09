# Contributing to claude-patterns

How to add each kind of thing this repository holds. These procedures moved out
of `CLAUDE.md` on 2026-09-07 (K105) — they are reference material you read when
you are about to add something, not context worth paying for on every turn of
every session.

The heading text is load-bearing: `scripts/new-pattern.mjs`,
`scripts/ci/validate-agents.js`, `scripts/ci/validate-skills.js` and
`skills/README.md` cite these sections by name. Rename one and those citations
point at nothing.

Before any of this, two habits that catch most mistakes early:

- Check `.claude/rules/` for the coding standards that apply, and
  `patterns/` for an existing shape, before inventing a new abstraction.
- Nothing here is committed for you. Stage your work and let a human review it.

---

## Adding a New Pattern

> **Skrót: `/add-pattern`** (skill `skills/meta/add-pattern/`) przechodzi całą tę procedurę
> za Ciebie — generuje szkielet z wymaganymi sekcjami, waliduje tagi wobec słownika, tworzy
> sparowaną kartę reguł i domyka lintem + reseedem. Ręcznie warto tylko wtedy, gdy robisz coś
> nietypowego. Sam generator: `node scripts/new-pattern.mjs --name … --layer … --tags "…"`.
> Kroki poniżej opisują, CO musi powstać (i dlaczego), niezależnie od drogi.

1. Create file in the appropriate layer: `patterns/{layer}/{name}-pattern.md`
2. Use this structure:
   ```markdown
   # Pattern: {Name}
   **Tags**: "api:domain:aggregate", "api:events"
   **Layer**: Domain|Application|Infrastructure|Architecture|Testing|Cross-Layer|Orchestration
   **Status**: production|stable|experimental
   
   ## What This Is
   ## When to Use
   **Use this pattern for:** (✅ bullets — concrete trigger conditions)
   **Do NOT use for:** (❌ bullets — the naive/wrong-fit cases, name the pattern that IS correct there)
   ## Implementation
   ## Anti-Patterns
   ```
   The ✅/❌ "When to Use" bullets are REQUIRED, not optional — they're what makes a pattern
   cheap to seed and cheap to pick correctly via `retrieve_patterns` (a reader/agent can match
   their situation against 3-5 bullets far faster than re-deriving intent from prose).

   **Tags** is required too, and it's the one field nothing else can reconstruct: path-derived
   tags say WHERE a pattern lives, `**Tags**` says WHAT it is about, and it's the only thing
   `retrieve_patterns` can filter on. The vocabulary lives in `blocks/_taxonomy.yml` — format
   `<stack>:<area>[:<variant>]`, 1-3 tags, quoted. **A tag outside the dictionary is an error,
   not a new tag**: levels 1-2 are closed, and when an area is genuinely missing you add it to
   `_taxonomy.yml` deliberately (that's how `platform` and `any` got in). Level 3 (variant) is
   open kebab-case, but the linter prints every unseen one so `jwt` and `json-web-token` don't
   end up living side by side — list a new variant under `variants_seen` once you mean to keep it.
   If the pattern has a rule card (`{name}_summary.md`), **copy the same `**Tags**` line into
   it**. The card is what actually enters prompts, so different tags there mean the topic filter
   admits one and drops the other; `lint-patterns.mjs` reports that mismatch as an error.
2b. **Declare `**Level**`** right under `**Tags**` when the pattern is not everyday depth:
   ```markdown
   **Level**: quickstart | core | advanced | exhaustive
   ```
   Same four values `library_reference_global` already uses, so `retrieve_*` filters by ONE
   vocabulary across both global collections. Omit it and the level follows the file's role:
   `_summary.md` → `quickstart` (a card is a shortcut — it is what gets pasted into an
   implementer's prompt), full pattern → `core`. Declare it explicitly only to say
   "this one is deeper than usual" (`advanced`) or "this is the full reference with decision
   history" (`exhaustive`). A value outside the four is an ERROR in `lint-patterns.mjs` —
   the retrieval filter would silently never return that chunk.

2c. **Every file needs at least one `## ` heading.** `markdown-chunker` splits on `## `, so a
   document with only `# ` and bold labels produces zero chunks and **vanishes from
   `patterns_global` without an error** — the reseed still reports success. This is how
   `geo-spatial-query-pattern_summary.md` (28 lines, 13 rules, zero `## `) sat on disk while
   being unreachable for `retrieve_patterns`, during the exact task where implementers ran
   126 greps looking for what it contained. `lint-patterns.mjs` now fails on this, and the
   indexer prints every file that produced no chunks.

3. **Is this pattern derived from ONE project's codebase and not yet seen/validated in a second
   one?** (e.g. promoted straight out of a single task like `TS-REACH-SYSTEM-001`, not yet reused
   elsewhere) — if so, add a line right after `**Status**:`:
   ```markdown
   **Scope**: project-specific (<project-name>) — single-project derivation, not yet validated
   in a second codebase. Excluded from `retrieve_patterns` by default; pass
   `project: "<project-name>"` to include it. Promote to universal once a second project adopts
   this shape.
   ```
   `markdown-chunker.ts` parses this line and tags every chunk from the file
   `scope: "project-specific", project: "<name>"` — `retrieve_patterns` filters these OUT by
   default so one project's derived pattern doesn't get suggested as generic guidance in an
   unrelated project. Also add `scope: project-specific` + `project: <name>` to the pattern's
   `METADATA.yml` entry, and mark it `⚠ project-specific (<name>)` in the `patterns/README.md`
   Status column. Omit the `**Scope**` line entirely for genuinely universal patterns (the
   default for all pre-existing patterns — no migration needed).
4. Update `patterns/README.md` to add it to the index
5. Add `METADATA.yml` entry if adding to a new category
6. **Does a hook need to know which files this pattern governs?** If the pattern rules a
   recognizable kind of file (aggregates, repositories, controllers), add a `pattern_routing:`
   entry to the block that owns that concept — `blocks/ddd/core.yml` for domain shapes,
   `blocks/kysely.yml` for persistence, and so on — then run
   `node scripts/generate-pattern-routing.mjs`. That regenerates
   `hooks/lib/pattern-routing.generated.js`, which `check-patterns-read` and
   `check-delegation` read. Skipping this leaves the gates blind to the new pattern while
   everything still looks correct; `--check` (also run by `audit-projects.mjs`) catches the
   drift. Purely conceptual patterns with no file signature need no entry.
7. **Reseed the MCP** so `retrieve_patterns` sees the change: `./scripts/reseed-patterns.sh`
   (one command — builds `knowledge-retriever`, ensures the dedicated Qdrant is up, rebuilds
   `patterns_global` + `library_reference_global` from the current `patterns/**`+`rules/**` tree).
   Purely mechanical, no LLM needed. **Easy to forget** — a new/edited pattern file is invisible
   to agents calling `retrieve_patterns` until this runs; batch several pattern edits into one
   reseed rather than running it per-file (it's a full `recreate()`, not incremental).

## Promoting a Project Refactor to a Pattern

When a downstream project (`juz-ide-api-*`, `grant-flow`, `vytches-ddd`, ...) finishes a task/refactor
and you're deciding whether it belongs in this shared library — this is the repeatable procedure
(not something to re-derive from scratch each time):

1. **Scope the diff, don't read all of it.** For a large feature (dozens/hundreds of files), delegate
   a review to an agent: point it at the architecturally interesting files (aggregates, domain
   services, specifications, ADRs) and explicitly tell it to SKIP routine CRUD query handlers,
   `.spec.ts` files, and migrations unless their content itself is the interesting part.
2. **Check for existing coverage first.** Read `patterns/README.md`'s index (and, if unsure,
   `retrieve_patterns`) before writing anything — "haven't we already documented this mechanism
   under a different name" is the most common false positive.
3. **Decide scope: universal vs project-specific.** Default to **project-specific** for anything
   derived from a single project's codebase — mark it with the `**Scope**:` line (see "Adding a New
   Pattern" above). Only classify a pattern as universal/generic nestjs-ddd guidance once **a second,
   independent project has adopted the same shape** — a pattern's own prose sounding generalizable is
   NOT sufficient evidence by itself; a human call on real reuse is. Re-classify (drop the `**Scope**`
   line) the moment that second adoption happens — don't leave it stale as project-specific forever.
4. **Write it using the template above**, including the required ✅/❌ "Use this pattern for / Do NOT
   use for" bullets.
5. **Reseed** (`./scripts/reseed-patterns.sh`) and spot-check with a direct Qdrant query or
   `retrieve_patterns` call before calling the promotion done — a pattern that isn't reseeded is
   invisible to every agent that would otherwise use it.

## Adding / Updating Legal Skills

The `skills/legal/` folder is **vendored from two upstream sources** with
**license verification per skill**:
- [evolsb/claude-legal-skill](https://github.com/evolsb/claude-legal-skill) (1 skill, MIT)
- [lawvable/awesome-legal-skills](https://github.com/lawvable/awesome-legal-skills) (11 skills filtered to Apache 2.0)

**Updating from upstream**:
```bash
./scripts/sync-legal-skills.sh --verify-licenses   # check for upstream license drift
./scripts/sync-legal-skills.sh --diff              # preview changes
./scripts/sync-legal-skills.sh                     # interactive — diff + verify + apply
```

**Critical**: the sync script verifies each upstream skill's
`metadata.license` field before vendoring. If a skill relicensed from
MIT/Apache to AGPL (or proprietary), the sync **aborts with explicit
drift report** — the operator must remove from `skills/legal/` or
update `VENDORABLE_LICENSES` in the script.

**Local additions / modifications**:
- `skills/legal/README.md`, `EXTERNAL.md`, `UPSTREAM_VERSION` — ours
- `skills/legal/contract-review/UPSTREAM_VERSION` and `LICENSE.upstream` — ours
- Don't modify individual skill files — the next sync will overwrite

**External skills** (in EXTERNAL.md) are **never vendored**, only cataloged.
If a project wants to use an AGPL skill (e.g., `gdpr-privacy-notice-eu-...`),
it must install in its own `.claude/skills/` per its own project license.

**Adding a brand-new legal skill that doesn't exist upstream**:
1. Place in `skills/legal/<name>/SKILL.md` with marker
   `<!-- LOCAL — not synced from upstream -->`
2. Update `skills/legal/README.md` Vendored Skills table
3. Add to routing table in `agents/universal/legal-strategist.md`
4. Use `LOCAL-` prefix or add explicit exclude to sync script
   (currently uses `--exclude='LOCAL-*'`)

---

## Adding / Updating Finance Skills

The `skills/finance/` and `tests/finance-evals/` folders are **vendored**
from [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) (MIT).

**Updating from upstream**:
```bash
./scripts/sync-finance-skills.sh --diff       # preview
./scripts/sync-finance-skills.sh              # interactive apply
./scripts/sync-finance-skills.sh --ref v1.0.0  # pin to a tag
```

**Local additions / modifications**:
- `skills/finance/README.md`, `skills/finance/PLUGINS.md`,
  `skills/finance/UPSTREAM_VERSION` — ours
- `tests/finance-evals/README.md` — ours (sibling of upstream files)
- Don't modify individual `SKILL.md` files inside
  `skills/finance/<plugin>/<skill>/` unless absolutely necessary —
  the next sync will overwrite them

**Adding a brand-new finance skill that doesn't exist upstream**:
1. Place it in `skills/finance/<plugin>/<name>/SKILL.md` and add a
   marker comment `<!-- LOCAL — not synced from upstream -->` at the top
2. Update `skills/finance/PLUGINS.md` and `skills/finance/README.md`
3. Add it to the routing table in
   `agents/universal/finance-strategist.md`
4. The sync script's `--exclude='LOCAL-*'` won't catch your file by name
   — rename it with `LOCAL-` prefix or add explicit exclusion to the
   rsync command for that plugin

---

## Adding / Updating Marketing Skills

The `skills/marketing/` and `tools/marketing/` folders are **vendored** from
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (MIT).

**Updating from upstream**:
```bash
./scripts/sync-marketing-skills.sh --diff    # preview
./scripts/sync-marketing-skills.sh           # interactive apply
./scripts/sync-marketing-skills.sh --ref v1.10.0  # pin to a tag
```

**Local additions / modifications**:
- `skills/marketing/README.md`, `skills/marketing/UPSTREAM_VERSION` — ours
- `tools/marketing/README.md` — ours (sibling of upstream `REGISTRY.md`)
- Don't modify individual `SKILL.md` files inside `skills/marketing/<name>/`
  unless absolutely necessary — the next sync will overwrite them. If a
  modification is needed, fork upstream or submit a PR there instead.

**Adding a brand-new marketing skill that doesn't exist upstream**:
1. Place it in `skills/marketing/<name>/SKILL.md` and add a marker comment
   `<!-- LOCAL — not synced from upstream -->` at the top of the file
2. Update `skills/marketing/README.md` catalog
3. Add it to the routing table in `agents/universal/marketing-strategist.md`
4. Make sure `sync-marketing-skills.sh` won't delete it (rsync `--exclude`
   may be needed — currently it uses `--delete`, so local-only skills get
   wiped; add an exclusion if you go this route)

---

## Adding a New Universal Agent

1. Create file in `agents/universal/{name}.md`
2. Required frontmatter:
   ```yaml
   ---
   name: agent-name
   description: |
     Multi-line description used for agent selection.
     Include: what it does, when to use, key examples.
   tools: Read, Glob, Grep (list only what's needed)
   disallowedTools: Write, Edit, Bash (explicit deny)
   model: opus|sonnet|haiku
   effort: max|medium|low
   memory: project
   maxTurns: 15
   ---
   ```
3. Update `agents/README.md` to add it to the table
4. Agent is immediately available via symlink (no restart needed)

## Adding a New Skill

1. Create directory: `skills/{category}/{name}/`
2. Create `SKILL.md` with frontmatter:
   ```yaml
   ---
   name: skill-name
   description: "One-line description"
   origin: ProjectName
   allowed-tools: Read, Write, Edit, Glob, Grep, Agent
   effort: low|medium|high
   ---
   ```
3. Document: When, Steps, Output Example
4. Skill is immediately available via symlink

## Adding a New Hook

1. Create `hooks/{name}.js` following the stdin→stdout pattern:
   ```javascript
   // Read stdin → parse JSON → do work → write stdin back → exit 0
   // Always exit 0 — never block the workflow
   // Use process.stderr for output (visible to Claude)
   ```
2. Update `hooks/hooks.json` if it should be auto-installed
3. Document in `hooks/README.md`

## Adding a New Template

1. Create directory: `templates/{template-name}/`
2. Include a `README.md` explaining setup
3. Use `{PLACEHOLDER}` syntax for project-specific values
4. Document in main `README.md`
