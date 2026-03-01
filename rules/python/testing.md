---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Testing

> This file extends [common/testing.md](../common/testing.md) with Python-specific content.

## Framework

Use **pytest** as the testing framework with **pytest-asyncio** for async tests.

## Test Pyramid

- **Unit Tests (~50%)**: Domain entities, services, value objects
- **Integration Tests (~30%)**: Database, repositories, external APIs
- **API Tests (~20%)**: E2E endpoint testing with TestClient

## Fixtures

```python
# conftest.py
import pytest
from httpx import AsyncClient, ASGITransport

@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        yield session
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
def user_repo(db_session: AsyncSession) -> SqlUserRepository:
    return SqlUserRepository(db_session)

@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

## Unit Tests

```python
@pytest.mark.unit
async def test_login_success(user_repo: UserRepository) -> None:
    service = AuthService(user_repo, BcryptHasher())
    user = await service.login("test@example.com", "password123")
    assert user.email == "test@example.com"

@pytest.mark.unit
async def test_login_invalid_credentials(user_repo: UserRepository) -> None:
    service = AuthService(user_repo, BcryptHasher())
    with pytest.raises(InvalidCredentialsError):
        await service.login("test@example.com", "wrong")
```

## API Tests

```python
@pytest.mark.api
async def test_create_user(client: AsyncClient) -> None:
    response = await client.post("/api/users", json={
        "name": "Alice",
        "email": "alice@example.com",
        "password": "secure123",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Alice"
```

## Coverage

```bash
pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```

## Test Naming

```
tests/
  unit/
    test_auth_service.py
    test_user_entity.py
  integration/
    test_user_repository.py
  api/
    test_auth_routes.py
    test_user_routes.py
  conftest.py
```
