# Python Hooks Configuration Guide

> Companion to `python-hooks.json` — JSON can't have comments, so config variants live here.

## Config Variants by Project Type

### Default: DDD-like Backend (FastAPI/Django)

Standard layered architecture with `domain/` and `services/` purity enforcement.

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

### Modular Monolith

Modules with internal `core/` layers instead of top-level `domain/services/`.

```json
{
  "layerPath": "src/modules",
  "purity": {
    "noInfraImportLayers": ["core", "domain"],
    "forbiddenImports": [
      "fastapi", "sqlalchemy", "redis", "celery", "httpx"
    ]
  },
  "typing": {
    "checkUntyped": {
      "enabled": true,
      "filePatterns": ["*/core/**/*.py", "*/domain/**/*.py"]
    }
  },
  "skipPatterns": ["test_", "_test.py", "conftest.py", "__pycache__", ".venv"]
}
```

### Pipeline / Data Project

No layer enforcement — only typing checks matter.

```json
{
  "layerPath": "src",
  "purity": {
    "noInfraImportLayers": [],
    "forbiddenImports": []
  },
  "typing": {
    "checkUntyped": {
      "enabled": true,
      "filePatterns": ["**/*.py"]
    }
  },
  "skipPatterns": ["test_", "_test.py", "conftest.py", "__pycache__", ".venv", "notebooks/"]
}
```

### Content / Creative Project

Minimal config — typing enforcement only on core modules.

```json
{
  "layerPath": "src",
  "purity": {
    "noInfraImportLayers": [],
    "forbiddenImports": []
  },
  "typing": {
    "checkUntyped": {
      "enabled": true,
      "filePatterns": ["*/core/**/*.py", "*/models/**/*.py"]
    }
  },
  "skipPatterns": ["test_", "_test.py", "conftest.py", "__pycache__", ".venv", "scripts/"]
}
```

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `layerPath` | `string` | Root path for layer detection (e.g., `"src"`, `"src/modules"`) |
| `purity.noInfraImportLayers` | `string[]` | Path segments that identify pure layers (empty = no layer enforcement) |
| `purity.forbiddenImports` | `string[]` | Module names forbidden in pure layers (empty = no import checking) |
| `typing.checkUntyped.enabled` | `boolean` | Whether to check for missing type annotations |
| `typing.checkUntyped.filePatterns` | `string[]` | Glob patterns for files to check (`**/*.py` = all) |
| `skipPatterns` | `string[]` | Path substrings to skip entirely (tests, venvs, caches) |

---

## How Hooks Find Config

1. Hook triggered by a file edit (e.g., `src/domain/user.py`)
2. Walk upward from the file's directory looking for `python-hooks.json`
3. Check: file's dir → parent → parent → ... → project root → `.claude/`
4. Found → load and enforce; Not found → silent skip

This means **no config = no enforcement** — safe for non-Python projects.
