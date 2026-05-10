#!/usr/bin/env node
/**
 * Statusline hook — PM-aware status bar for Claude Code.
 *
 * Reads JSON from stdin (Claude Code session metadata) and project state
 * from cwd. Prints a single line to stdout that becomes the terminal
 * statusline.
 *
 * Output format (when project has PM-system):
 *   ⚡ {model} | 📁 {project} | 🎯 {active-task} | 🚫 {blocked} | 💰 {cost} | 📊 {ctx%}
 *
 * Output when no PM-system (fallback):
 *   ⚡ {model} | 📁 {project} | 🌿 {branch} | 💰 {cost} | 📊 {ctx%}
 *
 * Silent on errors (always exits 0 with at least the model name).
 *
 * Activation:
 *   settings.json → { "statusLine": { "type": "command",
 *     "command": "node $HOME/.claude/hooks/statusline-pm.js" } }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_STDIN = 32 * 1024;

function readStdin() {
  try {
    const data = fs.readFileSync(0, 'utf8');
    return data.length > MAX_STDIN ? data.slice(0, MAX_STDIN) : data;
  } catch {
    return '';
  }
}

function tryJSON(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'project-orchestration', 'TEAM-STATE.md'))) {
      return { root: dir, hasPM: true };
    }
    if (fs.existsSync(path.join(dir, '.git'))) {
      return { root: dir, hasPM: false };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { root: startDir, hasPM: false };
}

function gitBranch(cwd) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000,
    }).toString().trim();
    return branch || null;
  } catch {
    return null;
  }
}

function countActiveBlocked(projectRoot) {
  const tasksDir = path.join(projectRoot, 'project-orchestration', 'tasks');
  if (!fs.existsSync(tasksDir)) return { active: 0, blocked: 0 };
  let active = 0, blocked = 0;
  try {
    for (const entry of fs.readdirSync(tasksDir)) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(tasksDir, entry);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) continue;
        const status = (fmMatch[1].match(/^status:\s*(.+)$/m) || [])[1] || '';
        const s = status.trim().toLowerCase().replace(/['"]/g, '');
        if (s === 'done' || s === 'completed' || s === 'deferred') continue;
        active++;
        if (s === 'blocked') blocked++;
      } catch {}
    }
  } catch {}
  return { active, blocked };
}

function readActiveTask(projectRoot) {
  // Look for "## Active Task" or "## Current" or first in-progress task
  const teamStatePath = path.join(projectRoot, 'project-orchestration', 'TEAM-STATE.md');
  try {
    const content = fs.readFileSync(teamStatePath, 'utf8');
    // Try to extract "Active Task: TS-XXX" or similar pattern
    const m =
      content.match(/Active\s+Task[:\s]+\*?\*?([A-Z]+-[A-Z0-9]+-?\d*)\*?\*?/i) ||
      content.match(/Current\s+(?:Sprint|Task)[:\s]+([A-Z]+-[A-Z0-9]+-?\d*)/i);
    if (m) return m[1];
  } catch {}
  // Fallback: first in-progress task in tasks/
  const tasksDir = path.join(projectRoot, 'project-orchestration', 'tasks');
  if (!fs.existsSync(tasksDir)) return null;
  try {
    for (const entry of fs.readdirSync(tasksDir)) {
      if (!entry.endsWith('.md')) continue;
      const content = fs.readFileSync(path.join(tasksDir, entry), 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) continue;
      const status = (fmMatch[1].match(/^status:\s*(.+)$/m) || [])[1] || '';
      if (/in-progress|in_progress|active/i.test(status)) {
        const id = (fmMatch[1].match(/^id:\s*(.+)$/m) || [])[1] || entry.replace(/\.md$/, '');
        return id.trim().replace(/['"]/g, '');
      }
    }
  } catch {}
  return null;
}

function formatCost(meta) {
  const cost = meta?.cost?.total_cost_usd ?? meta?.cost_usd ?? meta?.session_cost;
  if (typeof cost !== 'number') return null;
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

function formatContext(meta) {
  const used = meta?.context?.used_tokens ?? meta?.context_used;
  const total = meta?.context?.total_tokens ?? meta?.context_max ?? 200000;
  if (typeof used !== 'number') return null;
  const pct = Math.round((used / total) * 100);
  return `${pct}%`;
}

function main() {
  const stdin = readStdin();
  const meta = tryJSON(stdin) || {};
  const cwd = meta?.workspace?.current_dir || meta?.cwd || process.cwd();
  const model = meta?.model?.display_name || meta?.model_id || meta?.model || 'claude';

  const project = findProjectRoot(cwd);
  const projectName = path.basename(project.root);
  const cost = formatCost(meta);
  const ctx = formatContext(meta);

  const parts = [`⚡ ${model}`, `📁 ${projectName}`];

  if (project.hasPM) {
    const activeTask = readActiveTask(project.root);
    const { blocked } = countActiveBlocked(project.root);
    if (activeTask) parts.push(`🎯 ${activeTask}`);
    if (blocked > 0) parts.push(`🚫 ${blocked}`);
  } else {
    const branch = gitBranch(cwd);
    if (branch) parts.push(`🌿 ${branch}`);
  }

  if (cost) parts.push(`💰 ${cost}`);
  if (ctx) parts.push(`📊 ${ctx}`);

  process.stdout.write(parts.join(' | '));
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Fallback: write minimum on any error
  process.stdout.write('⚡ claude');
  process.exit(0);
}
