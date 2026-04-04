## Agent Ecosystem

**3 tiers** (all auto-discovered via symlinks):

| Tier | Agents | Model |
|------|--------|-------|
| Implementation | python-implementer, api-designer | Sonnet |
| Verification | code-quality-verifier (Sonnet), security-verifier (Opus) | Mixed |
| Utility | codebase-explorer, test-generator | Haiku |

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Layered Modular Monolith

```
Layer 3 (presentation):  api/  cli/  mcp_server/
                           ↓     ↓       ↓
Layer 2 (logic):         module_a/  module_b/  module_c/
                           ↓           ↓          ↓
Layer 1 (data):          db/
```

| Layer | Modules | Allowed Dependencies | Contains |
|-------|---------|---------------------|----------|
| **data** | `db/` | Pure Python + DB drivers only. NO imports from logic or presentation | Connection pools, query builders, DB clients, migrations |
| **logic** | Business modules (e.g. `ingest/`, `generator/`, `reports/`) | `db/` only. NO imports from presentation or other logic modules (unless explicitly declared) | Business logic, processing pipelines, domain models |
| **presentation** | `api/`, `cli/`, `mcp_server/` | `db/` + logic modules | FastAPI routes, CLI commands, MCP tools, request/response schemas |

### Dependency Rules (ENFORCED)

1. `db/` imports NOTHING from other modules (bottom layer)
2. Logic modules depend only on `db/` — never on presentation
3. Logic modules do NOT cross-import each other (unless explicitly declared)
4. Presentation modules may import from `db/` and logic modules
5. `cli/` is the top orchestrator — may import from all modules
6. **No direct DB driver imports** outside `db/` (psycopg, neo4j, redis, etc.)

**Enforced by**: `check-python-layers.js` hook + `moduleIsolation` rules in `python-hooks.json`.

### Adapting Module Structure

The template assumes a generic `core/` root. Adjust in `python-hooks.json`:

| Your structure | `layerPath` | `noInfraImportLayers` | Notes |
|---|---|---|---|
| `core/db/`, `core/ingest/`, etc. | `"core"` | `["db"]` | DB layer purity only |
| `src/modules/` | `"src/modules"` | `["db", "shared"]` | Per-module with shared kernel |
| Flat `src/` | `"src"` | `["db"]` | Simple flat structure |

---

## Framework: %%FRAMEWORK%%

### FastAPI Patterns

```python
# Route definition with dependency injection
@router.post("/items", status_code=201)
async def create_item(
    request: CreateItemRequest,
    db: DatabaseClient = Depends(get_db),
) -> ItemResponse:
    item = await db.items.create(request.name, request.metadata)
    return ItemResponse.model_validate(item)
```

### Dependency Injection

```python
# api/dependencies.py — composition root
async def get_db() -> AsyncGenerator[DatabaseClient, None]:
    async with get_client() as client:
        yield client

def get_ingest_service(db: DatabaseClient = Depends(get_db)) -> IngestService:
    return IngestService(db)
```

---

## Type Safety

```python
# ALWAYS: Type annotations on all public functions (enforced by hooks)
def process_batch(items: list[RawItem]) -> list[ProcessedItem]:
    ...

async def fetch_source(source_id: str) -> SourceData | None:
    ...

# Use Protocol for interfaces (structural subtyping)
from typing import Protocol

class Storage(Protocol):
    async def store(self, key: str, data: bytes) -> None: ...
    async def fetch(self, key: str) -> bytes | None: ...

# mypy strict mode in pyproject.toml
[tool.mypy]
strict = true
```

**Enforced by**: `check-python-typing.js` hook — flags missing return type annotations.

---

## Data Models

```python
# Frozen dataclasses for internal models
from dataclasses import dataclass
from datetime import datetime

@dataclass(frozen=True)
class ProcessedItem:
    id: str
    content: str
    metadata: dict[str, Any]
    processed_at: datetime

# Pydantic for API boundaries (request/response)
from pydantic import BaseModel, Field, ConfigDict

class CreateItemRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    metadata: dict[str, str] = {}

class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    status: str
```

---

## Database Access (db/ module)

```python
# db/clients.py — single entry point for all DB connections
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

engine = create_async_engine(settings.database_url)
async_session = async_sessionmaker(engine, class_=AsyncSession)

# db/queries/items.py — query functions (not repositories)
async def find_by_id(session: AsyncSession, item_id: str) -> ItemRow | None:
    return await session.get(ItemModel, item_id)

async def find_by_status(session: AsyncSession, status: str) -> list[ItemRow]:
    result = await session.execute(select(ItemModel).where(ItemModel.status == status))
    return list(result.scalars().all())
```

```bash
# Migrations
alembic revision --autogenerate -m "add items table"
alembic upgrade head
```

**Key principle**: All database driver imports live in `db/`. Other modules use `db/` functions, never raw drivers.

---

## Error Handling

```python
# Errors per module — no shared "domain exceptions" hierarchy
# db/errors.py
class DatabaseError(Exception):
    def __init__(self, message: str, code: str) -> None:
        self.message = message
        self.code = code

class NotFoundError(DatabaseError): ...
class ConnectionError(DatabaseError): ...

# api/error_handlers.py — translate module errors to HTTP
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
    redis_url: str = "redis://localhost:6379"
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000"]

settings = Settings()
```

---

## Project Structure

```
core/
  db/
    clients.py           # Connection pools (PostgreSQL, Redis, etc.)
    queries/             # Query functions grouped by entity
    models/              # SQLAlchemy table models
    migrations/          # Alembic migrations
  module_a/
    service.py           # Business logic for module A
    models.py            # Module-specific dataclasses
    __init__.py
  module_b/
    service.py           # Business logic for module B
    pipeline.py          # Processing pipeline (if applicable)
    models.py
    __init__.py
  api/
    routes/              # FastAPI routers (one per module/feature)
    schemas/             # Pydantic request/response models
    dependencies.py      # DI wiring
    middleware/           # Auth, CORS, logging
  cli/
    commands/            # Click command groups
    __init__.py
  config/
    settings.py          # Pydantic Settings
    constants.py         # App-wide constants
  shared/                # Cross-cutting utilities (logging, timing, etc.)
main.py                  # FastAPI app factory
tests/
  unit/                  # Module logic tests
  integration/           # DB + cross-module tests
  api/                   # Endpoint tests (httpx + TestClient)
  conftest.py            # Shared fixtures
pyproject.toml           # ruff, mypy, pytest config
```

---

## Testing Strategy

| Type | Coverage | What to Test |
|------|----------|-------------|
| **Unit** | ~50% | Module logic, data transformations, models |
| **Integration** | ~30% | Database queries, cross-module flows |
| **API** | ~20% | Endpoints, auth flows, error responses |

```python
# API test with httpx
@pytest.mark.api
async def test_create_item(client: AsyncClient) -> None:
    response = await client.post("/api/items", json={
        "name": "Test Item",
        "metadata": {"source": "test"},
    })
    assert response.status_code == 201
    assert response.json()["name"] == "Test Item"

# Unit test for module logic
@pytest.mark.unit
def test_process_item(raw_item: RawItem) -> None:
    result = process(raw_item)
    assert result.status == "processed"
    assert result.processed_at is not None
```

Use **pytest** + **pytest-asyncio** + **pytest-cov**. Coverage target: 80%+.
