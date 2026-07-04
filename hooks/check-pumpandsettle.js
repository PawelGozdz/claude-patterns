#!/usr/bin/env node
/**
 * PostToolUse Hook: Warn on bare pumpAndSettle() (no Duration) in Flutter test files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires flutter-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Flutter projects).
 *
 * Context (juz-ide-mobile-app TD-014): a bare `await tester.pumpAndSettle();` on a
 * widget with a continuously-animating/loading element can hang indefinitely,
 * ballooning a single `flutter_tester` process to tens of GB RSS and freezing a
 * shared host. `dart/testing.md` already warns against this pattern; this hook
 * catches new occurrences at edit time instead of relying on someone noticing.
 *
 * Checks:
 * - Bare `pumpAndSettle()` call (no argument) anywhere in a `_test.dart` file
 *
 * Always warns only (exit 0) — never blocks the agent. Some widgets genuinely
 * have no animation and a bare call is harmless, so this is advisory.
 */

const fs = require('fs');
const path = require('path');
const { findFlutterConfig } = require('./lib/flutter-config');

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const BARE_PUMP_AND_SETTLE = /\.pumpAndSettle\(\s*\)/;

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

    if (!filePath || !filePath.endsWith('_test.dart')) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Load project config — no config means no checks
    const loaded = findFlutterConfig(filePath);
    if (!loaded) {
      process.stdout.write(data);
      process.exit(0);
    }

    const { config } = loaded;
    const pumpConfig = config.pumpAndSettle?.checkBareCall;
    if (!pumpConfig?.enabled) {
      process.stdout.write(data);
      process.exit(0);
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(data);
      process.exit(0);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE.test(line)) continue;

      if (BARE_PUMP_AND_SETTLE.test(line)) {
        console.error(
          `[Hook] Flutter: bare pumpAndSettle() at line ${i + 1} in ${basename} — ` +
            `if this widget has any continuous animation/loading state, this can hang the ` +
            `test process indefinitely. Prefer pumpAndSettle(const Duration(seconds: 5)) ` +
            `or pump(duration) for known-infinite animations (see dart/testing.md).`,
        );
      }
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(data);
  process.exit(0);
});
