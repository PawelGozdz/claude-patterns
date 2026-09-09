#!/usr/bin/env node
/**
 * validate-agents.js — walidator plików agentów.
 *
 * Sprawdza (K103, TASK-KAIZEN-002):
 *  1. frontmatter parsuje się i ma pola wymagane przez CLAUDE.md
 *     („Adding a New Universal Agent"): name, description, tools, model
 *  2. `name` == nazwa pliku (rozjazd = agent niewywoływalny pod nazwą z tabeli)
 *  3. `model` z zamkniętej listy
 *  4. narzędzia `mcp__<serwer>__<tool>` w `tools:` wskazują na serwer, który
 *     gdziekolwiek istnieje (templates/mcp.json.template, mcp-server/*, allowlist).
 *     To jest check, który złapałby `mcp__zen__*` z K56: 16 agentów latami deklarowało
 *     narzędzie serwera, którego żaden satelita nie miał — każde wywołanie padało.
 *  5. spójność z `agents/README.md`: każdy plik ma wiersz w tabeli, model w tabeli
 *     zgadza się z frontmatterem. Tabela jest tym, co czyta człowiek wybierający agenta;
 *     rozjazd „README mówi Sonnet, plik mówi Haiku" to zła decyzja kosztowa u każdego,
 *     kto zaufał tabeli.
 *
 * Wyjście: ERROR → exit 1, `plik:linia`.
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, frontmatterKeyLine, asList } = require('../lib/frontmatter.mjs');

const ROOT = path.join(__dirname, '../..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const README = path.join(AGENTS_DIR, 'README.md');

const REQUIRED_FIELDS = ['name', 'description', 'tools', 'model'];
const VALID_MODELS = ['haiku', 'sonnet', 'opus'];
const SKIP_FILES = ['README.md'];

// Serwery MCP znane niezależnie od plików konfiguracyjnych w repo.
const KNOWN_MCP_SERVERS = new Set(['knowledge-retriever', 'claude-patterns']);

const errors = [];
const warnings = [];
const err = (loc, msg) => errors.push(`ERROR: ${loc} - ${msg}`);
const warn = (loc, msg) => warnings.push(`WARN: ${loc} - ${msg}`);

function findAgentFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findAgentFiles(full, results);
    else if (entry.name.endsWith('.md') && !SKIP_FILES.includes(entry.name)) results.push(full);
  }
  return results;
}

/** Zbiera nazwy serwerów MCP z każdego pliku konfiguracyjnego, jaki repo zna. */
function collectMcpServers() {
  const servers = new Set(KNOWN_MCP_SERVERS);
  const candidates = [
    path.join(ROOT, 'templates', 'mcp.json.template'),
    path.join(ROOT, '.mcp.json'),
    path.join(ROOT, 'mcp-server', 'settings.json.example'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const name of Object.keys(data.mcpServers || {})) servers.add(name);
    } catch {
      // Szablon z placeholderami (%%…%%) bywa niepoprawnym JSON-em — nie blokuj walidacji.
    }
  }
  const mcpDir = path.join(ROOT, 'mcp-server');
  if (fs.existsSync(mcpDir)) {
    for (const entry of fs.readdirSync(mcpDir, { withFileTypes: true })) {
      if (entry.isDirectory()) servers.add(entry.name);
    }
  }
  return servers;
}

/**
 * Wiersze tabel agentów w README: `| **nazwa** | opis | Model | Yes/No |`.
 * Nazwa bywa ze ścieżką (`implementers/test-implementer`) — bierzemy ostatni segment.
 */
function parseReadmeRows() {
  if (!fs.existsSync(README)) return null;
  const lines = fs.readFileSync(README, 'utf8').split('\n');
  const rows = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*\*\*([^*]+)\*\*\s*\|(.*?)\|\s*(Haiku|Sonnet|Opus)\s*\|/i);
    if (!m) continue;
    const name = m[1].trim().split('/').pop();
    rows.set(name, { model: m[3].toLowerCase(), line: i + 1 });
  }
  return rows;
}

function main() {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.log('No agents directory found, skipping validation');
    process.exit(0);
  }

  const mcpServers = collectMcpServers();
  const readmeRows = parseReadmeRows();
  const files = findAgentFiles(AGENTS_DIR);
  const seenInReadme = new Set();

  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      err(`${rel}:1`, e.message);
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm) {
      err(`${rel}:1`, 'brak frontmatteru (`---` musi być pierwszą linią pliku)');
      continue;
    }
    if (fm.error) {
      err(`${rel}:1`, `frontmatter nie parsuje się jako YAML: ${fm.error}`);
    }

    for (const field of REQUIRED_FIELDS) {
      const v = fm.data[field];
      if (v == null || (typeof v === 'string' && !v.trim())) {
        err(`${rel}:1`, `brak wymaganego pola: ${field}`);
      }
    }

    const expectedName = path.basename(filePath, '.md');
    if (fm.data.name && fm.data.name !== expectedName) {
      err(`${rel}:${frontmatterKeyLine(fm.raw, 'name')}`,
        `name "${fm.data.name}" ≠ nazwa pliku "${expectedName}"`);
    }

    if (fm.data.model && !VALID_MODELS.includes(String(fm.data.model))) {
      err(`${rel}:${frontmatterKeyLine(fm.raw, 'model')}`,
        `nieznany model "${fm.data.model}" (dozwolone: ${VALID_MODELS.join(', ')})`);
    }

    for (const key of ['tools', 'disallowedTools']) {
      for (const tool of asList(fm.data[key])) {
        const m = tool.match(/^mcp__([a-zA-Z0-9-]+)__/);
        if (!m) continue;
        if (!mcpServers.has(m[1])) {
          err(`${rel}:${frontmatterKeyLine(fm.raw, key)}`,
            `${key}: narzędzie "${tool}" wskazuje na nieistniejący serwer MCP "${m[1]}" ` +
            `(znane: ${[...mcpServers].sort().join(', ')})`);
        }
      }
    }

    if (readmeRows) {
      const row = readmeRows.get(expectedName);
      if (!row) {
        err(`${rel}:1`, `agent nieobecny w tabeli agents/README.md — dopisz wiersz`);
      } else {
        seenInReadme.add(expectedName);
        if (fm.data.model && row.model !== String(fm.data.model)) {
          err(`agents/README.md:${row.line}`,
            `model w tabeli "${row.model}" ≠ frontmatter "${fm.data.model}" (${rel})`);
        }
      }
    }
  }

  if (readmeRows) {
    for (const [name, row] of readmeRows) {
      if (!seenInReadme.has(name)) {
        err(`agents/README.md:${row.line}`, `wiersz tabeli "${name}" nie ma pliku agenta w agents/`);
      }
    }
  }

  for (const w of warnings) console.warn(w);
  for (const e of errors) console.error(e);
  if (errors.length) {
    console.error(`\n${errors.length} błędów w ${files.length} plikach agentów`);
    process.exit(1);
  }
  console.log(`Validated ${files.length} agent files (${warnings.length} warnings)`);
}

main();
