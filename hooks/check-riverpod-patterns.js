#!/usr/bin/env node
/**
 * PostToolUse Hook: Detect ref.read() inside build() methods in Flutter/Riverpod
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires flutter-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Flutter projects).
 *
 * Checks:
 * - ref.read() inside build() method — should use ref.watch() for reactivity
 *
 * Detection: finds build( method, tracks brace depth, flags ref.read( within scope.
 * Only checks files matching configurable patterns (e.g. presentation Dart files).
 * Skips generated files.
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { findFlutterConfig, matchesPattern } = require('./lib/flutter-config');

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const BUILD_METHOD = /\bbuild\s*\(/;
const REF_READ = /\bref\.read\s*\(/;

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

    if (!filePath || !filePath.endsWith('.dart')) {
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

    // Check if riverpod checks are enabled
    const riverpodConfig = config.riverpod?.checkRefRead;
    if (!riverpodConfig?.enabled) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Skip generated/test files
    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];
    if (skipPatterns.some((pat) => filePath.endsWith(pat))) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Check if file matches configured patterns
    const normalized = filePath.replace(/\\/g, '/');
    const filePatterns = riverpodConfig.filePatterns || ['*/presentation/**/*.dart'];
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
    const basename = path.basename(filePath);

    // Find build() methods and check for ref.read() inside them
    let insideBuild = false;
    let braceDepth = 0;
    let buildStartDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE.test(line)) continue;

      // Detect build() method start
      if (!insideBuild && BUILD_METHOD.test(line)) {
        insideBuild = true;
        buildStartDepth = braceDepth;
        // Count braces on the build line itself
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        // Check this line too
        if (REF_READ.test(line)) {
          console.error(
            `[Hook] Flutter: ref.read() at line ${i + 1} in ${basename} — use ref.watch() inside build() for reactivity`,
          );
        }
        continue;
      }

      if (insideBuild) {
        // Check for ref.read() before counting braces
        if (REF_READ.test(line)) {
          console.error(
            `[Hook] Flutter: ref.read() at line ${i + 1} in ${basename} — use ref.watch() inside build() for reactivity`,
          );
        }

        // Track brace depth
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }

        // Exited the build() method
        if (braceDepth <= buildStartDepth) {
          insideBuild = false;
        }
      } else {
        // Outside build — just track braces for nesting
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
      }
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(data);
  process.exit(0);
});
