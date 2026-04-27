# Claude Updates — Last Scan

**Last scanned**: 2026-04-24
**Last entry seen**: 2026-04-23 — Memory for Claude Managed Agents (public beta)

> Maintained by `/claude-updates` (see `commands/claude-updates.md`).
> Title is the primary key — dates can repeat, titles should not.
> Never prune — full history is cheap to keep.

## Seen entries (most recent first)

### 2026
- 2026-04-23 — Memory for Claude Managed Agents (public beta, `managed-agents-2026-04-01`)
- 2026-04-20 — Claude Haiku 3 retired (`claude-3-haiku-20240307`)
- 2026-04-16 — Claude Opus 4.7 launched; Claude in Amazon Bedrock GA
- 2026-04-14 — Deprecation: Sonnet 4 and Opus 4 (retire 2026-06-15)
- 2026-04-09 — Advisor tool in public beta (`advisor-tool-2026-03-01`)
- 2026-04-08 — Claude Managed Agents in public beta (`managed-agents-2026-04-01`); `ant` CLI launched
- 2026-04-07 — Claude Mythos Preview (Glasswing, gated); Messages API on Amazon Bedrock research preview
- 2026-03-30 — Message Batches `max_tokens` raised to 300k (`output-300k-2026-03-24`); 1M context beta retiring for Sonnet 4.5 / Sonnet 4 on 2026-04-30
- 2026-03-18 — Models API: `max_input_tokens`, `max_tokens`, `capabilities` fields
- 2026-03-16 — Extended thinking `display: "omitted"` field
- 2026-03-13 — 1M context window GA for Opus 4.6 and Sonnet 4.6; dedicated 1M rate limits removed; media limit 100 → 600 in 1M context
- 2026-02-19 — Automatic prompt caching (single `cache_control`); Sonnet 3.7 and Haiku 3.5 retired; Haiku 3 deprecation announced
- 2026-02-17 — Claude Sonnet 4.6 launched; API code execution free with web search/fetch; web search and programmatic tool calling GA; code execution, web fetch, tool search, memory tool, tool use examples GA
- 2026-02-07 — Fast mode (research preview, `speed` parameter, Opus 4.6)
- 2026-02-05 — Claude Opus 4.6; adaptive thinking (manual thinking deprecated); no prefill on Opus 4.6; effort parameter GA; compaction API beta; data residency controls (`inference_geo`); 1M beta for Opus 4.6; fine-grained tool streaming GA; `output_format` → `output_config.format`
- 2026-01-29 — Structured outputs GA on Sonnet 4.5 / Opus 4.5 / Haiku 4.5
- 2026-01-12 — `console.anthropic.com` redirects to `platform.claude.com`
- 2026-01-05 — Claude Opus 3 retired

### 2025
- 2025-12-19 — Haiku 3.5 deprecation announced
- 2025-12-04 — Structured outputs for Haiku 4.5
- 2025-11-24 — Claude Opus 4.5; programmatic tool calling beta; tool search tool beta; effort parameter beta; client-side compaction in SDK
- 2025-11-21 — Search result content blocks GA on Bedrock
- 2025-11-19 — New docs platform at `platform.claude.com/docs`
- 2025-11-18 — Claude in Microsoft Foundry
- 2025-11-14 — Structured outputs public beta (`structured-outputs-2025-11-13`)
- 2025-10-28 — Sonnet 3.7 deprecation; Sonnet 3.5 retired; thinking block clearing (`clear_thinking_20251015`)
- 2025-10-16 — **Agent Skills** beta (`skills-2025-10-02`); `/v1/skills` API; Anthropic-managed Skills (pptx/xlsx/docx/pdf)
- 2025-10-15 — Claude Haiku 4.5 launched
- 2025-09-29 — Claude Sonnet 4.5; global endpoint pricing on Bedrock/Vertex; `model_context_window_exceeded` stop reason; memory tool beta; context editing beta
- 2025-09-17 — Tool helpers beta (Python/TS SDKs)
- 2025-09-16 — Rebrand: Anthropic → Claude; `console.anthropic.com` → `platform.claude.com`
- 2025-09-10 — Web fetch tool beta; Claude Code Analytics API
- 2025-09-08 — C# SDK beta
- 2025-09-05 — Rate limit charts in Console
- 2025-09-03 — Citable documents in client-side tool results
- 2025-09-02 — Code Execution Tool v2 (Bash + file manipulation)
- 2025-08-27 — PHP SDK beta
- 2025-08-26 — 1M rate limits raised for Sonnet 4; 1M on Vertex AI
- 2025-08-19 — Request IDs in error response bodies
- 2025-08-18 — Usage & Cost API; Organization Info Admin API
- 2025-08-13 — Sonnet 3.5 deprecation announced; 1-hour cache duration GA
- 2025-08-12 — 1M token context window beta for Sonnet 4
- 2025-08-11 — 429 `rate_limit_error` replacing 529 `overloaded_error` for acceleration limits
- 2025-08-08 — Search result content blocks GA on API + Vertex
- 2025-08-05 — Claude Opus 4.1 launched
- 2025-07-28 — `text_editor_20250728` with `max_characters`
- 2025-07-24 — Rate limits increased for Opus 4
- 2025-07-21 — Claude 2.0, 2.1, Sonnet 3 retired
- 2025-07-17 — Rate limits increased for Sonnet 4
- 2025-07-03 — Search result content blocks beta (`search-results-2025-06-09`)
- 2025-06-30 — Opus 3 deprecation announced
- 2025-06-23 — Developer role can access Cost page
- 2025-06-11 — Fine-grained tool streaming beta (`fine-grained-tool-streaming-2025-05-14`)
- 2025-05-22 — Claude Opus 4 and Sonnet 4; interleaved thinking beta (`interleaved-thinking-2025-05-14`); Files API beta; Code execution tool beta; MCP connector beta; default `top_p` 0.999 → 0.99; Go SDK GA
- 2025-05-21 — Ruby SDK GA
- 2025-05-07 — Web search tool on API
- 2025-05-01 — Cache control moved to parent content blocks

### 2024 (selected)
- 2024-12-17 — GA: Models API, Message Batches API, Token counting API, Prompt Caching, PDF support; Java + Go SDKs alpha
- 2024-11-21 — Admin API launched
- 2024-11-20 — New rate limits (input/output tokens per minute); tool use in Workbench
- 2024-11-04 — Haiku 3.5 on API (text-only)
- 2024-10-22 — Computer use tools; Sonnet 3.5 upgrade
- 2024-10-08 — Message Batches API beta; `user`/`assistant` ordering loosened
- 2024-09-10 — Workspaces in Console
- 2024-08-14 — Prompt caching beta
- 2024-06-20 — Sonnet 3.5 GA

---

## Notes on categorization

Entries above are a flat list. Use `/claude-updates` to get the current classified delta (CRITICAL / HIGH / MEDIUM / INFO) against this baseline on each new run.

## Repo-impact watchlist

Things to re-check on every scan (the skill looks for these):
- Retired model IDs referenced in `agents/**/*.md` `model:` fields
- Beta headers referenced in commands/skills/agents (may be deprecated)
- New features that overlap with current patterns (Skills API ↔ `skills/`, Managed Agents ↔ `agents/`, Memory API ↔ `MEMORY.md`)
