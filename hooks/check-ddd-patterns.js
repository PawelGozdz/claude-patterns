#!/usr/bin/env node
/**
 * PostToolUse Hook: Validate DDD building block patterns + NestJS @Inject
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Config-driven: requires ddd-hooks.json in project root or .claude/.
 * No config = no warnings (silent skip for non-DDD projects).
 *
 * Checks:
 * 1. DDD building blocks extend correct base classes (per config baseClasses.extends)
 * 2. DDD building blocks implement required interfaces (per config baseClasses.implements)
 * 3. Forbidden patterns absent from specific files (per config baseClasses.forbidden)
 * 4. NestJS constructor params have @Inject decorator (per config nestjs)
 *
 * Always warns only (exit 0) — never blocks the agent.
 */

const fs = require('fs');
const path = require('path');
const { findConfig, matchesPattern } = require('./lib/ddd-config');

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

    if (SKIP_PATTERNS.some((p) => p.test(filePath))) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Load project config — no config means no checks
    const loaded = findConfig(filePath);
    if (!loaded) {
      process.stdout.write(data);
      process.exit(0);
    }

    const { config } = loaded;
    const normalized = filePath.replace(/\\/g, '/');
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      process.stdout.write(data);
      process.exit(0);
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    const basename = path.basename(filePath);

    // Check 1: Base class / interface / forbidden pattern validation
    if (config.baseClasses) {
      const match = config.baseClasses.find((rule) =>
        matchesPattern(normalized, rule.file),
      );

      if (match) {
        // Check 1a: "extends BaseClass"
        if (match.extends) {
          const hasRequired = match.extends.some((ext) => {
            const extendsPattern = new RegExp(`extends\\s+${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
            return extendsPattern.test(content);
          });
          if (!hasRequired) {
            const expected = match.extends.join(' or ');
            console.error(
              `[Hook] DDD: ${match.label} "${basename}" should extend ${expected}`,
            );
          }
        }

        // Check 1b: "implements IInterface"
        if (match.implements) {
          const hasImplements = match.implements.some((iface) => {
            const implPattern = new RegExp(`implements\\s+[\\w,\\s<>]*${iface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
            return implPattern.test(content);
          });
          if (!hasImplements) {
            const expected = match.implements.join(' or ');
            console.error(
              `[Hook] DDD: ${match.label} "${basename}" should implement ${expected}`,
            );
          }
        }

        // Check 1c: forbidden patterns (things that should NOT be in this file)
        if (match.forbidden) {
          for (const rule of match.forbidden) {
            const forbiddenPattern = new RegExp(rule.pattern);
            if (forbiddenPattern.test(content)) {
              console.error(
                `[Hook] DDD: ${match.label} "${basename}" — ${rule.message}`,
              );
            }
          }
        }
      }
    }

    // Check 2: NestJS @Inject decorator validation
    const injectConfig = config.nestjs?.requireInjectDecorator;
    if (injectConfig?.enabled && injectConfig.filePatterns) {
      const needsInjectCheck = injectConfig.filePatterns.some((pattern) =>
        matchesPattern(normalized, pattern),
      );

      if (needsInjectCheck) {
        const warnings = checkConstructorInjection(content);
        for (const w of warnings) {
          console.error(
            `[Hook] NestJS: constructor param "${w.param}" at line ${w.line} in ${basename} — missing @Inject() decorator`,
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

/**
 * Find constructor parameters that have an access modifier but no @ decorator.
 * Returns array of { line, param } for each missing decorator.
 */
function checkConstructorInjection(content) {
  const lines = content.split('\n');
  const warnings = [];
  let constructorStart = -1;
  let parenDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (constructorStart === -1) {
      if (/constructor\s*\(/.test(line)) {
        constructorStart = i;
        for (const ch of line) {
          if (ch === '(') parenDepth++;
          if (ch === ')') parenDepth--;
        }
        // Single-line constructor — still check this line for params
        if (parenDepth <= 0) {
          checkParamLine(line, i, constructorStart, lines, warnings);
          break;
        }
      }
      continue;
    }

    // Inside constructor params
    for (const ch of line) {
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth--;
    }

    checkParamLine(line, i, constructorStart, lines, warnings);
    if (parenDepth <= 0) break;
  }

  return warnings;
}

/**
 * Check a single line inside a constructor for a DI param missing a decorator.
 */
function checkParamLine(line, lineIdx, constructorStart, lines, warnings) {
  const trimmed = line.trim();
  if (!trimmed || /^\/\//.test(trimmed) || /^\/\*/.test(trimmed) || /^\*/.test(trimmed)) return;

  // Does this line declare a DI parameter?
  const paramMatch = trimmed.match(/(private|protected|public)\s+(?:readonly\s+)?(\w+)/);
  if (!paramMatch) return;

  // Decorator on the same line — OK
  if (/@\w+\s*\(/.test(trimmed)) return;

  // Look back for decorator above (until comma, constructor opening, or start)
  for (let j = lineIdx - 1; j >= constructorStart; j--) {
    const prevTrimmed = lines[j].trim();
    if (!prevTrimmed) continue;
    if (/@\w+\s*\(/.test(prevTrimmed)) return; // found decorator
    if (prevTrimmed.endsWith(',') || /constructor\s*\(/.test(prevTrimmed)) break;
  }

  warnings.push({ line: lineIdx + 1, param: paramMatch[2] });
}
