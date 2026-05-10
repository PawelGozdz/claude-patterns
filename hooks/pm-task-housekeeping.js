#!/usr/bin/env node
/**
 * PostToolUse Hook — Auto-housekeeping for task files marked status: done
 *
 * Cross-platform (Windows, macOS, Linux).
 *
 * Fires after Write/Edit/MultiEdit. If the modified task file in
 * `project-orchestration/tasks/` has frontmatter `status: done`, the hook:
 *   1. Moves the file to `project-orchestration/completed-tasks/`
 *   2. Appends a "Recently completed" entry to KANBAN.md (if it exists)
 *   3. Logs the action to stderr (visible to Claude as informational)
 *
 * Disable via env var: PM_NO_AUTO_HOUSEKEEPING=true (logs warning only)
 *
 * Silent on non-task files. Never blocks (exit 0 always).
 * Sibling to pm-task-check.js (which produces the briefing — this one mutates).
 */

const fs = require('fs');
const path = require('path');

const MAX_STDIN = 512 * 1024;
const AUTO_MOVE = process.env.PM_NO_AUTO_HOUSEKEEPING !== 'true';

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const result = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    result[kv[1]] = value;
  }
  return result;
}

function ensureKanbanEntry(projectRoot, taskId, frontmatter) {
  const kanbanPath = path.join(projectRoot, 'KANBAN.md');
  if (!fs.existsSync(kanbanPath)) return false;

  const today = new Date().toISOString().slice(0, 10);
  const title = frontmatter.title || frontmatter.summary || taskId;
  const entry = `- ${today} — **${taskId}** — ${title}`;

  let content;
  try {
    content = fs.readFileSync(kanbanPath, 'utf8');
  } catch {
    return false;
  }

  // Don't double-add
  if (content.includes(`**${taskId}**`)) return false;

  // Try to find a "Recently Completed" or "Done" section; append entry below heading
  const headingPatterns = [
    /^##\s+Recently[ -]?Completed\s*$/im,
    /^##\s+Done\s*$/im,
    /^##\s+Completed\s*$/im,
  ];

  for (const pattern of headingPatterns) {
    const match = content.match(pattern);
    if (match) {
      const idx = match.index + match[0].length;
      const updated = content.slice(0, idx) + '\n' + entry + content.slice(idx);
      fs.writeFileSync(kanbanPath, updated, 'utf8');
      return true;
    }
  }

  // No matching section — append a new one at the end
  const updated = content.trimEnd() + `\n\n## Recently Completed\n\n${entry}\n`;
  fs.writeFileSync(kanbanPath, updated, 'utf8');
  return true;
}

function findProjectRoot(filePath) {
  // Walk up from filePath until we find a parent containing 'project-orchestration'
  let dir = path.dirname(filePath);
  for (let i = 0; i < 10; i++) {
    if (path.basename(dir) === 'project-orchestration') {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
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

    const normalized = filePath.replace(/\\/g, '/');
    const isActiveTask = /\/project-orchestration\/tasks\/[^/]+\.md$/.test(normalized);
    if (!isActiveTask) {
      process.exit(0);
    }

    if (!fs.existsSync(filePath)) {
      // File may have just been deleted/moved by Claude itself — silent
      process.exit(0);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) {
      process.exit(0);
    }

    const status = (fm.status || '').toLowerCase();
    if (status !== 'done' && status !== 'completed') {
      process.exit(0);
    }

    const taskId = fm.id || path.basename(filePath, '.md');
    const pmRoot = findProjectRoot(filePath);
    if (!pmRoot) {
      console.error(`[pm-housekeeping] Could not locate project-orchestration/ for ${filePath}`);
      process.exit(0);
    }

    const completedDir = path.join(pmRoot, 'completed-tasks');
    const targetPath = path.join(completedDir, path.basename(filePath));

    if (!AUTO_MOVE) {
      console.error(
        `[pm-housekeeping] Task ${taskId} marked status: done — auto-move disabled.\n` +
        `   Run /task-tidy to move manually, or unset PM_NO_AUTO_HOUSEKEEPING.`
      );
      process.exit(0);
    }

    if (!fs.existsSync(completedDir)) {
      fs.mkdirSync(completedDir, { recursive: true });
    }

    if (fs.existsSync(targetPath)) {
      console.error(
        `[pm-housekeeping] Target already exists: ${targetPath} — leaving in tasks/, please resolve manually`
      );
      process.exit(0);
    }

    fs.renameSync(filePath, targetPath);

    const kanbanUpdated = ensureKanbanEntry(pmRoot, taskId, fm);
    const kanbanNote = kanbanUpdated ? ', KANBAN.md updated' : '';

    console.error(
      `[pm-housekeeping] ✓ ${taskId} → completed-tasks/${kanbanNote}`
    );
  } catch (err) {
    console.error(`[pm-housekeeping] error: ${err.message}`);
  }
  process.exit(0);
});
