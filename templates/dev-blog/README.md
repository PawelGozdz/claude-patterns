# Dev Blog — Workflow

**Weekly Development Log** — build-in-public blog generated from your project's
actual development history (git + KANBAN + completed tasks). Designed to build
traction **before launch** by documenting decisions, dilemmas, and milestones
in present tense, week by week.

This is a **template scaffold**. Copy into your project under `docs/blog/` (or
wherever you publish blog source), customize `INDEX.md` with your project name,
then use `/blog timeline` and `/blog research <week>` to populate it from
your real git history.

---

## Philosophy

The blog documents **weekly snapshots** of development. Not retrospective
("looking back..."), but **present tense from that moment** — what we did,
why, what dilemmas we faced.

**Core rules**:

1. **Week-by-week timeline** — Posts grouped by week (Monday–Sunday)
2. **Present tense** — Write *then*, not "going back" (we don't know what
   happens in 2 months)
3. **Cherry-picking** — Not every week = post (boring weeks → skip)
4. **Professional tone** — Substantive, considered (40+ founder voice by default;
   override in `VOICE_REFERENCE.md`)
5. **Business + Tech** — Business and technical decisions, not just code

**Goal**:

- **Personal branding** — Show thoughtful approach to building product
- **Transparency** — Evolution of thinking, not just final results
- **Credibility** — "This person knows what they're doing" — business + tech
- **Values** — Security, privacy, compliance as values, not checkboxes
- **Partnership magnet** — Attract collaborators, investors, partners

---

## Workflow: From Git History to Blog Posts

### Step 1 — Generate Weekly Timeline

```
/blog timeline
```

This analyzes git log + `project-orchestration/KANBAN.md` + completed task
files in `project-orchestration/completed-tasks/` (or `tasks/` with
`status: done`), and produces three files:

- `WEEKLY_TIMELINE.md` — All weeks, with activity classification (HIGH /
  MEDIUM / LOW / SKIP)
- `INTERESTING_WEEKS.md` — Filtered list of blog-worthy weeks with suggested
  topics
- `BORING_WEEKS.md` — Skipped weeks with reason

**Re-running** is safe and additive: existing manual edits to
`INTERESTING_WEEKS.md` (e.g., your own topic notes) are preserved when
possible; new weeks are appended.

### Step 2 — Choose a week

Pick a HIGH or MEDIUM activity week from `INTERESTING_WEEKS.md`.

**Blog-worthy criteria**:

- ✅ Major feature implementation
- ✅ Architectural decision (important tech choice)
- ✅ Technical pivot (stack change, major refactor)
- ✅ Business model decision
- ✅ Significant bug fix with a learning
- ❌ Routine refactors (type fixes, linting)
- ❌ Dependency updates (chore)

### Step 3 — Research scaffolding

```
/blog research week-NN
```

For a chosen week, the skill generates **structured research notes** (not
prose):

- Commits in the week with categorization (feat / fix / refactor / chore)
- Completed tasks with their `## Goal` snippets
- Decisions referenced in commit messages or task files
- Files/contexts touched (heatmap)
- Suggested narrative angles (1–3 candidate stories)

This is research, not draft. You write the prose.

### Step 4 — Write from template

```bash
cp BLOG_POST_TEMPLATE.md posts/week-NN-topic/YYYY-MM-DD-topic-slug.md
```

Open `VOICE_REFERENCE.md` in a side panel before writing — it has 3 anchor
excerpts to calibrate tone.

### Step 5 — Pre-publication checklist

Use the security & content checklist at the bottom of `BLOG_POST_TEMPLATE.md`.

---

## File Layout (after `/blog init`)

```
docs/blog/                          ← or project-orchestration/blog/
├── README.md                       ← this file
├── BLOG_POST_TEMPLATE.md           ← template for new posts
├── VOICE_REFERENCE.md              ← anchor excerpts for tone calibration
├── INDEX.md                        ← published-post index (manual + assisted)
├── WEEKLY_TIMELINE.md              ← all weeks (generated)
├── INTERESTING_WEEKS.md            ← blog-worthy weeks (generated + manual notes)
├── BORING_WEEKS.md                 ← skipped weeks (generated)
└── posts/
    └── week-NN-topic/
        └── YYYY-MM-DD-slug.md
```

---

## Re-running the timeline

The generator is **idempotent for new weeks** but does NOT overwrite manual
edits to `INTERESTING_WEEKS.md`. If you've added your own notes under a
week, they are preserved on re-run. New weeks are appended; existing weeks
are updated only in the auto-generated section (above the `<!-- USER NOTES
BELOW -->` marker per week).

To force full regeneration, delete `WEEKLY_TIMELINE.md` and re-run
`/blog timeline`.

---

## Security: what NOT to publish

Hard rules — the pre-publication checklist enforces these:

- ❌ SQL schemas (`CREATE TABLE`)
- ❌ Exact column names in queries
- ❌ API keys, credentials, secrets
- ❌ User data (PII — names, emails, phone numbers, IDs)
- ❌ Internal URLs, IP addresses
- ❌ Specific rate limits (e.g., "100 req/min")
- ❌ Library names + versions (helps attackers)
- ❌ Security configurations (salt rounds, token expiry, CSP directives)

If your post has tech sections, default to **abstraction**: "we encrypt
sensitive identifiers" rather than "AES-256-GCM with HMAC".
