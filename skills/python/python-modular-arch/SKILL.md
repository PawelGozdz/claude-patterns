---
name: python-modular-arch
description: Python layered modular monolith patterns — module isolation, dependency direction, db encapsulation, FastAPI DI, async patterns, pytest testing. For non-DDD Python projects.
origin: claude-patterns
paths:
  - "**/*.py"
---

# Python Modular Architecture Skill

Production-tested patterns for Python projects with layered modular monolith architecture.

## Activation

Auto-activates when editing `.py` files. Reference for:
- Layer structure (data → logic → presentation)
- Module isolation and dependency direction
- Database access encapsulation
- FastAPI dependency injection
- Protocol-based interfaces
- Async patterns
- pytest testing

## Core Patterns

| Pattern | When to Use |
|---------|-------------|
| Module isolation | New module, cross-module dependency decision |
| DB encapsulation | Any database access, new query, new driver |
| FastAPI DI | Routes, middleware, composition root |
| Protocol interfaces | Cross-module contracts, testable boundaries |
| Async patterns | Concurrency, connection pools, background tasks |

## Quick Rules

1. **db/ is the bottom layer** — imports nothing from logic or presentation
2. **Logic modules depend only on db/** — no cross-module imports unless declared
3. **No direct DB driver imports** outside db/ (psycopg, neo4j, redis, sqlalchemy)
4. **All public functions typed** — parameters AND return type
5. **Protocol for interfaces** — structural subtyping, not ABC
6. **Depends() for injection** — never instantiate services in routes
7. **async for I/O** — never block event loop with sync calls
8. **pytest only** — fixtures, factories, TestClient with DI overrides
9. **Frozen dataclasses** for internal models, Pydantic for API boundaries
10. **Per-module errors** — no shared "domain exception" hierarchy

## Anti-Patterns

- DB driver imports outside `db/` module
- Cross-module imports in logic layer (circular dependency risk)
- Business logic in route handlers (move to module service)
- SQLAlchemy models leaking into logic/presentation layers
- `Any` type without justification
- `time.sleep()` in async code
- f-strings in SQL/Cypher queries (use parameterized)
- Mutable shared state between requests
- Missing return type annotations
