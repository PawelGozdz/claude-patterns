## Messaging-Agnostic Architecture

**Core rule (enforced by hook + ESLint):**
`core/` and `mcp-servers/` NEVER import from `clients/<platform>/`

```
src/
├── core/              ← MESSAGING-AGNOSTIC (no platform knowledge)
│   ├── router/        intent classifier → routes to persona/handler
│   ├── safety/        pii-filter, kill-switch, permissions, audit-logger
│   ├── memory/        Redis session + vector semantic
│   └── observability/ cost tracking, structured logging
│
├── mcp-servers/       ← MESSAGING-AGNOSTIC tools for LLM
│
├── clients/           ← PLUGGABLE platform adapters
│   └── discord/       (rewrite ONLY this when switching platforms)
│
└── main.ts            boot: register adapter, start core
```

Changing platform = rewrite `src/clients/<old>/` → `src/clients/<new>/` only.

---

## Safety Rules (NEVER skip)

1. **PII filter**: every external LLM call goes through `core/safety/pii-filter.ts` (pre + post)
2. **Kill switch**: every action checks `core/safety/kill-switch.ts` first (Redis flag)
3. **Permissions**: every action checks `core/safety/permissions.ts` (per persona)
4. **Audit log**: every LLM call logged to `ai_analytics.llm_audit`
5. **Iteration cap**: hard limit 3 iterations per autonomous task (enforced in router)
6. **Cost cap**: daily $20 — Helicone alert + auto-pause
7. **No credentials**: all secrets from Azure Key Vault via env vars — NEVER hardcoded

---

## Anthropic SDK Patterns

```typescript
// ✅ CORRECT: streaming with cost tracking
const stream = await anthropic.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: sanitizedInput }], // after pii-filter
});

// ✅ CORRECT: prompt caching for persona system prompts
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  system: [{ type: 'text', text: personaPrompt, cache_control: { type: 'ephemeral' } }],
  messages,
});

// ❌ WRONG: raw user input to LLM without PII filter
const response = await anthropic.messages.create({ messages: [{ role: 'user', content: userMessage }] });
```

---

## Testing Strategy

| Level | Target | What |
|-------|--------|------|
| Unit | `core/` modules | router, safety, memory, persona registry |
| Integration | `mcp-servers/` | mock external API, real internal logic |
| E2E | full pipeline | mock platform adapter (no real Discord/Slack API) |

**PII filter: 100% coverage required** (regulatory — GDPR).

Framework: **Vitest**. No mocking of Redis/Postgres unless unit-testing edge cases.

---

## Cost Optimization

| Model | Use case |
|-------|---------|
| %%COST_OPUS%% Opus | Complex multi-step reasoning, orchestration decisions |
| %%COST_SONNET%% Sonnet | Standard persona responses, intent classification |
| %%COST_HAIKU%% Haiku | Simple routing, format checks, cheap lookups |

Enable prompt caching for all persona system prompts (stable context → high cache hit rate).
