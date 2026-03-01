#!/usr/bin/env node
/**
 * PostToolUse Hook: Check Flutter domain/application layer purity after editing
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires flutter-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Flutter projects).
 *
 * Validates:
 * - No forbidden imports (infra packages) in domain/application layers
 * - Detects Dart import syntax: import 'package:foo/...' or import 'dart:io'
 *
 * Skips: generated files (.g.dart, .freezed.dart), test files, mock files
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { findFlutterConfig } = require('./lib/flutter-config');

// Dart import pattern: import 'package:foo/bar.dart'; or import 'dart:io';
const DART_IMPORT = /^\s*import\s+['"]([^'"]+)['"]/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

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
    if (!loaded || !loaded.config.purity) {
      process.stdout.write(data);
      process.exit(0);
    }

    const { config } = loaded;

    // Skip generated/test files
    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];
    if (skipPatterns.some((pat) => filePath.endsWith(pat))) {
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
    const basename = path.basename(filePath);

    // Check: No forbidden imports in domain/application layers
    if (forbiddenImports.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_LINE.test(line)) continue;

        const importMatch = line.match(DART_IMPORT);
        if (!importMatch) continue;

        const importPath = importMatch[1];
        const forbidden = forbiddenImports.find((f) => importPath.startsWith(f));
        if (forbidden) {
          console.error(
            `[Hook] Flutter: Forbidden import "${forbidden}" at line ${i + 1} in ${basename} — ${fileLayer} layer must not depend on infrastructure`,
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
