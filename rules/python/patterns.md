---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Architecture Patterns

## Layered Architecture

```
domain  ←  services  ←  api
   ↑                      ↑
   └──── repositories ────┘
```

| Layer | Allowed Dependencies | Contains |
|-------|---------------------|----------|
| **domain** | Pure Python only (no framework imports) | Entities, value objects, exceptions, interfaces |
| **services** | Domain only | Use cases, business logic, orchestration |
| **api** | Services + domain | Routes, request/response schemas, middleware |
| **repositories** | Domain (implements interfaces) | Database queries, external API clients |

**Enforced by**: `check-python-layers.js` hook — forbidden imports in domain/services layers.

## Repository Pattern

```python
# domain/repositories.py — interface (Protocol)
from typing import Protocol

class UserRepository(Protocol):
    async def find_by_id(self, user_id: str) -> User | None: ...
    async def save(self, user: User) -> User: ...

# repositories/user_repository.py — implementation
class SqlUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_id(self, user_id: str) -> User | None:
        result = await self._session.get(UserModel, user_id)
        return result.to_entity() if result else None
```

## Service Layer

```python
# services/auth_service.py
class AuthService:
    def __init__(self, user_repo: UserRepository, hasher: PasswordHasher) -> None:
        self._user_repo = user_repo
        self._hasher = hasher

    async def login(self, email: str, password: str) -> User:
        user = await self._user_repo.find_by_email(email)
        if not user or not self._hasher.verify(password, user.password_hash):
            raise InvalidCredentialsError()
        return user
```

## FastAPI Dependency Injection

```python
# api/dependencies.py
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

def get_user_repo(session: AsyncSession = Depends(get_db)) -> SqlUserRepository:
    return SqlUserRepository(session)

def get_auth_service(repo: UserRepository = Depends(get_user_repo)) -> AuthService:
    return AuthService(repo, BcryptHasher())

# api/routes/auth.py
@router.post("/login")
async def login(
    request: LoginRequest,
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    user = await auth.login(request.email, request.password)
    return TokenResponse(access_token=create_token(user))
```

## Pydantic Schemas

```python
# api/schemas/user.py — request/response models
class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    created_at: datetime
```

## Error Handling

```python
# domain/exceptions.py — domain exceptions (no framework deps)
class DomainError(Exception):
    def __init__(self, message: str, code: str) -> None:
        self.message = message
        self.code = code

class NotFoundError(DomainError): ...
class ValidationError(DomainError): ...

# api/error_handlers.py — translate to HTTP responses
@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": exc.code, "message": exc.message})
```

## Project Structure

```
src/
  app/
    domain/
      entities/          # User, Order (frozen dataclasses)
      repositories/      # Protocol interfaces
      exceptions/        # Domain exceptions
      value_objects/      # Email, Money, etc.
    services/
      auth_service.py    # Business logic
      order_service.py
    api/
      routes/            # FastAPI routers
      schemas/           # Pydantic request/response models
      dependencies.py    # DI wiring
      middleware/         # Auth, CORS, logging
    repositories/
      sql/               # SQLAlchemy implementations
      cache/             # Redis implementations
    config/
      settings.py        # Pydantic Settings
      database.py        # Engine/session setup
tests/
  unit/                  # Domain + services
  integration/           # Repositories + database
  api/                   # Endpoint tests
  conftest.py            # Shared fixtures
```
