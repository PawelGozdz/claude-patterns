---
name: flutter-clean-arch
description: Flutter Clean Architecture patterns — feature-first structure, Riverpod state management, Either error handling, Freezed models, Dio networking, GoRouter navigation. Activates when editing Dart files.
origin: juz-ide-mobile-app
paths:
  - "**/*.dart"
---

# Flutter Clean Architecture Skill

Production-tested patterns for Flutter apps with Clean Architecture, Riverpod, and Freezed.

## Activation

This skill auto-activates when editing `.dart` files. Use it as reference for:
- Creating new features (domain/data/presentation layers)
- State management (Riverpod providers)
- Error handling (Either<Failure, T>)
- Networking (Dio interceptors)
- Navigation (GoRouter with auth guards)
- Testing (unit, widget, golden)

## Core Patterns

Reference patterns in `.claude/knowledge/patterns/` (symlinked from claude-patterns):

| Pattern | When to Use |
|---------|-------------|
| `clean-architecture-pattern.md` | New feature, layer structure |
| `riverpod-state-pattern.md` | State management, providers |
| `either-error-pattern.md` | Error handling in use cases/repos |
| `dio-networking-pattern.md` | API client, interceptors |
| `navigation-pattern.md` | Routes, auth guards, deep links |
| `testing-pattern.md` | Unit/widget/golden tests |
| `freezed-immutability-pattern.md` | Entities, DTOs, state classes |

## Quick Rules

1. **Domain layer is PURE** — no Flutter imports, no packages, pure Dart only
2. **ref.watch() in build()**, ref.read() in callbacks — NEVER ref.read() in build
3. **All models use @freezed** — entities, states, DTOs
4. **Use cases return Either<Failure, T>** — never throw exceptions
5. **Feature-first structure** — never import between features, use shared/
6. **Generated files** (.freezed.dart, .g.dart) — run `dart run build_runner build`

## Feature Scaffold

New feature structure:
```
lib/features/{name}/
  domain/
    entities/       # Pure Dart business models
    repositories/   # Abstract repository interfaces
    use_cases/      # Business logic, returns Either<Failure, T>
  data/
    models/         # DTOs with fromJson/toJson (@freezed)
    repositories/   # Implements domain repository interfaces
    datasources/    # Remote (API) and local (cache) data sources
  presentation/
    providers/      # Riverpod providers (StateNotifier, FutureProvider)
    pages/          # Full screen widgets
    widgets/        # Reusable feature-specific widgets
```

## Anti-Patterns

- Business logic in widgets (use providers/use cases)
- Direct API calls from widgets (use repository pattern)
- Mutable state in providers (always create new objects)
- Missing dispose in StatefulWidgets (cancel subscriptions)
- Cross-feature imports (use shared/ for common code)
- ref.read() inside build() (use ref.watch() for reactivity)
