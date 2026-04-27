---
name: cost-report
description: |
  Pull a usage/cost report from Claude Code Analytics API.
  Shows token spend per model + estimated cost (USD), broken down by day or week.
  Requires ANTHROPIC_ADMIN_API_KEY (Admin API key, sk-ant-admin-…).

  Usage:
    /cost-report                    → last 7 days, daily breakdown
    /cost-report 30                 → last 30 days, daily
    /cost-report 90 weekly          → last 90 days, weekly bucket
    /cost-report --since 2026-04-01 → custom start date

tools: Bash, Read
---

# /cost-report — Claude Code spend & token usage

Endpoint: `GET https://api.anthropic.com/v1/organizations/usage_report/claude_code`

Auth: header `x-api-key: $ANTHROPIC_ADMIN_API_KEY` (different from regular API key — must start with `sk-ant-admin-`).

Provides per-model token breakdown (input / output / cache_read / cache_creation) and `estimated_cost` in USD. Up to 1-hour delay.

---

## Steps

### 1. Verify admin key

```bash
if [ -z "$ANTHROPIC_ADMIN_API_KEY" ]; then
  echo "Set ANTHROPIC_ADMIN_API_KEY (admin key, sk-ant-admin-...). Provision in Console → API keys."
  exit 1
fi
```

### 2. Compute date range

Default: last 7 days, daily granularity. Parse args:
- First positional arg (number) → days back
- Second positional arg (`daily` | `weekly`) → bucket
- `--since YYYY-MM-DD` → explicit start

### 3. Call the API

```bash
START=$(date -u -d "$DAYS days ago" +%Y-%m-%d)
END=$(date -u +%Y-%m-%d)

curl -sS "https://api.anthropic.com/v1/organizations/usage_report/claude_code?starting_at=${START}T00:00:00Z&ending_at=${END}T00:00:00Z&bucket_width=${BUCKET}" \
  -H "x-api-key: $ANTHROPIC_ADMIN_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

Use cursor-based pagination if `next_page` is present in the response.

### 4. Aggregate and print

For each bucket, render:

```
📊 Claude Code spend — {start} to {end} ({bucket})

Period           Opus       Sonnet     Haiku      Total $    Tokens (M)
2026-04-20       $4.30      $2.10      $0.05      $6.45      1.2
2026-04-21       $5.80      $1.90      $0.03      $7.73      1.4
...
─────────────────────────────────────────────────────────────────────
TOTAL            $42.10     $18.30     $0.45      $60.85     14.8
SHARE            69%        30%        1%
```

After the table, add a heuristic check:

```
⚠️ Haiku share is 1% — branża (15-30%) is target.
   Consider downgrading bounded skills/agents to Haiku.
   Candidates: state-reader, changelog-bot, Explore (agents),
   pm-status, task-tidy, claude-updates-watcher (skills delegating to them).
```

Heuristic thresholds:
- Haiku < 10% → ⚠️ warning (under-utilized)
- Opus > 40% → ⚠️ warning (over-spending on simple tasks)
- Cache read tokens < 30% of total reads → 💡 hint about prompt caching

### 5. Write summary to `.claude/cost-reports/YYYY-MM-DD.md`

Optional, only if `--save` flag passed. Lets you trend cost over months.

---

## Rules

- **Admin API key only.** Don't accept regular sk-ant-… keys.
- **Read-only.** Never call write/mutation endpoints.
- **No automatic actions.** Report only — refactoring agent assignments is a separate user decision.
- **Cache the result for the session** so repeated calls in same session don't hit the API.

---

## Related

- Sources for analytics interpretation: `patterns/orchestration/project-management-system.md` (cost section if exists).
- After running this, consider `/orchestrate analyze cost` for deeper analysis with `backend-technology-expert`.
