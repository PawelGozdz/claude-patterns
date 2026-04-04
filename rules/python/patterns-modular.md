---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Modular Monolith Patterns

## Layered Modular Architecture

```
presentation (api/, cli/, mcp_server/)
       ↓
logic (business modules)
       ↓
data (db/)
```

| Layer | Allowed Dependencies | Contains |
|-------|---------------------|----------|
| **data** (`db/`) | DB drivers only — no imports from logic or presentation | Clients, queries, models, migrations |
| **logic** (business modules) | `db/` only — no cross-module imports unless declared | Services, pipelines, module-specific models |
| **presentation** (`api/`, `cli/`, `mcp_server/`) | `db/` + logic modules | Routes, commands, MCP tools, schemas |

**Enforced by**: `check-python-layers.js` hook — forbidden imports in lower layers.

## Module Isolation

```python
# GOOD: logic module imports only from db/
from core.db.clients import get_session
from core.db.queries.items import find_by_status

# BAD: logic module imports from presentation
from core.api.schemas import ItemResponse  # VIOLATION

# BAD: logic module imports from another logic module (unless declared)
from core.other_module.service import OtherService  # VIOLATION

# BAD: direct DB driver import outside db/
import psycopg  # VIOLATION — use core.db.clients
from neo4j import GraphDatabase  # VIOLATION
```

## Database Access (db/ module)

```python
# db/clients.py — centralized connection management
async def get_client() -> AsyncGenerator[DatabaseClient, None]:
    async with async_session() as session:
        yield DatabaseClient(session)

# db/queries/items.py — query functions (not repositories/classes)
async def find_by_id(session: AsyncSession, item_id: str) -> ItemRow | None:
    return await session.get(ItemModel, item_id)

async def create(session: AsyncSession, name: str, metadata: dict) -> ItemRow:
    item = ItemModel(name=name, metadata=metadata)
    session.add(item)
    await session.flush()
    return item
```

**Key rule**: All DB driver imports (`psycopg`, `neo4j`, `redis`, `sqlalchemy`) stay inside `db/`.

## Protocol Interfaces

```python
# Use Protocol for cross-module contracts (structural subtyping)
from typing import Protocol

class Storage(Protocol):
    async def store(self, key: str, data: bytes) -> None: ...
    async def fetch(self, key: str) -> bytes | None: ...

class Processor(Protocol):
    def process(self, raw: RawItem) -> ProcessedItem: ...
```

## FastAPI Dependency Injection

```python
# api/dependencies.py — composition root
async def get_db() -> AsyncGenerator[DatabaseClient, None]:
    async with get_client() as client:
        yield client

def get_ingest_service(db: DatabaseClient = Depends(get_db)) -> IngestService:
    return IngestService(db)

# api/routes/items.py
@router.get("/items/{item_id}")
async def get_item(
    item_id: str,
    db: DatabaseClient = Depends(get_db),
) -> ItemResponse:
    item = await db.items.find_by_id(item_id)
    if not item:
        raise NotFoundError("item", item_id)
    return ItemResponse.model_validate(item)
```

## Data Models

```python
# Frozen dataclasses for internal/module models
@dataclass(frozen=True)
class ProcessedItem:
    id: str
    content: str
    metadata: dict[str, Any]
    processed_at: datetime

# Pydantic for API boundaries only
class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    status: str
```

## Error Handling

```python
# Per-module errors — no shared "domain exception" hierarchy
class IngestError(Exception):
    def __init__(self, message: str, code: str) -> None:
        self.message = message
        self.code = code

class SourceUnavailableError(IngestError): ...
class ParseError(IngestError): ...

# api/error_handlers.py — translate to HTTP at the boundary
@app.exception_handler(IngestError)
async def ingest_error_handler(request: Request, exc: IngestError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"error": exc.code, "message": exc.message})
```

## Project Structure

```
core/
  db/
    clients.py           # Connection pools
    queries/             # Query functions by entity
    models/              # SQLAlchemy models
  module_a/
    service.py           # Business logic
    models.py            # Frozen dataclasses
  module_b/
    service.py
    pipeline.py
  api/
    routes/              # FastAPI routers
    schemas/             # Pydantic models
    dependencies.py      # DI wiring
  cli/
    commands/            # Click commands
  shared/                # Cross-cutting (logging, config)
tests/
  unit/
  integration/
  api/
  conftest.py
```
