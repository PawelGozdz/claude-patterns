#!/usr/bin/env node
// scripts/sync-fragments.mjs — wspólne fragmenty tekstu wstrzykiwane do promptów (TASK-GSTACK-ADOPT-001, B4).
//
// PO CO: ten sam blok reguł (np. kernel dowodowy) musi stać w kilkunastu agentach. Subagent nie
// rozwiązuje include'ów — widzi tylko swój plik — więc tekst musi być wstrzyknięty INLINE. Ręczne
// kopie rozjeżdżają się po pierwszej poprawce, dlatego źródłem prawdy jest jeden plik fragmentu,
// a konsument ma tylko marker; treść między markerami jest w całości generowana.
//
// Źródło: templates/fragments/<nazwa>.md. NIE agents/shared/: `validate-agents.js` przechodzi
// całe drzewo agents/ rekurencyjnie i traktowałby każdy plik .md jako agenta (brak frontmattera
// = błąd), a agents/shared/ ma własną konwencję (agenci współdzieleni przez stacki).
//
// Marker konsumenta (każdy w OSOBNEJ linii, POD frontmatterem, poza blokami ``` ):
//   <!-- fragment:evidence-kernel START -->
//   …treść generowana — nie edytuj ręcznie…
//   <!-- fragment:evidence-kernel END -->
//
// Skanowane katalogi: agents/, commands/, skills/ (tylko prawdziwe pliki .md; symlinki pomijane,
// żeby plik współdzielony przez symlink nie był przetwarzany dwa razy).
//
// Błędy walidacji (exit 1 w obu trybach, nic nie jest zapisywane): nieznany fragment, niedomknięty
// albo zagnieżdżony marker, END bez START, powtórzony fragment w pliku, marker w pliku bez
// frontmattera / przed nim / wewnątrz niego, marker o złej składni, marker w samym fragmencie.
//
// Użycie:
//   node scripts/sync-fragments.mjs --check            — exit 1, gdy któryś plik ma nieaktualny fragment
//   node scripts/sync-fragments.mjs --apply            — przepisuje nieaktualne bloki
//   node scripts/sync-fragments.mjs --check --root <dir>  — inny korzeń repo (evale na fixture'ach)

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFrontmatterBlock } from './lib/frontmatter.mjs';

const SCAN_DIRS = ['agents', 'commands', 'skills'];
const FRAGMENTS_DIR = join('templates', 'fragments');
const NAME_RE = /[a-z0-9][a-z0-9-]*/;
const MARKER_STRICT = new RegExp(`^<!-- fragment:(${NAME_RE.source}) (START|END) -->$`);
const MARKER_PREFIX = /^\s*<!--\s*fragment:/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

function parseArgs(argv) {
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx !== -1
    ? argv[rootIdx + 1]
    : join(dirname(fileURLToPath(import.meta.url)), '..');
  return { check: argv.includes('--check'), apply: argv.includes('--apply'), root, rootGiven: rootIdx !== -1 };
}

function walkMarkdown(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

/** Wczytuje fragmenty; zwraca { fragments: Map<nazwa, tekst>, errors }. */
function loadFragments(root) {
  const dir = join(root, FRAGMENTS_DIR);
  const fragments = new Map();
  const errors = [];
  if (!existsSync(dir)) return { fragments, errors };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3);
    const where = relative(root, join(dir, entry.name));
    if (!new RegExp(`^${NAME_RE.source}$`).test(name)) {
      errors.push(`${where} — nazwa fragmentu musi pasować do ${NAME_RE.source} (małe litery, cyfry, myślniki)`);
      continue;
    }
    const body = readFileSync(join(dir, entry.name), 'utf8')
      .replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
    if (!body) { errors.push(`${where} — fragment jest pusty`); continue; }
    const lines = body.split('\n');
    const bad = lines.findIndex((l) => MARKER_PREFIX.test(l));
    if (bad !== -1) {
      errors.push(`${where}:${bad + 1} — fragment nie może zawierać markerów fragmentów (rekurencja)`);
      continue;
    }
    fragments.set(name, body);
  }
  return { fragments, errors };
}

/**
 * Przetwarza jeden plik. Zwraca { errors, next, injected } — `next` to treść po wstrzyknięciu
 * (równa wejściu, gdy nic się nie zmienia), `injected` to liczba bloków w pliku.
 */
function processFile(content, where, fragments) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const errors = [];
  const fail = (idx, msg) => errors.push(`${where}:${idx + 1} — ${msg}`);

  const fm = extractFrontmatterBlock(content);
  const fmEndIdx = fm ? fm.endLine - 1 : -1; // indeks (0-based) zamykającego `---`

  const out = [];
  const seen = new Set();
  let fence = null; // otwarte ogrodzenie bloku kodu: ciąg ``` lub ~~~ (zamyka je tylko ogrodzenie tego samego znaku, co najmniej tak długie)
  let open = null; // { name, startIdx }
  let injected = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (open) {
      // W bloku generowanym szukamy wyłącznie własnego END; cokolwiek innego z prefiksem markera to błąd.
      if (MARKER_PREFIX.test(line)) {
        const m = line.match(MARKER_STRICT);
        if (m && m[1] === open.name && m[2] === 'END') {
          out.push(...fragments.get(open.name).split('\n'), line);
          open = null;
        } else {
          fail(i, `wewnątrz bloku fragmentu "${open.name}" (START w linii ${open.startIdx + 1}) napotkano ` +
            `${m ? `marker ${m[2]} "${m[1]}"` : 'zniekształcony marker'} — brakuje END dla "${open.name}"`);
          out.push(line);
        }
      }
      continue; // stara treść bloku jest odrzucana (zastępuje ją fragment)
    }

    const fenceHit = line.match(FENCE_RE);
    if (fenceHit) {
      if (!fence) fence = fenceHit[1];
      else if (fenceHit[1][0] === fence[0] && fenceHit[1].length >= fence.length && line.trim() === fenceHit[1]) fence = null;
    }
    if (fence || !MARKER_PREFIX.test(line)) { out.push(line); continue; }

    const m = line.match(MARKER_STRICT);
    if (!m) {
      fail(i, `zniekształcony marker fragmentu: oczekiwano \`<!-- fragment:<nazwa> START -->\` albo \`… END -->\` ` +
        `w osobnej linii, jest: ${line.trim().slice(0, 80)}`);
      out.push(line);
      continue;
    }
    const [, name, kind] = m;

    if (!fm) {
      fail(i, `marker fragmentu "${name}" w pliku bez frontmattera (albo przed nim) — marker ma stać POD frontmatterem`);
      out.push(line);
      continue;
    }
    if (i <= fmEndIdx) {
      fail(i, `marker fragmentu "${name}" wewnątrz frontmattera — przenieś go pod zamykające \`---\``);
      out.push(line);
      continue;
    }
    if (kind === 'END') {
      fail(i, `marker END fragmentu "${name}" bez wcześniejszego START`);
      out.push(line);
      continue;
    }
    if (!fragments.has(name)) {
      const known = [...fragments.keys()].join(', ') || '(brak plików w templates/fragments/)';
      fail(i, `nieznany fragment "${name}" — znane: ${known}`);
      out.push(line);
      continue;
    }
    if (seen.has(name)) {
      fail(i, `fragment "${name}" wstrzyknięty w tym pliku drugi raz`);
      out.push(line);
      continue;
    }
    seen.add(name);
    injected++;
    out.push(line);
    open = { name, startIdx: i };
  }

  if (open) fail(open.startIdx, `niedomknięty marker fragmentu "${open.name}" — brak \`<!-- fragment:${open.name} END -->\``);

  return { errors, next: out.join(eol), injected };
}

function main() {
  const { check, apply, root, rootGiven } = parseArgs(process.argv.slice(2));
  if (check === apply) {
    console.error('Użycie: node scripts/sync-fragments.mjs (--check | --apply) [--root <dir>]');
    process.exit(2);
  }
  // `--root --check` brał `--check` za ścieżkę, a nieistniejący katalog dawał zielone „0 bloków" — bramka, która nic nie sprawdza.
  if (rootGiven && (!root || root.startsWith('--') || !existsSync(root))) {
    console.error(`sync-fragments: --root wymaga istniejącego katalogu (podano: ${root ?? '(nic)'})`);
    process.exit(2);
  }

  const { fragments, errors } = loadFragments(root);
  const stale = [];
  const changes = [];
  let blocks = 0;
  let files = 0;

  const targets = SCAN_DIRS.flatMap((d) => walkMarkdown(join(root, d)));
  for (const file of targets) {
    const content = readFileSync(file, 'utf8');
    if (!content.includes('fragment:')) continue; // szybkie odsiewanie: większość plików nie ma markerów
    const where = relative(root, file);
    const res = processFile(content, where, fragments);
    errors.push(...res.errors);
    if (!res.injected && !res.errors.length) continue;
    files++;
    blocks += res.injected;
    if (res.next !== content && !res.errors.length) {
      stale.push(where);
      changes.push({ file, next: res.next });
    }
  }

  if (errors.length) {
    console.error('sync-fragments: BŁĄD — popraw markery (nic nie zapisano):');
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  if (apply) {
    for (const { file, next } of changes) writeFileSync(file, next);
    console.log(`sync-fragments: zaktualizowano ${changes.length} plików (${blocks} bloków w ${files} plikach, ` +
      `${fragments.size} fragmentów)`);
    return;
  }

  if (stale.length) {
    console.error(`sync-fragments: ${stale.length} plików ma nieaktualny wstrzyknięty fragment:`);
    for (const f of stale) console.error(`  ${f}`);
    console.error('Napraw: node scripts/sync-fragments.mjs --apply (źródło prawdy: templates/fragments/<nazwa>.md; ' +
      'nie edytuj treści między markerami ręcznie).');
    process.exit(1);
  }
  console.log(`sync-fragments: OK (${fragments.size} fragmentów, ${blocks} bloków w ${files} plikach)`);
}

main();
