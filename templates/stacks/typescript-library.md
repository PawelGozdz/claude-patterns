## Agent Ecosystem

**Global agents** (auto-discovered via `~/.claude/agents/`):

| Role | Agent | Model |
|------|-------|-------|
| Advisory | backend-technology-expert | Opus |
| Advisory | security-privacy-architect | Opus |
| Advisory | technical-architecture-lead | Opus |

**Stack agents** (auto-linked via `setup-project.sh`):

| Role | Agent | Model |
|------|-------|-------|
| Advisory | library-api-guardian | Sonnet |
| Verification | library-quality-verifier (VETO) | Sonnet |

**Built-in**: Explore agent (Haiku) — cost-efficient file discovery.

**Per-project** (optional in `.claude/agents/`): library-expert, orchestrator — project-specific.

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Library Architecture Rules

### This is a LIBRARY — Not an Application

- No DDD application patterns (this IS the DDD implementation)
- No framework-specific code in core packages (NestJS only in dedicated package)
- Every exported symbol is a public API contract
- Consumer impact must be assessed for every change

### Public API Surface

```typescript
// ✅ CORRECT: Explicit barrel exports
export { AggregateRoot } from './aggregate-root';
export type { AggregateRootOptions } from './aggregate-root';

// ❌ WRONG: Wildcard re-export exposes internals
export * from './aggregate-root';
```

### Backward Compatibility

```typescript
// ✅ CORRECT: Add optional param (non-breaking)
function create(name: string, options?: CreateOptions): Result<T>

// ❌ WRONG: Add required param (BREAKING)
function create(name: string, options: CreateOptions): Result<T>
```

### Package Boundaries (Nx Monorepo)

```
@vytches/ddd-contracts  ←  Foundation (no deps)
@vytches/ddd-domain-primitives  ←  contracts only
@vytches/ddd-aggregates  ←  contracts + primitives
@vytches/ddd-enterprise  ←  Re-exports all packages
```

Acyclic dependency graph enforced. Never introduce circular deps.

---

## Testing Strategy

| Type | Coverage | What to Test |
|------|----------|-------------|
| **Contract** | ~50% | Public API behavior (what consumers depend on) |
| **Export** | 100% | All declared exports exist and are importable |
| **Type** | Key APIs | Type assertions with expect-type |
| **Unit** | ~40% | Internal logic, edge cases |
| **Bundle** | ESM+CJS | Both formats import correctly |

Framework: **Vitest** + expect-type

---

## Patterns Library

**Location**: `.claude/knowledge/patterns/` (symlinked from claude-patterns)

| Pattern | Purpose |
|---------|---------|
| `public-api-pattern.md` | Exports, type guards, deprecation |
| `backward-compatibility-pattern.md` | Safe extensions, semver |
| `package-boundary-pattern.md` | Nx deps, circular prevention |
| `library-testing-pattern.md` | Contract, export, type tests |
| `build-publish-pattern.md` | ESM/CJS, declarations, changesets |
