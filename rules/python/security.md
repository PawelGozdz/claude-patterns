---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Security

> This file extends [common/security.md](../common/security.md) with Python-specific content.

## Secret Management

```python
# ALWAYS: Use Pydantic Settings for config
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    database_url: str
    secret_key: str
    api_key: str

# NEVER: Hardcode secrets
API_KEY = "sk-abc123..."  # BAD
```

## Input Validation

```python
# ALWAYS: Validate with Pydantic at API boundary
class CreateUserRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=0, le=150)

# NEVER: Trust raw input
@router.post("/users")
async def create_user(request: CreateUserRequest) -> UserResponse:
    # request is already validated by Pydantic
    ...
```

## SQL Injection Prevention

```python
# ALWAYS: Use SQLAlchemy ORM or parameterized queries
stmt = select(User).where(User.email == email)

# NEVER: String interpolation in queries
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")  # BAD
```

## Security Scanning

```bash
# Static analysis
bandit -r src/
pip-audit  # Dependency vulnerability check
```

## Authentication

```python
# Use python-jose for JWT, passlib for password hashing
from passlib.context import CryptContext
from jose import jwt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

## CORS

```python
# Configure explicitly — never allow all origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,  # From env, not hardcoded
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```
