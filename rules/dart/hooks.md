---
paths:
  - "**/*.dart"
---
# Flutter Hooks

> Automated enforcement hooks for Flutter Clean Architecture projects.

## Configuration

All hooks are config-driven via `flutter-hooks.json` in the project root or `.claude/` directory. No config file = hooks silently skip (no false positives in non-Flutter projects).

### Config Format (`flutter-hooks.json`)

```json
{
  "featurePath": "lib/features",
  "purity": {
    "noInfraImportLayers": ["domain", "application"],
    "forbiddenImports": [
      "package:flutter/",
      "package:dio/",
      "package:hive/",
      "package:shared_preferences/",
      "package:http/",
      "dart:io",
      "dart:html"
    ]
  },
  "riverpod": {
    "checkRefRead": {
      "enabled": true,
      "filePatterns": ["*/presentation/**/*.dart"]
    }
  },
  "skipPatterns": ["_test.dart", ".g.dart", ".freezed.dart", ".mock.dart"]
}
```

## PostToolUse Hooks (Edit)

### Domain/Application Layer Purity (`check-clean-arch.js`)

Checks `.dart` files in configured layers for forbidden infrastructure imports:
- Detects `import 'package:dio/...'`, `import 'dart:io'`, etc. in domain/application layers
- Layer detection via path: `*/domain/` and `*/application/` (configurable)
- Skips generated files (`.g.dart`, `.freezed.dart`) and test files

**Warning format:**
```
[Hook] Flutter: Forbidden import "package:dio/" at line 3 in user_repository.dart — domain layer must not depend on infrastructure
```

### Riverpod ref.read() Detection (`check-riverpod-patterns.js`)

Detects `ref.read()` inside `build()` methods:
- Should use `ref.watch()` for reactivity inside build
- `ref.read()` is correct in callbacks and event handlers
- Only checks files matching configured patterns (default: `*/presentation/**/*.dart`)
- Tracks brace depth to identify build() method scope

**Warning format:**
```
[Hook] Flutter: ref.read() at line 42 in login_page.dart — use ref.watch() inside build() for reactivity
```

## Stop Hook

### Cross-Feature Import Detection (`check-flutter-imports.js`)

Checks git-modified `.dart` files for imports crossing feature boundaries:
- For files in `lib/features/{featureA}/`, flags imports from `lib/features/{featureB}/`
- Excludes `shared/` and `common/` directories (cross-feature by design)
- Feature path configurable in config (default: `lib/features`)

**Warning format:**
```
[Hook] Flutter: Cross-feature import in lib/features/auth/data/auth_repo.dart:5 — imports from 'profile'
```

## Setup

Run `setup-project.sh` with `stack_profile: flutter-clean-arch` in `project.yml` to copy the config template to your project root.
