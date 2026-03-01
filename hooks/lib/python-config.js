/**
 * Config loader for Python project hooks
 *
 * Looks for `python-hooks.json` by walking up from the edited file's directory.
 * If no config found, hooks silently skip — no false positives in non-Python projects.
 *
 * Reuses matchesPattern() from ddd-config.js for glob matching.
 */

const fs = require('fs');
const path = require('path');
const { matchesPattern } = require('./ddd-config');

const CONFIG_FILENAME = 'python-hooks.json';

/**
 * Find and load python-hooks.json by walking up from startPath.
 * Checks both project root and .claude/ subdirectory at each level.
 * Returns { config, projectRoot } or null if not found.
 */
function findPythonConfig(startPath) {
  let dir = path.dirname(path.resolve(startPath));
  const root = path.parse(dir).root;
  let depth = 0;

  while (dir !== root && depth < 20) {
    const configPath = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return tryLoadConfig(configPath, dir);
    }

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

module.exports = { findPythonConfig, matchesPattern, CONFIG_FILENAME };
