#!/usr/bin/env node
// scripts/context-bill.mjs — rachunek kontekstu stałego + ratchet (TASK-GSTACK-ADOPT-001, A4).
//
// Dlaczego: 91% rachunku za pracę agentów to cache read/write, czyli kontekst, a nie "praca".
// Kontekst stały rośnie po cichu — każdy nowy agent/skill/komenda dokłada swój opis do KATALOGU,
// który siedzi w kontekście każdej sesji. Ten skrypt pokazuje, który plik podnosi koszt stały,
// zanim trafi do main (wzorzec: gstack — bin/gstack-context-bill, catalog-budget, context-budget-ratchet).
//
// Dwie kategorie kosztu per element repo:
//   1. KATALOG (stały)    — bajty frontmatter `name` + `description` agenta (agents/**/*.md bez README),
//                           skilla (skills/**/SKILL.md) i komendy (commands/*.md bez README). To jest
//                           to, co klient trzyma w kontekście ZAWSZE, niezależnie czy element zostanie użyty.
//   2. WYWOŁANIE (ciało)  — bajty pliku po frontmatterze; ładowane dopiero po użyciu elementu.
//                           Pliki pomocnicze skilla (references/, scripts/) NIE wchodzą do rachunku —
//                           czytane są selektywnie, nie z automatu.
// Przybliżenie tokenów = bajty / 4 (heurystyka, nie tokenizer; do porównań względnych, nie do faktur).
//
// Użycie:
//   node scripts/context-bill.mjs                 — raport: sumy per kategoria + top N (domyślnie 10)
//   node scripts/context-bill.mjs --top 25        — dłuższy ranking
//   node scripts/context-bill.mjs --json          — raport maszynowy (pełna lista elementów)
//   node scripts/context-bill.mjs --check         — porównanie z sufitami; exit 1 przy błędzie
//   node scripts/context-bill.mjs --capture       — zapisz nowy baseline sufitów
//   (opcjonalnie: --root <katalog> repo do zmierzenia, --ceilings <plik> fixture sufitów — dla evali)
//
// RATCHET (--check):
//   * nowy element bez sufitu w fixture      → BŁĄD
//   * katalog lub ciało ponad sufitem        → BŁĄD
//   * suma katalogu ponad sufitem sumarycznym → BŁĄD
//   * element usunięty z repo, wciąż w fixture → OSTRZEŻENIE (nie blokuje; --capture sprząta)
//
// LEGALNY WZROST: dodajesz agenta/skill/komendę albo świadomie rozbudowujesz opis? Uruchom
//   node scripts/context-bill.mjs --capture
// i zacommituj tests/flow-evals/context-budget/ceilings.json W TYM SAMYM COMMICIE co zmianę.
// Diff fixture w review to dokładnie ten rachunek, który właściciel ma zobaczyć i zatwierdzić.
// Sufit = bieżący stan + 5% (zaokrąglone w górę) — margines na drobne poprawki bez przechwytywania.
//
// Pomiar jest deterministyczny (sortowanie po ścieżce, porównanie bajtowe) i trwa dziesiątki ms.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(REPO, 'package.json'));
const YAML = require('yaml');

const MARGIN_PCT = 5;
const DEFAULT_TOP = 10;
const BYTES_PER_TOKEN = 4;
const CEILINGS_REL = join('tests', 'flow-evals', 'context-budget', 'ceilings.json');
const CAPTURE_HINT = 'node scripts/context-bill.mjs --capture  (i zacommituj ceilings.json w tym samym commicie co zmiana)';

// ── argumenty ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { mode: 'report', json: false, top: DEFAULT_TOP, root: REPO, ceilings: null };
  const modes = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--check') modes.push('check');
    else if (a === '--capture') modes.push('capture');
    else if (a === '--top' || a === '--root' || a === '--ceilings') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} wymaga wartości`);
      if (a === '--top') {
        opts.top = Number(v);
        if (!Number.isInteger(opts.top) || opts.top < 1) throw new Error('--top wymaga liczby całkowitej >= 1');
      } else if (a === '--root') opts.root = v;
      else opts.ceilings = v;
    } else throw new Error(`nieznany argument: ${a}`);
  }
  if (modes.length > 1) throw new Error('--check i --capture wykluczają się');
  if (modes.length === 1) opts.mode = modes[0];
  if (!opts.ceilings) opts.ceilings = join(opts.root, CEILINGS_REL);
  return opts;
}

// ── pomiar ───────────────────────────────────────────────────────────────────

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // bajtowo, niezależnie od locale
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const tokens = (n) => Math.ceil(n / BYTES_PER_TOKEN);

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, pred, acc);
    else if (pred(entry.name)) acc.push(full);
  }
  return acc;
}

function listFiles(root) {
  const md = (n) => n.endsWith('.md') && n !== 'README.md';
  const commandsDir = join(root, 'commands');
  const commands = existsSync(commandsDir)
    ? readdirSync(commandsDir, { withFileTypes: true }).filter((e) => e.isFile() && md(e.name)).map((e) => join(commandsDir, e.name))
    : [];
  return [
    ...walk(join(root, 'agents'), md).map((f) => ({ kind: 'agent', file: f })),
    ...walk(join(root, 'skills'), (n) => n === 'SKILL.md').map((f) => ({ kind: 'skill', file: f })),
    ...commands.map((f) => ({ kind: 'command', file: f })),
  ];
}

// Zwraca { catalog, body } w bajtach albo rzuca błąd z nazwą pliku (nie połykamy złych frontmatterów).
function measureFile(file) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) throw new Error('brak frontmattera (--- … ---)');
  let fm;
  try {
    fm = YAML.parse(m[1]);
  } catch (e) {
    throw new Error(`frontmatter nie jest poprawnym YAML: ${String(e.message).split('\n')[0]}`);
  }
  if (!fm || typeof fm.name !== 'string' || typeof fm.description !== 'string') {
    throw new Error('frontmatter bez tekstowych pól `name` i `description`');
  }
  return {
    catalog: bytes(fm.name.trim()) + bytes(fm.description.trim()),
    body: bytes(src.slice(m[0].length)),
  };
}

function measure(root) {
  const items = [];
  const errors = [];
  for (const { kind, file } of listFiles(root)) {
    const path = relative(root, file).split(sep).join('/');
    try {
      items.push({ path, kind, ...measureFile(file) });
    } catch (e) {
      errors.push(`${path}: ${e.message}`);
    }
  }
  items.sort((a, b) => cmp(a.path, b.path));
  errors.sort(cmp);
  return { items, errors };
}

// ── agregaty i raport ────────────────────────────────────────────────────────

const KINDS = ['agent', 'skill', 'command'];

function summarize(items) {
  const per = {};
  for (const k of KINDS) per[k] = { count: 0, catalog: 0, body: 0 };
  for (const it of items) {
    per[it.kind].count++;
    per[it.kind].catalog += it.catalog;
    per[it.kind].body += it.body;
  }
  const total = { count: items.length, catalog: 0, body: 0 };
  for (const k of KINDS) { total.catalog += per[k].catalog; total.body += per[k].body; }
  return { per, total };
}

// ranking: malejąco po wartości, remis rozstrzyga ścieżka (determinizm)
const top = (items, field, n) => [...items].sort((a, b) => b[field] - a[field] || cmp(a.path, b.path)).slice(0, n);

function fmtRow(label, b) {
  return `${String(b).padStart(8)} B  ~${String(tokens(b)).padStart(6)} tok  ${label}`;
}

function printReport({ items, errors }, topN) {
  const { per, total } = summarize(items);
  console.log('Rachunek kontekstu (tokeny ~ bajty/4 — przybliżenie, nie tokenizer)');
  console.log('KATALOG = name+description, w kontekście ZAWSZE | WYWOŁANIE = ciało pliku, po użyciu\n');
  console.log('Sumy per kategoria:');
  console.log(`  ${'kategoria'.padEnd(9)} ${'szt.'.padStart(5)} ${'katalog B'.padStart(10)} ${'~tok'.padStart(7)} ${'ciało B'.padStart(10)} ${'~tok'.padStart(8)}`);
  for (const k of KINDS) {
    const s = per[k];
    console.log(`  ${k.padEnd(9)} ${String(s.count).padStart(5)} ${String(s.catalog).padStart(10)} ${String(tokens(s.catalog)).padStart(7)} ${String(s.body).padStart(10)} ${String(tokens(s.body)).padStart(8)}`);
  }
  console.log(`  ${'RAZEM'.padEnd(9)} ${String(total.count).padStart(5)} ${String(total.catalog).padStart(10)} ${String(tokens(total.catalog)).padStart(7)} ${String(total.body).padStart(10)} ${String(tokens(total.body)).padStart(8)}`);
  console.log(`\nTOP ${topN} wg KATALOGU (koszt stały — płacony w każdej sesji):`);
  for (const it of top(items, 'catalog', topN)) console.log('  ' + fmtRow(`${it.path} [${it.kind}]`, it.catalog));
  console.log(`\nTOP ${topN} wg WYWOŁANIA (ciało — płacone po użyciu):`);
  for (const it of top(items, 'body', topN)) console.log('  ' + fmtRow(`${it.path} [${it.kind}]`, it.body));
  if (errors.length) {
    console.log(`\nPominięte (${errors.length}) — nie da się zmierzyć:`);
    for (const e of errors) console.log(`  ${e}`);
  }
}

// ── sufity ───────────────────────────────────────────────────────────────────

const withMargin = (n) => Math.ceil((n * (100 + MARGIN_PCT)) / 100);

function buildCeilings(items) {
  const { total } = summarize(items);
  const out = {
    _comment: `Sufity kontekstu (bajty) = stan z przechwycenia + ${MARGIN_PCT}%. Generowane: node scripts/context-bill.mjs --capture. Legalny wzrost = przechwycenie w tym samym commicie co zmiana. Nie edytuj ręcznie.`,
    schema: 1,
    margin_pct: MARGIN_PCT,
    totals: { catalog_bytes: withMargin(total.catalog) },
    items: {},
  };
  for (const it of items) out.items[it.path] = { catalog_bytes: withMargin(it.catalog), body_bytes: withMargin(it.body) };
  return out;
}

// jeden element na linię — diff fixture w review czyta się jak rachunek
function serializeCeilings(c) {
  const lines = Object.entries(c.items).map(([p, v]) => `    ${JSON.stringify(p)}: ${JSON.stringify(v)}`);
  return [
    '{',
    `  "_comment": ${JSON.stringify(c._comment)},`,
    `  "schema": ${c.schema},`,
    `  "margin_pct": ${c.margin_pct},`,
    `  "totals": ${JSON.stringify(c.totals)},`,
    '  "items": {',
    lines.join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
}

function loadCeilings(file) {
  if (!existsSync(file)) {
    throw new Error(`brak fixture sufitów: ${file}\n  Napraw: ${CAPTURE_HINT}`);
  }
  let c;
  try {
    c = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`fixture sufitów nie jest poprawnym JSON (${file}): ${e.message}\n  Napraw: ${CAPTURE_HINT}`);
  }
  if (c?.schema !== 1 || typeof c.items !== 'object' || c.items === null || typeof c.totals?.catalog_bytes !== 'number') {
    throw new Error(`fixture sufitów ma nieoczekiwany kształt (${file}; wymagane: schema=1, totals.catalog_bytes, items)\n  Napraw: ${CAPTURE_HINT}`);
  }
  return c;
}

function checkAgainst({ items }, ceilings) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  for (const it of items) {
    seen.add(it.path);
    const c = ceilings.items[it.path];
    if (!c) {
      errors.push(`NOWY element bez sufitu: ${it.path} [${it.kind}] (katalog ${it.catalog} B, ciało ${it.body} B)`);
      continue;
    }
    if (it.catalog > c.catalog_bytes) {
      errors.push(`KATALOG ponad sufitem: ${it.path} — ${it.catalog} B > ${c.catalog_bytes} B (+${it.catalog - c.catalog_bytes} B ≈ ${tokens(it.catalog - c.catalog_bytes)} tok w KAŻDEJ sesji)`);
    }
    if (it.body > c.body_bytes) {
      errors.push(`CIAŁO ponad sufitem: ${it.path} — ${it.body} B > ${c.body_bytes} B (+${it.body - c.body_bytes} B ≈ ${tokens(it.body - c.body_bytes)} tok przy każdym wywołaniu)`);
    }
  }
  for (const p of Object.keys(ceilings.items).sort(cmp)) {
    if (!seen.has(p)) warnings.push(`element usunięty z repo, wciąż w fixture: ${p} (sprząta go --capture)`);
  }
  const { total } = summarize(items);
  if (total.catalog > ceilings.totals.catalog_bytes) {
    errors.push(`SUMA katalogu ponad sufitem: ${total.catalog} B > ${ceilings.totals.catalog_bytes} B (+${total.catalog - ceilings.totals.catalog_bytes} B ≈ ${tokens(total.catalog - ceilings.totals.catalog_bytes)} tok w każdej sesji)`);
  }
  return { errors, warnings, total };
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`context-bill: ${e.message}`);
    process.exit(2);
  }

  const measured = measure(opts.root);

  if (opts.mode === 'report') {
    if (opts.json) {
      const { per, total } = summarize(measured.items);
      console.log(JSON.stringify({
        tokens_approx: `bytes/${BYTES_PER_TOKEN}`,
        totals: total,
        per_kind: per,
        top_catalog: top(measured.items, 'catalog', opts.top),
        top_body: top(measured.items, 'body', opts.top),
        items: measured.items,
        unmeasurable: measured.errors,
      }, null, 2));
    } else {
      printReport(measured, opts.top);
    }
    process.exit(measured.errors.length ? 1 : 0);
  }

  // --check i --capture wymagają kompletnego pomiaru: pominięty plik = dziura w ratchecie
  if (measured.errors.length) {
    console.error('context-bill: nie da się zmierzyć wszystkich elementów (popraw frontmatter):');
    for (const e of measured.errors) console.error(`  ${e}`);
    process.exit(1);
  }

  if (opts.mode === 'capture') {
    const next = buildCeilings(measured.items);
    mkdirSync(dirname(opts.ceilings), { recursive: true });
    writeFileSync(opts.ceilings, serializeCeilings(next));
    console.log(`context-bill: zapisano baseline (${measured.items.length} elementów, katalog razem ${summarize(measured.items).total.catalog} B, sufit sumaryczny ${next.totals.catalog_bytes} B, margines ${MARGIN_PCT}%)`);
    console.log(`  ${relative(opts.root, opts.ceilings).split(sep).join('/')} — dodaj do TEGO SAMEGO commitu co zmiana, która podniosła koszt.`);
    process.exit(0);
  }

  // --check
  let ceilings;
  try {
    ceilings = loadCeilings(opts.ceilings);
  } catch (e) {
    console.error(`context-bill --check: ${e.message}`);
    process.exit(1);
  }
  const { errors, warnings, total } = checkAgainst(measured, ceilings);
  for (const w of warnings) console.warn(`  ostrzeżenie: ${w}`);
  if (errors.length) {
    console.error(`context-bill --check: ${errors.length} naruszeń sufitów kontekstu stałego:`);
    for (const e of errors) console.error(`  ${e}`);
    console.error('\nCo zrobić: (1) skróć opis/ciało albo (2) jeśli wzrost jest zamierzony, przechwyć baseline:');
    console.error(`  ${CAPTURE_HINT}`);
    console.error('Podgląd, co kosztuje najwięcej: node scripts/context-bill.mjs');
    process.exit(1);
  }
  console.log(`context-bill --check OK: ${measured.items.length} elementów, katalog ${total.catalog} B (~${tokens(total.catalog)} tok) w sufitach${warnings.length ? `, ${warnings.length} ostrzeżeń` : ''}`);
}

main();
