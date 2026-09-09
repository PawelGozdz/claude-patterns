#!/usr/bin/env node
/**
 * validate-skills.js — walidator skilli.
 *
 * Przed K103 (TASK-KAIZEN-002) ten walidator sprawdzał wyłącznie „SKILL.md istnieje
 * i nie jest pusty". Teraz, dla skilli WŁASNYCH (poza vendorowanymi):
 *
 *  1. frontmatter parsuje się jako YAML (niesparsowany frontmatter = harness nie
 *     zna ani `name`, ani `description` — skill jest niewidoczny)
 *  2. `name` i `description` obecne (CLAUDE.md „Adding a New Skill")
 *  3. `name` == nazwa katalogu — inaczej ścieżka w dokumentacji i nazwa wywołania
 *     to dwie różne rzeczy
 *  4. `allowed-tools` / `effort` — WARN (konwencja, nie twardy wymóg; ~połowa
 *     starszych skilli ich nie ma i to nie psuje działania)
 *  5. referencje do agentów (`@nazwa`) i innych skilli (`skills/<ścieżka>/`)
 *
 * Skille VENDOROWANE (`skills/{marketing,finance,legal}/**`) idą łagodniejszą
 * ścieżką: SKILL.md istnieje, jest niepusty i jego frontmatter się parsuje.
 * Nie wymuszamy na nich naszych pól — pochodzą z upstreamu i następny
 * `sync-*-skills.sh` i tak nadpisze każdą lokalną poprawkę.
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, frontmatterKeyLine } = require('../lib/frontmatter.mjs');

const ROOT = path.join(__dirname, '../..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const AGENTS_DIR = path.join(ROOT, 'agents');

const VENDORED = new Set(['marketing', 'finance', 'legal']);

/**
 * Wyjątki od reguły `name` == katalog. Każdy wpis musi mieć powód.
 * Nie dopisuj tu nic bez powodu — to jest miejsce, w którym reguła umiera.
 */
const NAME_DIR_EXCEPTIONS = new Map([
  // Katalog jest skrótem, `name` pełną nazwą (zbieżną z `ecc:regex-vs-llm-structured-text`).
  // Zmiana nazwy katalogu zerwałaby symlinki w projektach satelitarnych — do rozstrzygnięcia
  // osobno, wraz z deprecation notice wymaganym przez CLAUDE.md.
  ['decision-frameworks/regex-vs-llm', 'regex-vs-llm-structured-text'],
]);

const errors = [];
const warnings = [];

function findSkillFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findSkillFiles(full, results);
    else if (entry.name === 'SKILL.md') results.push(full);
  }
  return results;
}

function collectAgentNames() {
  const out = new Set();
  if (!fs.existsSync(AGENTS_DIR)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.md') && e.name !== 'README.md') out.add(e.name.replace(/\.md$/, ''));
    }
  })(AGENTS_DIR);
  return out;
}

function collectSkillPaths() {
  const out = new Set();
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.add(r);
      walk(path.join(dir, e.name), r);
    }
  })(SKILLS_DIR, '');
  return out;
}

const lineOfIndex = (content, index) => content.slice(0, index).split('\n').length;

function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.log('No skills directory found, skipping validation');
    process.exit(0);
  }

  const err = (loc, msg) => errors.push(`ERROR: ${loc} - ${msg}`);
  const warn = (loc, msg) => warnings.push(`WARN: ${loc} - ${msg}`);

  const categories = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const validAgents = collectAgentNames();
  const validSkillPaths = collectSkillPaths();
  const validSkillNames = new Set([...validSkillPaths].map((p) => p.split('/').pop()));

  let ourCount = 0;
  let vendoredCount = 0;

  for (const category of categories) {
    const files = findSkillFiles(path.join(SKILLS_DIR, category));
    if (files.length === 0) {
      err(`skills/${category}/`, 'brak SKILL.md w całym poddrzewie kategorii');
      continue;
    }

    for (const file of files) {
      const rel = path.relative(ROOT, file);
      const skillDirRel = path.relative(SKILLS_DIR, path.dirname(file)).split(path.sep).join('/');
      const dirName = path.basename(path.dirname(file));

      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch (e) {
        err(`${rel}:1`, e.message);
        continue;
      }
      if (content.trim().length === 0) {
        err(`${rel}:1`, 'pusty plik');
        continue;
      }

      const fm = parseFrontmatter(content);
      if (!fm) {
        err(`${rel}:1`, 'brak frontmatteru (`---` musi być pierwszą linią pliku)');
        continue;
      }
      if (fm.error) {
        err(`${rel}:1`, `frontmatter nie parsuje się jako YAML: ${fm.error} ` +
          '(najczęstsza przyczyna: niecytowana wartość zawierająca ": ")');
      }

      if (VENDORED.has(category)) {
        vendoredCount++;
        continue; // vendorowane: dalej nie wymuszamy naszych konwencji
      }
      ourCount++;

      for (const field of ['name', 'description']) {
        const v = fm.data[field];
        if (v == null || (typeof v === 'string' && !v.trim())) {
          err(`${rel}:1`, `brak wymaganego pola frontmatteru: ${field}`);
        }
      }
      for (const field of ['allowed-tools', 'effort']) {
        if (fm.data[field] == null) warn(`${rel}:1`, `brak pola \`${field}\` (konwencja CLAUDE.md „Adding a New Skill")`);
      }

      if (fm.data.name && fm.data.name !== dirName && NAME_DIR_EXCEPTIONS.get(skillDirRel) !== fm.data.name) {
        err(`${rel}:${frontmatterKeyLine(fm.raw, 'name')}`,
          `name "${fm.data.name}" ≠ nazwa katalogu "${dirName}"`);
      }

      const scan = content.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));

      // `@nazwa` sprawdzamy TYLKO dla nazw z myślnikiem. Treść skilli jest pełna
      // adnotacji, które nie są wzmianką o agencie: `@freezed` (Dart), `@import`
      // i `@theme` (CSS), `@render` (Svelte), `@deprecated` (JSDoc). Każda nazwa
      // agenta w tym repo jest kebab-case z myślnikiem, więc ten warunek odsiewa
      // szum bez utraty zasięgu. Dodając agenta o jednoczłonowej nazwie — popraw tu.
      for (const m of scan.matchAll(/@([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g)) {
        if (!validAgents.has(m[1])) {
          err(`${rel}:${lineOfIndex(scan, m.index)}`, `martwa referencja do agenta @${m[1]}`);
        }
      }
      // Lookbehind: `.claude/skills/<x>/` to ścieżka per-projektowego symlinku
    // (skille są tam wystawiane płasko), a nie ścieżka w tym repo.
    for (const m of scan.matchAll(/(?<![\w./])skills\/((?:[a-z][-a-z0-9]*\/)+)/g)) {
        const p = m[1].replace(/\/$/, '');
        // Skill bywa opisywany skrótem względem samego siebie (`skills/skill-stocktake/scripts/`
        // w pliku leżącym pod skills/meta/skill-stocktake/) — to nie martwa referencja.
        if (p.split('/')[0] === dirName) continue;
        if (!validSkillPaths.has(p)) {
          err(`${rel}:${lineOfIndex(scan, m.index)}`, `martwa referencja do skilla skills/${p}/`);
        }
      }
      void validSkillNames;
    }
  }

  for (const w of warnings) console.warn(w);
  for (const e of errors) console.error(e);
  if (errors.length) {
    console.error(`\n${errors.length} błędów`);
    process.exit(1);
  }
  console.log(`Validated ${ourCount} własnych + ${vendoredCount} vendorowanych SKILL.md w ${categories.length} kategoriach (${warnings.length} warnings)`);
}

main();
