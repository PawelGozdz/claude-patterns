/**
 * pattern-routing.js — shared source-file → canonical-pattern routing.
 *
 * Single source of truth for "which architecture pattern governs this file".
 * Consumed by:
 *   - check-patterns-read.js  (blocks edits until the governing pattern is read)
 *   - check-delegation.js     (blocks the MAIN agent from editing pattern files;
 *                              forces delegation to a subagent / /orchestrate)
 *
 * Keep PATH_RULES / FILENAME_RULES here so both gates agree on what counts
 * as "real architecture" vs. a utility/config/module file.
 */

const path = require('path');

const EXEMPT_EXTENSIONS = ['.md', '.yaml', '.yml', '.json', '.lock', '.txt', '.gitignore'];

const EXEMPT_PATH_FRAGMENTS = [
  '__tests__/',
  '/test/',
  '/tests/',
  '.spec.',
  '.test.',
  'CHANGELOG',
  'README',
  '.claude/',
  'project-orchestration/',
  'node_modules/',
];

const ENFORCED_EXTENSIONS = ['.ts', '.tsx', '.dart', '.py', '.svelte'];

// Reguły przychodzą z bloków (`pattern_routing:` w blocks/**.yml) przez generator
// scripts/generate-pattern-routing.mjs. Do 2026-08-13 była tu ręczna lista 30 wpisów,
// niepowiązana z niczym: blok mógł wnieść nowy wzorzec, a hooki dalej go nie znały.
// Rejestr wyglądał poprawnie, bo był wewnętrznie spójny — dokładnie ten dryf, który
// opisuje patterns/cross-layer/registry-drift-guard-pattern.md.
//
// Kolejność w pliku generowanym jest już posortowana od najbardziej specyficznego
// dopasowania, więc „first match wins" niżej działa bez dodatkowych założeń.
const { PATH_RULES, FILENAME_RULES } = require('./pattern-routing.generated.js');

// ── warstwa lokalna projektu ──────────────────────────────────────────────
// Plik generowany wyżej powstaje WYŁĄCZNIE z blocks/**.yml centrali i jest wspólny dla
// każdego repo, które symlinkuje hooks/ — więc blok lokalny (`./geo` w czterech
// juz-ide-api) nie miał jak wnieść ani jednej reguły. Skutek: trigger słów kluczowych
// w runtime.yml działał, bo czytają go /analyze i /orchestrate, ale te trzy bramki były
// na pliki geo ślepe. Bramka stała tam, gdzie agent współpracuje, i znikała tam, gdzie
// mógłby ją obejść.
//
// Reguł projektu nie wolno dopisać do pliku centralnego — pojechałyby do wszystkich
// repozytoriów. Materializacja zapisuje je obok runtime.yml, a my szukamy tej warstwy
// w górę drzewa od edytowanego pliku (hook nie zna „bieżącego projektu"; zna ścieżkę).
const fs = require('fs');

const EMPTY_LOCAL = { paths: [], filenames: [] };
const localCache = new Map();

function loadLocalRules(filePath) {
  const startDir = path.dirname(path.resolve(filePath));
  if (localCache.has(startDir)) return localCache.get(startDir);

  let found = EMPTY_LOCAL;
  let dir = startDir;
  // W górę do korzenia. Pierwsze `.claude/config/` wygrywa — to katalog projektu.
  for (;;) {
    const candidate = path.join(dir, '.claude/config/pattern-routing.local.json');
    if (fs.existsSync(candidate)) {
      try {
        const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        found = {
          paths: (raw.paths ?? []).map((r) => ({ match: r.match, pattern: r.pattern })),
          // Regex żyje w JSON-ie jako string; niepoprawny wzorzec pomijamy pojedynczo,
          // zamiast wywracać bramkę dla wszystkich plików w repo.
          filenames: (raw.filenames ?? []).flatMap((r) => {
            try { return [{ match: new RegExp(r.match), pattern: r.pattern }]; }
            catch { return []; }
          }),
        };
      } catch {
        // Uszkodzony plik = brak warstwy lokalnej. Reguły centralne działają dalej;
        // hook nigdy nie wywraca edycji z powodu własnej konfiguracji.
        found = EMPTY_LOCAL;
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  localCache.set(startDir, found);
  return found;
}

/**
 * True if the file should be skipped entirely (docs, tests, config, non-enforced
 * extensions). Such files never need pattern grounding or delegation.
 */
function isExempt(filePath) {
  if (!filePath) return true;
  for (const frag of EXEMPT_PATH_FRAGMENTS) {
    if (filePath.includes(frag)) return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (EXEMPT_EXTENSIONS.includes(ext)) return true;
  if (!ENFORCED_EXTENSIONS.includes(ext)) return true;
  return false;
}

/**
 * Returns the canonical pattern path (relative, e.g. 'domain/aggregate-pattern.md')
 * that governs the given source file, or null if no rule applies.
 *
 * null = "not a pattern file" — a utility/config/module file. Both gates treat
 * null as "allow" (the verifier tier catches drift later).
 */
function findRequiredPattern(filePath) {
  // Warstwa lokalna idzie pierwsza: blok projektu opisuje jeden konkretny stack, więc
  // jest bardziej specyficzny niż suma reguł centrali (`./geo` musi wygrać z ogólną
  // regułą `*.repository.ts` z bloku kysely dla plików w kernelu geo).
  const local = loadLocalRules(filePath);
  for (const rule of local.paths) {
    if (filePath.includes(rule.match)) return rule.pattern;
  }
  for (const rule of local.filenames) {
    if (rule.match.test(filePath)) return rule.pattern;
  }

  for (const rule of PATH_RULES) {
    if (typeof rule.match === 'string') {
      if (filePath.includes(rule.match)) return rule.pattern;
    } else if (rule.match instanceof RegExp) {
      if (rule.match.test(filePath)) return rule.pattern;
    }
  }
  for (const rule of FILENAME_RULES) {
    if (rule.match.test(filePath)) return rule.pattern;
  }
  return null;
}

module.exports = {
  EXEMPT_EXTENSIONS,
  EXEMPT_PATH_FRAGMENTS,
  ENFORCED_EXTENSIONS,
  PATH_RULES,
  FILENAME_RULES,
  isExempt,
  findRequiredPattern,
};
