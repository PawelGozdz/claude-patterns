#!/usr/bin/env node

/**
 * PostToolUse Hook: Security implementation feedback
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Triggers when Edit/Write/MultiEdit modifies a TypeScript source file
 * (controllers, handlers, services, repositories). Reports progress on
 * the active task's security checklist:
 *
 *   [security-impl] file: handler.ts | task TS-AUTH-003 | 3/8 invariants
 *     ✓ section: ## 🔒 Security Pre-Analysis (filled)
 *     ⚠ 5 items remaining in implementation checklist
 *
 * Goal: keep security checklist visible while writing code, so it doesn't
 * drift to "I'll fill it in later". Pairs with statusline 🛡 N/M.
 *
 * Disable: env AGENT_SECURITY_IMPL_FEEDBACK=off
 * Never blocks (exit 0 always).
 */

const fs = require('fs');
const path = require('path');

if (process.env.AGENT_SECURITY_IMPL_FEEDBACK === 'off') {
  process.exit(0);
}

const MAX_STDIN = 256 * 1024;

// Source file patterns that warrant security feedback
const SOURCE_PATTERNS = [
  /\.ts$/,
  /\.tsx$/,
];

// Skip these (tests, configs, build outputs)
const SKIP_PATTERNS = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.e2e-spec\.ts$/,
  /node_modules\//,
  /\.d\.ts$/,
  /dist\//,
  /\.next\//,
  /coverage\//,
];

function shouldProcess(filePath) {
  if (!filePath) return false;
  if (!SOURCE_PATTERNS.some(p => p.test(filePath))) return false;
  if (SKIP_PATTERNS.some(p => p.test(filePath))) return false;
  return true;
}

function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'project-orchestration', 'TEAM-STATE.md'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findActiveTaskFile(projectRoot) {
  // Mirror logic from statusline-pm.js
  const tasksDir = path.join(projectRoot, 'project-orchestration', 'tasks');
  const teamStatePath = path.join(projectRoot, 'project-orchestration', 'TEAM-STATE.md');

  let foundId = null;
  try {
    const content = fs.readFileSync(teamStatePath, 'utf8');
    const m =
      content.match(/Active\s+Task[:\s]+\*?\*?([A-Z]+-[A-Z0-9]+-?\d*)\*?\*?/i) ||
      content.match(/Current\s+(?:Sprint|Task)[:\s]+([A-Z]+-[A-Z0-9]+-?\d*)/i);
    if (m) foundId = m[1];
  } catch {}

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

  if (foundId && fs.existsSync(tasksDir)) {
    try {
      for (const entry of fs.readdirSync(tasksDir)) {
        if (entry.startsWith(foundId) && entry.endsWith('.md')) {
          return { id: foundId, filePath: path.join(tasksDir, entry) };
        }
      }
    } catch {}
  }
  return null;
}

function readChecklistProgress(taskFilePath) {
  let content;
  try { content = fs.readFileSync(taskFilePath, 'utf8'); } catch { return null; }

  const hasPreAnalysis = /^##\s+(?:🔒\s+)?Security\s+(Pre-Analysis|Considerations)\s*$/im.test(content);
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => /^##\s+(?:📋\s+)?Implementation\s+Checklist/im.test(l));
  if (startIdx === -1) return { hasPreAnalysis, checked: 0, total: 0, missing: [] };

  let checked = 0;
  let total = 0;
  const missing = [];
  let currentSubsection = '';

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line.trim())) break;

    const sub = line.match(/^###\s+(.+?)$/);
    if (sub) { currentSubsection = sub[1].trim(); continue; }

    const item = line.match(/^\s*-\s+\[([ xX])\]\s+(.+?)$/);
    if (item) {
      total++;
      if (item[1].toLowerCase() === 'x') {
        checked++;
      } else {
        // Strip leading **bold** from item description
        const desc = item[2].replace(/\*\*/g, '').trim();
        missing.push({ subsection: currentSubsection, desc: desc.length > 60 ? desc.slice(0, 57) + '...' : desc });
      }
    }
  }

  return { hasPreAnalysis, checked, total, missing };
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');
    const filePath = input.tool_input?.file_path || input.tool_input?.path || '';
    if (!shouldProcess(filePath)) process.exit(0);

    const projectRoot = findProjectRoot(process.cwd());
    if (!projectRoot) process.exit(0);

    const task = findActiveTaskFile(projectRoot);
    if (!task || !task.filePath) process.exit(0);

    const progress = readChecklistProgress(task.filePath);
    if (!progress || progress.total === 0) process.exit(0);

    const fileName = path.basename(filePath);
    const preStatus = progress.hasPreAnalysis ? '✓ Pre-Analysis filled' : '⚠ Pre-Analysis missing';

    const lines = [
      `[security-impl] ${fileName} | task ${task.id} | ${progress.checked}/${progress.total} invariants checked`,
      `  ${preStatus}`,
    ];

    if (progress.missing.length > 0 && progress.missing.length <= 5) {
      lines.push(`  Remaining items:`);
      for (const m of progress.missing) {
        const sub = m.subsection ? `[${m.subsection}] ` : '';
        lines.push(`    - ${sub}${m.desc}`);
      }
    } else if (progress.missing.length > 5) {
      lines.push(`  ${progress.missing.length} items remaining (see task ${task.id} for details)`);
    }

    process.stderr.write(lines.join('\n') + '\n');
  } catch {
    // Silent — feedback hook must never disturb workflow
  }
  process.exit(0);
});
