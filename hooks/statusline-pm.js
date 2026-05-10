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
  // Returns { id, filePath } for the active in-progress task, or { id } if
  // only a TEAM-STATE reference is found, or null.
  const tasksDir = path.join(projectRoot, 'project-orchestration', 'tasks');
  const teamStatePath = path.join(projectRoot, 'project-orchestration', 'TEAM-STATE.md');

  // 1. Look up id from TEAM-STATE first
  let foundId = null;
  try {
    const content = fs.readFileSync(teamStatePath, 'utf8');
    const m =
      content.match(/Active\s+Task[:\s]+\*?\*?([A-Z]+-[A-Z0-9]+-?\d*)\*?\*?/i) ||
      content.match(/Current\s+(?:Sprint|Task)[:\s]+([A-Z]+-[A-Z0-9]+-?\d*)/i);
    if (m) foundId = m[1];
  } catch {}

  // 2. Fallback: first in-progress task in tasks/
  if (!foundId && fs.existsSync(tasksDir)) {
    try {
      for (const entry of fs.readdirSync(tasksDir)) {
        if (!entry.endsWith('.md')) continue;
        const fp = path.join(tasksDir, entry);
        const content = fs.readFileSync(fp, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) continue;
        const status = (fmMatch[1].match(/^status:\s*(.+)$/m) || [])[1] || '';
        if (/in-progress|in_progress|active/i.test(status)) {
          const id = (fmMatch[1].match(/^id:\s*(.+)$/m) || [])[1] || entry.replace(/\.md$/, '');
          return { id: id.trim().replace(/['"]/g, ''), filePath: fp };
        }
      }
    } catch {}
  }

  // 3. Resolve filePath for foundId by scanning tasks dir
  if (foundId && fs.existsSync(tasksDir)) {
    try {
      for (const entry of fs.readdirSync(tasksDir)) {
        if (entry.startsWith(foundId) && entry.endsWith('.md')) {
          return { id: foundId, filePath: path.join(tasksDir, entry) };
        }
      }
    } catch {}
    return { id: foundId, filePath: null };
  }

  return null;
}

// Count [x] and [ ] items in implementation checklist sections.
// Returns { checked, total, status }
//   status: 'missing'      — no checklist or pre-analysis section
//           'no-pre-analysis' — checklist present but Pre-Analysis missing
//           'in-progress'  — has items, partial
//           'complete'     — all items checked
function readSecurityProgress(filePath) {
  if (!filePath) return null;
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return null; }

  // Detect pre-analysis section
  const hasPreAnalysis = /^##\s+(?:🔒\s+)?Security\s+(Pre-Analysis|Considerations)\s*$/im.test(content);

  // Detect implementation checklist section
  const checklistHeader = content.match(/^##\s+(?:📋\s+)?Implementation\s+Checklist\s*$/im);
  if (!checklistHeader) {
    return { checked: 0, total: 0, status: hasPreAnalysis ? 'no-checklist' : 'missing' };
  }

  // Extract section content until next ## heading
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => /^##\s+(?:📋\s+)?Implementation\s+Checklist/im.test(l));
  let checked = 0;
  let total = 0;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i].trim())) break;
    const m = lines[i].match(/^\s*-\s+\[([ xX])\]/);
    if (m) {
      total++;
      if (m[1].toLowerCase() === 'x') checked++;
    }
  }

  if (total === 0) return { checked: 0, total: 0, status: hasPreAnalysis ? 'no-checklist' : 'missing' };
  if (!hasPreAnalysis) return { checked, total, status: 'no-pre-analysis' };
  if (checked === total) return { checked, total, status: 'complete' };
  return { checked, total, status: 'in-progress' };
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

  // Git branch (always show when in a git repo, regardless of PM-system presence)
  const branch = gitBranch(cwd);
  if (branch) parts.push(`🌿 ${branch}`);

  if (project.hasPM) {
    const activeTask = readActiveTask(project.root);
    const { blocked } = countActiveBlocked(project.root);
    if (activeTask) {
      parts.push(`🎯 ${activeTask.id}`);

      // Security progress 🛡 N/M (only when active task has known file path)
      if (activeTask.filePath) {
        const sec = readSecurityProgress(activeTask.filePath);
        if (sec) {
          if (sec.status === 'no-pre-analysis' || sec.status === 'missing') {
            parts.push(`🛡⚠`);
          } else if (sec.status === 'complete') {
            parts.push(`🛡✓`);
          } else if (sec.status === 'in-progress' && sec.total > 0) {
            parts.push(`🛡 ${sec.checked}/${sec.total}`);
          }
          // 'no-checklist' — silent (task has no security checklist)
        }
      }
    }
    if (blocked > 0) parts.push(`🚫 ${blocked}`);
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
