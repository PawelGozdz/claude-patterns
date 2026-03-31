# FastAPI Patterns

## When to Use

- Any Python web service built with FastAPI
- When you need structured dependency injection, validation, and error handling
- When building APIs that serve both internal microservices and external consumers
- When async I/O performance matters (DB queries, external HTTP calls)

**Do NOT use** for synchronous batch jobs or CLI tools. FastAPI adds overhead where request/response semantics aren't needed.

---

## Implementation

### App Factory with Lifespan Events

```python
# src/api/app.py
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.middleware import register_exception_handlers
from api.routes import grant_routes, health_routes, user_routes
from config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown lifecycle — replaces deprecated @app.on_event."""
    settings = get_settings()

    # Startup: create connection pool
    engine = create_async_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        echo=settings.debug,
    )
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)

    yield

    # Shutdown: dispose connection pool
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/docs" if settings.debug else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    # Register exception handlers
    register_exception_handlers(app)

    # Mount routers
    app.include_router(health_routes.router)
    app.include_router(user_routes.router, prefix="/api/v1")
    app.include_router(grant_routes.router, prefix="/api/v1")

    return app
```

### Dependency Injection Chain

```python
# src/api/dependencies.py
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from repositories.sqlalchemy.user_repository import SqlAlchemyUserRepository
from services.user_service import UserService


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yields a transactional session per request. Commits on success, rolls back on error."""
    session_factory = request.app.state.session_factory
    async with session_factory() as session:
        async with session.begin():
            yield session


# Type aliases for cleaner route signatures
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_user_repository(session: SessionDep) -> SqlAlchemyUserRepository:
    return SqlAlchemyUserRepository(session)


UserRepoDep = Annotated[SqlAlchemyUserRepository, Depends(get_user_repository)]


def get_user_service(user_repo: UserRepoDep) -> UserService:
    return UserService(user_repo)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]
```

### Pydantic Request/Response Models with Validation

```python
# src/api/schemas/grant_schemas.py
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class CreateGrantRequest(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=20, max_length=5000)
    amount: Decimal = Field(gt=0, le=Decimal("10_000_000"), decimal_places=2)
    currency: Literal["USD", "EUR", "GBP"] = "USD"
    deadline: date

    @field_validator("deadline")
    @classmethod
    def deadline_must_be_future(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("Deadline must be in the future")
        return v

    @field_validator("title")
    @classmethod
    def title_must_not_be_all_caps(cls, v: str) -> str:
        if v == v.upper() and len(v) > 10:
            raise ValueError("Title must not be all uppercase")
        return v.strip()


class UpdateGrantRequest(BaseModel):
    title: str | None = Field(default=None, min_length=5, max_length=200)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    amount: Decimal | None = Field(default=None, gt=0, le=Decimal("10_000_000"))

    @model_validator(mode="after")
    def at_least_one_field(self) -> UpdateGrantRequest:
        if all(v is None for v in (self.title, self.description, self.amount)):
            raise ValueError("At least one field must be provided")
        return self


class GrantResponse(BaseModel):
    id: UUID
    title: str
    description: str
    amount: Decimal
    currency: str
    deadline: date
    status: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel):
    items: list[GrantResponse]
    total: int
    limit: int
    offset: int
    has_more: bool
```

### Router with Typed Dependencies

```python
# src/api/routes/grant_routes.py
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from api.dependencies import UserServiceDep
from api.schemas.grant_schemas import (
    CreateGrantRequest,
    GrantResponse,
    PaginatedResponse,
    UpdateGrantRequest,
)

router = APIRouter(prefix="/grants", tags=["grants"])


@router.get("/", response_model=PaginatedResponse)
async def list_grants(
    user_service: UserServiceDep,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
) -> PaginatedResponse:
    grants, total = await user_service.list_grants(
        limit=limit, offset=offset, status_filter=status_filter
    )
    return PaginatedResponse(
        items=[GrantResponse.model_validate(g) for g in grants],
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


@router.post("/", response_model=GrantResponse, status_code=status.HTTP_201_CREATED)
async def create_grant(
    body: CreateGrantRequest,
    user_service: UserServiceDep,
) -> GrantResponse:
    grant = await user_service.create_grant(
        title=body.title,
        description=body.description,
        amount=body.amount,
        currency=body.currency,
        deadline=body.deadline,
    )
    return GrantResponse.model_validate(grant)


@router.patch("/{grant_id}", response_model=GrantResponse)
async def update_grant(
    grant_id: UUID,
    body: UpdateGrantRequest,
    user_service: UserServiceDep,
) -> GrantResponse:
    grant = await user_service.update_grant(
        grant_id=grant_id,
        **body.model_dump(exclude_none=True),
    )
    return GrantResponse.model_validate(grant)
```

### Error Handling Middleware

```python
# src/api/middleware.py
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from domain.exceptions import (
    BusinessRuleViolationError,
    DomainException,
    EntityNotFoundError,
)

logger = logging.getLogger(__name__)

# Map domain exceptions to HTTP status codes
EXCEPTION_STATUS_MAP: dict[type[DomainException], int] = {
    EntityNotFoundError: status.HTTP_404_NOT_FOUND,
    BusinessRuleViolationError: status.HTTP_422_UNPROCESSABLE_ENTITY,
}


def register_exception_handlers(app: FastAPI) -> None:
    """Register centralized exception handlers — keeps routes clean."""

    @app.exception_handler(DomainException)
    async def domain_exception_handler(
        request: Request, exc: DomainException
    ) -> JSONResponse:
        status_code = EXCEPTION_STATUS_MAP.get(
            type(exc), status.HTTP_400_BAD_REQUEST
        )
        return JSONResponse(
            status_code=status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                }
            },
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(
        request: Request, exc: ValueError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": {"code": "VALIDATION_ERROR", "message": str(exc)}},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled exception on %s %s", request.method, request.url)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred",
                }
            },
        )
```

### Settings with pydantic-settings

```python
# src/config.py
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "my-intelligence"
    app_version: str = "1.0.0"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://localhost:5432/app"
    db_pool_size: int = 10
    db_max_overflow: int = 5

    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me-in-production"
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
```

---

## Key Rules

1. **Always use `lifespan`** for startup/shutdown — `@app.on_event` is deprecated since FastAPI 0.109
2. **Chain dependencies with `Annotated[T, Depends()]`** — cleaner than raw `Depends()` in every route signature
3. **One responsibility per dependency** — `get_session` yields session, `get_user_repo` creates repo, `get_user_service` wires service
4. **Pydantic models validate at the boundary** — domain entities enforce business rules, Pydantic enforces API shape
5. **Exception handlers map domain errors to HTTP** — routes never catch `EntityNotFoundError` manually
6. **Use `response_model`** on every route — ensures response shape even if you return a dict by accident
7. **Settings are cached with `@lru_cache`** — parsed once, shared across all requests

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| `@app.on_event("startup")` | Deprecated; no cleanup guarantee | Use `lifespan` async context manager |
| Business logic inside route handlers | Untestable, duplicated across routes | Move to service layer, inject via `Depends()` |
| Catching domain exceptions per-route | Repetitive try/except in every handler | Register global `exception_handler` on the app |
| `Depends(UserService)` without factory | FastAPI calls `UserService()` with no args | Use a factory function that wires dependencies |
| Returning ORM models directly | Leaks internal schema, breaks on lazy loads | Always map to Pydantic `response_model` |
| Global `engine` / `Session` at module level | No cleanup, test isolation impossible | Store on `app.state`, yield from dependency |
