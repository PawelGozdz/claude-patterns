## Agent Ecosystem

**Global agents** (auto-discovered via `~/.claude/agents/`):

| Role | Agent | Model |
|------|-------|-------|
| Advisory | backend-technology-expert | Opus |
| Advisory | security-privacy-architect | Opus |
| Advisory | state-reader | Haiku |

**Project agents** (per-project in `.claude/agents/` — this stack has no shared
`agents/stacks/node-kysely/` in claude-patterns; agents are written per service):
quality/security verifiers, plus whatever domain specialists the service needs
(integration reviewers, query optimizers).

**Built-in**: Explore agent (Haiku) — cost-efficient file discovery.

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Flat Service Architecture

### No Domain Layer Split

This is a **plain Node.js/TypeScript service**, not a DDD project — no domain/application/
infrastructure split, no aggregates, no `@vytches/ddd`. Business logic lives in ordinary
service/repository modules under `src/`.

### Persistence: Kysely

Kysely is the query builder — typed SQL, no ORM entity mapping. Migrations and schema live
next to the code that owns them, not in a separate domain layer.

### Validation: Zod (when present)

Request/response shapes validated at the HTTP boundary with Zod schemas, not domain value
objects — validation and business rules are not layered apart the way a DDD stack separates
them.

---

## Testing Strategy

Standard pyramid (L1 unit ~50%, L2 integration ~30%, L3 e2e ~20%) — same targets as other
stacks, without a domain layer to unit-test in isolation. Integration tests exercise the
Kysely queries against a real (or testcontainers) database rather than mocking the query
builder.

---

## Patterns Library

`.claude/knowledge/patterns/` — this profile pulls `cross-layer/*` (conventions,
error propagation, logging) via the `node` block. Security invariants come from
`cross-layer/security-invariants-pattern.md`, whose code examples are NestJS-flavored —
a project on this profile typically overrides it with a local pattern in
`.claude/knowledge/patterns-local/` carrying stack-accurate examples, and excludes the
upstream one via the block's `patterns.remove` (see `blocks/decision-registry.yml`'s
sibling docs for the mechanism).
