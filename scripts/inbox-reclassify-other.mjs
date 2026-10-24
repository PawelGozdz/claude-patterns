#!/usr/bin/env node
// scripts/inbox-reclassify-other.mjs — jednorazowa reklasyfikacja rekordów skrzynki z `category: other`
// (TASK-OBS-013, ADR 0015 D5).
//
// Powód: 97 ze 106 kategorii w skrzynce to `other`, a większość to jedna sprawa — karty wzorców z obcego
// stosu albo warstwy niespójne z taskiem. Skrypt proponuje nową kategorię po słowach kluczowych z treści
// rekordu, ale NIC nie zmienia bez jawnego zatwierdzenia: zmianę `category:` robi człowiek.
//
// Użycie:
//   node scripts/inbox-reclassify-other.mjs                       # podgląd: tabela propozycji + udział `other` po zmianie
//   node scripts/inbox-reclassify-other.mjs --apply <id,id,…>     # zapisuje tylko wskazane rekordy
//   node scripts/inbox-reclassify-other.mjs --apply all           # zapisuje wszystkie propozycje z podglądu
//   node scripts/inbox-reclassify-other.mjs --apply unambiguous,<id>=<kategoria>,…
//                                                                 # propozycje bez "?" + wskazane rekordy z kategorią człowieka
//
// Zapis podmienia wyłącznie linię `category: other` we frontmatterze (reszta pliku bez zmian), a potem
// przypomina o `node scripts/generate-inbox-index.mjs`. Rekord bez dopasowania zostaje `other`.
// Skrypt NIGDY nie commituje ani nie staguje.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INBOX_DIR, readInboxEntries, toIndexEntry } from './lib/inbox.mjs';
import { CAUSES } from './lib/telemetry-events.mjs';

const EXIT = { OK: 0, USAGE: 1 };

// Kolejność = priorytet przy niejednoznaczności (karta wzorca jest głównym powtarzalnym przypadkiem).
// Słowa wąskie celowo: `warstw`/`wzorc`/`pattern` występują w prawie każdym wystąpieniu (prefiks
// „warstwa `id`", nazwy `*-pattern`), więc dopasowanie robiłoby z `plan` nową szufladę „wszystko".
const RULES = [
  { category: 'pattern_card', re: /(?<![\p{L}_])(kart(?:a|y|ę|ą|om|ami|ach)?|cards?)(?![\p{L}_])/giu },
  { category: 'plan', re: /(?<![\p{L}_])(layers_scope|layers_skip|dirs)(?![\p{L}_])/giu },
  // Druga fala (2026-10-24, zatwierdzona przez człowieka): rodziny objawów z pozostałych rekordów.
  // Kolejność = pierwszeństwo przy niejednoznaczności; trafienie w kilku grupach oznacza `?`.
  { category: 'budget', re: /(budżet\p{L}*|budzet\p{L}*|budget)/giu },
  { category: 'typecheck', re: /(typecheck\p{L}*|TS\d{4})/giu },
  { category: 'lint', re: /(import\/order|eslint|lint(?::\w+)?|no-console)/giu },
  { category: 'test', re: /(checks\.tests|testsFlaky\w*|flake\p{L}*|sond\p{L}* (?:test\p{L}*|przyrostu testów)|test:l\d)/giu },
  { category: 'verifier', re: /(unverified_scope|weryfikator\p{L}*|verifier)/giu },
  { category: 'config', re: /(runtime\.yml|create_when|orchestrate-prepare\p{L}*|installed\.yml|setup-project\p{L}*|frontmatter\p{L}*)/giu },
  { category: 'infra', re: /(worktree|dirtyAtStart|git status|git diff|git rev-parse|commit\p{L}*|narzędzi\p{L}*|tombstone|mtime|StructuredOutput|DATABASE_URL|Glob\/Grep|staged)/giu },
  { category: 'scope', re: /(poza zakres\p{L}*|out-of-scope)/giu },
];

// Linia wystąpienia: `- RRRR-MM-DD projekt (TASK) run `id` warstwa `id` — powód`. Prefiks pisze
// maszyna; dopasowujemy wyłącznie po powodzie (tekst po pierwszym „ — ").
function reasonsOf(body) {
  return body.split('\n').filter((l) => l.startsWith('- '))
    .map((l) => l.slice(l.indexOf(' — ') + 3)).join('\n');
}

function parseArgs(argv) {
  const out = { apply: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = argv[++i] ?? '';
    else {
      process.stderr.write(`✘ inbox-reclassify-other: nieznany przełącznik: ${argv[i]}\n`);
      process.exit(EXIT.USAGE);
    }
  }
  if (out.apply === '') {
    process.stderr.write('✘ inbox-reclassify-other: --apply wymaga listy id albo "all"\n');
    process.exit(EXIT.USAGE);
  }
  return out;
}

function propose(text) {
  const hits = RULES
    .map((r) => ({ category: r.category, words: [...text.matchAll(r.re)].map((m) => m[1].toLowerCase()) }))
    .filter((h) => h.words.length);
  if (!hits.length) return null;
  return { category: hits[0].category, ambiguous: hits.length > 1, words: hits.flatMap((h) => h.words) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = readInboxEntries();
  const total = rows.length;
  // Efektywne `other` = to, co liczy indeks: jawne `category: other` ORAZ brak pola przy triggerze,
  // którego domyślna kategoria to `other` (halt, blocked_by_prior, agent_note).
  const others = rows.filter((r) => toIndexEntry(r).category === 'other');

  const proposals = [];
  for (const r of others) {
    const body = readFileSync(join(INBOX_DIR, r.file), 'utf8').split(/^## Occurrences/m)[1] || '';
    const p = propose(reasonsOf(body));
    if (p) proposals.push({ id: r.id || r.file.replace(/\.md$/, ''), file: r.file, status: r.status, ...p });
  }

  const otherNow = rows.filter((r) => toIndexEntry(r).category === 'other').length;
  const otherAfter = otherNow - proposals.length;
  const pct = (n) => (total ? ((100 * n) / total).toFixed(1) : '0.0');

  if (args.apply === null) {
    for (const p of proposals) {
      console.log(`  other → ${p.category.padEnd(12)}${p.ambiguous ? ' ?' : '  '} ${p.id}  [${p.status}]  (${[...new Set(p.words)].join(', ')})`);
    }
    console.log(`\n${proposals.length} propozycji z ${others.length} rekordów \`other\` (${total} w skrzynce).`);
    console.log(`Udział \`other\`: ${otherNow}/${total} = ${pct(otherNow)}% → po zastosowaniu wszystkich ${otherAfter}/${total} = ${pct(otherAfter)}%.`);
    console.log('"?" = pasują słowa obu kategorii (proponowana pierwsza) — sprawdź przed zatwierdzeniem.');
    console.log('Zapis: --apply <id,id,…> albo --apply all.');
    return;
  }

  // Tokeny --apply: `all` (wszystkie propozycje), `unambiguous` (bez "?"), `id` (kategoria z propozycji),
  // `id=kategoria` (kategoria wskazana przez człowieka zamiast proponowanej).
  const tokens = args.apply.split(',').map((s) => s.trim()).filter(Boolean);
  const chosen = new Map();
  const unknown = [];
  for (const tok of tokens) {
    if (tok === 'all') proposals.forEach((p) => chosen.set(p.id, chosen.get(p.id) || p.category));
    else if (tok === 'unambiguous') proposals.filter((p) => !p.ambiguous).forEach((p) => chosen.set(p.id, chosen.get(p.id) || p.category));
    else {
      const [id, cat] = tok.split('=');
      const p = proposals.find((x) => x.id === id);
      if (!p) unknown.push(id);
      else if (cat && !CAUSES.includes(cat)) unknown.push(`${id}=${cat}`);
      else chosen.set(id, cat || p.category);
    }
  }
  if (unknown.length) {
    process.stderr.write(`✘ inbox-reclassify-other: brak propozycji albo nieznana kategoria: ${unknown.join(', ')}\n`);
    process.exit(EXIT.USAGE);
  }
  let written = 0;
  for (const base of proposals.filter((x) => chosen.has(x.id))) {
    const p = { ...base, category: chosen.get(base.id) };
    const file = join(INBOX_DIR, p.file);
    const raw = readFileSync(file, 'utf8');
    const fmEnd = raw.search(/\r?\n---\r?\n/);
    const head = fmEnd === -1 ? raw : raw.slice(0, fmEnd);
    let next;
    if (/^category:/m.test(head)) {
      next = raw.replace(/^(---\r?\n[\s\S]*?)^category: other[ \t]*$/m, `$1category: ${p.category}`);
    } else {
      // Rekord bez pola (domyślna z triggera) — dopisz po `trigger:`, żeby kolejność kluczy została jak w nowych.
      next = raw.replace(/^(trigger: .*)$/m, `$1\ncategory: ${p.category}`);
    }
    if (next === raw) {
      process.stderr.write(`⚠ ${p.id}: nie udało się ustawić category we frontmatterze — pominięty\n`);
      continue;
    }
    writeFileSync(file, next);
    written++;
  }
  console.log(`Zapisano ${written} rekordów. Odtwórz indeks: node scripts/generate-inbox-index.mjs`);
}

main();
