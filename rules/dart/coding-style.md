---
paths:
  - "**/*.dart"
---
# Dart Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with Dart-specific conventions.

## Effective Dart

Follow [Effective Dart](https://dart.dev/effective-dart) guidelines:

- **DO** use `lowerCamelCase` for variables, functions, parameters
- **DO** use `UpperCamelCase` for classes, enums, typedefs, type parameters
- **DO** use `lowercase_with_underscores` for file names and library prefixes
- **DO** use `SCREAMING_CAPS` only for compile-time constants (prefer `lowerCamelCase`)

## Const & Final

```dart
// PREFER: const constructors where possible
const EdgeInsets.all(16.0)
const Text('Hello')

// PREFER: final for local variables that aren't reassigned
final user = await fetchUser();
final items = <String>[];

// AVOID: var when final works
var name = 'Alice';  // BAD — use final
final name = 'Alice'; // GOOD
```

## Trailing Commas

Always use trailing commas for multi-line argument lists and collections:

```dart
// GOOD: trailing comma forces dart format to use multi-line
Widget build(BuildContext context) {
  return Padding(
    padding: const EdgeInsets.all(16.0),
    child: Column(
      children: [
        Text('Hello'),
        Text('World'),  // <-- trailing comma
      ],  // <-- trailing comma
    ),  // <-- trailing comma
  );
}
```

## Imports

```dart
// Order: dart → package → relative (separated by blank lines)
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/user.dart';
import 'utils.dart';
```

## Null Safety

```dart
// Use null-aware operators
final name = user?.name ?? 'Unknown';
final length = items?.length ?? 0;

// AVOID: unnecessary null checks on non-nullable types
// PREFER: late final for guaranteed initialization
late final AuthRepository _authRepo;
```

## String Interpolation

```dart
// PREFER: interpolation over concatenation
final message = 'Hello, $name!';
final path = '${baseUrl}/api/v1/users';

// AVOID
final message = 'Hello, ' + name + '!';
```

## Print Statements

- No `print()` or `debugPrint()` in production code
- Use a proper logging library (e.g., `logger` package)
- See hooks for automatic detection
