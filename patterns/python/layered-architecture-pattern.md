# Python Layered Architecture Pattern

## When to Use

- Any Python backend service with business logic beyond simple CRUD
- When domain rules must remain testable without framework dependencies
- When multiple teams work on different layers in parallel
- When you need to swap infrastructure (e.g., PostgreSQL to DynamoDB) without rewriting business logic

**Do NOT use** for throwaway scripts, CLI tools, or services with zero domain logic. A flat module with FastAPI routes suffices there.

---

## Implementation

### Directory Structure

```
src/
  domain/                   # Pure Python — NO framework imports
    entities/
      user.py               # Domain entities (dataclasses)
      grant.py
    value_objects/
      email.py              # Self-validating value objects
      money.py
    interfaces/
      user_repository.py    # Protocol-based interfaces
      notification_service.py
    exceptions.py           # Domain-specific exceptions
  services/                 # Business logic / use cases
    user_service.py         # Depends on domain interfaces ONLY
    grant_service.py
  api/                      # FastAPI routes + Pydantic schemas
    routes/
      user_routes.py
      grant_routes.py
    schemas/
      user_schemas.py
    dependencies.py         # DI wiring
    middleware.py
    app.py                  # FastAPI app factory
  repositories/             # Infrastructure implementations
    sqlalchemy/
      user_repository.py    # Implements domain.interfaces.UserRepository
      models.py             # SQLAlchemy ORM models
      session.py
    redis/
      cache_repository.py
  config.py                 # Settings via pydantic-settings
  main.py                   # Entrypoint
```

### Layer 1: Domain (Pure Python — Zero Framework Imports)

```python
# src/domain/entities/user.py
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from domain.value_objects.email import Email


class UserRole(str, Enum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    APPLICANT = "applicant"


@dataclass
class User:
    """Domain entity — pure Python, no ORM or framework coupling."""

    email: Email
    full_name: str
    role: UserRole
    id: UUID = field(default_factory=uuid4)
    is_active: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime | None = None

    def deactivate(self) -> None:
        if not self.is_active:
            raise UserAlreadyDeactivatedError(self.id)
        self.is_active = False
        self.updated_at = datetime.utcnow()

    def promote_to(self, role: UserRole) -> None:
        if self.role == role:
            return
        if role == UserRole.ADMIN and self.role != UserRole.REVIEWER:
            raise InvalidPromotionError(self.role, role)
        self.role = role
        self.updated_at = datetime.utcnow()


class UserAlreadyDeactivatedError(Exception):
    def __init__(self, user_id: UUID) -> None:
        self.user_id = user_id
        super().__init__(f"User {user_id} is already deactivated")


class InvalidPromotionError(Exception):
    def __init__(self, current: UserRole, target: UserRole) -> None:
        self.current = current
        self.target = target
        super().__init__(f"Cannot promote from {current.value} to {target.value}")
```

```python
# src/domain/value_objects/email.py
from __future__ import annotations

import re
from dataclasses import dataclass

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


@dataclass(frozen=True)
class Email:
    """Self-validating value object. Immutable by design."""

    value: str

    def __post_init__(self) -> None:
        if not EMAIL_REGEX.match(self.value):
            raise ValueError(f"Invalid email: {self.value}")
        # Normalize to lowercase via object.__setattr__ since frozen=True
        object.__setattr__(self, "value", self.value.lower().strip())

    def __str__(self) -> str:
        return self.value

    @property
    def domain(self) -> str:
        return self.value.split("@")[1]
```

### Layer 2: Domain Interfaces (Protocol-Based)

```python
# src/domain/interfaces/user_repository.py
from __future__ import annotations

from typing import Protocol, Sequence
from uuid import UUID

from domain.entities.user import User


class UserRepository(Protocol):
    """Protocol-based interface — no ABC, no registration, just structural typing."""

    async def get_by_id(self, user_id: UUID) -> User | None: ...

    async def get_by_email(self, email: str) -> User | None: ...

    async def list_active(self, *, limit: int = 50, offset: int = 0) -> Sequence[User]: ...

    async def save(self, user: User) -> User: ...

    async def delete(self, user_id: UUID) -> bool: ...
```

```python
# src/domain/exceptions.py
from __future__ import annotations

from uuid import UUID


class DomainException(Exception):
    """Base for all domain exceptions."""

    def __init__(self, message: str, code: str = "DOMAIN_ERROR") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


class EntityNotFoundError(DomainException):
    def __init__(self, entity_type: str, entity_id: UUID | str) -> None:
        self.entity_type = entity_type
        self.entity_id = entity_id
        super().__init__(
            message=f"{entity_type} with id {entity_id} not found",
            code="NOT_FOUND",
        )


class BusinessRuleViolationError(DomainException):
    def __init__(self, rule: str) -> None:
        super().__init__(message=rule, code="BUSINESS_RULE_VIOLATION")
```

### Layer 3: Services (Business Logic with Dependency Injection)

```python
# src/services/user_service.py
from __future__ import annotations

from uuid import UUID

from domain.entities.user import User, UserRole
from domain.exceptions import EntityNotFoundError, BusinessRuleViolationError
from domain.interfaces.user_repository import UserRepository
from domain.value_objects.email import Email


class UserService:
    """Business logic layer. Depends on domain interfaces, never on infrastructure."""

    def __init__(self, user_repo: UserRepository) -> None:
        self._user_repo = user_repo

    async def register_user(
        self, email: str, full_name: str, role: UserRole = UserRole.APPLICANT
    ) -> User:
        existing = await self._user_repo.get_by_email(email)
        if existing is not None:
            raise BusinessRuleViolationError(f"Email {email} is already registered")

        user = User(email=Email(email), full_name=full_name, role=role)
        return await self._user_repo.save(user)

    async def deactivate_user(self, user_id: UUID) -> User:
        user = await self._user_repo.get_by_id(user_id)
        if user is None:
            raise EntityNotFoundError("User", user_id)

        user.deactivate()
        return await self._user_repo.save(user)

    async def promote_user(self, user_id: UUID, target_role: UserRole) -> User:
        user = await self._user_repo.get_by_id(user_id)
        if user is None:
            raise EntityNotFoundError("User", user_id)

        user.promote_to(target_role)
        return await self._user_repo.save(user)

    async def get_user(self, user_id: UUID) -> User:
        user = await self._user_repo.get_by_id(user_id)
        if user is None:
            raise EntityNotFoundError("User", user_id)
        return user
```

### Layer 4: API (FastAPI Routes + Pydantic Schemas)

```python
# src/api/schemas/user_schemas.py
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from domain.entities.user import UserRole


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=100)
    role: UserRole = UserRole.APPLICANT


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_entity(cls, user: "User") -> UserResponse:
        from domain.entities.user import User  # noqa: F811
        return cls(
            id=user.id,
            email=str(user.email),
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
        )
```

```python
# src/api/routes/user_routes.py
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from api.dependencies import get_user_service
from api.schemas.user_schemas import CreateUserRequest, UserResponse
from services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    user_service: UserService = Depends(get_user_service),
) -> UserResponse:
    user = await user_service.register_user(
        email=body.email, full_name=body.full_name, role=body.role
    )
    return UserResponse.from_entity(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    user_service: UserService = Depends(get_user_service),
) -> UserResponse:
    user = await user_service.get_user(user_id)
    return UserResponse.from_entity(user)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: UUID,
    user_service: UserService = Depends(get_user_service),
) -> UserResponse:
    user = await user_service.deactivate_user(user_id)
    return UserResponse.from_entity(user)
```

### Layer 5: Repository (Infrastructure Implementation)

```python
# src/repositories/sqlalchemy/user_repository.py
from __future__ import annotations

from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from domain.entities.user import User, UserRole
from domain.value_objects.email import Email
from repositories.sqlalchemy.models import UserModel


class SqlAlchemyUserRepository:
    """Implements domain.interfaces.UserRepository via structural typing (Protocol)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: UUID) -> User | None:
        model = await self._session.get(UserModel, user_id)
        return self._to_entity(model) if model else None

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(UserModel).where(UserModel.email == email.lower())
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def list_active(
        self, *, limit: int = 50, offset: int = 0
    ) -> Sequence[User]:
        stmt = (
            select(UserModel)
            .where(UserModel.is_active.is_(True))
            .order_by(UserModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self._session.execute(stmt)
        return [self._to_entity(m) for m in result.scalars().all()]

    async def save(self, user: User) -> User:
        model = await self._session.get(UserModel, user.id)
        if model is None:
            model = UserModel(
                id=user.id,
                email=str(user.email),
                full_name=user.full_name,
                role=user.role.value,
                is_active=user.is_active,
                created_at=user.created_at,
            )
            self._session.add(model)
        else:
            model.email = str(user.email)
            model.full_name = user.full_name
            model.role = user.role.value
            model.is_active = user.is_active
            model.updated_at = user.updated_at
        await self._session.flush()
        return user

    async def delete(self, user_id: UUID) -> bool:
        model = await self._session.get(UserModel, user_id)
        if model is None:
            return False
        await self._session.delete(model)
        await self._session.flush()
        return True

    @staticmethod
    def _to_entity(model: UserModel) -> User:
        return User(
            id=model.id,
            email=Email(model.email),
            full_name=model.full_name,
            role=UserRole(model.role),
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
```

---

## Key Rules

1. **Domain layer has ZERO imports from FastAPI, SQLAlchemy, Pydantic, or any framework** — only stdlib and domain internals
2. **Services depend on Protocol interfaces, never on concrete repositories** — enables testing with in-memory fakes
3. **Data flows one direction: API -> Services -> Domain <- Repositories** — repositories implement domain interfaces but the domain never imports from repositories
4. **Entities contain business rules** (e.g., `user.deactivate()`) — services orchestrate, entities enforce invariants
5. **Value objects are immutable** (`frozen=True` dataclass) and self-validating in `__post_init__`
6. **Use Protocol, not ABC** — structural subtyping means implementations don't need to inherit or register

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| Importing SQLAlchemy in domain entities | Couples domain to infrastructure | Domain uses pure dataclasses; repository maps to/from ORM models |
| Service directly instantiates repository | Impossible to test without DB | Constructor injection: `UserService(user_repo: UserRepository)` |
| Business rules in route handlers | Logic scattered, untestable | Move all rules into domain entities or service methods |
| Returning ORM models from API routes | Leaks DB schema to consumers | Map entity -> Pydantic response schema at the API layer |
| ABC with `@abstractmethod` for interfaces | Requires explicit inheritance | Protocol enables structural typing — any class with matching methods works |
| Domain entity with `id: int` (DB auto-increment) | Couples identity to database | Use `UUID` generated in domain; DB stores it as a column |
