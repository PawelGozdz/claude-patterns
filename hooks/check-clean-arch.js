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

const { runRuleScanner, COMMENT_LINE_C } = require('./lib/rule-scanner');

// Dart import pattern: import 'package:foo/bar.dart'; or import 'dart:io';
const DART_IMPORT = /^\s*import\s+['"]([^'"]+)['"]/;

runRuleScanner({
  extensions: '.dart',
  configFinder: 'flutter',
  section: (config) => config.purity || null,
  skipStyle: 'flutter',
  // Warstwę pliku rozpoznajemy po fragmencie ścieżki `/warstwa/`.
  scope: ({ normalized, section }) =>
    (section.noInfraImportLayers || []).some((layer) => new RegExp(`/${layer}/`).test(normalized)),
  // Własny skaner: reguła dotyczy PREFIKSU importu (`package:dio/`), a komunikat
  // niesie nazwę warstwy — obie rzeczy wypadają poza skaner regułowy per-linia.
  scan: ({ lines, basename, normalized, section: purity }) => {
    const forbiddenImports = purity.forbiddenImports || [];
    if (forbiddenImports.length === 0) return;

    const fileLayer = (purity.noInfraImportLayers || []).find((layer) =>
      new RegExp(`/${layer}/`).test(normalized),
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE_C.test(line)) continue;

      const importMatch = line.match(DART_IMPORT);
      if (!importMatch) continue;

      const forbidden = forbiddenImports.find((f) => importMatch[1].startsWith(f));
      if (forbidden) {
        console.error(
          `[Hook] Flutter: Forbidden import "${forbidden}" at line ${i + 1} in ${basename} — ${fileLayer} layer must not depend on infrastructure`,
        );
      }
    }
  },
});
