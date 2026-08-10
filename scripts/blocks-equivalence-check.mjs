#!/usr/bin/env node
// Test równoważności F1 (TASK-BLOCKS-001, ADR 0008 D7):
// sklejenie bloków wg aliasu `nestjs-ddd` musi odtwarzać legacy
// _stack-defaults/nestjs-ddd.yml + presets/nestjs-ddd.yml.
// Raport na stdout; różnice do ręcznej klasyfikacji (zamierzona vs regresja).
// Ekstrakcja regexowa pod KONKRETNE pliki tego repo — nie ogólny parser YAML.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── ekstraktory ────────────────────────────────────────────────────────────
const stripComments = (src) =>
  src.split('\n').filter((l) => !l.trim().startsWith('#'));

// Lista wzorców "zawsze": sekcja `always_include:` (legacy) lub `always:` (blok)
function extractAlways(src) {
  const out = [];
  let inSec = false;
  for (const line of stripComments(src)) {
    if (/^\s*(always_include|always):\s*$/.test(line)) { inSec = true; continue; }
    if (inSec) {
      const m = line.match(/^\s+-\s+(\S+\.md)\s*$/);
      if (m) { out.push(m[1]); continue; }
      if (line.trim() !== '') inSec = false;
    }
  }
  return out;
}

// Triggery: grupy `- keywords: [..]` + wcięte pozycje `include:`
function extractTriggers(src) {
  const groups = [];
  let cur = null;
  for (const line of stripComments(src)) {
    const kw = line.match(/-\s*keywords:\s*\[([^\]]+)\]/);
    if (kw) {
      cur = { keywords: kw[1].split(',').map((s) => s.trim()), include: [] };
      groups.push(cur);
      continue;
    }
    if (cur) {
      const inc = line.match(/^\s+-\s+(\S+\.md)\s*$/);
      if (inc) { cur.include.push(inc[1]); continue; }
      if (/^\s*(always_include|always|overlay|analyze|orchestrate|env|name|requires):/.test(line)) cur = null;
    }
  }
  return groups;
}

// mapa keyword → Set(pattern) z listy grup
function keywordMap(groups) {
  const map = new Map();
  for (const g of groups)
    for (const k of g.keywords) {
      if (!map.has(k)) map.set(k, new Set());
      g.include.forEach((p) => map.get(k).add(p));
    }
  return map;
}

// linie inline `- { id: X, ..., agent: "Y" }` w danej sekcji
function extractInline(src, sectionRe, itemRe) {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => sectionRe.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^[a-z_]+:/.test(l)) break; // następna sekcja top-level
    if (l.trim().startsWith('#')) continue;
    const m = l.match(itemRe);
    if (m) out.push(m);
  }
  return out;
}

const inlineList = (src, key) => {
  const m = stripComments(src).join('\n').match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`));
  return m ? m[1].split(',').map((s) => s.trim()) : [];
};

// ── źródła ─────────────────────────────────────────────────────────────────
const legacySD = read('patterns/_stack-defaults/nestjs-ddd.yml');
const preset = read('presets/nestjs-ddd.yml');
const aliasSrc = read('blocks/_aliases.yml');

const aliases = {};
for (const m of aliasSrc.matchAll(/^\s{2}([\w/-]+):\s*\[([^\]]+)\]/gm))
  aliases[m[1]] = m[2].split(',').map((s) => s.trim());
const expand = (names) =>
  names.flatMap((n) => (aliases[n] ? expand(aliases[n]) : [n]));

const blockNames = expand(['nestjs-ddd']);
const blocks = blockNames.map((n) => {
  const p = `blocks/${n}.yml`;
  if (!existsSync(join(ROOT, p))) { console.error(`BRAK PLIKU BLOKU: ${p}`); process.exit(1); }
  return { name: n, src: read(p) };
});

// ── merge bloków ───────────────────────────────────────────────────────────
const mergedAlways = [...new Set(blocks.flatMap((b) => extractAlways(b.src)))];
const mergedTrig = keywordMap(blocks.flatMap((b) => extractTriggers(b.src)));
const mergedPanel = blocks.flatMap((b) =>
  extractInline(b.src, /^analyze:/, /agent:\s*"([^"]+)"/).map((m) => m[1]));
const mergedLayers = blocks.flatMap((b) =>
  extractInline(b.src, /^orchestrate:/, /\{\s*id:\s*(\w+).*?agent:\s*"([^"]+)"/).map((m) => `${m[1]}:${m[2]}`));
const mergedHooks = [...new Set(blocks.flatMap((b) => inlineList(b.src, 'hooks')))];
const mergedOverlayPatterns = [...new Set(blocks.flatMap((b) => inlineList(b.src, '  patterns')))].sort();
const mergedSrc = blocks.map((b) => b.src).join('\n');

// ── legacy ─────────────────────────────────────────────────────────────────
const legacyAlways = extractAlways(legacySD);
const legacyTrig = keywordMap(extractTriggers(legacySD));
const legacyPanel = extractInline(preset, /^phase_research:/, /agent:\s*"([^"]+)"/).map((m) => m[1]);
const legacyLayers = extractInline(preset, /^phase_implementation:/, /\{\s*id:\s*(\w+).*?agent:\s*"([^"]+)"/).map((m) => `${m[1]}:${m[2]}`);
const legacyHooks = inlineList(preset, 'hooks');
const legacyOverlayPatterns = inlineList(preset, '  patterns').sort();

const ENGINE_DEFAULTS = ['tech-lead']; // synteza = szkielet silnika, nie slot bloku

// ── porównania ─────────────────────────────────────────────────────────────
let diffs = 0;
const cmpSet = (label, a, b) => {
  const A = new Set(a), B = new Set(b);
  const onlyA = [...A].filter((x) => !B.has(x));
  const onlyB = [...B].filter((x) => !A.has(x));
  if (!onlyA.length && !onlyB.length) console.log(`✅ ${label}: identyczne (${A.size})`);
  else {
    diffs++;
    console.log(`⚠️  ${label}:`);
    onlyA.forEach((x) => console.log(`     tylko legacy : ${x}`));
    onlyB.forEach((x) => console.log(`     tylko bloki  : ${x}`));
  }
};

console.log(`Bloki po rozwinięciu aliasu nestjs-ddd: ${blockNames.join(', ')}\n`);
cmpSet('always-include', legacyAlways, mergedAlways);

// keyword → patterns
const allKeywords = new Set([...legacyTrig.keys(), ...mergedTrig.keys()]);
const trigDiffs = [];
for (const k of allKeywords) {
  const L = legacyTrig.get(k) ?? new Set();
  const M = mergedTrig.get(k) ?? new Set();
  const onlyL = [...L].filter((x) => !M.has(x));
  const onlyM = [...M].filter((x) => !L.has(x));
  if (onlyL.length || onlyM.length) trigDiffs.push({ k, onlyL, onlyM });
}
if (!trigDiffs.length) console.log(`✅ triggery: identyczne (${allKeywords.size} keywordów)`);
else {
  diffs++;
  console.log(`⚠️  triggery (${trigDiffs.length}/${allKeywords.size} keywordów się różni):`);
  for (const d of trigDiffs) {
    d.onlyL.forEach((p) => console.log(`     "${d.k}" w legacy ciągnął : ${p}`));
    d.onlyM.forEach((p) => console.log(`     "${d.k}" w blokach ciągnie: ${p}`));
  }
}

cmpSet('panel /analyze (bez engine-defaults)', legacyPanel.filter((a) => !ENGINE_DEFAULTS.includes(a)), mergedPanel);
cmpSet('warstwy /orchestrate', legacyLayers, mergedLayers);
cmpSet('hooki', legacyHooks, mergedHooks);
cmpSet('overlay.patterns', legacyOverlayPatterns, mergedOverlayPatterns);
cmpSet('env (klucze)', ['ECC_GATEGUARD', 'ECC_DISABLED_HOOKS', 'DELEGATION_MODE'],
  [...mergedSrc.matchAll(/^\s{2}([A-Z_]+):\s*"/gm)].map((m) => m[1]));

for (const flag of ['exit: PAUSE', 'exit: STAGE_NOT_COMMIT', 'security-e2e-verifier', 'max_attempts: 3'])
  console.log(`${mergedSrc.includes(flag) === preset.includes(flag) ? '✅' : (diffs++, '⚠️ ')} flaga "${flag}": ${mergedSrc.includes(flag) ? 'obecna' : 'BRAK'} w blokach`);

// walidacja ścieżek wzorców (wiszące odwołania — jawnie, nie cicho)
const allPaths = [...mergedAlways, ...[...mergedTrig.values()].flatMap((s) => [...s])];
const dangling = [...new Set(allPaths)].filter((p) => !existsSync(join(ROOT, 'patterns', p)));
if (dangling.length) { diffs++; dangling.forEach((p) => console.log(`⚠️  wisząca ścieżka: patterns/${p}`)); }
else console.log(`✅ ścieżki wzorców: wszystkie istnieją (${new Set(allPaths).size})`);

console.log(`\n${diffs === 0 ? 'RÓWNOWAŻNE' : `RÓŻNIC DO KLASYFIKACJI: ${diffs} (zamierzona vs regresja — decyzja człowieka)`}`);
