#!/usr/bin/env node
/**
 * Stop Hook: Detect cross-context imports in modified TypeScript files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Checks all git-modified .ts files for imports that cross bounded context
 * boundaries. Files in src/contexts/{contextA}/ must not import from
 * src/contexts/{contextB}/ — they should use the ACL Registry instead.
 *
 * Excludes: shared/ directory, test files
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const { isGitRepo, getGitModifiedFiles, readFile, log } = require('./lib/utils');

// Files to skip
const SKIP_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /__mocks__\//,
];

// Extract context name from file path: src/contexts/{contextName}/...
const CONTEXT_PATH = /(?:^|\/|\\)(?:src\/)?contexts\/([^/\\]+)\//;

// Match import lines referencing contexts
const IMPORT_LINE = /^\s*import\s+.*from\s+['"]/;
const CONTEXT_IMPORT = /from\s+['"](?:@contexts|.*\/contexts)\/([^/'"]+)/;

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

    const files = getGitModifiedFiles(['\\.ts$'])
      .filter((f) => fs.existsSync(f))
      .filter((f) => !SKIP_PATTERNS.some((p) => p.test(f)));

    let hasViolation = false;

    for (const file of files) {
      // Normalize path separators
      const normalized = file.replace(/\\/g, '/');

      // Determine which context this file belongs to
      const contextMatch = CONTEXT_PATH.exec(normalized);
      if (!contextMatch) continue;

      const fileContext = contextMatch[1];

      // Skip shared context — it's allowed to be imported by anyone
      if (fileContext === 'shared') continue;

      const content = readFile(file);
      if (!content) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Only check import lines
        if (!IMPORT_LINE.test(line)) continue;

        const importMatch = CONTEXT_IMPORT.exec(line);
        if (!importMatch) continue;

        const importedContext = importMatch[1];

        // Skip shared — always allowed
        if (importedContext === 'shared') continue;

        // Cross-context violation
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
