/**
 * Per-directory cooldown + build-info location for `post-edit-typecheck.js` (K107).
 *
 * Lives in its own module for one reason: the eval fixture has to be able to plant
 * a marker at exactly the path the hook will look at. Duplicating the hashing scheme
 * in `tests/flow-evals/hooks/run.js` would make the test pass while the hook drifts —
 * the failure mode this whole eval exists to catch.
 *
 * State goes to `<tsconfig dir>/.claude/run-state/`, which the gitignore template
 * already excludes (`templates/gitignore-claude.template:59`).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_COOLDOWN_MS = 120_000;

function cooldownMs() {
  const raw = Number(process.env.TYPECHECK_COOLDOWN_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COOLDOWN_MS;
}

function runStateDir(projectDir) {
  return path.join(projectDir, '.claude', 'run-state');
}

function markerPath(projectDir) {
  const hash = crypto.createHash('sha1').update(projectDir).digest('hex').slice(0, 12);
  return path.join(runStateDir(projectDir), `typecheck-${hash}.json`);
}

function buildInfoPath(projectDir) {
  return path.join(runStateDir(projectDir), 'typecheck.tsbuildinfo');
}

function readMarker(projectDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath(projectDir), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMarker(projectDir, patch) {
  try {
    fs.mkdirSync(runStateDir(projectDir), { recursive: true });
    const next = { ...readMarker(projectDir), ...patch };
    fs.writeFileSync(markerPath(projectDir), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch {
    // A missing marker costs one redundant typecheck. A thrown hook costs the edit.
  }
}

/** True while the last completed run for this root is younger than the cooldown. */
function inCooldown(projectDir) {
  const { last_run: lastRun } = readMarker(projectDir);
  if (!lastRun) return false;
  const age = Date.now() - Date.parse(lastRun);
  return Number.isFinite(age) && age >= 0 && age < cooldownMs();
}

function markRun(projectDir, at = new Date()) {
  writeMarker(projectDir, { last_run: at.toISOString() });
}

module.exports = {
  DEFAULT_COOLDOWN_MS,
  cooldownMs,
  runStateDir,
  markerPath,
  buildInfoPath,
  readMarker,
  writeMarker,
  inCooldown,
  markRun,
};
