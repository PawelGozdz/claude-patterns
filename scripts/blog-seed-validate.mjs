#!/usr/bin/env node
// scripts/blog-seed-validate.mjs — walidator plików zalążków *.seed.md (ADR 0013).
//
// Uruchamiany w claude-patterns (testy) i w repo blogów (przed przeglądem / w buildzie):
//   node <claude-patterns>/scripts/blog-seed-validate.mjs <plik|katalog>… [--blog <korzeń repo bloga>]
// Z `--blog` dodatkowo skanuje ciało regułami deny-listy TEGO bloga (druga linia obrony —
// np. gdy człowiek dopisał coś ręcznie). Kod wyjścia: 0 = wszystko poprawne, 1 = błędy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWith } from './lib/telemetry-events.mjs';
import { loadBlog } from './lib/blog-seed/config.mjs';
import { compileRules, scanForLeaks } from './lib/blog-seed/scrub.mjs';
import { SECTIONS, REQUIRED_NONEMPTY, AUTHOR_SECTION, EMPTY, parseSeed } from './lib/blog-seed/render.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_SCHEMA = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'schemas', 'blog-seed-v1.schema.json'), 'utf8'));
const LABELLED = ['Kontekst', 'Fakty', 'Co poszło nie tak', 'Hipoteza (agent)'];

function collect(target, acc = []) {
  if (!fs.existsSync(target)) return acc;
  if (fs.statSync(target).isDirectory()) {
    for (const f of fs.readdirSync(target)) collect(path.join(target, f), acc);
  } else if (target.endsWith('.seed.md')) {
    acc.push(target);
  }
  return acc;
}

function sectionErrors(seed) {
  const errors = [];
  const heads = Object.keys(seed.sections);
  for (const h of SECTIONS) if (!heads.includes(h)) errors.push(`brak sekcji "## ${h}"`);
  const present = heads.filter((h) => SECTIONS.includes(h));
  if (present.join('|') !== SECTIONS.filter((h) => heads.includes(h)).join('|')) errors.push('sekcje w złej kolejności');
  if (!seed.fm.suppressed) {
    for (const h of REQUIRED_NONEMPTY) {
      const s = seed.sections[h];
      if (s !== undefined && (!s || s === EMPTY || (h === 'Dowody' && s.split('\n').length < 3))) errors.push(`sekcja "${h}" jest pusta`);
    }
  }
  for (const h of LABELLED) {
    for (const line of (seed.sections[h] || '').split('\n').filter((l) => l.startsWith('- '))) {
      if (!/^- \[(FAKT|HIPOTEZA|WNIOSEK)\] /.test(line)) errors.push(`pozycja bez etykiety w "${h}": ${line.slice(0, 40)}…`);
    }
  }
  return errors;
}

/** Lista błędów dla treści jednego pliku (pusta = poprawny). */
export function validateSeedContent(content, rules = null) {
  const seed = parseSeed(content);
  if (!seed) return ['brak lub niepoprawny frontmatter'];
  const errors = [...validateWith(SEED_SCHEMA, seed.fm, 'frontmatter'), ...sectionErrors(seed)];
  if (!seed.title) errors.push('brak tytułu (# …)');
  const questions = seed.sections[AUTHOR_SECTION] || '';
  if (['drafted', 'published'].includes(seed.fm.status) && /answer:\s*null/.test(questions)) {
    errors.push(`status ${seed.fm.status}, a pytanie do autora bez odpowiedzi`);
  }
  if (rules) {
    const body = content.split('\n').slice(seed.endLine).join('\n');
    for (const hit of scanForLeaks(body, rules)) errors.push(`wyciek: ${hit}`);
  }
  return errors;
}

export function main(argv) {
  const targets = [];
  let blogRoot = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--blog') blogRoot = argv[++i];
    else targets.push(argv[i]);
  }
  if (!targets.length) {
    process.stderr.write('użycie: blog-seed-validate.mjs <plik|katalog>… [--blog <korzeń repo bloga>]\n');
    return 1;
  }
  let rules = null;
  if (blogRoot) {
    const res = loadBlog({ id: 'validate', path: path.resolve(blogRoot) });
    if (!res.ok) {
      process.stderr.write(`blog: ${res.detail}\n`);
      return 1;
    }
    rules = compileRules({ denyList: res.blog.denyList });
  }
  const files = targets.flatMap((t) => collect(path.resolve(t)));
  let bad = 0;
  for (const f of files) {
    const errors = validateSeedContent(fs.readFileSync(f, 'utf8'), rules);
    if (errors.length) {
      bad++;
      process.stdout.write(`❌ ${f}\n${errors.map((e) => `   - ${e}`).join('\n')}\n`);
    }
  }
  process.stdout.write(`${files.length - bad}/${files.length} zalążków poprawnych\n`);
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
