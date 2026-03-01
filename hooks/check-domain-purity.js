#!/usr/bin/env node
/**
 * PostToolUse Hook: Check domain/application layer purity after editing
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Validates two rules:
 * 1. No `throw new` in domain/ or application/ — must use Result<T, E> pattern
 * 2. No infrastructure imports in domain/ — must not import infra packages
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');

// Regex patterns for detection
const THROW_PATTERN = /^\s*throw\s+new\s/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const INFRA_IMPORT = /from\s+['"].*\/(infrastructure|@nestjs|typeorm|kysely)/;

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

    // Skip test/mock files
    if (SKIP_PATTERNS.some((p) => p.test(filePath))) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Normalize path separators for cross-platform matching
    const normalized = filePath.replace(/\\/g, '/');

    const isDomainFile = /\/domain\//.test(normalized);
    const isApplicationFile = /\/application\//.test(normalized);

    // Only check domain and application layer files
    if (!isDomainFile && !isApplicationFile) {
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
    const layer = isDomainFile ? 'domain' : 'application';

    // Check 1: No `throw new` in domain or application layer
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (COMMENT_LINE.test(line)) continue;
      if (THROW_PATTERN.test(line)) {
        console.error(
          `[Hook] DDD: throw at line ${i + 1} in ${basename} (${layer}) — use Result<T, E> instead`,
        );
      }
    }

    // Check 2: No infra imports in domain layer only
    if (isDomainFile) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (INFRA_IMPORT.test(line)) {
          console.error(
            `[Hook] DDD: Infrastructure import at line ${i + 1} in ${basename} — domain layer must not depend on infrastructure`,
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
