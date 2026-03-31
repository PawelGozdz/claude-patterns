---
name: ts-library-patterns
description: TypeScript shared library patterns — public API design, backward compatibility, Nx package boundaries, dual ESM/CJS builds, contract testing. Activates on TypeScript files.
origin: vytches-ddd
paths:
  - "**/*.ts"
  - "**/package.json"
  - "**/tsconfig*.json"
---

# TypeScript Library Patterns Skill

Production patterns for shared TypeScript npm packages in Nx monorepos.

## Core Patterns

| Pattern | When to Use |
|---------|-------------|
| `public-api-pattern.md` | Exports, type guards, deprecation |
| `backward-compatibility-pattern.md` | Extending APIs safely, semver |
| `package-boundary-pattern.md` | Nx deps, circular prevention |
| `library-testing-pattern.md` | Contract, export, type, property tests |
| `build-publish-pattern.md` | ESM/CJS, declarations, changesets |

## Quick Rules

1. **Explicit barrel exports** — no `export *`, list every export
2. **Never narrow existing types** — add optional, never remove/change
3. **Deprecation before removal** — @deprecated → warn → remove in next major
4. **Package boundaries** — acyclic graph, contracts package for shared types
5. **Dual output** — ESM + CJS, sideEffects: false for tree-shaking
6. **Contract tests** — test public API behavior, not internals
7. **Export validation** — every declared export must exist and be importable

## This is a LIBRARY — Not an Application

- No DDD application patterns (this IS the DDD source)
- No framework-specific code in core packages
- NestJS integration only in @vytches/ddd-nestjs package
- Every change must consider consumer impact
