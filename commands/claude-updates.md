---
name: claude-updates
description: |
  Scan Claude Platform release notes for new features, models, betas, and
  deprecations since the last check. Reports a classified delta and updates
  CLAUDE-UPDATES.md in the repo root.

  Usage: /claude-updates
  Alias: /cu
tools: Read, Write, Edit, WebFetch
---

# /claude-updates — Scan Claude Platform for New Features

Stay current on: new Claude models (Opus/Sonnet/Haiku, retirements,
deprecations), new beta features and headers, new tools (Managed Agents,
Memory API, Skills API, Advisor tool, …), SDK/CLI updates, pricing and
rate-limit changes.

See also: `skills/learning/claude-updates-watcher/SKILL.md` for the full
specification this command implements.

---

## Source

`https://platform.claude.com/docs/en/release-notes/overview` — canonical
changelog for the Claude Platform (API, SDKs, Console).

## State file

`/{repo-root}/CLAUDE-UPDATES.md` — git-tracked, append-only history of what
was seen. Structure:

```markdown
# Claude Updates — Last Scan

**Last scanned**: YYYY-MM-DD
**Last entry seen**: YYYY-MM-DD — {title}

## Seen entries (most recent first)
- YYYY-MM-DD — {title}
- ...
```

If the file doesn't exist → baseline mode: write it from the fetched list
and report `baseline established, N entries recorded`. Do not print a delta
on the baseline run.

---

## Steps

### 1. Read state

```
Read("CLAUDE-UPDATES.md")
```

If missing → go to step 2 with empty state (baseline mode).

### 2. Fetch release notes

```
WebFetch(
  url="https://platform.claude.com/docs/en/release-notes/overview",
  prompt="Extract every dated release entry from the page as a list of
          { date: YYYY-MM-DD, title: short summary, category:
          model|beta|sdk|tool|deprecation|infra, beta_header: any header
          mentioned, details: 1-2 sentence summary }. Order newest-first.
          Include at least the last 30 dated entries."
)
```

### 3. Diff

An entry from the fetch is **new** if its `title` is not present in the
"Seen entries" section of `CLAUDE-UPDATES.md`. Title is the key (dates can
repeat).

### 4. Classify each new entry

| Tag | Criteria |
|---|---|
| 🔴 **CRITICAL** | Model/API retirement or breaking change that affects files currently in this repo (scan `agents/**/*.md` for `model:` values referencing retired IDs). Deprecated beta headers currently used anywhere. |
| 🟠 **HIGH** | New beta features that could replace or extend what we build here: Managed Agents, Memory API, Skills API, Agent SDK, sub-agent changes, new MCP features. |
| 🟡 **MEDIUM** | New tools, new models, new SDK versions, new beta headers (not yet referenced in repo). |
| ⚪ **INFO** | Pricing, rate limits, Console UI, minor polish. |

**Scanning for CRITICAL impact:**
- `grep -r "claude-3-haiku-20240307" agents/` — retired models
- `grep -r "beta:" agents/ commands/ skills/` — referenced betas
- `grep -rE "model:\s*(opus|sonnet|haiku)" agents/` — model family usage

If a retired model is referenced anywhere → CRITICAL, list those files.

### 5. Report

Format:

```
📡 Claude Updates — delta since {last_scan_date}

🔴 CRITICAL ({n})
  - {date} — {title}
    {details}
    Beta header: {if any}
    Repo impact: {file list or "none identified"}

🟠 HIGH ({n})
  - {date} — {title}
    {details}
    Beta header: {if any}

🟡 MEDIUM ({n})
  - {date} — {title}

⚪ INFO ({n}, collapsed)
  - {date} — {title}
  ...

Total new: {n}
```

If zero new entries → print `📡 No Claude updates since {last_scan_date}.` and STOP (skip step 6).

### 6. Update state

Rewrite `CLAUDE-UPDATES.md` (full Write, not Edit — the file is short):
- Set `Last scanned` to today.
- Set `Last entry seen` to the newest new entry's date + title.
- Prepend new entries to the "Seen entries" list.
- Never prune — full history is cheap to keep.

---

## Rules

- **Do not refactor code** based on the delta. Report only. The user decides
  whether to open a task.
- **Do not run twice in one session** — WebFetch has a 15-min cache; the
  second run returns the same snapshot.
- **Always list the beta header** for beta features (user needs it).
- **CRITICAL entries are never collapsed** — always show full detail.
- **Keep per-entry details to 1–2 sentences** — this is a scan, not an article.

## When to run

- Weekly or monthly cadence (user choice).
- Before starting a sprint that touches agent/skill infrastructure.
- Before a major dependency/model upgrade.
- When someone asks "what's new in Claude?" and you need a grounded answer.
