#!/usr/bin/env node
// Strażnik świeżości RAG: node scripts/rag-freshness.mjs [--record]
//
// Po co: `retrieve_patterns` czyta kolekcje `patterns_global` / `library_reference_global`
// w dedykowanym Qdrancie, a te powstają wyłącznie z ręcznego `./scripts/reseed-patterns.sh`.
// Nic tego nie pilnowało — `grep -rl reseed-patterns hooks/ scripts/ci/` nie dawał ani
// jednego trafienia. CLAUDE.md napisało o tym „Easy to forget" i na tym się kończyło.
//
// Incydent 2026-08-16: karta reguł geo dostała na dysku GEO18 i GEO19 (ACL kontra
// projekcja per-kontekst, JSONB bez GiST), a w kolekcji siedziała wersja z GEO17.
// Karta reguł to dokładnie ten plik, który wjeżdża do promptu implementera — więc
// agent dostawał wskazówki sprzed poprawki i nic nie mogło mu tego zasygnalizować.
//
// Ten skrypt liczy hash każdego pliku wchodzącego do kolekcji i porównuje ze stanem
// zapisanym przy ostatnim reseedzie. Wypisuje KONKRETNE pliki, nie samo „rozjazd" —
// bo pierwsze pytanie po alarmie brzmi „co dokładnie jest nieświeże".
//
// Stan trzymamy lokalnie (.rag-seed-state.json, w .gitignore): Qdrant stoi na maszynie
// dewelopera, więc świeżość jest własnością tej maszyny, nie repozytorium. Brak pliku
// stanu = kolekcje nigdy nie były zasiane z tego klona i tak to raportujemy.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_PATH = join(REPO, '.rag-seed-state.json');
const RECORD = process.argv.includes('--record');

// Te same drzewa, które indeksuje reseed-patterns.sh. Rozjazd tej listy z indekserem
// dałby strażnika pilnującego czegoś innego niż to, co realnie ląduje w kolekcjach.
const INDEXED_TREES = ['patterns', 'rules'];

const walk = (dir, base = '') => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    const rel = base ? posix.join(base, e) : e;
    return statSync(join(dir, e)).isDirectory() ? walk(join(dir, e), rel) : [rel];
  });
};

const current = {};
for (const tree of INDEXED_TREES)
  for (const f of walk(join(REPO, tree)).filter((x) => x.endsWith('.md')))
    current[`${tree}/${f}`] = createHash('sha256')
      .update(readFileSync(join(REPO, tree, f))).digest('hex').slice(0, 12);

if (RECORD) {
  writeFileSync(STATE_PATH, JSON.stringify({
    _comment: 'Stan drzewa przy ostatnim reseedzie. Zapisywany przez scripts/reseed-patterns.sh.',
    files: current,
  }, null, 2) + '\n');
  console.log(`  rag-freshness: zapisano stan ${Object.keys(current).length} plików`);
  process.exit(0);
}

if (!existsSync(STATE_PATH)) {
  console.error('  RAG: brak .rag-seed-state.json — kolekcje nigdy nie były zasiane z tego klona\n' +
    '  → ./scripts/reseed-patterns.sh');
  process.exit(1);
}

const recorded = JSON.parse(readFileSync(STATE_PATH, 'utf8')).files ?? {};
const changed = Object.keys(current).filter((f) => recorded[f] && recorded[f] !== current[f]);
const added = Object.keys(current).filter((f) => !recorded[f]);
const removed = Object.keys(recorded).filter((f) => !current[f]);
const total = changed.length + added.length + removed.length;

if (!total) {
  console.log(`  RAG aktualny (${Object.keys(current).length} plików)`);
  process.exit(0);
}

const list = (label, arr) => arr.length
  ? `  ${label} (${arr.length}):\n` + arr.slice(0, 10).map((f) => `      ${f}`).join('\n') +
    (arr.length > 10 ? `\n      … i ${arr.length - 10} więcej` : '') + '\n'
  : '';

console.error(`  ROZJAZD RAG: ${total} plików różni się od tego, co jest w kolekcjach\n` +
  list('zmienione', changed) + list('nowe', added) + list('usunięte', removed) +
  '  → ./scripts/reseed-patterns.sh');
process.exit(1);
