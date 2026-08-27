#!/usr/bin/env node
// scripts/ci/validate-tasks.mjs — audyt zadań (K31, TASK-KAIZEN-001).
//
// "Broken deps / stuck / missing fields / orphaned" z /task-health to w 90% walidacja
// schematu frontmattera, nie rozumowanie — ten skrypt robi to deterministycznie zamiast
// zlecać agentowi czytanie każdego pliku od zera. Precedens: scripts/ci/validate-agents.js,
// scripts/count-assets.mjs (ten sam styl: prosty parser liniowy frontmattera, bez pełnego YAML).
//
// Użycie: node scripts/ci/validate-tasks.mjs [--dir <ścieżka>]

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirArgIdx = process.argv.indexOf('--dir');
const TASKS_DIR = dirArgIdx !== -1 ? process.argv[dirArgIdx + 1] : join(REPO, 'docs', 'tasks');
const STALE_DAYS = 14; // ten sam próg co "Stale (>14d)" w szablonie TEAM-STATE.md

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    val = val.trim().replace(/^['"]|['"]$/g, '');
    if (val.startsWith('[') && val.endsWith(']')) {
      fm[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      fm[key] = val;
    }
  }
  return fm;
}

// *.analysis.md to artefakty /analyze (schemat z polem `task:`, nie `id:` — patrz
// templates/task-analysis-template.md), inny typ dokumentu niż zwykły task. Pomijamy je
// tu celowo zamiast fałszywie zgłaszać brak `id`.
const files = readdirSync(TASKS_DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.endsWith('.analysis.md'));
const byId = new Map();
const errors = [];
const warnings = [];

for (const file of files) {
  const content = readFileSync(join(TASKS_DIR, file), 'utf8');
  const fm = parseFrontmatter(content);
  const expectedId = file.replace(/\.md$/, '');

  if (!fm) {
    warnings.push(`${file}: brak frontmattera — narzędzia PM (pulse/task-health/tasks-digest) go nie widzą`);
    continue;
  }
  if (!fm.id) errors.push(`${file}: brak pola \`id\` w frontmatterze`);
  if (!fm.status) errors.push(`${file}: brak pola \`status\` w frontmatterze`);
  if (fm.id && fm.id !== expectedId) {
    warnings.push(`${file}: \`id: ${fm.id}\` nie zgadza się z nazwą pliku (oczekiwano ${expectedId})`);
  }
  if (fm.id) {
    if (byId.has(fm.id)) errors.push(`${file}: zduplikowane \`id: ${fm.id}\` (już użyte w ${byId.get(fm.id)})`);
    else byId.set(fm.id, file);
  }
}

// Drugi przebieg — sprawdzenia wymagające pełnego zbioru id (depends_on, staleness)
for (const file of files) {
  const content = readFileSync(join(TASKS_DIR, file), 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm) continue;

  if (Array.isArray(fm.depends_on)) {
    for (const dep of fm.depends_on) {
      if (!byId.has(dep)) errors.push(`${file}: \`depends_on\` wskazuje nieistniejące \`${dep}\``);
    }
  }

  const status = (fm.status || '').toLowerCase();
  if (status === 'in-progress' || status === 'in_progress') {
    const dateStr = fm.updated_date || fm.created_date;
    if (dateStr) {
      const ageDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
      if (Number.isFinite(ageDays) && ageDays > STALE_DAYS) {
        warnings.push(`${file}: status in-progress od ${ageDays} dni (próg ${STALE_DAYS}) — sprawdź czy nie utknął`);
      }
    }
  }
}

console.log(`Sprawdzono ${files.length} plików w ${TASKS_DIR}`);
for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} błąd(ów), ${warnings.length} ostrzeżenie(ń)`);
  process.exit(1);
}
console.log(`\n0 błędów, ${warnings.length} ostrzeżenie(ń)`);
