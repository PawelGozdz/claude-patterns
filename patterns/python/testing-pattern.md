# Python Testing Patterns

## When to Use

- Every Python module with business logic, API routes, or repository implementations
- When you need isolated, repeatable tests that don't depend on external services
- When testing async code with FastAPI's dependency injection
- When building a test suite that runs in CI under 60 seconds

**Do NOT use** heavyweight integration tests for pure domain logic. Unit test entities and services directly; save TestClient for API-layer tests only.

---

## Implementation

### Conftest Organization

```python
# tests/conftest.py
"""
Root conftest — shared fixtures available to ALL tests.
Layer-specific fixtures live in their own conftest files:
  tests/unit/conftest.py
  tests/integration/conftest.py
  tests/e2e/conftest.py
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator
from typing import Any
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from domain.entities.user import User, UserRole
from domain.value_objects.email import Email


# -- Event loop fixture (required for pytest-asyncio) --

@pytest.fixture(scope="session")
def event_loop() -> Iterator[asyncio.AbstractEventLoop]:
    """Session-scoped event loop — shared across all async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# -- Database fixtures --

@pytest_asyncio.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    """Session-scoped engine — one connection pool for the entire test run."""
    engine = create_async_engine(
        "postgresql+asyncpg://test:test@localhost:5432/test_db",
        echo=False,
    )
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Function-scoped session — each test gets its own transaction that rolls back."""
    async with engine.connect() as conn:
        transaction = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        yield session
        await session.close()
        await transaction.rollback()  # Always rollback — test isolation guaranteed
```

### Factory Pattern for Test Data

```python
# tests/factories.py
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from domain.entities.grant import Grant
from domain.entities.user import User, UserRole
from domain.value_objects.email import Email


class UserFactory:
    """Builds User entities with sensible defaults. Override only what matters per test."""

    _counter: int = 0

    @classmethod
    def create(
        cls,
        *,
        id: UUID | None = None,
        email: str | None = None,
        full_name: str = "Jane Doe",
        role: UserRole = UserRole.APPLICANT,
        is_active: bool = True,
    ) -> User:
        cls._counter += 1
        return User(
            id=id or uuid4(),
            email=Email(email or f"user{cls._counter}@example.com"),
            full_name=full_name,
            role=role,
            is_active=is_active,
            created_at=datetime(2025, 1, 1),
        )

    @classmethod
    def create_batch(cls, count: int, **kwargs: object) -> list[User]:
        return [cls.create(**kwargs) for _ in range(count)]  # type: ignore[arg-type]


class GrantFactory:
    _counter: int = 0

    @classmethod
    def create(
        cls,
        *,
        id: UUID | None = None,
        title: str | None = None,
        amount: Decimal = Decimal("50000.00"),
        currency: str = "USD",
        deadline: date | None = None,
        status: str = "draft",
    ) -> Grant:
        cls._counter += 1
        return Grant(
            id=id or uuid4(),
            title=title or f"Test Grant #{cls._counter}",
            amount=amount,
            currency=currency,
            deadline=deadline or date(2026, 12, 31),
            status=status,
        )
```

### In-Memory Fake Repository for Unit Tests

```python
# tests/fakes.py
from __future__ import annotations

from typing import Sequence
from uuid import UUID

from domain.entities.user import User


class FakeUserRepository:
    """In-memory repository that satisfies the UserRepository Protocol.
    No inheritance needed — structural typing handles it."""

    def __init__(self, initial: list[User] | None = None) -> None:
        self._store: dict[UUID, User] = {}
        for user in initial or []:
            self._store[user.id] = user

    async def get_by_id(self, user_id: UUID) -> User | None:
        return self._store.get(user_id)

    async def get_by_email(self, email: str) -> User | None:
        for user in self._store.values():
            if str(user.email) == email.lower():
                return user
        return None

    async def list_active(self, *, limit: int = 50, offset: int = 0) -> Sequence[User]:
        active = [u for u in self._store.values() if u.is_active]
        return active[offset : offset + limit]

    async def save(self, user: User) -> User:
        self._store[user.id] = user
        return user

    async def delete(self, user_id: UUID) -> bool:
        return self._store.pop(user_id, None) is not None
```

### Unit Tests for Domain Entities

```python
# tests/unit/domain/test_user.py
from __future__ import annotations

import pytest

from domain.entities.user import (
    InvalidPromotionError,
    User,
    UserAlreadyDeactivatedError,
    UserRole,
)
from tests.factories import UserFactory


class TestUserDeactivation:
    def test_deactivate_active_user(self) -> None:
        user = UserFactory.create(is_active=True)

        user.deactivate()

        assert user.is_active is False
        assert user.updated_at is not None

    def test_deactivate_already_inactive_raises(self) -> None:
        user = UserFactory.create(is_active=False)

        with pytest.raises(UserAlreadyDeactivatedError) as exc_info:
            user.deactivate()
        assert str(user.id) in str(exc_info.value)


class TestUserPromotion:
    def test_promote_reviewer_to_admin(self) -> None:
        user = UserFactory.create(role=UserRole.REVIEWER)

        user.promote_to(UserRole.ADMIN)

        assert user.role == UserRole.ADMIN

    def test_promote_applicant_to_admin_raises(self) -> None:
        user = UserFactory.create(role=UserRole.APPLICANT)

        with pytest.raises(InvalidPromotionError):
            user.promote_to(UserRole.ADMIN)

    def test_promote_to_same_role_is_noop(self) -> None:
        user = UserFactory.create(role=UserRole.REVIEWER)

        user.promote_to(UserRole.REVIEWER)

        assert user.role == UserRole.REVIEWER
        assert user.updated_at is None  # No change occurred
```

### Async Service Tests with Fakes

```python
# tests/unit/services/test_user_service.py
from __future__ import annotations

import pytest
import pytest_asyncio

from domain.exceptions import BusinessRuleViolationError, EntityNotFoundError
from domain.entities.user import UserRole
from services.user_service import UserService
from tests.factories import UserFactory
from tests.fakes import FakeUserRepository


@pytest_asyncio.fixture
async def user_service() -> UserService:
    repo = FakeUserRepository()
    return UserService(user_repo=repo)


@pytest_asyncio.fixture
async def user_service_with_user() -> tuple[UserService, "User"]:
    user = UserFactory.create(email="existing@example.com")
    repo = FakeUserRepository(initial=[user])
    return UserService(user_repo=repo), user


class TestRegisterUser:
    @pytest.mark.asyncio
    async def test_register_new_user(self, user_service: UserService) -> None:
        user = await user_service.register_user(
            email="new@example.com", full_name="New User"
        )

        assert str(user.email) == "new@example.com"
        assert user.role == UserRole.APPLICANT

    @pytest.mark.asyncio
    async def test_register_duplicate_email_raises(
        self, user_service_with_user: tuple[UserService, "User"]
    ) -> None:
        service, existing = user_service_with_user

        with pytest.raises(BusinessRuleViolationError, match="already registered"):
            await service.register_user(
                email="existing@example.com", full_name="Duplicate"
            )


class TestDeactivateUser:
    @pytest.mark.asyncio
    async def test_deactivate_existing_user(
        self, user_service_with_user: tuple[UserService, "User"]
    ) -> None:
        service, existing = user_service_with_user

        result = await service.deactivate_user(existing.id)

        assert result.is_active is False

    @pytest.mark.asyncio
    async def test_deactivate_nonexistent_raises(
        self, user_service: UserService
    ) -> None:
        from uuid import uuid4

        with pytest.raises(EntityNotFoundError):
            await user_service.deactivate_user(uuid4())
```

### FastAPI Integration Tests with Dependency Override

```python
# tests/integration/api/test_user_routes.py
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from api.app import create_app
from api.dependencies import get_session
from tests.factories import UserFactory
from tests.fakes import FakeUserRepository


@pytest.fixture
def app_with_fake_repo():
    """Override DI to inject fake repo — no database needed."""
    app = create_app()
    fake_repo = FakeUserRepository()

    async def override_session():
        """Stub session dependency — the fake repo doesn't need a real session."""
        yield None

    app.dependency_overrides[get_session] = override_session
    return app


@pytest.mark.asyncio
async def test_create_user(app_with_fake_repo) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app_with_fake_repo),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/users/",
            json={
                "email": "test@example.com",
                "full_name": "Test User",
                "role": "applicant",
            },
        )

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_get_nonexistent_user_returns_404(app_with_fake_repo) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app_with_fake_repo),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/api/v1/users/00000000-0000-0000-0000-000000000001"
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
```

### Mock and Patch for External Services

```python
# tests/unit/services/test_notification.py
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


class TestEmailNotification:
    @pytest.mark.asyncio
    async def test_sends_email_on_grant_award(self) -> None:
        mock_email_client = AsyncMock()
        mock_email_client.send.return_value = {"message_id": "abc-123"}

        from services.notification_service import NotificationHandler

        handler = NotificationHandler(email_client=mock_email_client)
        await handler.on_grant_awarded(
            grant_id="grant-1",
            recipient_email="winner@example.com",
        )

        mock_email_client.send.assert_awaited_once()
        call_args = mock_email_client.send.call_args
        assert call_args.kwargs["to"] == "winner@example.com"
        assert "awarded" in call_args.kwargs["subject"].lower()

    @pytest.mark.asyncio
    @patch("services.notification_service.httpx.AsyncClient.post")
    async def test_webhook_notification(self, mock_post: AsyncMock) -> None:
        mock_post.return_value = AsyncMock(status_code=200)

        from services.notification_service import NotificationHandler

        handler = NotificationHandler(email_client=AsyncMock())
        await handler.send_webhook(
            url="https://hooks.example.com/notify",
            payload={"event": "grant.awarded", "grant_id": "grant-1"},
        )

        mock_post.assert_awaited_once()
```

---

## Key Rules

1. **Test isolation via rollback** — each test function gets a transaction that rolls back; never commit in tests
2. **Fakes over mocks for repositories** — `FakeUserRepository` is simpler, more readable, and catches interface drift
3. **Factory pattern for test data** — `UserFactory.create(role=UserRole.ADMIN)` beats 10-line constructor calls
4. **Dependency override for API tests** — `app.dependency_overrides[get_session]` replaces real DB with fakes
5. **Use `pytest.mark.asyncio`** on every async test — missing this decorator makes the test silently pass without running
6. **AsyncMock for external services** — use `assert_awaited_once()` not `assert_called_once()` for async calls
7. **Group tests in classes** — `TestUserDeactivation`, `TestUserPromotion` — organized and filterable with `-k`

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| Tests that commit to a real database | Slow, flaky, leaves state between runs | Rollback-per-test or in-memory fakes |
| `MagicMock()` for repository in every test | Verbose, doesn't catch interface changes | `FakeUserRepository` with in-memory dict |
| No factory — constructing entities inline | Noisy, brittle when entity fields change | `UserFactory.create(role=UserRole.ADMIN)` |
| Sync `TestClient` for async routes | Misses async bugs, deprecated pattern | `AsyncClient` with `ASGITransport` |
| Testing implementation details (mock internals) | Breaks on refactor, tests prove nothing | Test behavior: input -> expected output |
| Missing `pytest.mark.asyncio` | Test appears to pass but never executes | Always mark async tests, or set `asyncio_mode = auto` in pytest config |
