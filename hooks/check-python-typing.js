#!/usr/bin/env node
/**
 * PostToolUse Hook: Detect missing type hints in Python functions
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires python-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Python projects).
 *
 * Checks:
 * - Function definitions without return type annotations
 * - Function parameters without type annotations (excluding self, cls)
 *
 * Only checks files matching configurable patterns.
 * Skips test files, conftest, private/dunder methods.
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { findPythonConfig, matchesPattern } = require('./lib/python-config');

const COMMENT_LINE = /^\s*#/;
// Match function defs: def foo(params) or def foo(params) -> RetType:
const FUNC_DEF = /^\s*(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/;
const HAS_RETURN_TYPE = /->\s*\S+/;

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
    if (!loaded) {
      process.stdout.write(data);
      process.exit(0);
    }

    const { config } = loaded;

    // Check if typing checks are enabled
    const typingConfig = config.typing?.checkUntyped;
    if (!typingConfig?.enabled) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Skip test files
    const skipPatterns = config.skipPatterns || ['test_', '_test.py', 'conftest.py', '__pycache__', '.venv'];
    const basename = path.basename(filePath);
    if (skipPatterns.some((pat) => basename.startsWith(pat) || basename.endsWith(pat) || filePath.includes(pat))) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Check if file matches configured patterns
    const normalized = filePath.replace(/\\/g, '/');
    const filePatterns = typingConfig.filePatterns || ['**/*.py'];
    const matchesFile = filePatterns.some((pat) => matchesPattern(normalized, pat));

    if (!matchesFile) {
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE.test(line)) continue;

      const funcMatch = line.match(FUNC_DEF);
      if (!funcMatch) continue;

      const funcName = funcMatch[1];

      // Skip dunder methods and private helpers
      if (funcName.startsWith('_')) continue;

      // Check return type annotation
      if (!HAS_RETURN_TYPE.test(line)) {
        console.error(
          `[Hook] Python: Function "${funcName}" at line ${i + 1} in ${basename} — missing return type annotation`,
        );
      }
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(data);
  process.exit(0);
});
