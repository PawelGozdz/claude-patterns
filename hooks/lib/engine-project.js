/**
 * engine-project.js — find and read a project's `.claude/config/runtime.yml` (the block composition, ADR 0008).
 * Shared by the hooks that only make sense in an engine project (rule-card injection, verifier reminder).
 * No runtime.yml = not an engine project = callers pass through silently.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function findRuntime(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const p = path.join(dir, '.claude', 'config', 'runtime.yml');
    if (fs.existsSync(p)) return { root: dir, file: p };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// null on any failure: a hook never breaks over its own configuration.
function loadRuntime(file) {
  try {
    const YAML = require(path.join(REPO_ROOT, 'node_modules', 'yaml'));
    return YAML.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch { return null; }
}

// `ecc:foo-implementer` and `foo-implementer` name the same agent for routing purposes.
const bare = (name) => String(name || '').split(':').pop();

module.exports = { REPO_ROOT, findRuntime, loadRuntime, bare };
