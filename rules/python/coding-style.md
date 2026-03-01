---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with Python-specific conventions.

## Standards

- Follow **PEP 8** conventions
- Use **type annotations** on all public function signatures (enforced by hooks)
- Use **PEP 585** generic types (`list[str]` not `List[str]`) for Python 3.9+

## Type Hints

```python
# ALWAYS annotate public functions
def get_user(user_id: str) -> User | None:
    ...

async def create_order(request: CreateOrderRequest) -> Order:
    ...

# Use Protocol for structural typing (duck typing)
from typing import Protocol

class Repository(Protocol):
    def find_by_id(self, id: str) -> dict | None: ...
    def save(self, entity: dict) -> dict: ...
```

## Immutability

```python
# PREFER: frozen dataclasses for domain objects
from dataclasses import dataclass

@dataclass(frozen=True)
class User:
    name: str
    email: str

# PREFER: Pydantic models for API schemas
from pydantic import BaseModel

class UserResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    name: str
    email: str
```

## Formatting & Linting

- **ruff** for linting + formatting (replaces black, isort, flake8)
- **mypy** strict mode for type checking
- Configuration in `pyproject.toml`:

```toml
[tool.ruff]
line-length = 88
target-version = "py312"

[tool.mypy]
strict = true
```

## Imports

```python
# Order: stdlib → third-party → local (ruff handles this)
import os
from pathlib import Path

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from app.domain.entities import User
from app.services.auth import AuthService
```

## Print Statements

- No `print()` in production code
- Use `logging` module with structured logging
- See hooks for automatic detection
