---
name: claude-updates-watcher
description: Fetches Claude Platform release notes, diffs them against the last scan, and reports new features/models/betas/deprecations with a relevance filter for the claude-patterns repo.
origin: claude-patterns
allowed-tools: Read, Write, Edit, WebFetch
model: haiku
effort: low
user-invocable: true
---

# Claude Updates Watcher

Periodic scan of Anthropic's release notes so new models, beta features,
deprecated APIs, and new tools do not slip past. Maintains a local state
file (`CLAUDE-UPDATES.md` in the repo root) with the last-seen dated
entries; each run prints only the delta.

## When to invoke

- Manually via `/claude-updates` (see `commands/claude-updates.md`).
- Periodically (user cadence — weekly/monthly is usually enough).
- After hearing "wait, Claude has X now?" one too many times.

## Sources (read in order)

1. `https://platform.claude.com/docs/en/release-notes/overview`
   — Canonical changelog for Claude Platform (API, SDKs, Console).
2. `https://claude.com/blog` (only if the user asks for marketing-level context)
   — Product announcements (less actionable than 1).

## State file

`/{repo-root}/CLAUDE-UPDATES.md` — maintained by this skill. Structure:

```markdown
# Claude Updates — Last Scan

**Last scanned**: 2026-04-24
**Last entry seen**: 2026-04-23 — Memory for Managed Agents

## Seen entries (most recent first)
- 2026-04-23 — Memory for Managed Agents (public beta, managed-agents-2026-04-01)
- 2026-04-20 — Claude Haiku 3 retired
- 2026-04-16 — Claude Opus 4.7 launched
- ...
```

If the file does not exist, treat the current scan as baseline: write it
but do not report a delta (print "baseline established, N entries recorded").

## Steps

### 1. Read state

```
Read("CLAUDE-UPDATES.md")
```

If missing → baseline mode (skip step 3, go straight to step 4 with all entries).

### 2. Fetch release notes

```
WebFetch(
  url="https://platform.claude.com/docs/en/release-notes/overview",
  prompt="Extract every dated release entry as { date: YYYY-MM-DD,
          title: short summary, category: model|beta|sdk|tool|deprecation|infra,
          beta_header: if any, details: 1-2 sentence summary }.
          Return as a list ordered newest-first. Include at least the last
          30 entries."
)
```

### 3. Diff against state

Parse both. An entry is **new** if its `(date, title)` is not in
`CLAUDE-UPDATES.md`. Skip entries older than the `Last entry seen` date
unless their title isn't in the seen list — dates can collide, titles are
the primary key.

### 4. Classify new entries

For each new entry, tag relevance to claude-patterns:

| Tag | When |
|---|---|
| 🔴 **CRITICAL** | Deprecation / retirement of a model or API the repo references, breaking changes |
| 🟠 **HIGH** | New beta features that could replace existing patterns (Managed Agents, Memory API, Skills API, Agent SDK updates) |
| 🟡 **MEDIUM** | New tools, SDK versions, new models, new beta headers worth knowing |
| ⚪ **INFO** | Pricing, rate limits, minor API polish, Console UI changes |

Relevance hints (from current repo inventory):
- Skills API (`/v1/skills`, beta `skills-2025-10-02`) ↔ our `skills/` directory
- Managed Agents (`managed-agents-2026-04-01`) ↔ our `agents/` directory (different concept, worth noting)
- Claude Code sub-agents ↔ our `agents/universal/` + `agents/stacks/`
- Models Opus/Sonnet/Haiku changes ↔ agent frontmatter `model:` fields
- MCP connector changes ↔ any hook referencing MCP servers
- Deprecations of models in current agent configs → CRITICAL (scan `agents/**/*.md` for the retired model id)

### 5. Report

Print the delta to the user in this format:

```
📡 Claude Updates — delta since {last_scan_date}

🔴 CRITICAL (N items)
  - {date} — {title}
    {details}
    Repo impact: {specific files to check, or "none identified"}

🟠 HIGH (N items)
  - {date} — {title}
    {details}

🟡 MEDIUM (N items)
  - {date} — {title}

⚪ INFO (N items, collapsed)
  - {date} — {title}
  ...

Total new entries: N
```

If zero new entries → print `📡 No Claude updates since {last_scan_date}.` and stop.

### 6. Update state

Rewrite `CLAUDE-UPDATES.md`:
- Bump `Last scanned` to today.
- Bump `Last entry seen` to the newest new entry's date.
- Prepend new entries to the "Seen entries" list (keep full history — this is a
  small text file, no need to prune).

Use `Write` (full rewrite), not `Edit` — the file is short and structured.

## Anti-patterns

- **Don't fetch the blog by default** — it's marketing prose, hard to diff.
  Only fetch when the user explicitly asks for context.
- **Don't skip classification** — unclassified deltas are just noise.
- **Don't prune the Seen entries list** — it's cheap to keep and users grep it.
- **Don't auto-update code** — this skill reports, does not refactor. If a
  deprecation is critical, the user decides whether to open a task.

## Output discipline

- Keep per-entry details to 1–2 sentences.
- Always include the beta header for beta features (so the user can reference it).
- If CRITICAL, do NOT collapse or summarize — full detail.
