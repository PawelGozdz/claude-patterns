#!/usr/bin/env node
/**
 * validate-commands.js — walidator plików komend.
 *
 * Przed K103 (TASK-KAIZEN-002) ten plik nie parsował frontmatteru w ogóle,
 * a martwa referencja do skilla była WARN-em, który nikt nie czytał. Teraz:
 *
 *  1. frontmatter: `description` wymagane; `name` (gdy jest) == nazwa pliku
 *  2. `/nazwa` — komenda albo skill (obie formy to poprawne wejście użytkownika)
 *  3. `agents/nazwa.md`, `@nazwa`, `subagent_type: nazwa` — agent musi istnieć
 *  4. `skills/<kategoria>/<nazwa>/` — CAŁA ścieżka musi istnieć, nie tylko pierwszy
 *     segment (stary regex `skills/([a-z-]+)\/` sprawdzał wyłącznie `skills/orchestration`
 *     i przepuszczał każdą literówkę w nazwie skilla)
 *  5. ``skill `nazwa` `` — skill musi istnieć
 *  6. `ecc:nazwa` — sprawdzane w marketplace ECC (`~/.claude/plugins/marketplaces/ecc/`);
 *     brak marketplace = WARN „ECC nie zainstalowany", nie ERROR (repo musi walidować
 *     się także na maszynie bez ECC)
 *
 * Martwa referencja = ERROR (exit 1), komunikat w formacie `plik:linia`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseFrontmatter, frontmatterKeyLine } = require('../lib/frontmatter.mjs');

const ROOT = path.join(__dirname, '../..');
const COMMANDS_DIR = path.join(ROOT, 'commands');
const AGENTS_DIR = path.join(ROOT, 'agents');
const SKILLS_DIR = path.join(ROOT, 'skills');
const ECC_ROOT = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', 'ecc');

// Skille wbudowane w harness (spoza skills/ tego repo) — `/loop` to nie nasz plik.
const HARNESS_NATIVE_SKILLS = new Set(['loop']);
// Wartości `subagent_type` wbudowane w harness.
const HARNESS_NATIVE_AGENTS = new Set(['general-purpose', 'Explore', 'Plan', 'fork', 'claude', 'statusline-setup']);

const errors = [];
const warnings = [];

function collectNames(dir, { dirs = false } = {}) {
  const out = new Set();
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (dirs) out.add(e.name);
        walk(path.join(d, e.name));
      } else if (!dirs && e.name.endsWith('.md') && e.name !== 'README.md') {
        out.add(e.name.replace(/\.md$/, ''));
      }
    }
  })(dir);
  return out;
}

/** Zbiór ścieżek względnych KAŻDEGO katalogu pod skills/ (`orchestration`, `orchestration/pulse`, …). */
function collectSkillPaths() {
  const out = new Set();
  if (!fs.existsSync(SKILLS_DIR)) return out;
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

/** Nazwy dostępne w marketplace ECC. `null` = ECC niezainstalowany. */
function collectEccNames() {
  if (!fs.existsSync(ECC_ROOT)) return null;
  const out = new Set();
  for (const sub of ['commands', 'skills', 'agents']) {
    const dir = path.join(ECC_ROOT, sub);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      out.add(e.isDirectory() ? e.name : e.name.replace(/\.(md|ya?ml)$/, ''));
    }
  }
  return out;
}

/** Numer linii pierwszego wystąpienia dopasowania (1-based). */
function lineOfIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function main() {
  if (!fs.existsSync(COMMANDS_DIR)) {
    console.log('No commands directory found, skipping validation');
    process.exit(0);
  }

  const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const validCommands = new Set(files.map((f) => f.replace(/\.md$/, '')));
  const validAgents = collectNames(AGENTS_DIR);
  const validSkillNames = collectNames(SKILLS_DIR, { dirs: true });
  const validSkillPaths = collectSkillPaths();
  const eccNames = collectEccNames();
  let eccWarned = false;

  const err = (file, line, msg) => errors.push(`ERROR: commands/${file}:${line} - ${msg}`);
  const warn = (file, line, msg) => warnings.push(`WARN: commands/${file}:${line} - ${msg}`);

  const checkEcc = (file, line, name, kind) => {
    if (eccNames === null) {
      if (!eccWarned) {
        warnings.push(`WARN: ECC nie zainstalowany (${ECC_ROOT}) — referencje ecc:* niesprawdzone`);
        eccWarned = true;
      }
      return;
    }
    if (!eccNames.has(name)) err(file, line, `${kind} ecc:${name} nie istnieje w marketplace ECC`);
  };

  for (const file of files) {
    const filePath = path.join(COMMANDS_DIR, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      err(file, 1, e.message);
      continue;
    }
    if (content.trim().length === 0) {
      err(file, 1, 'pusty plik komendy');
      continue;
    }

    // ── frontmatter ────────────────────────────────────────────────────────
    const fm = parseFrontmatter(content);
    if (!fm) {
      err(file, 1, 'brak frontmatteru (`---` musi być pierwszą linią pliku)');
    } else {
      if (fm.error) err(file, 1, `frontmatter nie parsuje się jako YAML: ${fm.error}`);
      const desc = fm.data.description;
      if (desc == null || (typeof desc === 'string' && !desc.trim())) {
        err(file, 1, 'brak wymaganego pola frontmatteru: description');
      }
      const expected = file.replace(/\.md$/, '');
      if (fm.data.name && fm.data.name !== expected) {
        err(file, frontmatterKeyLine(fm.raw, 'name'), `name "${fm.data.name}" ≠ nazwa pliku "${expected}"`);
      } else if (!fm.data.name) {
        warn(file, 1, 'brak pola `name` we frontmatterze (konwencja: name == nazwa pliku)');
      }
    }

    // Bloki kodu to przykłady/szablony, nie referencje. Zastępujemy je pustymi
    // liniami, żeby numery linii pozostały prawdziwe.
    const scan = content.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));

    // ── `/nazwa` (komenda albo skill) ──────────────────────────────────────
    const lines = scan.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/creates:|would create:/i.test(lines[i])) continue;
      for (const m of lines[i].matchAll(/`\/(ecc:)?([a-z][-a-z0-9]*)`/g)) {
        const name = m[2];
        if (m[1]) { checkEcc(file, i + 1, name, 'komenda'); continue; }
        if (!validCommands.has(name) && !validSkillNames.has(name) && !HARNESS_NATIVE_SKILLS.has(name)) {
          err(file, i + 1, `martwa referencja do komendy/skilla /${name}`);
        }
      }
    }

    // ── agenci: agents/nazwa.md, @nazwa, subagent_type ─────────────────────
    // Lookbehind na `.` — `.agents/<name>-context.md` to per-projektowy plik
    // kontekstu (finance/legal/marketing), NIE referencja do agents/ tego repo.
    for (const m of scan.matchAll(/(?<!\.)agents\/([a-z][-a-z0-9]*)\.md/g)) {
      if (!validAgents.has(m[1])) {
        err(file, lineOfIndex(scan, m.index), `martwa referencja do agenta agents/${m[1]}.md`);
      }
    }
    // Tylko nazwy z myślnikiem — patrz komentarz w validate-skills.js: `@import`,
    // `@deprecated`, `@freezed` to adnotacje języków, nie wzmianki o agentach.
    for (const m of scan.matchAll(/@([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g)) {
      if (!validAgents.has(m[1]) && !HARNESS_NATIVE_AGENTS.has(m[1])) {
        err(file, lineOfIndex(scan, m.index), `martwa referencja do agenta @${m[1]}`);
      }
    }
    for (const m of scan.matchAll(/subagent_type\s*[:=]\s*['"]?([A-Za-z][-A-Za-z0-9:]*)/g)) {
      const name = m[1];
      if (name.startsWith('ecc:')) { checkEcc(file, lineOfIndex(scan, m.index), name.slice(4), 'agent'); continue; }
      if (!validAgents.has(name) && !HARNESS_NATIVE_AGENTS.has(name)) {
        err(file, lineOfIndex(scan, m.index), `subagent_type "${name}" nie odpowiada żadnemu agentowi`);
      }
    }

    // ── skille: skills/<kategoria>/<nazwa>/ oraz ``skill `nazwa` `` ────────
    // Lookbehind: `.claude/skills/<x>/` to ścieżka per-projektowego symlinku
    // (skille są tam wystawiane płasko), a nie ścieżka w tym repo.
    for (const m of scan.matchAll(/(?<![\w./])skills\/((?:[a-z][-a-z0-9]*\/)+)/g)) {
      const relPath = m[1].replace(/\/$/, '');
      if (!validSkillPaths.has(relPath)) {
        err(file, lineOfIndex(scan, m.index), `martwa referencja do skilla skills/${relPath}/`);
      }
    }
    for (const m of scan.matchAll(/\bskills?\s+`(ecc:)?([a-z][-a-z0-9]*)`/gi)) {
      const name = m[2];
      if (m[1]) { checkEcc(file, lineOfIndex(scan, m.index), name, 'skill'); continue; }
      if (!validSkillNames.has(name) && !HARNESS_NATIVE_SKILLS.has(name)) {
        err(file, lineOfIndex(scan, m.index), `martwa referencja do skilla \`${name}\``);
      }
    }

    // ── diagramy przepływu: `a -> b -> c` ─────────────────────────────────
    for (const m of scan.matchAll(/^([a-z][-a-z0-9]*(?:\s*->\s*[a-z][-a-z0-9]*)+)$/gm)) {
      for (const agent of m[1].split(/\s*->\s*/)) {
        if (!validAgents.has(agent)) {
          err(file, lineOfIndex(scan, m.index), `diagram przepływu wskazuje nieistniejącego agenta "${agent}"`);
        }
      }
    }
  }

  for (const w of warnings) console.warn(w);
  for (const e of errors) console.error(e);
  if (errors.length) {
    console.error(`\n${errors.length} błędów w ${files.length} plikach komend`);
    process.exit(1);
  }
  console.log(`Validated ${files.length} command files (${warnings.length} warnings)`);
}

main();
