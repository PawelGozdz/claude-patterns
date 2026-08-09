#!/usr/bin/env node
/**
 * PostToolUse Hook — mechanizm emisji (ADR 0006, faza 1 / ROADMAP 6.1).
 *
 * Bez tego hooka wynik pilotażu byłby nieinterpretowalny: „nikt nie nadawał"
 * nie znaczy „kanał bezwartościowy", jeśli nikt nie miał kiedy sobie o nim przypomnieć.
 * Precedens konstrukcyjny: `pm-task-check.js`.
 *
 * Odpala się po zapisie pliku w `project-orchestration/tasks/`. Przypomina o `/broadcast`
 * TYLKO wtedy, gdy treść taska dotyka czegoś poza własnym klastrem — czyli gdy pada
 * nazwa cudzego repo z rejestru albo nazwa cudzego/innego topicu domenowego.
 * Przypomnienie leci raz na task na dobę (dedupe w `state/`), żeby nie stać się szumem.
 *
 * Nic nie emituje samodzielnie. Zawsze `exit 0`, zawsze przepuszcza stdin dalej.
 */

const fs = require('fs');
const path = require('path');

const manifestLib = require('./lib/broadcast/manifest');
const paths = require('./lib/broadcast/paths');

const MAX_STDIN = 512 * 1024;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});

process.stdin.on('end', () => {
  try {
    run();
  } catch {
    // cisza — hook przypominający nigdy nie psuje workflow
  }
  process.stdout.write(data);
  process.exit(0);
});

function run() {
  const input = JSON.parse(data);
  const filePath = (input.tool_input?.file_path || input.tool_input?.path || '').replace(/\\/g, '/');
  if (!filePath.includes('/project-orchestration/tasks/') || !filePath.endsWith('.md')) return;

  const loaded = manifestLib.load(path.dirname(filePath));
  if (!loaded.ok) return; // brak manifestu albo błędny → broadcast tu nie istnieje

  const manifest = loaded.manifest;
  const content = safeRead(filePath);
  if (!content) return;

  const hits = crossClusterHits(content, manifest);
  if (hits.length === 0) return;

  const taskId = path.basename(filePath, '.md');
  if (alreadyRemindedToday(manifest.instance, taskId)) return;

  const suggestion = hits.find((hit) => hit.topic)?.topic || `${manifest.repo}/<domain>`;
  console.error(
    [
      `[broadcast] ${taskId} dotyka: ${hits.map((h) => h.label).join(', ')}`,
      '[broadcast] jeśli ta zmiana zmienia założenia innych instancji — nadaj wpis:',
      `[broadcast]   /broadcast ${suggestion} "<jedno zdanie, co się zmieniło>"`,
      '[broadcast] jeśli nie dotyczy innego repo/klastra — nie nadawaj (OQ4: własny klaster ma to w tasks/)',
    ].join('\n'),
  );

  markReminded(manifest.instance, taskId);
}

/**
 * Sygnały cross-cluster: cudze repo z rejestru albo topic domenowy inny niż kontekst taska.
 * Świadomie prymitywne — to podpowiedź dla człowieka/agenta, nie klasyfikator.
 */
function crossClusterHits(content, manifest) {
  const haystack = content.toLowerCase();
  const hits = [];

  for (const entry of manifestLib.loadRegistry()) {
    if (entry.repo === manifest.repo) continue;
    if (haystack.includes(entry.repo.toLowerCase())) {
      hits.push({ label: `repo ${entry.repo}`, topic: null });
    }
  }

  for (const domain of manifest.emits.domain) {
    if (haystack.includes(domain.toLowerCase())) {
      hits.push({ label: `topic ${domain}`, topic: `${manifest.repo}/${domain}` });
    }
  }

  for (const structural of ['contracts', 'migrations', 'security', 'release']) {
    if (haystack.includes(structural)) {
      hits.push({ label: structural, topic: `${manifest.repo}/${structural}` });
    }
  }

  // Więcej niż jeden klaster w jednym tasku = dokładnie ten przypadek, o który chodzi.
  return hits.length >= 2 ? hits.slice(0, 4) : [];
}

function stateFile(instance) {
  return paths.statePath(`task-emit-${instance}`);
}

function alreadyRemindedToday(instance, taskId) {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile(instance), 'utf8'));
    return state[taskId] === today();
  } catch {
    return false;
  }
}

function markReminded(instance, taskId) {
  try {
    paths.ensureLayout();
    let state = {};
    try {
      state = JSON.parse(fs.readFileSync(stateFile(instance), 'utf8'));
    } catch {
      state = {};
    }
    state[taskId] = today();
    fs.writeFileSync(stateFile(instance), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {
    // brak dedupe jest lepszy niż wywrócony hook
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}
