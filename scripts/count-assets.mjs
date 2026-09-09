#!/usr/bin/env node
// scripts/count-assets.mjs — jedno źródło prawdy dla liczników repo (K13, TASK-KAIZEN-001).
//
// Liczy realną zawartość drzewa (commands/, hooks/, agents/, patterns/, skills/) i porównuje
// z nagłówkowymi licznikami w METADATA.yml. Celowo NIE parsuje README.md — liczby tam żyją
// wtopione w prozę ASCII-drzewa katalogów (komentarze w code fence), nie w danych
// strukturalnych; próba wyłapania ich regexem byłaby krucha i fałszywie failowałaby przy
// każdej redakcyjnej zmianie opisu. METADATA.yml jest jedynym miejscem, gdzie liczba jest
// polem YAML, więc jest jedynym bezpiecznym celem automatycznej bramki.
//
// Użycie:
//   node scripts/count-assets.mjs             — pokaż realne liczby + porównanie z METADATA.yml
//   node scripts/count-assets.mjs --check      — jak wyżej, exit 1 przy jakimkolwiek rozjeździe
//   node scripts/count-assets.mjs --check-docs — porówna liczniki wklejone jako proza w
//                                                CLAUDE.md/README.md/patterns/README.md
//                                                z tymi samymi realnymi liczbami; exit 1
//                                                przy rozjeździe (K70, TASK-KAIZEN-002)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const CHECK_DOCS = process.argv.includes('--check-docs');

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, pred, acc);
    else if (pred(entry.name)) acc.push(full);
  }
  return acc;
}

const isMd = (n) => n.endsWith('.md') && n !== 'README.md';
const isPatternMd = (n) => isMd(n) && !n.endsWith('_summary.md');

// commands/ — pliki płaskie, bez podkatalogów
const commandsCount = readdirSync(join(REPO, 'commands')).filter((f) => isMd(f)).length;

// hooks/ — .js i .sh, płaskie (lib/ to kod dzielony, nie osobne hooki)
const hooksJs = readdirSync(join(REPO, 'hooks')).filter((f) => f.endsWith('.js')).length;
const hooksSh = readdirSync(join(REPO, 'hooks')).filter((f) => f.endsWith('.sh')).length;
const hooksCount = hooksJs + hooksSh;

// agents/ — universal (płaskie) + stacks (rekurencyjnie, per-stack breakdown)
const agentsUniversal = readdirSync(join(REPO, 'agents/universal')).filter((f) => isMd(f)).length;
const stacksDir = join(REPO, 'agents/stacks');
const perStack = {};
for (const stack of existsSync(stacksDir) ? readdirSync(stacksDir, { withFileTypes: true }) : []) {
  if (!stack.isDirectory()) continue;
  perStack[stack.name] = walk(join(stacksDir, stack.name), isMd).length;
}
const agentsStackSpecific = Object.values(perStack).reduce((a, b) => a + b, 0);
const agentsTotal = agentsUniversal + agentsStackSpecific;

// patterns/ — per-katalog top-level (bez rekursji — patterns/<kategoria>/*.md, płasko)
const patternsDir = join(REPO, 'patterns');
const perPatternCategory = {};
for (const cat of readdirSync(patternsDir, { withFileTypes: true })) {
  if (!cat.isDirectory()) continue;
  perPatternCategory[cat.name] = readdirSync(join(patternsDir, cat.name))
    .filter((f) => isPatternMd(f)).length;
}
const patternsTotal = Object.values(perPatternCategory).reduce((a, b) => a + b, 0);
const CORE_CATEGORIES = ['domain', 'application', 'infrastructure', 'architecture', 'testing', 'cross-layer', 'orchestration'];
const patternsCore = CORE_CATEGORIES.reduce((a, c) => a + (perPatternCategory[c] ?? 0), 0);
const patternsStackSpecific = patternsTotal - patternsCore
  - (perPatternCategory.marketing ?? 0) - (perPatternCategory.finance ?? 0) - (perPatternCategory.legal ?? 0);

// skills/ — kategorie top-level + SKILL.md rekurencyjnie
const skillsDir = join(REPO, 'skills');
const skillsCategories = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
const skillsTotal = walk(skillsDir, (n) => n === 'SKILL.md').length;

const actual = {
  'commands.total': commandsCount,
  'hooks.total': hooksCount,
  'agents.universal': agentsUniversal,
  'agents.stack_specific': agentsStackSpecific,
  'patterns.total_count': patternsTotal,
  'patterns.core_count': patternsCore,
  'patterns.stack_specific_count': patternsStackSpecific,
  'skills.total_categories': skillsCategories,
  'skills.total_skills': skillsTotal,
};

console.log('Realne liczniki:');
for (const [k, v] of Object.entries(actual)) console.log(`  ${k.padEnd(28)} ${v}`);
console.log('\nAgenci per-stack:');
for (const [k, v] of Object.entries(perStack).sort()) console.log(`  ${k.padEnd(24)} ${v}`);

// ── porównanie z METADATA.yml (parsing liniowy, nie pełny YAML — pola są płaskie
// i jednoznaczne po ścieżce klucza; pełny parser YAML to przerost formy dla 9 pól) ──
const metaPath = join(REPO, 'METADATA.yml');
const metaSrc = readFileSync(metaPath, 'utf8');
const metaLines = metaSrc.split('\n');

function metaField(path) {
  const [section, field] = path.split('.');
  let inSection = false;
  for (const line of metaLines) {
    if (new RegExp(`^${section}:`).test(line)) { inSection = true; continue; }
    if (inSection && /^[a-z]/.test(line)) break; // nowa sekcja top-level
    if (inSection) {
      const m = line.match(new RegExp(`^  ${field}:\\s*(.+)$`));
      if (m) return Number(m[1].split('#')[0].trim());
    }
  }
  return null;
}

let mismatches = 0;
console.log('\nPorównanie z METADATA.yml:');
for (const key of Object.keys(actual)) {
  const expected = metaField(key);
  const ok = expected === actual[key];
  if (!ok) mismatches++;
  console.log(`  ${ok ? '✓' : '✗'} ${key.padEnd(28)} METADATA=${expected}  realnie=${actual[key]}`);
}

if (mismatches > 0) {
  console.log(`\n${mismatches} rozjazd(ów) — zaktualizuj METADATA.yml albo popraw drzewo.`);
  if (CHECK) process.exit(1);
} else {
  console.log('\n✔ METADATA.yml zgodne z drzewem.');
}

// ── --check-docs: liczniki wklejone jako proza w CLAUDE.md/README.md/patterns/README.md ──
//
// Celowo NIE jeden generyczny regex `\d+\s+(patterns|hooks|commands|agents|skills)` na
// całym pliku: repo pełne jest legalnych PODZBIORÓW w identycznej formie słownej —
// "41 marketing skills", "84 finance skills", "3 skills" (finance/core), "7 patterns"
// (AI/ML, sekcja per-stack) — które nie są totalem i nie mają się równać
// `skills.total_skills`/`patterns.total_count`. Generyczny regex fałszywie failowałby na
// każdym takim zdaniu. Zamiast tego: lista konkretnych, rozpoznawalnych fraz (dokładnie
// te, które C5/K70 audytu z 2026-09-07 złapały jako rozjechane), każda z jawnym mapowaniem
// na pole z `actual`/pochodne. Dopisuj kolejną regułę, gdy znajdziesz nowy STAŁY licznik w
// prozie — nie rozszerzaj na "każde zdanie z liczbą w środku".
//
// Logika liczenia jest ta sama co wyżej (`actual`, `perPatternCategory`, `perStack`,
// `hooksJs`/`hooksSh`) — ten blok tylko z niej czyta, nic nie liczy od nowa.
if (CHECK_DOCS) {
  const versionMatch = metaSrc.match(/^version:\s*"?([\d.]+)"?/m);
  const metaVersion = versionMatch ? versionMatch[1] : null;

  // Nagłówki `### <Nazwa> (N patterns)` w patterns/README.md, którym warto ufać jako
  // totalowi danej kategorii — tylko te core/orchestration/marketing/finance/legal.
  // Podsekcje per-stack (Python, Flutter, ...) celowo pominięte: np. "Python (5 patterns)"
  // to ŚWIADOMY podzbiór katalogu (2 pliki project-specific opisane osobno pod "Data
  // Pipeline") — ASCII-drzewo niżej i tak pilnuje sumy całego katalogu.
  const LAYER_HEADINGS = {
    'Domain Layer': 'domain',
    'Application Layer': 'application',
    'Infrastructure Layer': 'infrastructure',
    'Architecture Layer': 'architecture',
    'Testing Layer': 'testing',
    'Cross-Layer Patterns': 'cross-layer',
    'Orchestration Layer': 'orchestration',
    'Marketing Layer': 'marketing',
    'Finance Layer': 'finance',
    'Legal Layer': 'legal',
  };

  const docErrors = [];
  const lineOf = (src, index) => src.slice(0, index).split('\n').length;

  function report(relPath, src, index, label, found, expected) {
    if (expected == null) return; // metryka bez odpowiednika (np. brak w METADATA) — pomiń
    // Porównanie stringowe — obejmuje zarówno liczniki (Number("104") vs 104 są sobie
    // równe jako stringi) jak i wersję semver ("3.6.0"), której Number() dałoby NaN.
    if (String(found) !== String(expected)) {
      docErrors.push(`${relPath}:${lineOf(src, index)}  ${label}: w pliku ${found}, oczekiwano ${expected}`);
    }
  }

  function checkFile(relPath, rules) {
    const full = join(REPO, relPath);
    if (!existsSync(full)) return;
    const src = readFileSync(full, 'utf8');
    for (const rule of rules) {
      for (const m of src.matchAll(rule.regex)) {
        for (const { label, found, expected } of rule.extract(m)) {
          report(relPath, src, m.index, label, found, expected);
        }
      }
    }
  }

  checkFile('CLAUDE.md', [
    {
      // "104 production patterns (54 core + 45 stack-specific + 1 marketing + 2 finance + 2 legal)"
      regex: /(\d+) production patterns \((\d+) core \+ (\d+) stack-specific \+ (\d+) marketing \+ (\d+) finance \+ (\d+) legal\)/g,
      extract: (m) => [
        { label: 'total patterns', found: m[1], expected: patternsTotal },
        { label: 'core patterns', found: m[2], expected: patternsCore },
        { label: 'stack-specific patterns', found: m[3], expected: patternsStackSpecific },
        { label: 'marketing patterns', found: m[4], expected: perPatternCategory.marketing },
        { label: 'finance patterns', found: m[5], expected: perPatternCategory.finance },
        { label: 'legal patterns', found: m[6], expected: perPatternCategory.legal },
      ],
    },
    {
      // "26 universal + 30 stack-specific agents"
      regex: /(\d+) universal \+ (\d+) stack-specific agents/g,
      extract: (m) => [
        { label: 'universal agents', found: m[1], expected: agentsUniversal },
        { label: 'stack-specific agents', found: m[2], expected: agentsStackSpecific },
      ],
    },
    {
      // "190 skills across 24 categories"
      regex: /(\d+) skills across (\d+) categories/g,
      extract: (m) => [
        { label: 'total skills', found: m[1], expected: skillsTotal },
        { label: 'skill categories', found: m[2], expected: skillsCategories },
      ],
    },
    {
      // "53 hooks (50 js + 3 sh, ...)"
      regex: /(\d+) hooks \((\d+) js \+ (\d+) sh/g,
      extract: (m) => [
        { label: 'total hooks', found: m[1], expected: hooksCount },
        { label: 'hooks (.js)', found: m[2], expected: hooksJs },
        { label: 'hooks (.sh)', found: m[3], expected: hooksSh },
      ],
    },
    {
      // "45 global commands"
      regex: /(\d+) global commands/g,
      extract: (m) => [{ label: 'total commands', found: m[1], expected: commandsCount }],
    },
    {
      // Key Files table: "Pattern index (104 patterns)"
      regex: /Pattern index \((\d+) patterns\)/g,
      extract: (m) => [{ label: 'total patterns (Key Files)', found: m[1], expected: patternsTotal }],
    },
  ]);

  checkFile('README.md', [
    {
      // "**Version**: 3.6.0" — header and footer, compared against METADATA.yml `version:`
      regex: /^\*\*Version\*\*:\s*([\d.]+)/gm,
      extract: (m) => [{ label: 'repo version vs METADATA.yml', found: m[1], expected: metaVersion }],
    },
    {
      // "Production patterns (54 core + 45 stack-specific + 1 marketing + 2 finance + 2 legal)"
      // — the Repository Structure ASCII tree uses this exact breakdown, capital P.
      regex: /production patterns \((\d+) core \+ (\d+) stack-specific \+ (\d+) marketing \+ (\d+) finance \+ (\d+) legal\)/gi,
      extract: (m) => [
        { label: 'core patterns', found: m[1], expected: patternsCore },
        { label: 'stack-specific patterns', found: m[2], expected: patternsStackSpecific },
        { label: 'marketing patterns', found: m[3], expected: perPatternCategory.marketing },
        { label: 'finance patterns', found: m[4], expected: perPatternCategory.finance },
        { label: 'legal patterns', found: m[5], expected: perPatternCategory.legal },
      ],
    },
    {
      // ASCII tree per-category lines: "├── domain/  # Domain layer (8 patterns)",
      // "└── legal/   # ... Legal patterns (2 patterns: jurisdiction-aware-disclaimer, ...)"
      regex: /(?:├──|└──)\s*([a-z][\w-]*)\/\s*#.*?\((\d+) patterns?\b[^)]*\)/gm,
      extract: (m) => [{ label: `ASCII tree: ${m[1]}/`, found: m[2], expected: perPatternCategory[m[1]] }],
    },
    {
      // "Agent definitions (26 universal + 30 stack-specific)"
      regex: /\((\d+) universal \+ (\d+) stack-specific\)/g,
      extract: (m) => [
        { label: 'universal agents', found: m[1], expected: agentsUniversal },
        { label: 'stack-specific agents', found: m[2], expected: agentsStackSpecific },
      ],
    },
    {
      // "- Creates per-file symlinks in `~/.claude/agents/` for 26 universal agents"
      regex: /for (\d+) universal agents/g,
      extract: (m) => [{ label: 'universal agents', found: m[1], expected: agentsUniversal }],
    },
    {
      // "(45 commands)" — setup bullet + footer catalog line
      regex: /\((\d+) commands\)/g,
      extract: (m) => [{ label: 'total commands', found: m[1], expected: commandsCount }],
    },
    {
      // "Global commands (45 — symlinked to ~/.claude/commands/)" — Repository Structure tree
      regex: /global commands \((\d+) — symlinked/gi,
      extract: (m) => [{ label: 'total commands (tree)', found: m[1], expected: commandsCount }],
    },
    {
      // "(53 hooks)" — setup bullet
      regex: /\((\d+) hooks\)/g,
      extract: (m) => [{ label: 'total hooks', found: m[1], expected: hooksCount }],
    },
    {
      // "Full pattern index (104 patterns)" — footer only (word "index" anchors it away
      // from the per-category tree lines, handled by the dedicated rule above)
      regex: /pattern index \((\d+) patterns\)/gi,
      extract: (m) => [{ label: 'total patterns (footer)', found: m[1], expected: patternsTotal }],
    },
    {
      // "Agent catalog (56 agents)" — footer
      regex: /agent catalog \((\d+) agents\)/gi,
      extract: (m) => [{ label: 'total agents (footer)', found: m[1], expected: agentsTotal }],
    },
  ]);

  checkFile('patterns/README.md', [
    {
      // "**Status**: PRODUCTION (54 core patterns + 45 stack-specific + 1 marketing + 2 finance + 2 legal = 104 total)"
      regex: /\*\*Status\*\*: PRODUCTION \((\d+) core patterns \+ (\d+) stack-specific \+ (\d+) marketing \+ (\d+) finance \+ (\d+) legal = (\d+) total\)/g,
      extract: (m) => [
        { label: 'core patterns', found: m[1], expected: patternsCore },
        { label: 'stack-specific patterns', found: m[2], expected: patternsStackSpecific },
        { label: 'marketing patterns', found: m[3], expected: perPatternCategory.marketing },
        { label: 'finance patterns', found: m[4], expected: perPatternCategory.finance },
        { label: 'legal patterns', found: m[5], expected: perPatternCategory.legal },
        { label: 'total patterns', found: m[6], expected: patternsTotal },
      ],
    },
    {
      // ASCII tree: "├── domain/  # ... - 8 patterns" / "└── typescript-library/ # ... - 5 patterns"
      regex: /^(?:├──|└──)\s*([a-z][\w-]*)\/\s*#.*?-\s*(\d+) patterns?\b/gm,
      extract: (m) => [{ label: `ASCII tree: ${m[1]}/`, found: m[2], expected: perPatternCategory[m[1]] }],
    },
    {
      // "### Domain Layer (8 patterns)" and siblings from LAYER_HEADINGS
      regex: /^### (.+?) \((\d+) patterns?\)$/gm,
      extract: (m) => {
        const key = LAYER_HEADINGS[m[1]];
        return key ? [{ label: `section header: ${m[1]}`, found: m[2], expected: perPatternCategory[key] }] : [];
      },
    },
  ]);

  console.log('\n--check-docs:');
  if (docErrors.length > 0) {
    for (const e of docErrors) console.log(`  ✗ ${e}`);
    console.log(`\n${docErrors.length} rozjazd(ów) w dokumentacji — popraw liczniki w plikach powyżej.`);
    process.exit(1);
  } else {
    console.log('  ✔ liczniki w CLAUDE.md/README.md/patterns/README.md zgodne z drzewem.');
  }
}
