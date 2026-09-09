#!/usr/bin/env node
/**
 * validate-hooks.js — walidator konfiguracji hooków.
 *
 * Część 1 (od zawsze): schemat `hooks/hooks.json` — poprawne zdarzenia, matchery,
 * pola wpisów, składnia inline JS w `node -e`.
 *
 * Część 2 (K103, TASK-KAIZEN-002): DRYF NAZW. Każdy hook wskazany w
 * `hooks/hooks.json`, `templates/settings/*.json` i `blocks/**.yml` musi istnieć
 * jako plik w `hooks/`. Bez tego usunięcie hooka (K98/K99 wycięły hooki sesyjne)
 * zostawia martwy wpis, który harness cicho ignoruje — konfiguracja wygląda na
 * kompletną, a bramka nie działa.
 *
 * Część 3 (K103): każdy `hooks/*.js` deklaruje w nagłówku swoje zdarzenie
 * (PreToolUse / PostToolUse / Stop / …). Hook bez tej informacji jest nie do
 * wpięcia bez czytania kodu.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../..');
const HOOKS_DIR = path.join(ROOT, 'hooks');
const HOOKS_FILE = path.join(HOOKS_DIR, 'hooks.json');
const SETTINGS_DIR = path.join(ROOT, 'templates', 'settings');
const BLOCKS_DIR = path.join(ROOT, 'blocks');

/**
 * Pełna lista zdarzeń hooków wspieranych przez harness.
 * Źródło: https://code.claude.com/docs/en/hooks — zweryfikowane 2026-08-08.
 *
 * Wcześniejsza wersja tej listy miała 8 pozycji i odrzucała `SubagentStart`
 * oraz `WorktreeCreate` — wpisy obecne w `hooks.json` i całkowicie poprawne.
 * Fałszywy alarm walidatora jest gorszy niż brak walidatora: uczy ignorowania
 * jego wyjścia, przez co prawdziwy błąd przechodzi niezauważony.
 *
 * Przy aktualizacji Claude Code: sprawdź dokumentację, nie zgaduj z zachowania.
 */
const VALID_EVENTS = [
  // sesja
  'SessionStart', 'SessionEnd', 'Setup',
  // tura
  'UserPromptSubmit', 'UserPromptExpansion', 'Stop', 'StopFailure',
  // narzędzia
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch',
  'PermissionRequest', 'PermissionDenied',
  // subagenci i taski
  'SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted', 'TeammateIdle',
  // środowisko
  'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'FileChanged',
  'WorktreeCreate', 'WorktreeRemove', 'InstructionsLoaded',
  // kontekst
  'PreCompact', 'PostCompact',
  // komunikaty
  'Notification', 'MessageDisplay', 'Elicitation', 'ElicitationResult',
];

/**
 * Validate a single hook entry has required fields and valid inline JS
 * @param {object} hook - Hook object with type and command fields
 * @param {string} label - Label for error messages (e.g., "PreToolUse[0].hooks[1]")
 * @returns {boolean} true if errors were found
 */
// Kształt wpisu czytamy ze schematu (K110, 2026-09-07) — schemas/hooks.schema.json był
// dotąd bez konsumenta i przez to niezauważenie błędny. VALID_EVENTS zostaje tutaj:
// schemat celowo trzyma listę zdarzeń otwartą (waliduje ją harness, nie my).
const HOOK_SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/hooks.schema.json'), 'utf8'));
const HOOK_ITEM_DEF = HOOK_SCHEMA.$defs?.hookItem ?? {};
const ALLOWED_ITEM_TYPES = HOOK_ITEM_DEF.properties?.type?.enum ?? ['command'];
const ALLOWED_ITEM_KEYS = Object.keys(HOOK_ITEM_DEF.properties ?? { type: 1, command: 1, async: 1, timeout: 1 });

function validateHookEntry(hook, label) {
  let hasErrors = false;

  if (!hook.type || typeof hook.type !== 'string') {
    console.error(`ERROR: ${label} missing or invalid 'type' field`);
    hasErrors = true;
  } else if (!ALLOWED_ITEM_TYPES.includes(hook.type)) {
    console.error(`ERROR: ${label} 'type' must be one of ${ALLOWED_ITEM_TYPES.join('|')} (schemas/hooks.schema.json), got '${hook.type}'`);
    hasErrors = true;
  }
  for (const k of Object.keys(hook)) {
    if (!ALLOWED_ITEM_KEYS.includes(k)) {
      console.error(`ERROR: ${label} unknown key '${k}' (allowed by schemas/hooks.schema.json: ${ALLOWED_ITEM_KEYS.join(', ')})`);
      hasErrors = true;
    }
  }

  // Validate optional async and timeout fields
  if ('async' in hook && typeof hook.async !== 'boolean') {
    console.error(`ERROR: ${label} 'async' must be a boolean`);
    hasErrors = true;
  }
  if ('timeout' in hook && (typeof hook.timeout !== 'number' || hook.timeout < 0)) {
    console.error(`ERROR: ${label} 'timeout' must be a non-negative number`);
    hasErrors = true;
  }

  if (!hook.command || (typeof hook.command !== 'string' && !Array.isArray(hook.command)) || (typeof hook.command === 'string' && !hook.command.trim()) || (Array.isArray(hook.command) && (hook.command.length === 0 || !hook.command.every(s => typeof s === 'string' && s.length > 0)))) {
    console.error(`ERROR: ${label} missing or invalid 'command' field`);
    hasErrors = true;
  } else if (typeof hook.command === 'string') {
    // Validate inline JS syntax in node -e commands
    const nodeEMatch = hook.command.match(/^node -e "(.*)"$/s);
    if (nodeEMatch) {
      try {
        new vm.Script(nodeEMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
      } catch (syntaxErr) {
        console.error(`ERROR: ${label} has invalid inline JS: ${syntaxErr.message}`);
        hasErrors = true;
      }
    }
  }

  return hasErrors;
}

// ── Część 2 + 3: dryf nazw hooków i nagłówki zdarzeń ────────────────────────

/** Zbiór nazw plików istniejących w hooks/ (z rozszerzeniem i bez). */
function existingHookNames() {
  const names = new Set();
  if (!fs.existsSync(HOOKS_DIR)) return names;
  for (const entry of fs.readdirSync(HOOKS_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(js|sh|mjs|cjs)$/.test(entry.name)) continue;
    names.add(entry.name);
    names.add(entry.name.replace(/\.(js|sh|mjs|cjs)$/, ''));
  }
  return names;
}

function walkFiles(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, filter, acc);
    else if (filter(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * Referencje do hooków w plikach konfiguracyjnych.
 * @returns {Array<{file: string, line: number, name: string}>}
 */
function collectHookReferences() {
  const refs = [];
  const push = (file, content, re, group = 1) => {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(re)) {
        refs.push({ file: path.relative(ROOT, file), line: i + 1, name: m[group] });
      }
    }
  };

  // JSON: ścieżki `hooks/<nazwa>.js` w polach "command"
  for (const file of [HOOKS_FILE, ...walkFiles(SETTINGS_DIR, (n) => n.endsWith('.json'))]) {
    if (!fs.existsSync(file)) continue;
    push(file, fs.readFileSync(file, 'utf8'), /hooks\/([\w.-]+\.(?:js|sh|mjs|cjs))/g);
  }

  // Bloki (ADR 0008): `hooks: [nazwa, nazwa]` — nazwy bez rozszerzenia
  for (const file of walkFiles(BLOCKS_DIR, (n) => n.endsWith('.yml') || n.endsWith('.yaml'))) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*hooks:\s*\[([^\]]*)\]/);
      if (!m) continue;
      for (const raw of m[1].split(',')) {
        const name = raw.trim().replace(/^["']|["']$/g, '');
        if (name) refs.push({ file: path.relative(ROOT, file), line: i + 1, name });
      }
    }
  }

  return refs;
}

/**
 * Pliki w `hooks/`, które nie są hookami zdarzeniowymi i nie mają deklarować eventu.
 * Katalog jest symlinkowany globalnie (~/.claude/hooks/), więc mieszkają tu też
 * narzędzia CLI wołane po ścieżce — każdy wyjątek z powodem.
 */
const NON_EVENT_SCRIPTS = new Map([
  ['statusline-pm.js', 'statusline (settings.statusLine), nie zdarzenie hooka'],
  ['workflow-lint.js', 'CLI wołane po ścieżce przez /orchestrate — sam plik to mówi w nagłówku'],
]);

/** Zdarzenie zadeklarowane w nagłówku pliku hooka (pierwsze 40 linii). */
function headerEvent(filePath) {
  const head = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 40).join('\n');
  return VALID_EVENTS.find((ev) => new RegExp(`\\b${ev}\\b`).test(head)) || null;
}

function validateDrift() {
  const errors = [];
  const existing = existingHookNames();

  for (const ref of collectHookReferences()) {
    if (!existing.has(ref.name)) {
      errors.push(`ERROR: ${ref.file}:${ref.line} - hook "${ref.name}" nie istnieje w hooks/`);
    }
  }

  for (const file of walkFiles(HOOKS_DIR, (n) => n.endsWith('.js'))) {
    if (path.dirname(file) !== HOOKS_DIR) continue; // hooks/lib/** to biblioteki, nie hooki
    if (NON_EVENT_SCRIPTS.has(path.basename(file))) continue;
    if (!headerEvent(file)) {
      errors.push(`ERROR: ${path.relative(ROOT, file)}:1 - nagłówek nie deklaruje zdarzenia ` +
        `(dopisz np. "PostToolUse Hook: …" w komentarzu na górze pliku)`);
    }
  }

  return errors;
}

function validateHooks() {
  if (!fs.existsSync(HOOKS_FILE)) {
    console.log('No hooks.json found, skipping validation');
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf-8'));
  } catch (e) {
    console.error(`ERROR: Invalid JSON in hooks.json: ${e.message}`);
    process.exit(1);
  }

  // Support both object format { hooks: {...} } and array format
  const hooks = data.hooks || data;
  let hasErrors = false;
  let totalMatchers = 0;

  if (typeof hooks === 'object' && !Array.isArray(hooks)) {
    // Object format: { EventType: [matchers] }
    for (const [eventType, matchers] of Object.entries(hooks)) {
      if (!VALID_EVENTS.includes(eventType)) {
        console.error(`ERROR: Invalid event type: ${eventType}`);
        hasErrors = true;
        continue;
      }

      if (!Array.isArray(matchers)) {
        console.error(`ERROR: ${eventType} must be an array`);
        hasErrors = true;
        continue;
      }

      for (let i = 0; i < matchers.length; i++) {
        const matcher = matchers[i];
        if (typeof matcher !== 'object' || matcher === null) {
          console.error(`ERROR: ${eventType}[${i}] is not an object`);
          hasErrors = true;
          continue;
        }
        if (!matcher.matcher) {
          console.error(`ERROR: ${eventType}[${i}] missing 'matcher' field`);
          hasErrors = true;
        }
        if (!matcher.hooks || !Array.isArray(matcher.hooks)) {
          console.error(`ERROR: ${eventType}[${i}] missing 'hooks' array`);
          hasErrors = true;
        } else {
          // Validate each hook entry
          for (let j = 0; j < matcher.hooks.length; j++) {
            if (validateHookEntry(matcher.hooks[j], `${eventType}[${i}].hooks[${j}]`)) {
              hasErrors = true;
            }
          }
        }
        totalMatchers++;
      }
    }
  } else if (Array.isArray(hooks)) {
    // Array format (legacy)
    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i];
      if (!hook.matcher) {
        console.error(`ERROR: Hook ${i} missing 'matcher' field`);
        hasErrors = true;
      }
      if (!hook.hooks || !Array.isArray(hook.hooks)) {
        console.error(`ERROR: Hook ${i} missing 'hooks' array`);
        hasErrors = true;
      } else {
        // Validate each hook entry
        for (let j = 0; j < hook.hooks.length; j++) {
          if (validateHookEntry(hook.hooks[j], `Hook ${i}.hooks[${j}]`)) {
            hasErrors = true;
          }
        }
      }
      totalMatchers++;
    }
  } else {
    console.error('ERROR: hooks.json must be an object or array');
    process.exit(1);
  }

  const driftErrors = validateDrift();
  for (const e of driftErrors) console.error(e);
  if (driftErrors.length) hasErrors = true;

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`Validated ${totalMatchers} hook matchers + referencje hooków (hooks.json, templates/settings/, blocks/)`);
}

validateHooks();
