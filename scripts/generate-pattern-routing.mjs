#!/usr/bin/env node
// Generuje hooks/lib/pattern-routing.generated.js z sekcji `pattern_routing:` bloków:
//   node scripts/generate-pattern-routing.mjs           # zapisz
//   node scripts/generate-pattern-routing.mjs --check   # tylko sprawdź rozjazd (exit 1)
//
// Po co: mapowanie „plik → wzorzec, który nim rządzi" było listą 30 wpisów wpisaną
// ręcznie w hooks/lib/pattern-routing.js. Nic nie wiązało jej z blokami, więc nowy
// wzorzec wchodził do kompozycji, a hooki dalej go nie znały — rejestr wyglądał
// poprawnie, bo był wewnętrznie spójny (patterns/cross-layer/registry-drift-guard-pattern.md).
// Teraz reguła mieszka przy bloku, który jest właścicielem pojęcia: `ddd/core` wie,
// że agregat leży w `/domain/aggregates/`.
//
// KOLEJNOŚĆ: „first match wins", więc reguły sortujemy po specyficzności (dłuższy
// wzorzec dopasowania pierwszy), NIE po kolejności bloków. Kolejność bloków zależy od
// kompozycji projektu, a hooki są globalne — sortowanie po długości daje ten sam wynik
// niezależnie od tego, kto akurat co złożył.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

let YAML;
try { YAML = (await import('yaml')).default; }
catch { console.error('BŁĄD: brak paczki "yaml" — odpal `npm ci`.'); process.exit(1); }

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const OUT = join(REPO, 'hooks/lib/pattern-routing.generated.js');

const walk = (dir, base = '') => readdirSync(dir).flatMap((e) => {
  const rel = base ? posix.join(base, e) : e;
  return statSync(join(dir, e)).isDirectory() ? walk(join(dir, e), rel) : [rel];
});

const blockFiles = walk(join(REPO, 'blocks'))
  .filter((f) => f.endsWith('.yml') && !f.split('/').pop().startsWith('_'))
  .sort();

const paths = [], filenames = [];
const errors = [];

for (const bf of blockFiles) {
  const doc = YAML.parse(readFileSync(join(REPO, 'blocks', bf), 'utf8')) ?? {};
  const routing = doc.pattern_routing;
  if (!routing) continue;
  const source = doc.name ?? bf.replace(/\.yml$/, '');

  for (const [kind, list] of [['paths', routing.paths], ['filenames', routing.filenames]]) {
    for (const rule of list ?? []) {
      if (!rule.match || !rule.pattern) {
        errors.push(`blok "${source}": pattern_routing.${kind} — wpis bez "match" albo "pattern"`);
        continue;
      }
      // Wisząca ścieżka wzorca to reguła, która zablokuje edycję i każe przeczytać
      // plik, którego nie ma — gorsze niż brak reguły.
      if (!existsSync(join(REPO, 'patterns', rule.pattern)))
        errors.push(`blok "${source}": pattern_routing wskazuje "${rule.pattern}" — nie ma takiego wzorca`);
      if (kind === 'filenames') {
        try { new RegExp(rule.match); }
        catch (e) { errors.push(`blok "${source}": "${rule.match}" nie jest poprawnym regexem — ${e.message}`); }
      }
      (kind === 'paths' ? paths : filenames).push({ ...rule, source });
    }
  }
}

if (errors.length) {
  console.error('BŁĘDY:\n  ' + errors.join('\n  '));
  process.exit(1);
}

// Dłuższy `match` = bardziej specyficzny, więc idzie pierwszy. Przy równej długości
// sortujemy alfabetycznie — wynik ma być identyczny przy każdym uruchomieniu.
const bySpecificity = (a, b) =>
  b.match.length - a.match.length || a.match.localeCompare(b.match) || a.source.localeCompare(b.source);
paths.sort(bySpecificity);
filenames.sort(bySpecificity);

const content = `// WYGENEROWANE przez scripts/generate-pattern-routing.mjs — NIE edytuj ręcznie.
// Źródło: sekcje \`pattern_routing:\` w blocks/**.yml. Po zmianie reguły w bloku
// uruchom generator; \`--check\` wykrywa rozjazd (nadaje się do CI).
//
// Kolejność: od najbardziej do najmniej specyficznego dopasowania ("first match wins").

const PATH_RULES = [
${paths.map((r) => `  { match: ${JSON.stringify(r.match)}, pattern: ${JSON.stringify(r.pattern)} }, // ${r.source}`).join('\n')}
];

const FILENAME_RULES = [
${filenames.map((r) => `  { match: /${r.match.replace(/\//g, '\\/')}/, pattern: ${JSON.stringify(r.pattern)} }, // ${r.source}`).join('\n')}
];

module.exports = { PATH_RULES, FILENAME_RULES };
`;

const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;

if (CHECK) {
  if (current === content) {
    console.log(`  pattern-routing aktualny (${paths.length} ścieżek, ${filenames.length} nazw plików)`);
    process.exit(0);
  }
  console.error(current === null
    ? '  BRAK hooks/lib/pattern-routing.generated.js\n  → node scripts/generate-pattern-routing.mjs'
    : '  ROZJAZD: pattern-routing.generated.js nie odpowiada blokom\n  → node scripts/generate-pattern-routing.mjs');
  process.exit(1);
}

writeFileSync(OUT, content);
console.log(`  hooks/lib/pattern-routing.generated.js: ${paths.length} ścieżek, ${filenames.length} nazw plików` +
  ` (bloki: ${[...new Set([...paths, ...filenames].map((r) => r.source))].join(', ')})`);
