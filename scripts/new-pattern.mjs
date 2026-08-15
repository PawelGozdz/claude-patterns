#!/usr/bin/env node
/**
 * new-pattern.mjs — jedno polecenie zamiast siedmiu ręcznych kroków z CLAUDE.md.
 *
 * Powód istnienia: procedura „Adding a New Pattern" ma 7 kroków i łatwo z niej wypaść.
 * Realny koszt takiego wypadnięcia (2026-08-14): dwa pliki bez nagłówka `## ` — w tym karta
 * reguł geo-spatial z 13 regułami — leżały na dysku i NIE ISTNIAŁY dla retrieve_patterns,
 * bo markdown-chunker tnie po sekcjach. Reseed raportował sukces. Implementerzy w tym samym
 * czasie wykonali 126 grepów, szukając wiedzy, którą ta karta zawierała.
 *
 * Podział pracy jest celowy: TEN skrypt robi to, co deterministyczne (szkielet z wymaganymi
 * sekcjami, walidacja tagów wobec słownika, sparowana karta, lint), a treść wzorca pisze
 * człowiek albo agent przez skill `add-pattern`. Generator, który „wypełniłby" prozę
 * placeholderami, produkuje wzorce wyglądające na gotowe i puste w środku.
 *
 * Użycie:
 *   node scripts/new-pattern.mjs --name outbox-dispatch --layer infrastructure \
 *        --tags "api:events:outbox,api:data-access" [--level core] [--scope juz-ide-api-1] [--no-card]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import YAML from 'yaml';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['quickstart', 'core', 'advanced', 'exhaustive'];

const arg = (flag, dflt = null) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? dflt : process.argv[i + 1];
};
const has = (flag) => process.argv.includes(flag);

const name = arg('--name');
const layer = arg('--layer');
const tagsRaw = arg('--tags');
const level = (arg('--level', 'core') || 'core').toLowerCase();
const scope = arg('--scope');
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!name || !layer || !tagsRaw) {
  console.error(`Użycie:
  node scripts/new-pattern.mjs --name <kebab-name> --layer <warstwa> --tags "<tag>,<tag>" [opcje]

Opcje:
  --level <${LEVELS.join('|')}>   głębokość (domyślnie: core)
  --scope <projekt>                 pattern wyprowadzony z JEDNEGO projektu, jeszcze niezwalidowany
                                    w drugim — wyłączany z retrieve_patterns domyślnie
  --no-card                         nie twórz karty reguł (odradzane dla wzorców z półki always)

Warstwy: ${readdirSync(join(REPO, 'patterns')).filter((d) => !d.includes('.')).join(', ')}`);
  process.exit(2);
}

// ── walidacja warstwy ────────────────────────────────────────────────────
const layers = readdirSync(join(REPO, 'patterns')).filter((d) => !d.includes('.'));
if (!layers.includes(layer)) die(`nieznana warstwa "${layer}". Dostępne: ${layers.join(', ')}`);

// ── walidacja poziomu ────────────────────────────────────────────────────
if (!LEVELS.includes(level)) die(`--level "${level}" spoza słownika (${LEVELS.join('|')}). Chunk z takim poziomem nigdy nie zostałby zwrócony przez filtr retrieve_*.`);

// ── walidacja tagów wobec blocks/_taxonomy.yml ───────────────────────────
// Poziomy 1-2 są ZAMKNIĘTE (stack, area); poziom 3 (variant) otwarty, ale nowy wariant
// wypisujemy, żeby `jwt` i `json-web-token` nie zaczęły żyć obok siebie.
const tax = YAML.parse(readFileSync(join(REPO, 'blocks/_taxonomy.yml'), 'utf8')) ?? {};
const STACKS = new Set(tax.stacks ?? []);
const AREAS = new Set(tax.areas ?? []);
const seen = tax.variants_seen ?? {};
const tags = tagsRaw.split(',').map((t) => t.trim().replace(/["'`]/g, '')).filter(Boolean);
if (!tags.length || tags.length > 3) die(`podaj 1-3 tagi (masz ${tags.length})`);

const newVariants = [];
for (const t of tags) {
  const [stack, area, variant] = t.split(':');
  if (!STACKS.has(stack)) die(`tag "${t}": stack "${stack}" spoza słownika (${[...STACKS].join('|')}). Słownik jest ZAMKNIĘTY — dopisz do blocks/_taxonomy.yml świadomie, nie w locie.`);
  if (!AREAS.has(area)) die(`tag "${t}": area "${area}" spoza słownika (${[...AREAS].join('|')}). Słownik jest ZAMKNIĘTY — patrz wyżej.`);
  if (variant && !(seen[area] ?? []).includes(variant)) newVariants.push(`${area}:${variant}`);
}

// ── ścieżki ──────────────────────────────────────────────────────────────
const slug = name.endsWith('-pattern') ? name : `${name}-pattern`;
const dir = join(REPO, 'patterns', layer);
const file = join(dir, `${slug}.md`);
const cardFile = join(dir, `${slug}_summary.md`);
if (existsSync(file)) die(`${file} już istnieje — nie nadpisuję`);
mkdirSync(dir, { recursive: true });

const title = slug.replace(/-pattern$/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const tagLine = `**Tags**: ${tags.map((t) => `"${t}"`).join(', ')}`;
const scopeLine = scope
  ? `\n**Scope**: project-specific (${scope}) — single-project derivation, not yet validated\nin a second codebase. Excluded from \`retrieve_patterns\` by default; pass\n\`project: "${scope}"\` to include it. Promote to universal once a second project adopts this shape.`
  : '';

// Sekcje `## ` NIE są kosmetyką: bez nich chunker nie wyprodukuje ani jednego chunka
// i plik zniknie z patterns_global po cichu.
writeFileSync(file, `# Pattern: ${title}

${tagLine}
**Layer**: ${layer[0].toUpperCase() + layer.slice(1)}
**Level**: ${level}
**Status**: experimental${scopeLine}

## What This Is

<!-- Jedno-dwa zdania: co ten wzorzec robi. Bez historii, bez uzasadnienia — to niżej. -->

## When to Use

**Use this pattern for:**
- ✅ <konkretny warunek wyzwalający — sytuacja, nie cecha>
- ✅ <drugi>

**Do NOT use for:**
- ❌ <naiwny/zły przypadek> — tam właściwy jest <nazwa innego wzorca>
- ❌ <drugi>

<!-- Te bullety są WYMAGANE. To one decydują, czy ktoś (człowiek lub agent) dopasuje
     swoją sytuację w 5 sekund, zamiast rekonstruować intencję z prozy. -->

## Implementation

<!-- Realny kod produkcyjny, nie pseudokod. -->

\`\`\`typescript
// ...
\`\`\`

## Anti-Patterns

<!-- Co ludzie robią zamiast tego i dlaczego to boli. Chunker indeksuje tę sekcję
     osobno (kind: anti_pattern), więc warto ją wypełnić konkretami. -->
`);

let created = [file];
if (!has('--no-card')) {
  // Karta MUSI mieć ten sam **Tags** co wzorzec — inaczej filtr tematyczny wpuszcza jeden
  // z dwóch dokumentów i gubi drugi (lint-patterns.mjs zgłasza to jako błąd).
  writeFileSync(cardFile, `# Rule Card: ${title}

${tagLine}
**Pattern**: \`patterns/${layer}/${slug}.md\`
**Layer**: ${layer[0].toUpperCase() + layer.slice(1)}
**Level**: quickstart${scope ? `\n**Scope**: project-specific (${scope})` : ''}

## Why this card exists

<!-- Jedno zdanie: co pójdzie źle, jeśli ktoś zignoruje te reguły. -->

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **X1** | <reguła w trybie rozkazującym> | <co się psuje, konkretnie> |

<!-- Karta to jest to, co realnie wkleja się do promptu implementera (§2b′ w
     commands/orchestrate.md). Limit ~8 KB — powyżej lint-patterns.mjs ostrzega, bo to
     znak, że wzorzec potrzebuje podziału. -->
`);
  created.push(cardFile);
}

console.log(`✓ utworzono:\n${created.map((f) => `    ${f.replace(REPO + '/', '')}`).join('\n')}`);
if (newVariants.length) {
  console.log(`\n⚠ nowe warianty tagów (poziom 3 jest otwarty, ale pilnuj synonimów):`);
  for (const v of newVariants) console.log(`    ${v}  → dopisz do variants_seen w blocks/_taxonomy.yml, jeśli zostaje`);
}

console.log(`\n── czego skrypt NIE zrobi za Ciebie ──────────────────────────────`);
console.log(`  1. Treść. Szkielet ma komentarze <!-- --> mówiące, co gdzie wpisać.`);
console.log(`  2. patterns/README.md — dopisz wiersz do indeksu:`);
console.log(`     | \`${layer}/${slug}.md\` | <jedno zdanie> | ${scope ? `⚠ project-specific (${scope})` : 'experimental'} |`);
console.log(`  3. METADATA.yml — wpis, jeśli to nowa kategoria${scope ? ` (+ scope: project-specific, project: ${scope})` : ''}.`);
console.log(`  4. pattern_routing w blocks/*.yml — TYLKO jeśli wzorzec rządzi rozpoznawalnym`);
console.log(`     rodzajem pliku i hooki mają o nim wiedzieć; potem: node scripts/generate-pattern-routing.mjs`);
console.log(`\n── gdy treść gotowa ─────────────────────────────────────────────`);
console.log(`  node scripts/lint-patterns.mjs      # sekcje, tagi, poziom, parowanie karty`);
console.log(`  ./scripts/reseed-patterns.sh        # bez tego wzorzec NIE ISTNIEJE dla retrieve_patterns`);

try {
  execSync(`node ${join(REPO, 'scripts/lint-patterns.mjs')}`, { stdio: 'pipe' });
} catch { /* lint sam raportuje; świeży szkielet ma puste sekcje, to normalne */ }
