/**
 * Shared config loader for DDD enforcement hooks
 *
 * Looks for `ddd-hooks.json` by walking up from the edited file's directory.
 * If no config found, hooks silently skip — no false positives in non-DDD projects.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILENAME = 'ddd-hooks.json';

/**
 * Find and load ddd-hooks.json by walking up from startPath.
 * Checks both project root and .claude/ subdirectory at each level.
 * Returns { config, projectRoot } or null if not found.
 */
function findConfig(startPath) {
  let dir = path.dirname(path.resolve(startPath));
  const root = path.parse(dir).root;
  let depth = 0;

  while (dir !== root && depth < 20) {
    // Check project root first
    const configPath = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return tryLoadConfig(configPath, dir);
    }

    // Then check .claude/ subdirectory
    const claudeConfigPath = path.join(dir, '.claude', CONFIG_FILENAME);
    if (fs.existsSync(claudeConfigPath)) {
      return tryLoadConfig(claudeConfigPath, dir);
    }

    dir = path.dirname(dir);
    depth++;
  }

  return null;
}

function tryLoadConfig(configPath, projectRoot) {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return { config: JSON.parse(content), projectRoot };
  } catch {
    return null;
  }
}

// Match a file path against a glob-like pattern from config.
//
// Patterns without "/" match against basename only:
//   "*.aggregate.ts" matches "user.aggregate.ts"
//
// Patterns with "/" match against the full normalized path:
//   "*/domain/**/*.event.ts" matches "src/contexts/auth/domain/events/..."
//   "**/services/**/*.py"    matches "src/services/user_service.py"
//
// Glob semantics:
//   **/  = zero or more path segments (including none) → regex: (.*/)?
//   **   = match everything (at end of pattern)        → regex: .*
//   *    = single path segment (no slashes)            → regex: [^/]*
function matchesPattern(filePath, pattern) {
  const normalized = filePath.replace(/\\/g, '/');

  if (!pattern.includes('/')) {
    // Simple basename pattern: "*.aggregate.ts" → check suffix
    const suffix = pattern.replace(/^\*/, '');
    return path.basename(normalized).endsWith(suffix);
  }

  // Path pattern: convert glob to regex
  // Order matters: **/ before standalone ** before single *
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(regexStr).test(normalized);
}

module.exports = { findConfig, matchesPattern, CONFIG_FILENAME };
