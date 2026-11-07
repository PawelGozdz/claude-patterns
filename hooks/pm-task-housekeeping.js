#!/usr/bin/env node
/**
 * PostToolUse Hook — Auto-housekeeping for task files marked status: done
 *
 * Cross-platform (Windows, macOS, Linux).
 *
 * Fires after Write/Edit/MultiEdit. If the modified task file in
 * `project-orchestration/tasks/` has frontmatter `status: done`, the hook:
 *   1. Moves the file to `project-orchestration/completed-tasks/`
 *   2. Appends a "Recently completed" entry to KANBAN.md (if it exists); in projects with
 *      `.claude/config/doc-graph.yml` (generated KANBAN.md) it removes the task from
 *      `project-orchestration/kolejka/*.yml` instead and leaves KANBAN.md alone
 *   3. Logs the action to stderr (visible to Claude as informational)
 *
 * Disable via env var: PM_HOUSEKEEPING_MODE=off (logs warning only).
 * `PM_NO_AUTO_HOUSEKEEPING=true` is the DEPRECATED spelling, still honoured so
 * satellite projects that set it keep working (K106).
 *
 * Silent on non-task files. Never blocks (exit 0 always).
 * Sibling to pm-task-check.js (which produces the briefing — this one mutates).
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter: parseFrontmatterShared } = require('./lib/pm-tasks');
const { readStdinJsonWithRaw } = require('./lib/utils');

const MAX_STDIN = 512 * 1024;
// PM_HOUSEKEEPING_MODE=off wyłącza przenoszenie; PM_NO_AUTO_HOUSEKEEPING=true — alias deprecated.
const AUTO_MOVE = (process.env.PM_HOUSEKEEPING_MODE || '').toLowerCase() !== 'off'
  && process.env.PM_NO_AUTO_HOUSEKEEPING !== 'true';

// parseArrays: false — pierwotna wersja tego pliku nie parsowała inline-tablic
// `[a, b, c]` (w przeciwieństwie do pm-task-check.js); zachowane celowo, nie
// ujednolicone cichcem (K40, TASK-KAIZEN-001).
function parseFrontmatter(content) {
  return parseFrontmatterShared(content, { parseArrays: false });
}

/**
 * Projekt z `.claude/config/doc-graph.yml` (np. juz-ide-api, TS-DOCS-QUESTIONS-GAPS-FILES-001)
 * generuje KANBAN.md z frontmatterów zadań i plików `kolejka/*.yml` (`pnpm docs:views`).
 * Taki KANBAN.md nie jest commitowany i nie wolno do niego dopisywać: zapis przepadłby przy
 * następnej generacji. W tym trybie hook nie dotyka KANBAN.md, tylko usuwa zamknięte zadanie
 * z plików kolejek (tak samo mechanicznie jak wcześniej dopisywał wpis).
 */
function usesGeneratedKanban(pmRoot) {
  return fs.existsSync(path.join(pmRoot, '..', '.claude', 'config', 'doc-graph.yml'));
}

function removeFromQueues(pmRoot, taskId) {
  const queueDir = path.join(pmRoot, 'kolejka');
  if (!fs.existsSync(queueDir)) return 0;
  const itemLine = new RegExp(`^\\s*-\\s*${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  let removed = 0;
  for (const name of fs.readdirSync(queueDir)) {
    if (!name.endsWith('.yml')) continue;
    const file = path.join(queueDir, name);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const kept = lines.filter((line) => !itemLine.test(line));
    if (kept.length !== lines.length) {
      fs.writeFileSync(file, kept.join('\n'), 'utf8');
      removed += lines.length - kept.length;
    }
  }
  return removed;
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

async function main() {
  const { raw } = await readStdinJsonWithRaw({ maxSize: MAX_STDIN });
  try {
    const input = JSON.parse(raw || '{}');
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
        `   Run /task-tidy to move manually, or unset PM_HOUSEKEEPING_MODE (deprecated alias: PM_NO_AUTO_HOUSEKEEPING).`
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

    let kanbanNote;
    if (usesGeneratedKanban(pmRoot)) {
      const removed = removeFromQueues(pmRoot, taskId);
      kanbanNote = removed > 0
        ? `, usunięto z kolejka/*.yml (KANBAN.md jest generowany: pnpm docs:views)`
        : ', KANBAN.md jest generowany (pnpm docs:views), bez zapisu';
    } else {
      const kanbanUpdated = ensureKanbanEntry(pmRoot, taskId, fm);
      kanbanNote = kanbanUpdated ? ', KANBAN.md updated' : '';
    }

    console.error(
      `[pm-housekeeping] ✓ ${taskId} → completed-tasks/${kanbanNote}`
    );
  } catch (err) {
    console.error(`[pm-housekeeping] error: ${err.message}`);
  }
  process.exit(0);
}

main();
