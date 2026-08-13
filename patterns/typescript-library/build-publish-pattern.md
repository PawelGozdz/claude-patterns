# Pattern: Build & Publish Pipeline for TypeScript Libraries

**Tags**: "lib:build"

**Layer**: Infrastructure
**Status**: production

## What This Is

Dual ESM/CJS build configuration, npm publishing, and release workflow for
TypeScript libraries in an Nx monorepo. Covers the `package.json` `exports`
contract, the library-specific `tsconfig`, the Nx build targets that produce
both module formats, and the changeset-driven CI release pipeline that turns
a merged PR into a published npm version with a generated changelog.

---

## When to Use

**Use this pattern for:**
- ✅ Publishing a TypeScript library to npm (public or private registry) for external or cross-repo consumption
- ✅ Consumers need both ESM (`import`) and CJS (`require`) support
- ✅ You need tree-shaking, source maps, and TypeScript declaration files shipped to consumers
- ✅ You are using Nx (with pnpm or another package manager) for monorepo management
- ✅ You need an automated, changeset- or release-tool-driven versioning and publish workflow

**Do NOT use for:**
- ❌ An application bundled for deployment (not a library meant for consumption) — this pipeline is for publishable packages, not deploy artifacts
- ❌ An internal monorepo package consumed only via source path, never published to a registry — no `exports`/dual-build contract is needed there, see `package-boundary-pattern.md`
- ❌ Deciding WHAT a package should export (its public surface) — see `public-api-pattern.md`
- ❌ Deciding whether a given change requires a major version bump — see `backward-compatibility-pattern.md`

---

## Implementation

### 1. Package.json -- Conditional Exports

The `exports` field is the modern way to define what consumers get when they import your package. It replaces the legacy `main` and `module` fields.

```json
{
  "name": "@scope/payments",
  "version": "2.1.0",
  "description": "Payment processing library for the platform",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/types/index.d.ts",
        "default": "./dist/esm/index.mjs"
      },
      "require": {
        "types": "./dist/types/index.d.cts",
        "default": "./dist/cjs/index.cjs"
      }
    },
    "./package.json": "./package.json"
  },
  "main": "./dist/cjs/index.cjs",
  "module": "./dist/esm/index.mjs",
  "types": "./dist/types/index.d.ts",
  "files": [
    "dist/",
    "CHANGELOG.md",
    "README.md"
  ],
  "sideEffects": false,
  "engines": {
    "node": ">=18"
  },
  "peerDependencies": {
    "typescript": ">=5.0.0"
  },
  "scripts": {
    "build": "nx build @scope/payments",
    "test": "nx test @scope/payments",
    "typecheck": "tsc --noEmit"
  }
}
```

Key decisions in this config:

- **`"type": "module"`** -- the package is ESM-first; CJS is provided as a fallback
- **`"sideEffects": false`** -- enables tree-shaking in consumer bundlers (webpack, Rollup, esbuild)
- **`"types"` inside each condition** -- TypeScript resolves declarations correctly for both module systems
- **`"files"`** -- only ship dist, changelog, and readme; exclude source, tests, configs
- **`"./package.json"` export** -- some tools need to read package.json at runtime

#### Subpath exports

`exports` is not limited to the package root (`"."`). Libraries commonly ship
secondary entry points — e.g. `@scope/payments/testing` for test doubles, or
`@scope/payments/react` for a framework-specific adapter — so consumers only
pull in what they need instead of the whole package:

```json
"exports": {
  ".": { "import": "./dist/esm/index.mjs", "require": "./dist/cjs/index.cjs" },
  "./testing": { "import": "./dist/esm/testing.mjs", "require": "./dist/cjs/testing.cjs" }
}
```

Each subpath needs its own `types` condition, same as the root, and its own
entry in the build output -- treat it as a second mini-package inside the
same `dist/`.

#### peerDependencies

When a library depends on a host package the consumer already provides (a
framework, a plugin host, or another `@scope/*` library expected to be a
singleton in the consumer's tree), declare it under `peerDependencies` rather
than `dependencies`. This tells the package manager to resolve the version
from the consumer's tree instead of installing a private copy, avoiding
duplicate instances (e.g. two copies of a DI container or a class-identity
check that silently fails across duplicated modules). Pair it with a version
range wide enough for real consumers, and list overly strict peers as
`peerDependenciesMeta: { optional: true }` when the dependency is only needed
for one subpath export.

### 2. TypeScript Configuration for Libraries

Libraries need a different tsconfig than applications. The library tsconfig emits declarations and targets a stable module format.

```json
// libs/payments/tsconfig.lib.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": "./src",
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "stripInternal": true
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "src/**/*.spec.ts",
    "src/**/*.test.ts",
    "src/**/__tests__/**",
    "src/**/__mocks__/**",
    "vitest.config.ts"
  ]
}
```

Key options:

- **`declaration: true`** -- generates `.d.ts` files for consumers
- **`declarationMap: true`** -- allows "Go to Definition" to navigate to source
- **`sourceMap: true`** -- enables debugging through the library
- **`stripInternal: true`** -- removes `@internal` JSDoc-tagged declarations from `.d.ts`
- **`verbatimModuleSyntax: true`** -- enforces explicit `import type` for type-only imports
- **`isolatedModules: true`** -- ensures compatibility with esbuild and other single-file transpilers

### 3. Build Configuration with Nx

Use the Nx `@nx/js:tsc` executor for TypeScript compilation and a custom target for dual-format output.

```json
// libs/payments/project.json
{
  "name": "@scope/payments",
  "tags": ["scope:payments", "type:domain"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/payments",
        "main": "libs/payments/src/index.ts",
        "tsConfig": "libs/payments/tsconfig.lib.json",
        "assets": [
          "libs/payments/README.md",
          "libs/payments/CHANGELOG.md"
        ]
      }
    },
    "build-esm": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "tsc -p libs/payments/tsconfig.lib.json --outDir dist/libs/payments/esm --module ES2022",
          "node scripts/rename-extensions.js dist/libs/payments/esm .js .mjs"
        ],
        "parallel": false
      }
    },
    "build-cjs": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "tsc -p libs/payments/tsconfig.lib.json --outDir dist/libs/payments/cjs --module CommonJS --moduleResolution node",
          "node scripts/rename-extensions.js dist/libs/payments/cjs .js .cjs"
        ],
        "parallel": false
      }
    },
    "build-all": {
      "executor": "nx:run-commands",
      "dependsOn": ["build-esm", "build-cjs"],
      "options": {
        "commands": [
          "tsc -p libs/payments/tsconfig.lib.json --outDir dist/libs/payments/types --emitDeclarationOnly",
          "cp libs/payments/package.json dist/libs/payments/package.json",
          "cp libs/payments/README.md dist/libs/payments/README.md"
        ],
        "parallel": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "options": {
        "config": "libs/payments/vitest.config.ts"
      }
    }
  }
}
```

Extension rename helper script:

```javascript
// scripts/rename-extensions.js
const { readdirSync, renameSync, statSync } = require('fs');
const { join } = require('path');

const [dir, fromExt, toExt] = process.argv.slice(2);

function renameRecursive(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    if (statSync(fullPath).isDirectory()) {
      renameRecursive(fullPath);
    } else if (entry.endsWith(fromExt)) {
      renameSync(fullPath, fullPath.replace(new RegExp(`\\${fromExt}$`), toExt));
    }
  }
}

renameRecursive(dir);
```

### 4. Source Maps for Debugging

Ensure source maps chain correctly so consumers can debug into library source:

```json
// tsconfig additions for source maps
{
  "compilerOptions": {
    "sourceMap": true,
    "declarationMap": true,
    "inlineSources": true,
    "sourceRoot": "/"
  }
}
```

The `inlineSources: true` option embeds the original TypeScript source in the source map, so consumers can step through `.ts` files even without cloning the library repo.

### 5. Changeset-Based Release Workflow

Use `@changesets/cli` for version management and changelog generation.

```yaml
# .changeset/config.json
{
  "changelog": ["@changesets/changelog-github", { "repo": "org/monorepo" }],
  "commit": false,
  "fixed": [],
  "linked": [["@scope/contracts", "@scope/domain-*"]],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@scope/app-*"]
}
```

Developer workflow:

```bash
# 1. After making changes, create a changeset
pnpm changeset

# Interactive prompts:
# - Which packages changed? @scope/payments
# - Is this a major/minor/patch? minor
# - Summary: Add idempotency key support to createPaymentIntent

# 2. This creates a markdown file in .changeset/
# .changeset/fuzzy-donuts-smile.md:
# ---
# "@scope/payments": minor
# ---
# Add idempotency key support to createPaymentIntent

# 3. Commit and push the changeset with your code

# 4. CI/release pipeline consumes changesets:
pnpm changeset version   # Updates package.json versions + CHANGELOG.md
pnpm changeset publish   # Publishes to npm
```

#### Alternative: `nx release`

In an Nx monorepo, `nx release` is a native alternative to
`@changesets/cli` -- it handles conventional-commit-based (or
changelog-file-based) versioning, changelog generation, and npm publish in
a single Nx-integrated command, with built-in awareness of the project
graph (so dependent packages get version-bumped together automatically).
Prefer `@changesets/cli` when you want per-change human-authored changelog
entries and fine-grained control over which packages are linked/fixed
(as configured above); prefer `nx release` when you want less workflow
ceremony and are already conventional-commits-disciplined, since it can
derive versions and changelogs from commit history without a separate
changeset file per change. Do not run both in the same repo -- pick one
as the single source of truth for versioning.

### 6. CI/CD Pipeline

```yaml
# .github/workflows/release-libraries.yml
name: Release Libraries

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install --frozen-lockfile

      - name: Build affected libraries
        run: pnpm nx affected --target=build-all --base=HEAD~1

      - name: Test affected libraries
        run: pnpm nx affected --target=test --base=HEAD~1

      - name: Type-check affected libraries
        run: pnpm nx affected --target=typecheck --base=HEAD~1

      - name: Create Release PR or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          version: pnpm changeset version
          title: 'chore: version packages'
          commit: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 7. Pre-publish Validation Checklist

Before writing a custom validation script, run the two standard community
validators against the built package -- they catch the most common
publishing mistakes without any bespoke code:

- **`publint`** -- lints the published package layout itself: catches a
  `main`/`module`/`exports` pointing at a non-existent file, missing
  `types`, wrong `sideEffects`, and other npm-resolution footguns, run
  against the built `dist/` (or the packed tarball) before publish, e.g.
  `npx publint ./dist/libs/payments`.
- **`arethetypeswrong` (attw)** -- checks that the TypeScript types
  resolve correctly for *every* consumer resolution mode (`node16`,
  `bundler`, CJS `require`, ESM `import`), which is exactly where dual
  ESM/CJS packages tend to drift -- e.g. `npx attw --pack ./dist/libs/payments`.

Run both as a CI step (or an `nx` target) right before `changeset publish`
/ `nx release publish`, and fail the pipeline on either reporting an error.

Add a prepublish script that validates the package before it goes to npm:

```typescript
// scripts/validate-package.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function validate(distPath: string): void {
  const errors: string[] = [];

  // 1. package.json exists and has required fields
  const pkgPath = join(distPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  if (!pkg.name) errors.push('Missing package name');
  if (!pkg.version) errors.push('Missing version');
  if (!pkg.exports) errors.push('Missing exports field');

  // 2. All export paths resolve to real files
  for (const [key, conditions] of Object.entries(pkg.exports as Record<string, any>)) {
    if (typeof conditions === 'string') {
      if (!existsSync(join(distPath, conditions))) {
        errors.push(`Export "${key}" points to missing file: ${conditions}`);
      }
    } else {
      for (const [condition, target] of Object.entries(conditions as Record<string, any>)) {
        const filePath = typeof target === 'string' ? target : (target as any).default;
        if (filePath && !existsSync(join(distPath, filePath))) {
          errors.push(`Export "${key}".${condition} points to missing file: ${filePath}`);
        }
      }
    }
  }

  // 3. No source files leaked into dist
  const distFiles = readFileSync(join(distPath, '..', 'file-list.txt'), 'utf-8').split('\n');
  const leakedSources = distFiles.filter(
    (f) => f.endsWith('.spec.ts') || f.endsWith('.test.ts') || f.includes('__tests__')
  );
  if (leakedSources.length > 0) {
    errors.push(`Test files leaked into dist: ${leakedSources.join(', ')}`);
  }

  // 4. sideEffects flag is set
  if (pkg.sideEffects !== false) {
    errors.push('Missing "sideEffects": false for tree-shaking');
  }

  if (errors.length > 0) {
    console.error('Package validation failed:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`Package ${pkg.name}@${pkg.version} validated successfully.`);
}

validate(process.argv[2]);
```

---

## Key Rules

1. **Always ship dual ESM + CJS** -- not all consumers have migrated to ESM
2. **`exports` field is the source of truth** -- `main` and `module` are fallbacks for older tools
3. **`sideEffects: false` enables tree-shaking** -- without it, bundlers include the entire library
4. **`files` array controls what ships** -- never publish source code, tests, or configs
5. **Changesets automate versioning** -- no manual version bumps, no manual changelog entries
6. **Validate before publish** -- check export paths, declaration files, and no test leakage
7. **Source maps with `inlineSources`** -- consumers can debug without cloning your repo

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Publishing only ESM | Consumers using `require()` or older Node versions break | Ship both ESM (.mjs) and CJS (.cjs) |
| Missing `types` condition in exports | TypeScript resolves wrong or missing declarations | Put `types` first in each condition block |
| `"files": ["*"]` or no files field | Ships node_modules, tests, .env, everything | Explicit `"files": ["dist/"]` allowlist |
| Manual version bumps | Teams forget, versions drift, changelogs are empty | Use `@changesets/cli` for automated versioning |
| `sideEffects: true` or missing | Bundlers cannot tree-shake, consumers get full bundle | `"sideEffects": false` for pure libraries |
| Publishing from local machine | Unreproducible builds, risk of dirty state | Publish only from CI after tests pass |
| No `declarationMap` | "Go to Definition" lands on `.d.ts` instead of source | Enable `declarationMap: true` + `inlineSources` |
