#!/usr/bin/env node
/**
 * PostToolUse Hook: Check domain/application layer purity after editing
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires ddd-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-DDD projects).
 *
 * Validates (per config purity section):
 * 1. No `throw new` in configured layers — must use Result<T, E> pattern
 * 2. No forbidden imports in configured layers — must not import infra packages
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { findConfig } = require('./lib/ddd-config');

const THROW_PATTERN = /^\s*throw\s+new\s/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

// Files to skip
const SKIP_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /__mocks__\//,
];

const MAX_STDIN = 1024 * 1024;
let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path;

    if (!filePath || !filePath.endsWith('.ts')) {
      process.stdout.write(data);
      process.exit(0);
    }

    if (SKIP_PATTERNS.some((p) => p.test(filePath))) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Load project config — no config means no checks
    const loaded = findConfig(filePath);
    if (!loaded || !loaded.config.purity) {
      process.stdout.write(data);
      process.exit(0);
    }

    const { config } = loaded;
    const purity = config.purity;
    const normalized = filePath.replace(/\\/g, '/');

    // Determine which layer this file belongs to
    const noThrowLayers = purity.noThrowLayers || [];
    const noInfraLayers = purity.noInfraImportLayers || [];
    const forbiddenImports = purity.forbiddenImports || [];

    const fileLayer = noThrowLayers.concat(noInfraLayers).find((layer) =>
      new RegExp(`/${layer}/`).test(normalized),
    );

    if (!fileLayer) {
      process.stdout.write(data);
      process.exit(0);
    }

    const shouldCheckThrow = noThrowLayers.some((layer) =>
      new RegExp(`/${layer}/`).test(normalized),
    );
    const shouldCheckInfra = noInfraLayers.some((layer) =>
      new RegExp(`/${layer}/`).test(normalized),
    );

    // Read the file
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(data);
      process.exit(0);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);

    // Check 1: No `throw new`
    if (shouldCheckThrow) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_LINE.test(line)) continue;
        if (THROW_PATTERN.test(line)) {
          const layer = noThrowLayers.find((l) =>
            new RegExp(`/${l}/`).test(normalized),
          );
          console.error(
            `[Hook] DDD: throw at line ${i + 1} in ${basename} (${layer}) — use Result<T, E> instead`,
          );
        }
      }
    }

    // Check 2: No forbidden imports
    if (shouldCheckInfra && forbiddenImports.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const importMatch = line.match(/from\s+['"](.*)['"]/);
        if (!importMatch) continue;

        const importPath = importMatch[1];
        const forbidden = forbiddenImports.find((f) => importPath.includes(f));
        if (forbidden) {
          const layer = noInfraLayers.find((l) =>
            new RegExp(`/${l}/`).test(normalized),
          );
          console.error(
            `[Hook] DDD: Forbidden import "${forbidden}" at line ${i + 1} in ${basename} — ${layer} layer must not depend on infrastructure`,
          );
        }
      }
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(data);
  process.exit(0);
});
