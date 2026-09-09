# Token Optimization Guide — Rule Card

**Tags**: "any:process"
<!-- Egzekwowalne streszczenie token-optimization-pattern.md.
     Pełny wzorzec: token-optimization-pattern.md -->

**Layer**: Architecture
**Status**: Reference (Claude Code session/settings guidance, not an enforced code pattern)
**Source**: token-optimization-pattern.md

## MUST
- **T1** — Default `model: sonnet` in `~/.claude/settings.json` — Opus only via explicit
  `/model opus` for complex reasoning (~60% cost reduction vs Opus-default).
- **T2** — Set `MAX_THINKING_TOKENS` to 10000 (down from 31999 default) unless a task genuinely
  needs deep extended thinking; `0` for trivial tasks.
- **T3** — Set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` to 50 — the 95% default compacts too late,
  after quality has already degraded.
- **T4** — Set `CLAUDE_CODE_SUBAGENT_MODEL=haiku` — subagent exploration/file-reading doesn't
  need Sonnet/Opus and is ~80% cheaper on Haiku.
- **T5** — Use subagents (Task tool) for exploration that reads many files — the subagent's full
  read stays out of the main context; only its summary returns.
- **T6** — Keep enabled MCP servers under ~10 per project; prefer a CLI (`gh`, `aws`) over an
  MCP server when both exist.

## MUST NOT
- **N1** — ❌ Run `/compact` mid-implementation of related changes, while actively debugging, or
  mid multi-file refactor — compact at milestone/task boundaries instead.
- **N2** — ❌ Use Agent Teams for simple sequential work — each teammate is a separate context
  window; subagents (Task tool) are more token-efficient for non-parallel tasks.
- **N3** — ❌ Leave stale context loaded across unrelated tasks — `/clear` between them; every
  subsequent message otherwise pays for the stale context.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Setting up `~/.claude/settings.json` defaults for a new machine/project.
- ✅ A session burning tokens fast and needing concrete levers.
- ✅ Deciding subagents vs. long main-context session for a multi-step task.
- ❌ A one-off model choice for a single message (use `/model` directly).
- ❌ Correctness/architecture decisions unrelated to token cost.

## Verifier — najczęstsze naruszenia
| Symptom | Złamana reguła |
|---|---|
| `settings.json` bez `MAX_THINKING_TOKENS`/`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` na nowej maszynie | T2/T3 |
| Main-agent czyta 20 plików zamiast delegować do subagenta | T5 |
| `/compact` wywołany w trakcie aktywnego debugowania | N1 |
| Sekwencyjny task uruchomiony jako Agent Teams | N2 |

**Pełny wzorzec**: [`token-optimization-pattern.md`](./token-optimization-pattern.md)
