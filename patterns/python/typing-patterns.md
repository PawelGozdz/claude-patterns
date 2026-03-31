# Python Typing Patterns

## When to Use

- Every Python module in the codebase — typing is not optional
- When defining interfaces between layers (Protocol)
- When building generic, reusable abstractions (TypeVar)
- When config or API contracts need runtime validation (Pydantic) vs. compile-time checking (dataclass)

**Do NOT skip** type annotations on public functions. Internal lambdas and comprehension variables are exempt, but function signatures are always typed.

---

## Implementation

### Protocol-Based Interfaces (Not ABC)

```python
# src/domain/interfaces/repository.py
from __future__ import annotations

from typing import Protocol, Sequence, TypeVar
from uuid import UUID

T = TypeVar("T")


class Repository(Protocol[T]):
    """Generic repository Protocol. Any class with these methods satisfies the contract."""

    async def get_by_id(self, entity_id: UUID) -> T | None: ...

    async def list_all(self, *, limit: int = 50, offset: int = 0) -> Sequence[T]: ...

    async def save(self, entity: T) -> T: ...

    async def delete(self, entity_id: UUID) -> bool: ...


class Publishable(Protocol):
    """Mixin protocol — classes that can be published."""

    @property
    def is_draft(self) -> bool: ...

    def publish(self) -> None: ...
```

```python
# Why Protocol beats ABC:
#
# With ABC:
#   class UserRepo(AbstractUserRepository):  # Must inherit explicitly
#       ...
#
# With Protocol:
#   class SqlAlchemyUserRepo:  # Just implement the methods. No inheritance needed.
#       async def get_by_id(self, entity_id: UUID) -> User | None: ...
#       async def list_all(self, *, limit: int = 50, offset: int = 0) -> Sequence[User]: ...
#       async def save(self, entity: User) -> User: ...
#       async def delete(self, entity_id: UUID) -> bool: ...
#
# SqlAlchemyUserRepo satisfies Repository[User] via structural subtyping.
# No base class import needed. No metaclass complexity. Just matching signatures.
```

### TypeVar for Generic Services

```python
# src/services/crud_service.py
from __future__ import annotations

from typing import Generic, Sequence, TypeVar
from uuid import UUID

from domain.exceptions import EntityNotFoundError
from domain.interfaces.repository import Repository

T = TypeVar("T")


class CrudService(Generic[T]):
    """Reusable CRUD operations. Subclass for domain-specific logic."""

    def __init__(self, repo: Repository[T], entity_name: str) -> None:
        self._repo = repo
        self._entity_name = entity_name

    async def get(self, entity_id: UUID) -> T:
        entity = await self._repo.get_by_id(entity_id)
        if entity is None:
            raise EntityNotFoundError(self._entity_name, entity_id)
        return entity

    async def list(self, *, limit: int = 50, offset: int = 0) -> Sequence[T]:
        return await self._repo.list_all(limit=limit, offset=offset)

    async def create(self, entity: T) -> T:
        return await self._repo.save(entity)

    async def remove(self, entity_id: UUID) -> None:
        deleted = await self._repo.delete(entity_id)
        if not deleted:
            raise EntityNotFoundError(self._entity_name, entity_id)
```

### TypedDict for Complex Dicts

```python
# src/domain/types.py
from __future__ import annotations

from typing import Literal, Required, TypedDict


class PaginationParams(TypedDict, total=False):
    """All fields optional except where marked Required."""
    limit: int           # defaults to not-required
    offset: int
    order_by: str
    order_dir: Literal["asc", "desc"]


class AuditEntry(TypedDict):
    """All fields required by default (total=True is the default)."""
    actor_id: str
    action: Literal["create", "update", "delete", "publish"]
    resource_type: str
    resource_id: str
    timestamp: str
    changes: dict[str, tuple[object, object]]  # field -> (old_value, new_value)


class FilterSpec(TypedDict, total=False):
    """Used by repository query builders."""
    status: Required[str]  # Required even though total=False
    created_after: str
    created_before: str
    tags: list[str]
```

### Literal for Constrained Strings

```python
# src/domain/entities/grant.py
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4

GrantStatus = Literal["draft", "open", "under_review", "awarded", "rejected", "closed"]
Currency = Literal["USD", "EUR", "GBP"]


@dataclass
class Grant:
    title: str
    amount: Decimal
    currency: Currency
    deadline: date
    id: UUID = field(default_factory=uuid4)
    status: GrantStatus = "draft"

    def submit(self) -> None:
        if self.status != "draft":
            raise ValueError(f"Cannot submit grant in status: {self.status}")
        self.status = "open"

    def award(self) -> None:
        if self.status != "under_review":
            raise ValueError(f"Cannot award grant in status: {self.status}")
        self.status = "awarded"
```

### dataclass vs Pydantic BaseModel Decision

```python
# RULE: Use dataclass for domain entities, Pydantic for API boundaries.

# Domain entity — dataclass (no validation overhead, pure Python)
from dataclasses import dataclass
from uuid import UUID


@dataclass
class Applicant:
    id: UUID
    name: str
    score: float

    def is_eligible(self) -> bool:
        return self.score >= 70.0


# API schema — Pydantic (validation, serialization, OpenAPI generation)
from pydantic import BaseModel, Field


class ApplicantRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    score: float = Field(ge=0.0, le=100.0)


# Config — Pydantic (env parsing, type coercion, defaults)
from pydantic_settings import BaseSettings


class AppConfig(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 5432
    debug: bool = False
```

### Optional vs Union — Modern Syntax

```python
# src/domain/interfaces/notification_service.py
from __future__ import annotations

from typing import Protocol
from uuid import UUID


class NotificationService(Protocol):
    # Modern Python 3.10+ syntax for Optional:
    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        cc: list[str] | None = None,        # Use X | None, not Optional[X]
    ) -> bool: ...

    async def send_sms(
        self,
        phone: str,
        message: str,
    ) -> bool: ...

    # Union for multiple types:
    async def notify(
        self,
        user_id: UUID,
        channel: str,
        payload: dict[str, str | int | bool],  # Use X | Y, not Union[X, Y]
    ) -> None: ...
```

### Callable and ParamSpec for Decorators

```python
# src/services/retry.py
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import ParamSpec, TypeVar

logger = logging.getLogger(__name__)

P = ParamSpec("P")
R = TypeVar("R")


def async_retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    exceptions: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
    """Typed async retry decorator. Preserves function signature via ParamSpec."""

    def decorator(func: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            last_exception: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as exc:
                    last_exception = exc
                    if attempt < max_attempts:
                        logger.warning(
                            "Attempt %d/%d failed for %s: %s. Retrying in %.1fs",
                            attempt, max_attempts, func.__name__, exc, delay,
                        )
                        await asyncio.sleep(delay * attempt)  # linear backoff
            raise last_exception  # type: ignore[misc]

        return wrapper

    return decorator


# Usage:
# @async_retry(max_attempts=3, delay=0.5, exceptions=(ConnectionError, TimeoutError))
# async def fetch_remote_data(url: str) -> dict[str, Any]:
#     ...
```

### Runtime Type Checking with Protocol

```python
# src/services/validation.py
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Validatable(Protocol):
    """Mark a Protocol as runtime_checkable to use with isinstance()."""

    def validate(self) -> list[str]: ...


def validate_all(items: list[Any]) -> dict[int, list[str]]:
    """Validate items that implement Validatable protocol."""
    errors: dict[int, list[str]] = {}
    for i, item in enumerate(items):
        if not isinstance(item, Validatable):
            errors[i] = [f"{type(item).__name__} does not implement Validatable"]
            continue
        item_errors = item.validate()
        if item_errors:
            errors[i] = item_errors
    return errors
```

---

## Key Rules

1. **All public functions have type annotations** on every parameter and the return type — no exceptions
2. **Use `X | None` not `Optional[X]`** — modern syntax since Python 3.10, enabled everywhere via `from __future__ import annotations`
3. **Use Protocol for interfaces, not ABC** — structural subtyping, no inheritance required
4. **Use dataclass for domain entities, Pydantic for API boundaries and config** — don't validate twice
5. **Use `TypeVar` and `Generic` for reusable abstractions** — repository, service, and handler patterns
6. **Use `Literal` for constrained string fields** — caught by mypy, visible in IDE autocomplete
7. **Use `ParamSpec` for decorators** — preserves original function signature in type checkers
8. **Add `from __future__ import annotations`** to every module — enables `X | Y` syntax on Python 3.9+

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| `def process(data)` with no annotations | No IDE support, no mypy checking, no documentation | `def process(data: GrantData) -> Result:` |
| `Optional[str]` | Verbose, less readable | `str \| None` with `from __future__ import annotations` |
| `Dict[str, Any]` for everything | No structure, no checking | `TypedDict` with specific fields |
| ABC with `@abstractmethod` | Requires inheritance chain | Protocol for structural subtyping |
| `isinstance(x, int)` for type narrowing | Misses complex types | Use `TypeGuard` for custom narrowing functions |
| Pydantic BaseModel for domain entities | Validation overhead in business logic | dataclass for domain, Pydantic at API boundary |
