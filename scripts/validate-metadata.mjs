#!/usr/bin/env node
// Walidator METADATA.yml katalogów wzorców: node scripts/validate-metadata.mjs
//
// Po co: do 2026-09-07 w `patterns/**` żyły DWA schematy naraz — stary
// (`layer`/`stack_support`/`patterns:` z nazwami plików pod kluczem `name`) w
// domain/application/architecture i nowy (`category`/`maturity`/`patterns_count`)
// w katalogach stackowych. Siedem z szesnastu kategorii nie miało pliku w ogóle,
// a `validate-metadata.sh` — jedyny walidator — sprawdzał WYŁĄCZNIE stary schemat,
// więc raportował 6/10 FAIL na plikach, które były poprawne, i nie był wpięty w
// żadną bramkę. Walidator, który myli się w większości przypadków i nikt go nie
// odpala, jest gorszy niż jego brak: uczy ignorowania własnych wyników.
//
// K84 (TASK-KAIZEN-002): jeden schemat (nowy), jeden walidator (ten), wpięty w
// `scripts/pre-commit-guards.mjs`.
//
// Co sprawdza:
//   1. każdy katalog `patterns/<kategoria>/` z >=1 plikiem wzorca ma METADATA.yml
//   2. plik jest poprawnym YAML-em i ma wszystkie wymagane pola
//   3. `category` zgadza się z nazwą katalogu
//   4. `maturity` jest ze słownika
//   5. `last_verified` to data ISO (YYYY-MM-DD)
//   6. `patterns_count` == realna liczba plików liczona TAK SAMO jak w
//      `scripts/count-assets.mjs` (patrz komentarz przy `isPatternFile`)
//   7. gdy jest opcjonalna lista `patterns:` — każdy `file` istnieje na dysku,
//      a wpis z `scope: project-specific` ma `project:`
//
// Wyjście: exit 1 przy pierwszym błędzie w raporcie (wszystkie błędy wypisane
// naraz, plik:pole), exit 0 gdy czysto.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let YAML;
try { YAML = (await import('yaml')).default; }
catch { console.error('BŁĄD: brak paczki "yaml" — odpal `npm ci`.'); process.exit(1); }

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = join(REPO, 'patterns');

// Wymagane pola nowego schematu. `source_projects` jest w liczbie mnogiej — stary
// `source_project` (l.poj.) w czterech plikach był tą samą informacją pod inną
// nazwą i to jest dokładnie ten rodzaj rozjazdu, przez który schemat przestaje
// być schematem. Jedna nazwa, nawet gdy projekt jest jeden.
const REQUIRED = ['category', 'version', 'maturity', 'last_verified', 'stack',
  'source_projects', 'patterns_count', 'description'];

// Słownik dojrzałości. Zamknięty świadomie: „production" i „prod", albo
// „experimental" i „draft" obok siebie, robią z pola filtr, po którym nie da się
// filtrować.
const MATURITY = new Set(['production', 'stable', 'experimental', 'deprecated']);

// Pola opcjonalne, które przeżyły migracje ze starego schematu, bo niosą
// informację, której nowy schemat nie ma gdzie zapisać. Wypisane jawnie, żeby
// literówka w kluczu nie przechodziła po cichu.
const OPTIONAL = new Set(['layer', 'stack_support', 'patterns', 'changelog', 'notes']);

// LICZENIE WZORCÓW — ta sama definicja co `scripts/count-assets.mjs` (`isPatternMd`):
// każdy `*.md` w katalogu kategorii poza `README.md` i kartami `*_summary.md`.
// Celowo NIE „tylko `*-pattern.md`": pliki bez tego sufiksu (`architecture/
// cross-context-communication.md`, `python/async-patterns.md`,
// `testing/test-seeding-performance-guide.md`, `orchestration/
// project-management-system.md`) są indeksowane i zwracane przez
// `retrieve_patterns` dokładnie tak samo jak wzorce — z punktu widzenia korpusu
// są wzorcami, nazwa pliku niczego tu nie zmienia. Dwie różne definicje w dwóch
// skryptach dałyby dwie różne „prawdziwe" liczby.
const isPatternFile = (n) => n.endsWith('.md') && n !== 'README.md' && !n.endsWith('_summary.md');

const errors = [];
const seen = [];

for (const entry of readdirSync(PATTERNS, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const dir = join(PATTERNS, entry.name);
  const files = readdirSync(dir).filter(isPatternFile);
  if (!files.length) continue; // katalog bez wzorców nie potrzebuje metadanych

  const metaPath = join(dir, 'METADATA.yml');
  const rel = `patterns/${entry.name}/METADATA.yml`;
  if (!existsSync(metaPath)) {
    errors.push(`${rel}: BRAK pliku — katalog ma ${files.length} wzorc(ów)`);
    continue;
  }

  let doc;
  try { doc = YAML.parse(readFileSync(metaPath, 'utf8')); }
  catch (e) { errors.push(`${rel}: niepoprawny YAML — ${e.message}`); continue; }
  if (!doc || typeof doc !== 'object') { errors.push(`${rel}: pusty albo nie jest mapą`); continue; }

  seen.push({ category: entry.name, count: files.length });

  for (const field of REQUIRED)
    if (doc[field] === undefined || doc[field] === null || doc[field] === '')
      errors.push(`${rel}: brak wymaganego pola \`${field}\``);

  for (const key of Object.keys(doc))
    if (!REQUIRED.includes(key) && !OPTIONAL.has(key))
      errors.push(`${rel}: nieznane pole \`${key}\` — literówka? (dozwolone opcjonalne: ${[...OPTIONAL].join(', ')})`);

  if (doc.category !== undefined && doc.category !== entry.name)
    errors.push(`${rel}: \`category: ${doc.category}\` ≠ nazwa katalogu "${entry.name}"`);

  if (doc.maturity !== undefined && !MATURITY.has(String(doc.maturity)))
    errors.push(`${rel}: \`maturity: ${doc.maturity}\` spoza słownika (${[...MATURITY].join('|')})`);

  // YAML parsuje gołe `2026-07-31` jako Date — akceptujemy obie formy, ale
  // odrzucamy „2026-7" i prozę.
  if (doc.last_verified !== undefined) {
    const asText = doc.last_verified instanceof Date
      ? doc.last_verified.toISOString().slice(0, 10)
      : String(doc.last_verified);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asText))
      errors.push(`${rel}: \`last_verified: ${doc.last_verified}\` — wymagany format YYYY-MM-DD`);
  }

  if (doc.patterns_count !== undefined && Number(doc.patterns_count) !== files.length)
    errors.push(`${rel}: \`patterns_count: ${doc.patterns_count}\`, a w katalogu jest ${files.length} plików ` +
      `(liczone jak w count-assets.mjs: *.md bez README.md i *_summary.md)`);

  // Opcjonalna lista `patterns:` — nie musi wymieniać wszystkiego (to nie jest
  // drugi indeks, od tego jest patterns/README.md). Wymieniony plik musi jednak
  // istnieć, bo wpis o nieistniejącym pliku to fałszywe pokrycie.
  if (doc.patterns !== undefined) {
    if (!Array.isArray(doc.patterns)) {
      errors.push(`${rel}: \`patterns:\` musi być listą wpisów {file, scope?, project?, ...}`);
    } else {
      for (const [i, item] of doc.patterns.entries()) {
        const where = `${rel}: patterns[${i}]`;
        if (!item || typeof item !== 'object') { errors.push(`${where}: wpis nie jest mapą`); continue; }
        if (item.name !== undefined && item.file === undefined)
          errors.push(`${where}: \`name:\` to stary schemat — pole nazywa się \`file:\``);
        if (!item.file) { errors.push(`${where}: brak \`file:\``); continue; }
        if (!existsSync(join(dir, item.file)))
          errors.push(`${where}: \`file: ${item.file}\` — nie ma takiego pliku w patterns/${entry.name}/`);
        if (item.scope !== undefined) {
          if (item.scope !== 'project-specific')
            errors.push(`${where}: \`scope: ${item.scope}\` — jedyna dozwolona wartość to "project-specific" ` +
              '(wzorzec uniwersalny po prostu nie deklaruje scope)');
          else if (!item.project)
            errors.push(`${where}: \`scope: project-specific\` bez \`project:\` — retrieve_patterns nie ma czym filtrować`);
        }
        if (item.project !== undefined && item.scope === undefined)
          errors.push(`${where}: \`project:\` bez \`scope: project-specific\` — samo wskazanie projektu niczego nie wyłącza z retrievalu`);
      }
    }
  }
}

console.log(`METADATA.yml: ${seen.length} kategorii ` +
  `(${seen.reduce((a, s) => a + s.count, 0)} wzorców łącznie)`);

if (errors.length) {
  console.error(`\nBŁĘDY (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('  bez zastrzeżeń');
