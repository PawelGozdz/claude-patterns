---
name: python-clean-arch
description: Python layered architecture patterns — domain purity, FastAPI dependency injection, Protocol interfaces, async patterns, pytest testing. Activates on Python files.
origin: my-intelligence, pcu
paths:
  - "**/*.py"
---

# Python Clean Architecture Skill

Production-tested patterns for Python projects with FastAPI and layered architecture.

## Activation

Auto-activates when editing `.py` files. Reference for:
- Layer structure (domain/services/api/repositories)
- FastAPI dependency injection
- Protocol-based interfaces
- Async patterns
- pytest testing

## Core Patterns

Reference patterns in `.claude/knowledge/patterns/`:

| Pattern | When to Use |
|---------|-------------|
| `layered-architecture-pattern.md` | New module, layer structure |
| `fastapi-patterns.md` | Routes, middleware, DI |
| `typing-patterns.md` | Interfaces, generics, validation |
| `testing-pattern.md` | Fixtures, factories, async tests |
| `async-patterns.md` | Concurrency, pools, background tasks |

## Quick Rules

1. **Domain layer is PURE** — no sqlalchemy, fastapi, httpx, boto3, redis, celery
2. **All public functions typed** — parameters AND return type
3. **Protocol for interfaces** — not ABC (structural subtyping)
4. **Depends() for injection** — never instantiate services in routes
5. **async for I/O** — never block event loop with sync calls
6. **pytest only** — fixtures, factories, TestClient with DI overrides

## Anti-Patterns

- SQLAlchemy models in domain (use pure dataclasses)
- Business logic in route handlers (move to services)
- `Any` type without justification
- `time.sleep()` in async code
- Raw SQL without parameterization
- Missing return type annotations
