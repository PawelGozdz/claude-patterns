#!/usr/bin/env node
/**
 * Stop Hook: Detect cross-feature imports in modified Dart files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires flutter-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-Flutter projects).
 *
 * Checks all git-modified .dart files for imports that cross feature
 * boundaries. Uses featurePath from config (default: "lib/features").
 *
 * Excludes: shared/ and common/ directories, generated/test files
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { isGitRepo, getGitModifiedFiles, readFile, log, readStdinJsonWithRaw } = require('./lib/utils');
const { findFlutterConfig } = require('./lib/flutter-config');

// Dart import pattern
const DART_IMPORT = /^\s*import\s+['"]([^'"]+)['"]/;

async function main() {
  const { raw } = await readStdinJsonWithRaw();

  try {
    if (!isGitRepo()) {
      process.stdout.write(raw);
      process.exit(0);
    }

    // Load config from cwd — no config means no checks
    const loaded = findFlutterConfig(process.cwd());
    if (!loaded) {
      process.stdout.write(raw);
      process.exit(0);
    }

    const { config } = loaded;
    const featurePath = config.featurePath || 'lib/features';
    const skipPatterns = config.skipPatterns || ['_test.dart', '.g.dart', '.freezed.dart', '.mock.dart'];

    // Build regex to extract feature name from file path
    // e.g. "lib/features" → /(?:^|\/)lib\/features\/([^/]+)\//
    const escapedPath = featurePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const FEATURE_PATH_RE = new RegExp(`(?:^|/|\\\\)(?:${escapedPath})/([^/\\\\]+)/`);

    const files = getGitModifiedFiles(['\\.dart$'])
      .filter((f) => fs.existsSync(f))
      .filter((f) => !skipPatterns.some((pat) => f.endsWith(pat)));

    let hasViolation = false;

    for (const file of files) {
      const normalized = file.replace(/\\/g, '/');

      // Determine which feature this file belongs to
      const featureMatch = FEATURE_PATH_RE.exec(normalized);
      if (!featureMatch) continue;

      const fileFeature = featureMatch[1];
      if (fileFeature === 'shared' || fileFeature === 'common') continue;

      const content = readFile(file);
      if (!content) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const importMatch = line.match(DART_IMPORT);
        if (!importMatch) continue;

        const importPath = importMatch[1];

        // Check for cross-feature imports via relative paths or package paths
        // Look for references to lib/features/{otherFeature}/
        const importFeatureMatch = FEATURE_PATH_RE.exec(importPath);
        if (!importFeatureMatch) {
          // Also check for package-style imports referencing features
          const packageFeatureRe = new RegExp(`features/([^/]+)/`);
          const packageMatch = packageFeatureRe.exec(importPath);
          if (!packageMatch) continue;

          const importedFeature = packageMatch[1];
          if (importedFeature === 'shared' || importedFeature === 'common') continue;

          if (importedFeature !== fileFeature) {
            log(
              `[Hook] Flutter: Cross-feature import in ${file}:${i + 1} — imports from '${importedFeature}'`,
            );
            hasViolation = true;
          }
          continue;
        }

        const importedFeature = importFeatureMatch[1];
        if (importedFeature === 'shared' || importedFeature === 'common') continue;

        if (importedFeature !== fileFeature) {
          log(
            `[Hook] Flutter: Cross-feature import in ${file}:${i + 1} — imports from '${importedFeature}'`,
          );
          hasViolation = true;
        }
      }
    }

    if (hasViolation) {
      log('[Hook] Flutter: Cross-feature imports break feature isolation. Use shared/ for cross-feature dependencies.');
    }
  } catch (err) {
    log(`[Hook] check-flutter-imports error: ${err.message}`);
  }

  process.stdout.write(raw);
  process.exit(0);
}

main();
