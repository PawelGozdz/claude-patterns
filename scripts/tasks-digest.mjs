#!/usr/bin/env node
// scripts/tasks-digest.mjs — digest deterministyczny dla docs/tasks/ (K30, TASK-KAIZEN-001).
//
// /pulse, /task-health, /reprioritize kazały dotąd czytać WSZYSTKIE pliki w
// project-orchestration/tasks/ (symlink na docs/tasks/) w całości — przy kilkunastu taskach
// to pełny kontekst wciągany do promptu, gdy realnie potrzebna jest garść pól z frontmattera
// (id, status, priority, wiek). Ten skrypt czyta TYLKO frontmatter i produkuje zwięzłą tabelę —
// pełną treść konkretnego pliku czyta się osobno, tylko gdy digest wskaże, że to konieczne
// (np. task zablokowany i trzeba zrozumieć dlaczego).
//
// Użycie:
//   node scripts/tasks-digest.mjs          — tabela tekstowa
//   node scripts/tasks-digest.mjs --json   — JSON (użycie maszynowe)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TASKS_DIR = join(REPO, 'docs/tasks');
const JSON_OUT = process.argv.includes('--json');

// Parser liniowy, nie pełny YAML — pola frontmattera tasków są płaskie (jak w
// verify-project-setup.mjs / validate-agents.js). Wystarcza `klucz: wartość` na jednej linii;
// `source: >` (blok wieloliniowy) jest celowo pomijany — digest nie potrzebuje jego treści.
function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!mm) continue;
    let [, key, val] = mm;
    val = val.trim().replace(/^['"]|['"]$/g, '');
    if (val && val !== '>' && val !== '|') fm[key] = val;
  }
  return fm;
}

function ageDays(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const then = new Date(dateStr + 'T00:00:00Z').getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - then) / 86400000));
}

const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
const tasks = [];
for (const file of files) {
  const content = readFileSync(join(TASKS_DIR, file), 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) {
    tasks.push({ file, id: file.replace(/\.md$/, ''), status: 'brak-frontmattera', priority: '', age: '?', title: '' });
    continue;
  }
  const age = ageDays(fm.updated_date) ?? ageDays(fm.created_date);
  tasks.push({
    file,
    id: fm.id || file.replace(/\.md$/, ''),
    status: fm.status || '?',
    priority: fm.priority || '',
    age: age === null ? '?' : age,
    title: fm.title || '',
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify(tasks, null, 2));
  process.exit(0);
}

// Grupowanie: blocked → in-progress/ready/draft → planned → reszta stłumiona (tylko licznik).
const ORDER = { blocked: 0, 'in-progress': 1, ready: 1, draft: 1, planned: 2 };
const rank = (t) => ORDER[t.status] ?? 3;
tasks.sort((a, b) => rank(a) - rank(b) || String(a.age).localeCompare(String(b.age)));

const active = tasks.filter((t) => rank(t) < 3);
const suppressed = tasks.filter((t) => rank(t) === 3);

console.log(`Taski w docs/tasks/: ${tasks.length} (${active.length} aktywnych, ${suppressed.length} zamkniętych/odłożonych)\n`);

const idW = Math.max(...tasks.map((t) => t.id.length), 2);
const statusW = Math.max(...tasks.map((t) => t.status.length), 6);
const header = `${'ID'.padEnd(idW)}  ${'STATUS'.padEnd(statusW)}  PRIO  WIEK  TYTUŁ`;
console.log(header);
console.log('-'.repeat(header.length + 20));

for (const t of active) {
  console.log(`${t.id.padEnd(idW)}  ${t.status.padEnd(statusW)}  ${String(t.priority).padEnd(4)}  ${String(t.age).padEnd(4)}  ${t.title}`);
}

if (suppressed.length) {
  console.log(`\nZamknięte/odłożone (${suppressed.length}, tłumione — pełna lista przez --json):`);
  const byStatus = {};
  for (const t of suppressed) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  for (const [status, count] of Object.entries(byStatus)) console.log(`  ${status}: ${count}`);
}
