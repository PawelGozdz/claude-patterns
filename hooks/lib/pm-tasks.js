/**
 * hooks/lib/pm-tasks.js — parser frontmattera zadań, wspólny dla pm-task-check.js
 * i pm-task-housekeeping.js (K40, TASK-KAIZEN-001, 2026-08-27). Był zduplikowany
 * niemal identycznie w obu plikach — jedyna różnica: pm-task-check.js parsuje
 * inline-tablice `[a, b, c]`, pm-task-housekeeping.js tego nie robiło. Zachowane
 * jako parametr `parseArrays`, NIE ujednolicone cichcem — housekeeping wywołuje
 * z `parseArrays: false`, żeby zachować dokładnie swoje pierwotne zachowanie.
 */

function parseFrontmatter(content, { parseArrays = true } = {}) {
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

    if (parseArrays && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }

    result[kv[1]] = value;
  }
  return result;
}

module.exports = { parseFrontmatter };
