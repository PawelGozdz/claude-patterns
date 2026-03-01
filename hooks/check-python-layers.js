#!/usr/bin/env node
/**
 * PostToolUse Hook: Check Python domain/service layer purity after editing
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires python-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Python projects).
 *
 * Validates:
 * - No forbidden imports (infra packages) in domain/services layers
 * - Detects Python import syntax: import foo, from foo import bar
 *
 * Skips: test files, conftest, __pycache__, .venv
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { findPythonConfig } = require('./lib/python-config');

// Python import patterns
const PY_IMPORT = /^\s*(?:import\s+(\S+)|from\s+(\S+)\s+import)/;
const COMMENT_LINE = /^\s*#/;

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

    if (!filePath || !filePath.endsWith('.py')) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Load project config — no config means no checks
    const loaded = findPythonConfig(filePath);
    if (!loaded || !loaded.config.purity) {
      process.stdout.write(data);
      process.exit(0);
    }

    const { config } = loaded;

    // Skip test/generated files
    const skipPatterns = config.skipPatterns || ['test_', '_test.py', 'conftest.py', '__pycache__', '.venv'];
    const basename = path.basename(filePath);
    if (skipPatterns.some((pat) => basename.startsWith(pat) || basename.endsWith(pat) || filePath.includes(pat))) {
      process.stdout.write(data);
      process.exit(0);
    }

    const purity = config.purity;
    const normalized = filePath.replace(/\\/g, '/');

    // Determine which layer this file belongs to
    const noInfraLayers = purity.noInfraImportLayers || [];
    const forbiddenImports = purity.forbiddenImports || [];

    const fileLayer = noInfraLayers.find((layer) =>
      new RegExp(`/${layer}/`).test(normalized),
    );

    if (!fileLayer) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Read the file
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(data);
      process.exit(0);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split('\n');

    // Check: No forbidden imports in domain/services layers
    if (forbiddenImports.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_LINE.test(line)) continue;

        const importMatch = line.match(PY_IMPORT);
        if (!importMatch) continue;

        const importModule = importMatch[1] || importMatch[2];
        if (!importModule) continue;

        // Check top-level package name (e.g. "sqlalchemy.orm" → "sqlalchemy")
        const topPackage = importModule.split('.')[0];
        const forbidden = forbiddenImports.find((f) => topPackage === f);
        if (forbidden) {
          console.error(
            `[Hook] Python: Forbidden import "${forbidden}" at line ${i + 1} in ${basename} — ${fileLayer} layer must not depend on infrastructure`,
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
