#!/usr/bin/env node
/**
 * Keep METADATA.yml counts honest.
 *
 *   node scripts/ci/sync-counts.js          → check (exit 1 on drift)
 *   node scripts/ci/sync-counts.js --fix    → rewrite the drifted numbers in place
 *
 * METADATA.yml is this repo's single source of truth, so its own numbers drifting
 * from the filesystem is corrosive. Counting by hand after every change does not
 * survive contact with a 100-commit merge — this does it mechanically.
 *
 * Only numeric fields that can be derived unambiguously from the filesystem are
 * touched. Comments, ordering and every other field are preserved: the file is
 * edited line-by-line by regex, never re-serialized.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const METADATA = path.join(ROOT, 'METADATA.yml');

// Explicit category split — auditable, and a new directory shows up as an error
// rather than being silently absorbed into whichever bucket happened to match.
const CORE_PATTERNS = ['domain', 'application', 'infrastructure', 'architecture', 'testing', 'cross-layer', 'orchestration'];
const STACK_PATTERNS = ['ai-ml', 'flutter', 'nextjs', 'python', 'sveltekit', 'typescript-library'];
const DOMAIN_PATTERNS = ['marketing', 'finance', 'legal'];
const IGNORED_PATTERN_DIRS = ['_stack-defaults'];

const VENDORED_SKILL_CATEGORIES = ['marketing', 'finance', 'legal'];

function ls(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
}

/** Pattern .md files in a category, excluding README/METADATA. */
function countPatterns(category) {
  const dir = path.join(ROOT, 'patterns', category);
  return ls(dir).filter(
    (e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md' && e.name !== 'METADATA.yml',
  ).length;
}

function countSkillsIn(dir) {
  let n = 0;
  for (const e of ls(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += countSkillsIn(full);
    else if (e.name === 'SKILL.md') n += 1;
  }
  return n;
}

function countAgents(dir) {
  let n = 0;
  for (const e of ls(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += countAgents(full);
    else if (e.name.endsWith('.md') && e.name !== 'README.md') n += 1;
  }
  return n;
}

function collect() {
  const patternDirs = ls(path.join(ROOT, 'patterns'))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !IGNORED_PATTERN_DIRS.includes(n));

  const known = [...CORE_PATTERNS, ...STACK_PATTERNS, ...DOMAIN_PATTERNS];
  const unknown = patternDirs.filter((d) => !known.includes(d));
  if (unknown.length) {
    console.error(`ERROR: unclassified pattern directories: ${unknown.join(', ')}`);
    console.error('       Add them to CORE_PATTERNS / STACK_PATTERNS / DOMAIN_PATTERNS in this script.');
    process.exit(1);
  }

  const sum = (cats) => cats.reduce((a, c) => a + countPatterns(c), 0);

  const skillCategories = ls(path.join(ROOT, 'skills')).filter((e) => e.isDirectory()).map((e) => e.name);
  const totalSkills = countSkillsIn(path.join(ROOT, 'skills'));
  const vendoredSkills = VENDORED_SKILL_CATEGORIES.reduce(
    (a, c) => a + countSkillsIn(path.join(ROOT, 'skills', c)), 0,
  );

  const core = sum(CORE_PATTERNS);
  const stack = sum(STACK_PATTERNS);
  const marketing = countPatterns('marketing');
  const finance = countPatterns('finance');
  const legal = countPatterns('legal');
  const total = core + stack + marketing + finance + legal;

  return {
    'patterns.core_count': core,
    'patterns.stack_specific_count': stack,
    'patterns.marketing_count': marketing,
    'patterns.finance_count': finance,
    'patterns.legal_count': legal,
    'patterns.total_count': total,
    'patterns.maturity.production': total,
    'agents.universal': countAgents(path.join(ROOT, 'agents/universal')),
    'agents.stack_specific': countAgents(path.join(ROOT, 'agents/stacks')),
    'skills.total_categories': skillCategories.length,
    'skills.total_skills': totalSkills,
    'hooks.total': ls(path.join(ROOT, 'hooks')).filter((e) => e.isFile() && e.name.endsWith('.js')).length,
    'templates.stack_presets': ls(path.join(ROOT, 'templates/stacks')).filter((e) => e.name.endsWith('.md')).length,
    'templates.settings_presets': ls(path.join(ROOT, 'templates/settings')).filter((e) => e.name.endsWith('.json')).length,
    _internalSkills: totalSkills - vendoredSkills,
  };
}

/**
 * METADATA.yml reuses leaf keys across sections (`total:` appears under both
 * skills and hooks), so a plain key match is ambiguous. Walk the file tracking
 * the current top-level section and the indent depth instead.
 */
function patch(content, dotted, value) {
  const parts = dotted.split('.');
  const section = parts[0];
  const leaf = parts[parts.length - 1];
  const lines = content.split('\n');

  let inSection = false;
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[a-z_]+:/.test(line)) {
      inSection = line.startsWith(`${section}:`);
      continue;
    }
    if (!inSection) continue;

    const m = line.match(new RegExp(`^(\\s+${leaf}:\\s*)(\\d+)(\\s*(?:#.*)?)$`));
    if (m) {
      const current = Number(m[2]);
      if (current !== value) lines[i] = `${m[1]}${value}${m[3]}`;
      found = true;
      break;
    }
  }
  return { content: lines.join('\n'), found };
}

function main() {
  const fix = process.argv.includes('--fix');
  const counts = collect();
  const internal = counts._internalSkills;
  delete counts._internalSkills;

  let content = fs.readFileSync(METADATA, 'utf-8');
  const drift = [];
  const missing = [];

  for (const [key, value] of Object.entries(counts)) {
    const leaf = key.split('.').pop();
    const section = key.split('.')[0];
    // Read the current value with the same section-aware walk used to patch.
    const probe = patch(content, key, value);
    if (!probe.found) {
      missing.push(key);
      continue;
    }
    if (probe.content !== content) {
      const before = content.split('\n').find((l, i) => l !== probe.content.split('\n')[i]);
      const oldValue = (before.match(/:\s*(\d+)/) || [, '?'])[1];
      drift.push(`  ${key}: ${oldValue} → ${value}`);
      if (fix) content = probe.content;
    }
  }

  // The skills comment carries the internal/vendored breakdown — regenerate it
  // whole, so a stale per-source number cannot survive (the parts must sum to
  // total_skills, which is exactly the invariant that had drifted).
  const breakdown =
    `${internal} internal` +
    VENDORED_SKILL_CATEGORIES.map(
      (c) => ` + ${countSkillsIn(path.join(ROOT, 'skills', c))} vendored ${c}`,
    ).join('');
  const commentRe = /^(\s*total_skills:\s*\d+\s*#\s*)(.*)$/m;
  const cm = content.match(commentRe);
  if (cm && cm[2].trim() !== breakdown) {
    drift.push(`  skills.total_skills comment: "${cm[2].trim()}" → "${breakdown}"`);
    if (fix) content = content.replace(commentRe, `$1${breakdown}`);
  }

  if (missing.length) {
    console.error(`ERROR: fields not found in METADATA.yml: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (drift.length === 0) {
    console.log(`METADATA.yml counts match the filesystem (${Object.keys(counts).length} fields checked)`);
    return;
  }

  if (fix) {
    fs.writeFileSync(METADATA, content);
    console.log('Updated METADATA.yml:');
    drift.forEach((d) => console.log(d));
    return;
  }

  console.error('ERROR: METADATA.yml counts drifted from the filesystem:');
  drift.forEach((d) => console.error(d));
  console.error('\nRun: node scripts/ci/sync-counts.js --fix');
  process.exit(1);
}

main();
