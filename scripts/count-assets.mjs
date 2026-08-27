#!/usr/bin/env node
// scripts/count-assets.mjs — jedno źródło prawdy dla liczników repo (K13, TASK-KAIZEN-001).
//
// Liczy realną zawartość drzewa (commands/, hooks/, agents/, patterns/, skills/) i porównuje
// z nagłówkowymi licznikami w METADATA.yml. Celowo NIE parsuje README.md — liczby tam żyją
// wtopione w prozę ASCII-drzewa katalogów (komentarze w code fence), nie w danych
// strukturalnych; próba wyłapania ich regexem byłaby krucha i fałszywie failowałaby przy
// każdej redakcyjnej zmianie opisu. METADATA.yml jest jedynym miejscem, gdzie liczba jest
// polem YAML, więc jest jedynym bezpiecznym celem automatycznej bramki.
//
// Użycie:
//   node scripts/count-assets.mjs           — pokaż realne liczby + porównanie z METADATA.yml
//   node scripts/count-assets.mjs --check    — jak wyżej, exit 1 przy jakimkolwiek rozjeździe

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, pred, acc);
    else if (pred(entry.name)) acc.push(full);
  }
  return acc;
}

const isMd = (n) => n.endsWith('.md') && n !== 'README.md';
const isPatternMd = (n) => isMd(n) && !n.endsWith('_summary.md');

// commands/ — pliki płaskie, bez podkatalogów
const commandsCount = readdirSync(join(REPO, 'commands')).filter((f) => isMd(f)).length;

// hooks/ — .js i .sh, płaskie (lib/ to kod dzielony, nie osobne hooki)
const hooksJs = readdirSync(join(REPO, 'hooks')).filter((f) => f.endsWith('.js')).length;
const hooksSh = readdirSync(join(REPO, 'hooks')).filter((f) => f.endsWith('.sh')).length;
const hooksCount = hooksJs + hooksSh;

// agents/ — universal (płaskie) + stacks (rekurencyjnie, per-stack breakdown)
const agentsUniversal = readdirSync(join(REPO, 'agents/universal')).filter((f) => isMd(f)).length;
const stacksDir = join(REPO, 'agents/stacks');
const perStack = {};
for (const stack of existsSync(stacksDir) ? readdirSync(stacksDir, { withFileTypes: true }) : []) {
  if (!stack.isDirectory()) continue;
  perStack[stack.name] = walk(join(stacksDir, stack.name), isMd).length;
}
const agentsStackSpecific = Object.values(perStack).reduce((a, b) => a + b, 0);
const agentsTotal = agentsUniversal + agentsStackSpecific;

// patterns/ — per-katalog top-level (bez rekursji — patterns/<kategoria>/*.md, płasko)
const patternsDir = join(REPO, 'patterns');
const perPatternCategory = {};
for (const cat of readdirSync(patternsDir, { withFileTypes: true })) {
  if (!cat.isDirectory()) continue;
  perPatternCategory[cat.name] = readdirSync(join(patternsDir, cat.name))
    .filter((f) => isPatternMd(f)).length;
}
const patternsTotal = Object.values(perPatternCategory).reduce((a, b) => a + b, 0);
const CORE_CATEGORIES = ['domain', 'application', 'infrastructure', 'architecture', 'testing', 'cross-layer', 'orchestration'];
const patternsCore = CORE_CATEGORIES.reduce((a, c) => a + (perPatternCategory[c] ?? 0), 0);
const patternsStackSpecific = patternsTotal - patternsCore
  - (perPatternCategory.marketing ?? 0) - (perPatternCategory.finance ?? 0) - (perPatternCategory.legal ?? 0);

// skills/ — kategorie top-level + SKILL.md rekurencyjnie
const skillsDir = join(REPO, 'skills');
const skillsCategories = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
const skillsTotal = walk(skillsDir, (n) => n === 'SKILL.md').length;

const actual = {
  'commands.total': commandsCount,
  'hooks.total': hooksCount,
  'agents.universal': agentsUniversal,
  'agents.stack_specific': agentsStackSpecific,
  'patterns.total_count': patternsTotal,
  'patterns.core_count': patternsCore,
  'patterns.stack_specific_count': patternsStackSpecific,
  'skills.total_categories': skillsCategories,
  'skills.total_skills': skillsTotal,
};

console.log('Realne liczniki:');
for (const [k, v] of Object.entries(actual)) console.log(`  ${k.padEnd(28)} ${v}`);
console.log('\nAgenci per-stack:');
for (const [k, v] of Object.entries(perStack).sort()) console.log(`  ${k.padEnd(24)} ${v}`);

// ── porównanie z METADATA.yml (parsing liniowy, nie pełny YAML — pola są płaskie
// i jednoznaczne po ścieżce klucza; pełny parser YAML to przerost formy dla 9 pól) ──
const metaPath = join(REPO, 'METADATA.yml');
const metaSrc = readFileSync(metaPath, 'utf8');
const metaLines = metaSrc.split('\n');

function metaField(path) {
  const [section, field] = path.split('.');
  let inSection = false;
  for (const line of metaLines) {
    if (new RegExp(`^${section}:`).test(line)) { inSection = true; continue; }
    if (inSection && /^[a-z]/.test(line)) break; // nowa sekcja top-level
    if (inSection) {
      const m = line.match(new RegExp(`^  ${field}:\\s*(.+)$`));
      if (m) return Number(m[1].split('#')[0].trim());
    }
  }
  return null;
}

let mismatches = 0;
console.log('\nPorównanie z METADATA.yml:');
for (const key of Object.keys(actual)) {
  const expected = metaField(key);
  const ok = expected === actual[key];
  if (!ok) mismatches++;
  console.log(`  ${ok ? '✓' : '✗'} ${key.padEnd(28)} METADATA=${expected}  realnie=${actual[key]}`);
}

if (mismatches > 0) {
  console.log(`\n${mismatches} rozjazd(ów) — zaktualizuj METADATA.yml albo popraw drzewo.`);
  if (CHECK) process.exit(1);
} else {
  console.log('\n✔ METADATA.yml zgodne z drzewem.');
}
