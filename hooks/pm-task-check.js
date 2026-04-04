#!/usr/bin/env node
/**
 * PostToolUse Hook: PM health check when project-orchestration task files change
 *
 * Fires after Write/Edit/MultiEdit. Checks if the modified file is in
 * project-orchestration/tasks/ or project-orchestration/completed-tasks/.
 * If yes: scans all active task YAML frontmatters and prints a compact
 * PM briefing that Claude sees in its conversation context.
 *
 * Output example:
 * [PM] 74 active | P0: 3 | P1: 12 | Blocked: 5 | Stale: 8
 * [PM] Overdue: TS-AUTH-003 (2026-03-15, 18d ago)
 * [PM] Mobile HIGH (pending): TS-GEO-013, TS-AUTH-MOBILE-001
 * [PM] Debt: 🔴 3 major, 7 minor
 *
 * Silent on non-task files (no output, pass-through).
 * Never blocks — always exits 0.
 */

const fs = require('fs');
const path = require('path');

const MAX_STDIN = 512 * 1024;
let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path || input.tool_input?.path || '';

    // Only act on project-orchestration task files
    const normalized = filePath.replace(/\\/g, '/');
    const isTaskFile =
      normalized.includes('/project-orchestration/tasks/') ||
      normalized.includes('/project-orchestration/completed-tasks/');

    if (!isTaskFile) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Find project-orchestration/tasks/ directory
    const tasksDirMatch = normalized.match(/^(.*\/project-orchestration)\//);
    if (!tasksDirMatch) {
      process.stdout.write(data);
      process.exit(0);
    }

    const orchRoot = tasksDirMatch[1];
    const tasksDir = path.join(orchRoot, 'tasks');

    if (!fs.existsSync(tasksDir)) {
      process.stdout.write(data);
      process.exit(0);
    }

    // Scan all .md files in tasks/
    const taskFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith('.md'));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = {
      total: 0,
      byPriority: { P0: 0, P1: 0, P2: 0, P3: 0, unknown: 0 },
      blocked: 0,
      stale: [],
      overdue: [],
      mobileHigh: [],
      debtMajor: 0,
      debtMinor: 0,
    };

    for (const file of taskFiles) {
      const content = fs.readFileSync(path.join(tasksDir, file), 'utf8');
      const frontmatter = parseFrontmatter(content);
      if (!frontmatter) continue;

      // Skip done/deferred
      const status = (frontmatter.status || '').toLowerCase();
      if (status === 'done' || status === 'deferred' || status === 'completed') continue;

      stats.total++;

      // Priority
      const priority = (frontmatter.priority || '').toUpperCase();
      if (stats.byPriority[priority] !== undefined) stats.byPriority[priority]++;
      else stats.byPriority.unknown++;

      // Blocked
      if (status === 'blocked') stats.blocked++;

      // Stale (updated_date > 14 days ago)
      if (frontmatter.updated_date) {
        const updated = new Date(frontmatter.updated_date);
        const daysSince = Math.floor((today - updated) / 86400000);
        if (daysSince > 14) {
          stats.stale.push({ id: frontmatter.id || file.replace('.md', ''), days: daysSince });
        }
      }

      // Overdue
      if (frontmatter.due_date) {
        const due = new Date(frontmatter.due_date);
        if (due < today) {
          const daysOverdue = Math.floor((today - due) / 86400000);
          stats.overdue.push({
            id: frontmatter.id || file.replace('.md', ''),
            date: frontmatter.due_date,
            days: daysOverdue,
          });
        }
      }

      // Mobile impact
      const mobile = (frontmatter.mobile_impact || '').toLowerCase();
      if (mobile === 'high') {
        stats.mobileHigh.push(frontmatter.id || file.replace('.md', ''));
      }

      // Tech debt
      const debt = (frontmatter.tech_debt || '').toLowerCase();
      if (debt === 'major') stats.debtMajor++;
      else if (debt === 'minor') stats.debtMinor++;
    }

    // Format debt indicator
    const debtScore = stats.debtMajor * 1.0 + stats.debtMinor * 0.5;
    const debtIcon = debtScore > 5 ? '🔴' : debtScore > 2 ? '🟡' : '🟢';

    // Build output
    const lines = [];
    lines.push(
      `[PM] ${stats.total} active | P0: ${stats.byPriority.P0} | P1: ${stats.byPriority.P1} | Blocked: ${stats.blocked} | Stale: ${stats.stale.length}`,
    );

    if (stats.overdue.length > 0) {
      const list = stats.overdue
        .slice(0, 3)
        .map((t) => `${t.id} (${t.date}, ${t.days}d ago)`)
        .join(', ');
      lines.push(`[PM] ⚠️  Overdue: ${list}${stats.overdue.length > 3 ? ` +${stats.overdue.length - 3} more` : ''}`);
    }

    if (stats.stale.length > 0) {
      const list = stats.stale
        .slice(0, 3)
        .map((t) => `${t.id} (${t.days}d)`)
        .join(', ');
      lines.push(`[PM] 💤 Stale (>14d): ${list}${stats.stale.length > 3 ? ` +${stats.stale.length - 3} more` : ''}`);
    }

    if (stats.mobileHigh.length > 0) {
      const list = stats.mobileHigh.slice(0, 3).join(', ');
      lines.push(
        `[PM] 📱 Mobile HIGH: ${list}${stats.mobileHigh.length > 3 ? ` +${stats.mobileHigh.length - 3}` : ''} — needs UX review`,
      );
    }

    if (stats.debtMajor > 0 || stats.debtMinor > 0) {
      lines.push(`[PM] 🔧 Debt: ${debtIcon} ${stats.debtMajor} major, ${stats.debtMinor} minor`);
    }

    process.stderr.write(lines.join('\n') + '\n');
  } catch {
    // Silent on errors — never break the workflow
  }

  process.stdout.write(data);
  process.exit(0);
});

/**
 * Parse YAML frontmatter between --- delimiters.
 * Minimal implementation — handles string and array values.
 * Returns null if no frontmatter found.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const result = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (!kv) continue;

    const key = kv[1];
    let value = kv[2].trim();

    // Strip quotes
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }

    // Parse inline arrays [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }

    result[key] = value;
  }

  return result;
}
