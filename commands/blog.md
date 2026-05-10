---
name: blog
description: |
  Entry point for the build-in-public developer blog. Generates blog
  scaffolding from project history (git + KANBAN.md + completed tasks).
  Produces structured research notes — does NOT write prose.

  Examples:
    /blog init                          # scaffold templates into docs/blog/
    /blog timeline                      # analyze full git history
    /blog timeline --last-n-weeks=12    # only recent weeks
    /blog timeline --since=2025-08-01   # since a date
    /blog research week-04              # research notes for a chosen week

  Usage: /blog <mode> [args]

tools: Task, Read, Glob, Grep, Bash, Write, Edit
disallowedTools: NotebookEdit
---

# /blog — Dev Blog Generator

**Build-in-public weekly log.** Reads project history, classifies weeks by
activity, produces research scaffolding. **You write the prose.**

## What This Does

Routes to the `dev-blog-generator` skill which operates in three modes:

| Mode | Purpose |
|---|---|
| `init` | Copy `templates/dev-blog/` into project (`docs/blog/` or `project-orchestration/blog/`) |
| `timeline` | Analyze git + KANBAN, generate `WEEKLY_TIMELINE.md` + `INTERESTING_WEEKS.md` + `BORING_WEEKS.md` |
| `research <week-id>` | Produce structured research notes (commits, tasks, files, decisions, narrative angles) for one week |

## Steps

1. **Parse mode and args** from `$1`. Default mode if no args: ask user
   which mode they want.

2. **Pre-flight checks**:
   - For `timeline` / `research`: confirm we're in a git repo (`git rev-parse
     --show-toplevel`). Abort with a helpful message if not.
   - For `timeline` / `research`: check that `docs/blog/` or
     `project-orchestration/blog/` exists. If not, suggest `/blog init` first.
   - For `research <week>`: confirm `WEEKLY_TIMELINE.md` exists. If not,
     run `timeline` first.

3. **Read `VOICE_REFERENCE.md`** if it exists (gives language and persona
   context — the skill outputs research notes adapted to the project's
   language).

4. **Invoke the skill**: load
   `~/.claude/skills/marketing/dev-blog-generator/SKILL.md` and execute the
   appropriate mode workflow.

5. **Report results**: short tabular summary of what was generated/updated
   and the recommended next step.

## What This Does NOT Do

- ❌ Write blog prose for the user (research scaffolds only)
- ❌ Invent decisions, dilemmas, or events not present in git/tasks
- ❌ Publish to external platforms (Medium, Dev.to, Substack)
- ❌ Manage CMS or static site generators

## Output Contract

After this command runs, the user has either:
- A scaffolded blog directory (after `init`)
- Updated timeline + interesting + boring files (after `timeline`)
- A research scaffold at `{blog-dir}/research/week-NN-research.md`
  (after `research`)

In all cases: clear recommended next step in the final message.

## See Also

- Skill: `skills/marketing/dev-blog-generator/SKILL.md`
- Templates: `templates/dev-blog/`
- Marketing strategist routing: `agents/universal/marketing-strategist.md`
