#!/usr/bin/env node
// Walidator formatu wzorców: node scripts/lint-patterns.mjs [--strict]
//
// Po co: CLAUDE.md wymaga od wzorca nagłówka (`**Layer**`, `**Status**`) i sekcji
// „When to Use" z bulletami ✅/❌, ale pomiar z 2026-08-11 pokazał `**Layer**`
// w 38 plikach na 97. Wymóg bez walidatora nie działa — a nowy setup bloków
// opiera dobór wzorców właśnie na tych metadanych.
//
// Dwa poziomy zgłoszeń:
//   BŁĄD (exit 1 przy --strict) — psuje działanie: wzorzec z półki `always` bez
//     karty reguł, wzorzec deklarowany przez blok, którego nie ma na dysku.
//   UWAGA — dług do nadrobienia: brak `**Layer**`/`**Status**`/„When to Use".
//
// Półkę `always` czytamy z bloków, nie z listy w tym pliku: to blok decyduje,
// co wchodzi do 100% tasków, więc on wyznacza, które wzorce muszą być tanie.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

let YAML;
try { YAML = (await import('yaml')).default; }
catch { console.error('BŁĄD: brak paczki "yaml" — odpal `npm ci`.'); process.exit(1); }

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');
// Wzorce projektowe walidujemy przeciw sumie słowników: rdzeń + rozszerzenie projektu.
const PROJECT_DIR = (() => {
  const i = process.argv.indexOf('--project');
  return i > -1 ? process.argv[i + 1] : null;
})();
const PATTERNS = join(REPO, 'patterns');
const BLOCKS = join(REPO, 'blocks');

// Karta reguł z półki `always` wchodzi do KAŻDEGO prompta — powyżej tego rozmiaru
// przestaje być tanim streszczeniem i robi się drugim wzorcem.
const CARD_SIZE_LIMIT_KB = 8;

const walk = (dir, base = '') => readdirSync(dir).flatMap((e) => {
  const rel = base ? posix.join(base, e) : e;
  return statSync(join(dir, e)).isDirectory() ? walk(join(dir, e), rel) : [rel];
});

const allFiles = walk(PATTERNS);
const patternFiles = allFiles
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !/_summary\.md$/.test(f) && !/README\.md$/i.test(f) && !/METADATA/.test(f));

// ── co deklarują bloki ────────────────────────────────────────────────────
const blockFiles = walk(BLOCKS).filter((f) => f.endsWith('.yml') && !f.split('/').pop().startsWith('_'));
const always = new Map();      // ścieżka → [bloki]
const triggered = new Map();
for (const bf of blockFiles) {
  const doc = YAML.parse(readFileSync(join(BLOCKS, bf), 'utf8')) ?? {};
  const name = doc.name ?? bf.replace(/\.yml$/, '');
  for (const p of doc.patterns?.always ?? []) always.set(p, [...(always.get(p) ?? []), name]);
  for (const g of doc.patterns?.triggers ?? [])
    for (const p of g.include ?? []) triggered.set(p, [...(triggered.get(p) ?? []), name]);
}

const errors = [], warnings = [];

// ── taksonomia tagów (blocks/_taxonomy.yml) ───────────────────────────────
const taxPath = join(BLOCKS, '_taxonomy.yml');
const tax = existsSync(taxPath) ? (YAML.parse(readFileSync(taxPath, 'utf8')) ?? {}) : {};
const projTaxPath = PROJECT_DIR ? join(PROJECT_DIR, '.claude/config/taxonomy.yml') : null;
const projTax = projTaxPath && existsSync(projTaxPath)
  ? (YAML.parse(readFileSync(projTaxPath, 'utf8')) ?? {}) : {};
for (const key of ['stacks', 'areas'])
  for (const v of projTax[key] ?? [])
    if ((tax[key] ?? []).includes(v))
      warnings.push(`${projTaxPath}: "${v}" jest już w rdzeniu — rozszerzenie ma tylko DODAWAĆ`);
const STACKS = new Set([...(tax.stacks ?? []), ...(projTax.stacks ?? [])]);
const AREAS = new Set([...(tax.areas ?? []), ...(projTax.areas ?? [])]);
const seenVariants = new Set([
  ...Object.values(tax.variants_seen ?? {}).flat(),
  ...Object.values(projTax.variants_seen ?? {}).flat(),
]);
const newVariants = new Set();

function checkTag(tag, where) {
  const parts = tag.split(':');
  if (parts.length < 2 || parts.length > 3)
    return errors.push(`${where}: tag "${tag}" — format to <stack>:<obszar>[:<wariant>]`);
  const [stack, area, variant] = parts;
  if (!STACKS.has(stack)) errors.push(`${where}: tag "${tag}" — nieznany stack "${stack}" (dozwolone: ${[...STACKS].join(', ')})`);
  if (!AREAS.has(area)) errors.push(`${where}: tag "${tag}" — nieznany obszar "${area}"; dopisz go do blocks/_taxonomy.yml, jeśli naprawdę brakuje`);
  if (variant) {
    if (!/^[a-z0-9-]+$/.test(variant)) errors.push(`${where}: tag "${tag}" — wariant musi być kebab-case`);
    else if (!seenVariants.has(variant)) newVariants.add(`${variant} (${where})`);
  }
}

// ── wzorce deklarowane przez bloki, których nie ma ────────────────────────
for (const [p, blocks] of [...always, ...triggered])
  if (!existsSync(join(PATTERNS, p)))
    errors.push(`wisząca ścieżka: ${p} ← blok ${blocks.join(', ')}`);

// ── półka always musi być tania ───────────────────────────────────────────
for (const [p, blocks] of always) {
  const abs = join(PATTERNS, p);
  if (!existsSync(abs)) continue;
  const card = p.replace(/\.md$/, '_summary.md');
  const kb = Math.round(statSync(abs).size / 1024);
  const cardAbs = join(PATTERNS, card);
  if (!existsSync(cardAbs)) {
    errors.push(`brak karty reguł: ${card} — wzorzec wchodzi do KAŻDEGO taska (blok ${blocks.join(', ')}, ${kb} KB)`);
  } else {
    // Gdy karta istnieje, to ONA jest tym, co realnie wchodzi do promptów — rozmiar
    // pełnego wzorca przestaje być kosztem. Pilnujemy więc rozmiaru karty, nie wzorca.
    const cardKb = Math.round(statSync(cardAbs).size / 1024);
    if (cardKb > CARD_SIZE_LIMIT_KB)
      warnings.push(`${card}: ${cardKb} KB — karta reguł z półki always powinna być zwięzła (limit ~${CARD_SIZE_LIMIT_KB} KB)`);
  }
}

// ── metadane i sekcje wymagane przez CLAUDE.md ────────────────────────────
for (const f of patternFiles) {
  const src = readFileSync(join(PATTERNS, f), 'utf8');
  const miss = [];
  if (!/^\*\*Layer\*\*/m.test(src)) miss.push('**Layer**');
  if (!/^\*\*Status\*\*/m.test(src)) miss.push('**Status**');
  if (!/##\s*When to Use/i.test(src)) miss.push('## When to Use');
  else if (!/✅/.test(src) || !/❌/.test(src)) miss.push('bullety ✅/❌');
  if (miss.length) warnings.push(`${f}: brak ${miss.join(', ')}`);

  // `**Assumes**` deklaruje zależność pojęciową wzorca („zakłada model domenowy").
  // Nie zgadujemy jej z treści — sprawdzamy tylko, czy zadeklarowany blok istnieje.
  // `**Tags**` to jedyne, po czym `retrieve_patterns` potrafi zawęzić dobór tematycznie.
  // Brak tagów niczego nie wysypie — wzorzec po prostu wypada z każdego filtra i wraca
  // wyłącznie przez podobieństwo embeddingów. Stąd UWAGA, nie BŁĄD, ale zgłaszana:
  // bez niej nowy nieotagowany wzorzec jest niewidoczny także dla autora.
  const tagLine = src.match(/^\*\*Tags\*\*:\s*(.+)$/m);
  if (!tagLine) warnings.push(`${f}: brak **Tags** — wzorzec wypada z filtrowania po tematach`);
  else
    for (const t of tagLine[1].replace(/<!--[\s\S]*?-->/g, '').split(',').map((x) => x.trim().replace(/[`*"']/g, '')))
      if (t) checkTag(t, f);

  // Karta reguł jest tym, co realnie wchodzi do promptów. Gdy ma inne tagi niż wzorzec,
  // filtr tematyczny wpuszcza jedno, a odrzuca drugie — rozjazd rejestru w czystej
  // postaci (patterns/cross-layer/registry-drift-guard-pattern.md).
  const cardPath = join(PATTERNS, f.replace(/\.md$/, '_summary.md'));
  if (existsSync(cardPath)) {
    const cardTags = readFileSync(cardPath, 'utf8').match(/^\*\*Tags\*\*:\s*(.+)$/m)?.[1]?.trim();
    if (cardTags !== tagLine?.[1]?.trim())
      errors.push(`${f}: karta reguł ma inne **Tags** niż wzorzec — filtr tematyczny wpuści tylko jedno z nich`);
  }

  const assumes = src.match(/^\*\*Assumes\*\*:\s*(.+)$/m);
  if (assumes)
    for (const dep of assumes[1].replace(/<!--[\s\S]*?-->/g, '').split(',').map((s) => s.trim().replace(/[`*]/g, '')))
      if (dep && !existsSync(join(BLOCKS, `${dep}.yml`)))
        errors.push(`${f}: **Assumes**: ${dep} — nie ma takiego bloku`);
}

const report = (label, items) => {
  if (!items.length) return;
  console.error(`\n${label} (${items.length}):`);
  for (const i of items) console.error(`  ${i}`);
};

console.log(`wzorców: ${patternFiles.length}` +
  `, kart reguł: ${allFiles.filter((f) => f.endsWith('_summary.md')).length}` +
  `, na półce always: ${always.size}`);
if (newVariants.size)
  console.error(`\nNOWE WARIANTY (poziom 3 jest otwarty — dopisz do variants_seen, jeśli mają zostać):\n  ` +
    [...newVariants].join('\n  '));
report('BŁĘDY', errors);
report('UWAGI', warnings);
if (!errors.length && !warnings.length) console.log('bez zastrzeżeń');
process.exit(STRICT && errors.length ? 1 : 0);
