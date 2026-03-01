#!/usr/bin/env node
/**
 * Stop Hook: Detect cross-context imports in modified TypeScript files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires ddd-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-DDD projects).
 *
 * Checks all git-modified .ts files for imports that cross bounded context
 * boundaries. Uses contextPath from config (default: "src/contexts").
 *
 * Excludes: shared/ directory, test files
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { isGitRepo, getGitModifiedFiles, readFile, log } = require('./lib/utils');
const { findConfig } = require('./lib/ddd-config');

// Files to skip
const SKIP_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /__mocks__\//,
];

// Match import lines
const IMPORT_LINE = /^\s*import\s+.*from\s+['"]/;

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
    if (!isGitRepo()) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Load config from cwd — no config means no checks
    const loaded = findConfig(process.cwd());
    if (!loaded || !loaded.config.contextPath) {
      process.stdout.write(data);
      process.exit(0);
    }

    const contextPath = loaded.config.contextPath;
    // Build dynamic regexes from config contextPath
    // e.g. "src/contexts" → /(?:^|\/|\\)src\/contexts\/([^/\\]+)\//
    const escapedPath = contextPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const CONTEXT_PATH_RE = new RegExp(`(?:^|/|\\\\)(?:${escapedPath})\/([^/\\\\]+)\/`);
    const CONTEXT_IMPORT_RE = new RegExp(
      `from\\s+['"](?:@contexts|.*/${escapedPath.replace(/\\\//g, '/')})\/([^/'"]+)`,
    );

    const files = getGitModifiedFiles(['\\.ts$'])
      .filter((f) => fs.existsSync(f))
      .filter((f) => !SKIP_PATTERNS.some((p) => p.test(f)));

    let hasViolation = false;

    for (const file of files) {
      const normalized = file.replace(/\\/g, '/');

      // Determine which context this file belongs to
      const contextMatch = CONTEXT_PATH_RE.exec(normalized);
      if (!contextMatch) continue;

      const fileContext = contextMatch[1];
      if (fileContext === 'shared') continue;

      const content = readFile(file);
      if (!content) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!IMPORT_LINE.test(line)) continue;

        const importMatch = CONTEXT_IMPORT_RE.exec(line);
        if (!importMatch) continue;

        const importedContext = importMatch[1];
        if (importedContext === 'shared') continue;

        if (importedContext !== fileContext) {
          log(
            `[Hook] DDD: Cross-context import in ${file}:${i + 1} — imports from '${importedContext}'. Use ACL Registry.`,
          );
          hasViolation = true;
        }
      }
    }

    if (hasViolation) {
      log('[Hook] DDD: Cross-context imports break bounded context isolation');
    }
  } catch (err) {
    log(`[Hook] check-context-isolation error: ${err.message}`);
  }

  process.stdout.write(data);
  process.exit(0);
});
