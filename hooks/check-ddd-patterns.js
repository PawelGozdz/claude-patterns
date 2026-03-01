#!/usr/bin/env node
/**
 * PostToolUse Hook: Validate DDD building block base classes after editing
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Checks that DDD building blocks (aggregates, value objects, entities,
 * specifications, domain events, integration events) extend the correct
 * base classes based on file naming convention.
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');

// Configurable pattern map: file pattern → required base class(es)
// If the file content contains ANY of the required extends, it passes.
const PATTERN_MAP = [
  { file: /\.aggregate\.ts$/, required: ['AggregateRoot<'], label: 'Aggregate' },
  { file: /\.vo\.ts$/, required: ['BaseValueObject<'], label: 'Value Object' },
  { file: /\.entity\.ts$/, required: ['BaseEntity<'], label: 'Entity' },
  {
    file: /\.specification\.ts$/,
    required: ['CompositeSpecification<', 'AsyncCompositeSpecification<'],
    label: 'Specification',
  },
  {
    file: /\/domain\/.*\.event\.ts$/,
    required: ['LocalHeroDomainEvent<', 'ProjectDomainEvent<'],
    label: 'Domain Event',
  },
  {
    file: /\.integration-event\.ts$/,
    required: ['LocalHeroIntegrationEvent', 'IntegrationEvent'],
    label: 'Integration Event',
  },
];

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

    // Find matching pattern
    const match = PATTERN_MAP.find((p) => p.file.test(normalized));
    if (!match) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Read the file to check for required extends
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(data);
      process.exit(0);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const hasRequired = match.required.some((ext) => content.includes(ext));

    if (!hasRequired) {
      const expected = match.required.join(' or ');
      console.error(
        `[Hook] DDD: ${match.label} "${path.basename(filePath)}" should extend ${expected}`,
      );
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(data);
  process.exit(0);
});
