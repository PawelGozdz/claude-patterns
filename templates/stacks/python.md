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

## Layered Architecture

```
domain  ←  services  ←  api
   ↑                      ↑
   └──── repositories ────┘
```

| Layer | Allowed Dependencies | Contains |
|-------|---------------------|----------|
| **domain** | Pure Python only (no framework, no ORM) | Entities, value objects, repository interfaces (Protocol), exceptions |
| **services** | Domain only | Use cases, business logic, orchestration |
| **api** | Services + domain | FastAPI routes, Pydantic schemas, middleware, DI wiring |
| **repositories** | Domain (implements Protocol interfaces) | SQLAlchemy queries, Redis clients, external API adapters |

**Enforced by**: `check-python-layers.js` hook — forbidden imports in domain/services layers.

---

## Framework: %%FRAMEWORK%%

### FastAPI Patterns

```python
# Route definition with dependency injection
@router.post("/users", status_code=201)
async def create_user(
    request: CreateUserRequest,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    user = await service.create(request.name, request.email)
    return UserResponse.model_validate(user)
```

### Dependency Injection

```python
# api/dependencies.py — DI wiring (composition root)
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

def get_user_repo(session: AsyncSession = Depends(get_db)) -> SqlUserRepository:
    return SqlUserRepository(session)

def get_user_service(repo: UserRepository = Depends(get_user_repo)) -> UserService:
    return UserService(repo)
```

---

## Type Safety

```python
# ALWAYS: Type annotations on all public functions (enforced by hooks)
def get_user(user_id: str) -> User | None:
    ...

async def create_order(items: list[OrderItem]) -> Order:
    ...

# mypy strict mode in pyproject.toml
[tool.mypy]
strict = true
```

**Enforced by**: `check-python-typing.js` hook — flags missing return type annotations.

---

## Data Validation: Pydantic

```python
# Request/response schemas
class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str

# Domain entities (frozen dataclasses)
@dataclass(frozen=True)
class User:
    id: str
    name: str
    email: str
    created_at: datetime
```

---

## Database: SQLAlchemy + Alembic

```python
# Async SQLAlchemy setup
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, class_=AsyncSession)

# Repository implementation
class SqlUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_id(self, user_id: str) -> User | None:
        result = await self._session.get(UserModel, user_id)
        return result.to_entity() if result else None
```

```bash
# Migrations
alembic revision --autogenerate -m "add users table"
alembic upgrade head
```

---

## Error Handling

```python
# Domain exceptions (pure Python, no framework deps)
class DomainError(Exception):
    def __init__(self, message: str, code: str) -> None:
        self.message = message
        self.code = code

class NotFoundError(DomainError): ...
class AuthorizationError(DomainError): ...

# API error handlers (translate domain → HTTP)
@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": exc.code, "message": exc.message})
```

---

## Configuration: Pydantic Settings

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    secret_key: str
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000"]

settings = Settings()
```

---

## Project Structure

```
src/
  app/
    domain/
      entities/          # User, Order (frozen dataclasses)
      repositories/      # Protocol interfaces
      exceptions/        # Domain exceptions
      value_objects/      # Email, Money
    services/
      auth_service.py    # Business logic
      order_service.py
    api/
      routes/            # FastAPI routers
      schemas/           # Pydantic request/response
      dependencies.py    # DI wiring
      middleware/         # Auth, CORS, logging
    repositories/
      sql/               # SQLAlchemy implementations
      cache/             # Redis implementations
    config/
      settings.py        # Pydantic Settings
      database.py        # Engine/session setup
  main.py                # FastAPI app factory
tests/
  unit/                  # Domain + services (pytest)
  integration/           # Repositories + database
  api/                   # Endpoint tests (httpx + TestClient)
  conftest.py            # Shared fixtures
alembic/                 # Database migrations
pyproject.toml           # ruff, mypy, pytest config
```

---

## Testing Strategy

| Type | Coverage | What to Test |
|------|----------|-------------|
| **Unit** | ~50% | Services, domain entities, value objects |
| **Integration** | ~30% | Repositories, database, external APIs |
| **API** | ~20% | Endpoints, auth flows, error responses |

```python
# API test with httpx
@pytest.mark.api
async def test_create_user(client: AsyncClient) -> None:
    response = await client.post("/api/users", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "secure123",
    })
    assert response.status_code == 201
    assert response.json()["name"] == "Alice"
```

Use **pytest** + **pytest-asyncio** + **pytest-cov**. Coverage target: 80%+.
