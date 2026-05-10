#!/usr/bin/env node
/**
 * PreCompact Hook — Snapshot TEAM-STATE.md before context compaction
 *
 * Cross-platform (Windows, macOS, Linux).
 *
 * When Claude is about to compact the context window, this hook saves
 * a copy of project-orchestration/TEAM-STATE.md to a timestamped file
 * in project-orchestration/_archive/snapshots/, preserving the exact
 * state-of-the-world Claude was looking at before compaction.
 *
 * This gives you a recoverable history of how TEAM-STATE.md evolved
 * across long sessions, even if the in-memory context drops the
 * intermediate updates during compaction.
 *
 * Silent for projects without PM-system. Never blocks (exit 0 always).
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'project-orchestration', 'TEAM-STATE.md'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').replace(/Z$/, '');
}

const KEEP_SNAPSHOTS = parseInt(process.env.PM_SNAPSHOT_KEEP || '30', 10);

function rotateSnapshots(snapshotsDir, keep) {
  try {
    const files = fs.readdirSync(snapshotsDir)
      .filter(f => f.startsWith('team-state_') && f.endsWith('.md'))
      .map(f => ({ name: f, path: path.join(snapshotsDir, f) }))
      .sort((a, b) => a.name.localeCompare(b.name)); // ISO names sort chronologically
    if (files.length <= keep) return 0;
    const toDelete = files.slice(0, files.length - keep);
    for (const f of toDelete) {
      try { fs.unlinkSync(f.path); } catch {}
    }
    return toDelete.length;
  } catch {
    return 0;
  }
}

function main() {
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) {
    process.exit(0);
  }

  const sourcePath = path.join(projectRoot, 'project-orchestration', 'TEAM-STATE.md');
  const snapshotsDir = path.join(projectRoot, 'project-orchestration', '_archive', 'snapshots');

  try {
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true });
    }
    const targetPath = path.join(snapshotsDir, `team-state_${isoTimestamp()}.md`);

    const content = fs.readFileSync(sourcePath, 'utf8');
    const header =
      `<!-- Snapshot taken at ${new Date().toISOString()} before context compaction -->\n` +
      `<!-- Source: project-orchestration/TEAM-STATE.md -->\n\n`;

    fs.writeFileSync(targetPath, header + content, 'utf8');

    // Rotate: keep newest N (default 30, override via PM_SNAPSHOT_KEEP env var)
    const removed = rotateSnapshots(snapshotsDir, KEEP_SNAPSHOTS);
    const rotateNote = removed > 0 ? `, rotated ${removed} old` : '';

    console.error(
      `[pre-compact-pm] Snapshot saved: ${path.relative(projectRoot, targetPath)}${rotateNote}`
    );
  } catch (err) {
    console.error(`[pre-compact-pm] Failed to snapshot: ${err.message}`);
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error(`[pre-compact-pm] Error: ${err.message}`);
  process.exit(0);
}
