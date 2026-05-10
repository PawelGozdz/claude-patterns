# Output Styles

Pre-built output styles that override the session system prompt for
specific advisory contexts. Each style enforces a consistent voice and
reasoning discipline more strongly than agent prompts alone.

## Available styles

| Style | Pairs with agent | When to activate |
|-------|------------------|------------------|
| `marketing-strategist` | `@marketing-strategist` | Marketing analysis sessions (CRO, copy, SEO, paid ads, growth) |
| `finance-strategist` | `@finance-strategist` | Investment, regulatory, advisory, pricing, unit economics analysis |
| `legal-strategist` | `@legal-strategist` | Contracts, GDPR/CCPA, IP, employment, compliance work |

## When to use output styles vs agent prompts

- **Agent prompt** (`@marketing-strategist`): one-shot delegation. Agent
  receives a task, produces output, returns. Voice rules live in agent file.
- **Output style** (this directory): session-wide. Voice rules apply to
  every Claude response until the style is changed. Useful when you're
  doing a long marketing/legal/finance session and want consistency
  beyond what an agent prompt can guarantee.

Both can co-exist — output style sets the session voice; agent invocations
within still work normally and inherit the style.

## Activation

### Per-session (one-time)

```
/output-style marketing-strategist
```

### Per-project default (settings.json)

Add to `.claude/settings.json`:

```json
{
  "outputStyle": "finance-strategist"
}
```

### Per-user default (`~/.claude/settings.json`)

Same key, but applies to all projects unless overridden per-project.

## Discovery

Claude Code reads output styles from:

1. `.claude/output-styles/` (per-project)
2. `~/.claude/output-styles/` (per-user, symlinked here from claude-patterns)

Project-level overrides user-level by name match. The symlink in
`~/.claude/output-styles/` points to this directory, so all three
strategist styles are immediately available globally.

## Why these three only

claude-patterns currently ships strategist agents only for marketing,
finance, and legal — these are the three advisory contexts where voice
discipline (hedging, confidence levels, contextual disclaimers) matters
most because the user is making business decisions on the output. Code
implementation work doesn't need a separate output style — it inherits
the project's CLAUDE.md instructions and the implementer agent prompts.

## Adding a new output style

1. Create `output-styles/<name>.md` with frontmatter:
   ```yaml
   ---
   name: <name>
   description: <one-line description>
   ---
   ```
2. Body is the system prompt: voice rules, reasoning discipline,
   what-to-avoid section, tone guidance.
3. Update this README's table.
4. Test by activating in a session and confirming the voice differs
   from default Claude Code coding-focused output.
