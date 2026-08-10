#!/usr/bin/env node
// Materializacja bloków → .claude/config/runtime.yml (ADR 0008 D3, TASK-BLOCKS-001 F2).
// Wołane z setup-project.sh (sekcja 5a) albo ręcznie:
//   node scripts/materialize-runtime.mjs <project_dir> [patterns_repo]
//
// Sklejanie dzieje się RAZ, tutaj — silniki /analyze i /orchestrate czytają
// wyłącznie wynikowy runtime.yml. Reguły: unia always (dedup), konkatenacja
// triggers, panel w kolejności bloków, exit PAUSE jeśli ktokolwiek deklaruje,
// orchestrate z dokładnie jednego bloku, env później-wygrywa (z ostrzeżeniem),
// budżety min-merge (OQ3; project.yml nadpisuje), ostrzeżenie >8 always (OQ4),
// walidacja ścieżek wzorców i zależności requires (twardy błąd).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [projectDir, repoArg] = process.argv.slice(2);
if (!projectDir) { console.error('użycie: materialize-runtime.mjs <project_dir> [patterns_repo]'); process.exit(1); }
const REPO = repoArg ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const warn = (m) => console.error(`  UWAGA: ${m}`);
const fail = (m) => { console.error(`  BŁĄD: ${m}`); process.exit(1); };

// ── helpery parsowania (subset YAML używany przez bloki tego repo) ─────────
const lines = (src) => src.split('\n');
const noComment = (l) => !l.trim().startsWith('#');

function section(src, key) {
  const ls = lines(src);
  const start = ls.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < ls.length; i++) {
    if (/^[a-z_]/.test(ls[i])) break;
    body.push(ls[i]);
  }
  return { header: ls[start], body };
}

const inlineList = (line) => {
  const m = line?.match(/\[([^\]]*)\]/);
  return m && m[1].trim() ? m[1].split(',').map((s) => s.trim()) : [];
};

function listItems(body, subkey) {
  // pozycje `- x` pod wciętym kluczem subkey:
  const out = [];
  let inSub = false;
  for (const l of body.filter(noComment)) {
    if (new RegExp(`^\\s+${subkey}:\\s*$`).test(l)) { inSub = true; continue; }
    if (new RegExp(`^\\s+${subkey}:\\s*\\[`).test(l)) return inlineList(l);
    if (inSub) {
      const m = l.match(/^\s+-\s+(\S.*?)\s*$/);
      if (m) { out.push(m[1]); continue; }
      if (l.trim() !== '') inSub = false;
    }
  }
  return out;
}

function triggerGroups(body) {
  const groups = [];
  let cur = null;
  for (const l of body.filter(noComment)) {
    const kw = l.match(/-\s*keywords:\s*\[([^\]]+)\]/);
    if (kw) { cur = { keywords: kw[1].split(',').map((s) => s.trim()), include: [] }; groups.push(cur); continue; }
    if (cur) {
      const inc = l.match(/^\s+-\s+(\S+\.md)\s*$/);
      if (inc) { cur.include.push(inc[1]); continue; }
      if (/^\s{2}\w+:/.test(l)) cur = null;
    }
  }
  return groups;
}

function inlineItems(body) {
  // pozycje `- { ... }`, także wielolinijkowe (balans nawiasów)
  const items = [];
  let cur = null, depth = 0;
  for (const l of body) {
    if (!cur && /^\s*-\s*\{/.test(l)) { cur = [l]; depth = 0; }
    else if (cur) cur.push(l);
    if (cur) {
      depth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
      if (depth <= 0) { items.push(cur.join('\n')); cur = null; }
    }
  }
  return items;
}

// ── wejście: project.yml → stack_blocks ────────────────────────────────────
const projectYml = join(projectDir, '.claude/config/project.yml');
if (!existsSync(projectYml)) fail(`brak ${projectYml}`);
const projSrc = readFileSync(projectYml, 'utf8');
const sbLine = lines(projSrc).find((l) => /^\s{2}stack_blocks:/.test(l));
if (!sbLine) fail('project.yml nie deklaruje project.stack_blocks (lista inline)');
const declared = inlineList(sbLine);
if (!declared.length) fail('stack_blocks jest puste');

// ── aliasy + rozwinięcie ───────────────────────────────────────────────────
const aliases = {};
const aliasPath = join(REPO, 'blocks/_aliases.yml');
if (existsSync(aliasPath))
  for (const m of readFileSync(aliasPath, 'utf8').matchAll(/^\s{2}([\w/-]+):\s*\[([^\]]+)\]/gm))
    aliases[m[1]] = m[2].split(',').map((s) => s.trim());
const expand = (ns) => ns.flatMap((n) => (aliases[n] ? expand(aliases[n]) : [n]));
const expanded = [...new Set(expand(declared))];

// ── wczytanie bloków (centralne + lokalne ./) ──────────────────────────────
const blocks = expanded.map((name) => {
  const path = name.startsWith('./')
    ? join(projectDir, '.claude/blocks', `${name.slice(2)}.yml`)
    : join(REPO, 'blocks', `${name}.yml`);
  if (!existsSync(path)) fail(`blok "${name}" nie istnieje (${path})`);
  return { name, src: readFileSync(path, 'utf8') };
});

// requires: twardy błąd przy brakującej zależności (ADR D1)
const present = new Set(expanded);
for (const b of blocks) {
  const reqLine = lines(b.src).find((l) => /^requires:/.test(l));
  for (const r of inlineList(reqLine ?? ''))
    if (!present.has(r)) fail(`blok "${b.name}" wymaga "${r}" — dodaj go do stack_blocks`);
}

// ── merge ──────────────────────────────────────────────────────────────────
const always = [];           // {path, source}
const triggers = [];         // {keywords, include, source}
const panel = [];            // {raw, source}
let analyzeExit = null, analyzeExitSrc = null;
let orch = null;             // {raw, source}
let ralph = null, reqEcc = null;
const hooks = [], env = new Map(), envSrc = new Map();
const overlay = { agents: [], patterns: [], rules: [] };
const budgets = new Map();   // slot → {fields: Map, source}

for (const b of blocks) {
  const pat = section(b.src, 'patterns');
  if (pat) {
    for (const p of listItems(pat.body, 'always'))
      if (!always.some((a) => a.path === p)) always.push({ path: p, source: b.name });
    for (const g of triggerGroups(pat.body)) triggers.push({ ...g, source: b.name });
  }
  const an = section(b.src, 'analyze');
  if (an) {
    for (const raw of inlineItems(an.body)) panel.push({ raw, source: b.name });
    const ex = an.body.find((l) => /^\s+exit:/.test(l));
    if (ex) {
      const v = ex.trim().split(/\s+/)[1];
      if (v === 'PAUSE' || !analyzeExit) { analyzeExit = v; analyzeExitSrc = b.name; }
    }
  }
  const or = section(b.src, 'orchestrate');
  if (or && or.body.some((l) => /^\s+layers:/.test(l))) {
    if (orch) fail(`orchestrate.layers definiują dwa bloki: "${orch.source}" i "${b.name}" — dozwolony jeden`);
    orch = { raw: or.body.join('\n'), source: b.name };
  }
  const ra = section(b.src, 'ralphinho');
  if (ra && !ralph) ralph = { raw: ra.body.join('\n'), source: b.name };
  const re = section(b.src, 'requires_ecc');
  if (re && !reqEcc) reqEcc = { raw: re.body.join('\n'), source: b.name };

  const ov = section(b.src, 'overlay');
  if (ov) {
    for (const key of ['agents', 'patterns', 'rules'])
      for (const v of listItems(ov.body, key) ?? [])
        if (!overlay[key].includes(v)) overlay[key].push(v);
    const hl = ov.body.find((l) => /^\s+hooks:/.test(l));
    for (const h of inlineList(hl ?? '')) if (!hooks.includes(h)) hooks.push(h);
  }
  const en = section(b.src, 'env');
  if (en)
    for (const l of en.body.filter(noComment)) {
      const m = l.match(/^\s{2}([A-Z_]+):\s*(.+)$/);
      if (!m) continue;
      if (env.has(m[1]) && env.get(m[1]) !== m[2])
        warn(`env ${m[1]}: wartość z bloku "${envSrc.get(m[1])}" nadpisana przez blok "${b.name}"`);
      env.set(m[1], m[2]); envSrc.set(m[1], b.name);
    }
  const bu = section(b.src, 'budgets');
  if (bu)
    for (const l of bu.body.filter(noComment)) {
      const m = l.match(/^\s{2}([\w-]+):\s*\{(.+)\}/);
      if (!m) continue;
      const slot = budgets.get(m[1]) ?? { fields: new Map(), source: b.name };
      for (const f of m[2].matchAll(/([\w-]+):\s*([\w-]+)/g)) {
        const num = Number(f[2]);
        const prev = slot.fields.get(f[1]);
        // OQ3: przy konflikcie liczb wygrywa niższa wartość
        slot.fields.set(f[1], !isNaN(num) && prev !== undefined && !isNaN(Number(prev))
          ? String(Math.min(num, Number(prev))) : (prev ?? f[2]));
      }
      budgets.set(m[1], slot);
    }
}

// project.yml może nadpisać budżety bez ograniczeń (OQ3)
const projBud = section(projSrc, 'budgets');
if (projBud)
  for (const l of projBud.body.filter(noComment)) {
    const m = l.match(/^\s{2}([\w-]+):\s*\{(.+)\}/);
    if (!m) continue;
    const slot = { fields: new Map(), source: 'project.yml' };
    for (const f of m[2].matchAll(/([\w-]+):\s*([\w-]+)/g)) slot.fields.set(f[1], f[2]);
    budgets.set(m[1], slot);
  }

// ── walidacje (OQ4 + ścieżki) ──────────────────────────────────────────────
if (always.length > 8)
  warn(`suma patterns.always = ${always.length} (>8) — zdegraduj coś na triggers/MCP:\n` +
    always.map((a) => `    ${a.path}  (${a.source})`).join('\n'));
for (const p of [...new Set([...always.map((a) => a.path), ...triggers.flatMap((t) => t.include)])])
  if (!existsSync(join(REPO, 'patterns', p)) && !existsSync(join(projectDir, p)))
    warn(`wisząca ścieżka wzorca: ${p}`);

// ── emisja runtime.yml ─────────────────────────────────────────────────────
const hash = createHash('sha256')
  .update(blocks.map((b) => b.src).join('\n') + (existsSync(aliasPath) ? readFileSync(aliasPath, 'utf8') : ''))
  .digest('hex').slice(0, 12);

const out = [];
out.push('# GENERATED przez materialize-runtime.mjs (ADR 0008) — NIE edytuj ręcznie.');
out.push('# Zmiany rób w blokach (claude-patterns/blocks/ lub .claude/blocks/) i odpal setup-project.sh.');
out.push('schema_version: 1');
out.push(`materialized_at: "${new Date().toISOString()}"`);
out.push(`source_hash: "${hash}"`);
out.push(`stack_blocks: [${expanded.join(', ')}]`);
out.push('');
out.push('patterns:');
out.push('  always:');
for (const a of always) out.push(`    - ${a.path}  # source: ${a.source}`);
out.push('  triggers:');
for (const t of triggers) {
  out.push(`    - keywords: [${t.keywords.join(', ')}]  # source: ${t.source}`);
  out.push('      include:');
  for (const p of t.include) out.push(`        - ${p}`);
}
out.push('');
out.push('analyze:');
out.push('  panel:');
for (const p of panel) { out.push(`    # source: ${p.source}`); out.push(p.raw); }
if (analyzeExit) out.push(`  exit: ${analyzeExit}  # source: ${analyzeExitSrc}`);
out.push('');
if (orch) { out.push(`orchestrate:  # source: ${orch.source}`); out.push(orch.raw); out.push(''); }
if (hooks.length) out.push(`hooks: [${hooks.join(', ')}]`);
if (env.size) {
  out.push('env:');
  for (const [k, v] of env) out.push(`  ${k}: ${v}  # source: ${envSrc.get(k)}`);
}
if (Object.values(overlay).some((v) => v.length)) {
  out.push('overlay:');
  for (const key of ['agents', 'patterns', 'rules'])
    if (overlay[key].length) out.push(`  ${key}: [${overlay[key].join(', ')}]`);
}
if (reqEcc) { out.push(`requires_ecc:  # source: ${reqEcc.source}`); out.push(reqEcc.raw); }
if (ralph) { out.push(`ralphinho:  # source: ${ralph.source}`); out.push(ralph.raw); }
if (budgets.size) {
  out.push('budgets:');
  for (const [slot, s] of budgets)
    out.push(`  ${slot}: { ${[...s.fields].map(([k, v]) => `${k}: ${v}`).join(', ')} }  # source: ${s.source}`);
}
out.push('');

const dst = join(projectDir, '.claude/config/runtime.yml');
mkdirSync(dirname(dst), { recursive: true });
writeFileSync(dst, out.join('\n').replace(/\n{3,}/g, '\n\n'));
console.log(`  runtime.yml: ${expanded.length} bloków [${expanded.join(', ')}], hash ${hash}`);
