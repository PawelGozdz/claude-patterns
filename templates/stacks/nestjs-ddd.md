## Agent Ecosystem

**3 tiers** (all auto-discovered via symlinks):

| Tier | Agents | Model |
|------|--------|-------|
| Implementation | domain-application-implementer, infrastructure-testing-implementer | Sonnet |
| Verification | code-quality-verifier (Sonnet), security-e2e-verifier (Opus, VETO) | Mixed |
| Utility | codebase-explorer, schema-testing-agent, test-scaffolder, documentation-writer, migration-generator | Haiku |

**Advisory** (on-demand): ddd-application-expert, backend-technology-expert (both Sonnet/Opus).

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Patterns Library

**Location**: `.claude/knowledge/patterns/` (symlinked from claude-patterns)

6 layers: Domain, Application, Infrastructure, Architecture, Cross-Layer, Testing.

**Before implementing anything**: read the relevant pattern first. Patterns contain real production code, not generic DDD examples.

Quick lookup: `.claude/knowledge/patterns/README.md`

---

## Key Architecture Rules

- **Module Organization**: If file imports from `./index`, it CANNOT be exported from that `./index`
- **ACL Registry**: NEVER import between contexts. Use `aclRegistry.getGlobalRequired()`
- **Hybrid Events**: Domain events in aggregates, Integration events from handlers only
- **PolicyBuilder**: ALWAYS use `.must(spec)`. NEVER `BusinessRuleValidator.addRule()`
- **Dual Identity**: NEVER accept userId from request body. Extract from `RequestContextService`
- **@Transactional**: `Result.fail()` rollback, `Result.ok()` commit
- **Handler Registration**: Decorator-based auto-discovery. Add `@CommandHandler`/`@QueryHandler`/`@EventHandler` + providers array
