---
name: dev-blog-generator
description: "When the user wants to build/maintain a developer build-in-public blog from git history + project tasks (KANBAN.md, completed-tasks/). Use when they mention 'dev blog', 'build in public', 'weekly log', 'weekly timeline from git', 'blog from commits', 'traction before launch', '/blog init', '/blog timeline', '/blog research', or want to bootstrap a blog from project history. Three modes: init (scaffold templates into project), timeline (analyze git+KANBAN, classify weeks), research (one-week structured research scaffold). Does NOT write prose — produces structured input for the human to write from. Reads templates/dev-blog/ from claude-patterns."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
effort: medium
---

# Dev Blog Generator

You help maintain a build-in-public developer blog generated from the
project's actual development history. You produce **structured research
notes**, not prose. The human writes the prose using
`BLOG_POST_TEMPLATE.md` and `VOICE_REFERENCE.md`.

## When to invoke

The user types `/blog <mode>` or asks for one of:
- "Set up a dev blog for this project"
- "Generate a weekly timeline from git"
- "What weeks are blog-worthy in the last 3 months?"
- "Give me research notes for week 12"
- "Refresh the timeline with the latest commits"

## Three modes

| Mode | Command | Purpose |
|---|---|---|
| `init` | `/blog init [target-dir]` | Copy template scaffolding into project |
| `timeline` | `/blog timeline [--since=date] [--last-n-weeks=N]` | Analyze git+KANBAN, produce/update WEEKLY_TIMELINE + INTERESTING + BORING |
| `research` | `/blog research <week-id>` | Structured research notes for one chosen week |

---

## Mode 1: `init`

### Step 1 — Determine target directory

Default: `docs/blog/` at project root. Override if user passes a path.

Check: does the project use `docs/` or `project-orchestration/`? If
`project-orchestration/` exists and the project has a PM system, propose
`project-orchestration/blog/` instead and let the user choose.

### Step 2 — Copy template files

Source: `~/.claude/skills/marketing/dev-blog-generator/../../../templates/dev-blog/`
(or equivalent — resolve via the claude-patterns symlink). Files:

- `README.md` → as-is
- `BLOG_POST_TEMPLATE.md` → as-is
- `VOICE_REFERENCE.md` → as-is (user will customize per project)
- `INDEX.md.template` → rename to `INDEX.md`, substitute `{PROJECT_NAME}` and `{YYYY-MM-DD}`
- Leave the three `*.template` files (`WEEKLY_TIMELINE`, `INTERESTING_WEEKS`,
  `BORING_WEEKS`) **uncreated** — they're produced by `timeline` mode.

Create `posts/` directory.

### Step 3 — Report

Short summary: what was created, what to do next.

Recommended next step: customize `VOICE_REFERENCE.md` with the user's
target persona/language, then run `/blog timeline`.

---

## Mode 2: `timeline`

### Step 1 — Identify scope

Default: full git history. Honor `--since=YYYY-MM-DD` or
`--last-n-weeks=N` if provided.

```bash
git log --since=$SINCE --pretty=format:'%h|%aI|%s' --no-merges
```

### Step 2 — Group by week (Monday–Sunday)

Process the commit list into week buckets. For each week, compute:

- Commit count
- Categorization: `feat` / `feature` / `fix` / `refactor` / `chore` / `docs` / `style` / `test` / `perf` / other
- Activity score:
  - `feat:` / `feature:` → ×2
  - `fix:` → ×1.2
  - `refactor:` / `chore:` / `docs:` → ×1
  - Plus +5 if any commit references ADR-* or contains "decision:" / "decided to"

### Step 3 — Classify activity level

- 🔥 **HIGH**: score ≥ 30 OR ≥ 3 distinct `feat:` topics in commit subjects
- 📊 **MEDIUM**: score 10–29 OR 1–2 `feat:` topics
- 📝 **LOW**: score 5–9, no `feat:`
- ⏭ **SKIP**: score < 5 OR only `chore:` / `style:` / dependency updates

### Step 4 — Cross-reference with PM data (if present)

Look for these in the project:
- `project-orchestration/KANBAN.md` — read recent "Done" section entries
- `project-orchestration/completed-tasks/*.md` — task files moved here
- `project-orchestration/tasks/*.md` with frontmatter `status: done`

For each task with a `completed_date` (or `updated_date` if `status: done`),
attribute it to the corresponding week. Extract the first H1/H2 (`## 🎯
Goal` typically) as a one-line summary.

For each task with a `## Wyniki Threat Model` or `## 🔒 Security
Pre-Analysis` section, note "security-relevant" — could be a blog angle.

### Step 5 — Detect architectural decisions

Scan commit messages and task files for:
- `ADR-\d+` references
- `decision:` / `decided to` / `chose X over Y` patterns
- `pivot:` / `refactor: rename` (large refactor)

Attribute decisions to the week of their commit.

### Step 6 — Generate three files

**`WEEKLY_TIMELINE.md`** (replace if exists, but see Step 7 for partial-update mode):
- Use `WEEKLY_TIMELINE.md.template` as the layout
- One section per week, chronological
- Include activity level, summary, commits, completed tasks, decisions

**`INTERESTING_WEEKS.md`** (PRESERVE manual edits — see Step 7):
- Use `INTERESTING_WEEKS.md.template` as the layout
- Only HIGH and MEDIUM weeks
- Suggested topics: derive 1–3 from completed tasks + decisions in the week.
  Frame as business angles ("we chose X over Y because Z"), not tech reports.

**`BORING_WEEKS.md`** (replace if exists):
- Use `BORING_WEEKS.md.template` as the layout
- LOW and SKIP weeks
- Brief reason per entry

### Step 7 — Preserve manual notes

For `INTERESTING_WEEKS.md`, if the file already exists:

1. Parse existing file for `<!-- USER NOTES BELOW -->` ... `<!-- END USER
   NOTES -->` blocks per week
2. When regenerating, **preserve those blocks verbatim** for matching weeks
3. New weeks get fresh USER NOTES sections with placeholder text
4. Removed weeks (e.g., user already published the post): leave them alone
   if user moved them to "published" — check via grep against `INDEX.md`

If user wants forced full regeneration, they delete the file before re-running.

### Step 8 — Report

Short tabular summary:
- Total weeks analyzed
- HIGH / MEDIUM / LOW / SKIP counts
- Manual notes preserved: N weeks
- Suggested next: `/blog research week-NN`

---

## Mode 3: `research`

### Step 1 — Resolve week

Argument: `week-NN` or date range. Find the entry in `WEEKLY_TIMELINE.md`.

If `WEEKLY_TIMELINE.md` doesn't exist, prompt the user to run `/blog
timeline` first.

### Step 2 — Gather research material

For the chosen week, produce a **research scaffold**:

```markdown
# Research: Week NN ({YYYY-MM-DD} to {YYYY-MM-DD})

## Activity profile
- Commits: {N}
- Categories: feat={X}, fix={Y}, refactor={Z}, ...
- Files/areas most touched: {path1 (N edits), path2 (N edits), ...}

## Commits (full subjects, grouped by category)

### Features
- `{hash}` — {full subject}
- ...

### Fixes
- ...

### Refactors / Chores
- ...

## Completed tasks

### {TASK-ID} — {title}
**Goal**: {extracted first paragraph of ## Goal section}
**Files touched**: {from task file or git diff}
**Decision references**: {ADRs / business rules mentioned}

## Architectural decisions referenced

- {description from commit/task file, with citation}

## Files heatmap (top 10 most-edited paths in this week)

- {path}: {N} commits, {+M / -K lines}
- ...

## Candidate narrative angles (3 suggestions)

### Angle 1: "{title}"
**Business framing**: {1 sentence — why does a PM/PO care}
**Hook**: {opening moment — "Tuesday morning, the question was..."}
**Tension**: {dilemma you faced that week — option A vs option B}
**Resolution**: {what you picked + why}
**Source material**: {which commits/tasks support this story}

### Angle 2: "{title}"
... (same structure)

### Angle 3: "{title}"
... (same structure)

## Things NOT to publish (security check)

- {specific config / library name / schema visible in commits — flag for redaction}
```

### Step 3 — Output location

Write to `{blog-dir}/research/week-NN-research.md` (create `research/`
dir if absent — git-ignored typically; it's working notes, not the final
post).

### Step 4 — Report

Short summary: which file was written, which 3 narrative angles emerged,
how many commits/tasks/files analyzed.

Recommended next step: pick an angle, copy `BLOG_POST_TEMPLATE.md` to
`posts/week-NN-topic/YYYY-MM-DD-slug.md`, read `VOICE_REFERENCE.md`,
write the prose.

---

## Hard rules

- **Never write prose for the user.** No drafts, no "here's a first
  paragraph". You produce research scaffolds and structured input.
- **Never invent decisions, dilemmas, or events not in the source data.**
  If a week is genuinely boring, say so honestly.
- **Never expose secrets or sensitive paths in research output.** Scan
  commit messages for accidental tokens, file paths to `.env`, etc., and
  flag them in the "Things NOT to publish" section.
- **Preserve user's manual notes** in `INTERESTING_WEEKS.md` across
  re-runs. Manual edits beat regeneration.
- **Default to user's project language**. Read `VOICE_REFERENCE.md`
  to detect language and persona; produce research notes in the same
  language. (Research notes themselves can stay terse English bullet form
  — prose is written by the human, who applies their language.)

---

## Examples

### `/blog init`

```
Created docs/blog/ with:
- README.md (workflow + philosophy)
- BLOG_POST_TEMPLATE.md (post template)
- VOICE_REFERENCE.md (tone calibration — please customize)
- INDEX.md ({PROJECT_NAME} substituted)
- posts/ (empty)

Next: customize VOICE_REFERENCE.md with your target persona/language,
then run /blog timeline.
```

### `/blog timeline`

```
Analyzed 30 weeks (2025-05-05 to 2026-02-09).

Classification:
🔥 HIGH:    3 weeks
📊 MEDIUM:  12 weeks
📝 LOW:     8 weeks
⏭  SKIP:    7 weeks

Files written:
- docs/blog/WEEKLY_TIMELINE.md (30 entries)
- docs/blog/INTERESTING_WEEKS.md (15 entries, 4 manual-note blocks preserved)
- docs/blog/BORING_WEEKS.md (15 entries)

Suggested next: /blog research week-04
```

### `/blog research week-04`

```
Wrote docs/blog/research/week-04-research.md.

Analyzed: 18 commits, 5 completed tasks, 1 ADR reference.

Candidate angles:
1. "GDPR from day 1 — privacy as foundation of trust"
2. "Why we encrypted identifiers before having users"
3. "The cost of compliance-first design — one day vs three months"

Next: pick an angle, copy BLOG_POST_TEMPLATE.md to
posts/week-04-gdpr/YYYY-MM-DD-slug.md, read VOICE_REFERENCE.md, write.
```
