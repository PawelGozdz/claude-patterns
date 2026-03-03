---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Hooks

> Automated enforcement hooks for Python projects.

## Configuration

All hooks are config-driven via `python-hooks.json` in the project root or `.claude/` directory. No config file = hooks silently skip (no false positives in non-Python projects).

### Config Format (`python-hooks.json`)

```json
{
  "layerPath": "src",
  "purity": {
    "noInfraImportLayers": ["domain", "services"],
    "forbiddenImports": [
      "fastapi", "sqlalchemy", "alembic", "redis",
      "celery", "httpx", "requests", "boto3", "aiohttp"
    ]
  },
  "typing": {
    "checkUntyped": {
      "enabled": true,
      "filePatterns": ["*/domain/**/*.py", "*/services/**/*.py", "*/api/**/*.py"]
    }
  },
  "skipPatterns": ["test_", "_test.py", "conftest.py", "__pycache__", ".venv"]
}
```

## PostToolUse Hooks (Edit)

### Layer Purity (`check-python-layers.js`)

Checks `.py` files in configured layers for forbidden infrastructure imports:
- Detects `import sqlalchemy`, `from fastapi import ...`, etc. in domain/services layers
- Layer detection via path segments (configurable)
- Skips test files and virtual environments

**Warning format:**
```
[Hook] Python: Forbidden import "sqlalchemy" at line 3 in user.py — domain layer must not depend on infrastructure
```

### Type Annotation Check (`check-python-typing.js`)

Detects public functions missing return type annotations:
- Scans function definitions for `-> ReturnType`
- Skips private/dunder methods (`_name`, `__name__`)
- Only checks files matching configured patterns
- Skips test files

**Warning format:**
```
[Hook] Python: Function "get_user" at line 15 in service.py — missing return type annotation
```

## Setup

Set `stack_profile: python` in `project.yml` and run `setup-project.sh` to copy the config template.

For config variants by project type (modular monolith, data pipeline, content/creative), see [`templates/PYTHON-HOOKS-GUIDE.md`](../../templates/PYTHON-HOOKS-GUIDE.md).
