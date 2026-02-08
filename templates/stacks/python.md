## Agent Ecosystem

**3 tiers** (all auto-discovered via symlinks):

| Tier | Agents | Model |
|------|--------|-------|
| Implementation | python-implementer, api-designer | Sonnet |
| Verification | code-quality-verifier (Sonnet), security-verifier (Opus) | Mixed |
| Utility | codebase-explorer, endpoint-scaffolder, test-generator | Haiku |

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Python Architecture Rules

- **Framework**: %%FRAMEWORK%%
- **Type Safety**: Use type hints everywhere + mypy strict mode
- **Dependency Injection**: Depends() for FastAPI, or factory pattern
- **Data Validation**: Pydantic models for API/data validation
- **Async**: async/await for I/O operations (FastAPI, aiohttp)
- **Database**: SQLAlchemy/Alembic for ORM + migrations

---

## Key Patterns

- **Repository Pattern**: Data access abstraction
- **Service Layer**: Business logic separation
- **Schema Layer**: Pydantic models (request/response/domain)
- **Dependency Container**: Factory pattern or dependency-injector
- **Error Handling**: Structured exceptions + error responses
- **Configuration**: Pydantic Settings + .env files

---

## Testing Strategy

- **Unit Tests (~50%)**: Business logic, services, utilities (pytest)
- **Integration Tests (~30%)**: Database, external APIs, repositories
- **API Tests (~20%)**: E2E endpoint testing (pytest + httpx/TestClient)
- **Coverage Target**: 80%+ with pytest-cov
