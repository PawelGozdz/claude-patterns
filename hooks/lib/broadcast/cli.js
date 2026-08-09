#!/usr/bin/env node
/**
 * Broadcast CLI — deterministyczna warstwa wykonawcza dla `/broadcast` i `/broadcast-status`.
 *
 * Komendy w `commands/*.md` są promptami: mówią modelowi CO nadać, ale zapis, walidację
 * i wszystkie reguły ADR 0006 (D1, D4, D5, D9, D11) wykonuje ten skrypt. Model nie ma
 * jak ich obejść, bo nie pisze do kanału bezpośrednio.
 *
 * Użycie:
 *   node cli.js init      [--repo R] [--instance I] [--emits a,b] [--subscribes r/t,...] [--force]
 *   node cli.js emit      --topic <repo/domain> --title "..." [--body "..."|--body-file F]
 *                         [--kind discovery|done] [--class interpretive|deterministic]
 *                         [--severity info|important|critical] [--owner REPO]
 *                         [--paths a.ts,b.ts] [--reply-to ULID] [--human] [--dry-run] [--json]
 *   node cli.js read      [--limit N] [--include-decided] [--json]
 *   node cli.js ack       <id> --decision acked|ignored|escalated|applied|dismissed [--note "..."]
 *   node cli.js claim     <id>
 *   node cli.js gate      [--json]
 *   node cli.js status    [--json]
 *   node cli.js doctor
 *
 * Kody wyjścia: 0 = ok · 1 = błąd użycia/walidacji · 2 = brak manifestu (broadcast wyłączony)
 *               3 = `claim` przegrany (ktoś inny działa)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const paths = require('./paths');
const manifestLib = require('./manifest');
const schema = require('./schema');
const channel = require('./channel');
const cursorLib = require('./cursor');
const claimLib = require('./claim');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMPLATE_PATH = path.join(REPO_ROOT, 'templates', 'broadcast', 'broadcast.yml');

function main(argv) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);

  switch (command) {
    case 'init':
      return cmdInit(args);
    case 'emit':
      return cmdEmit(args);
    case 'read':
      return cmdRead(args);
    case 'ack':
      return cmdAck(args);
    case 'claim':
      return cmdClaim(args);
    case 'install-hooks':
      return cmdInstallHooks(args);
    case 'gate':
      return cmdGate(args);
    case 'inbox':
      return cmdInbox(args);
    case 'stop':
      return cmdStop(args);
    case 'resume':
      return cmdResume(args);
    case 'status':
      return cmdStatus(args);
    case 'doctor':
      return cmdDoctor(args);
    default:
      process.stderr.write(usage());
      return command ? 1 : 0;
  }
}

// ── init ──────────────────────────────────────────────────────────────────────

function cmdInit(args) {
  const cwd = process.cwd();
  const root = gitRoot(cwd) || cwd;
  const target = path.join(root, manifestLib.MANIFEST_RELATIVE_PATH);

  paths.ensureLayout();

  if (fs.existsSync(target) && !args.force) {
    process.stdout.write(`Manifest już istnieje: ${target} (użyj --force, żeby nadpisać)\n`);
    ensureGitExclude(root);
    return 0;
  }

  const instance = args.instance || path.basename(root);
  const repo = args.repo || instance.replace(/-\d+$/, '');
  const emits = splitList(args.emits);
  const subscribes = splitList(args.subscribes);

  let content = readTemplate();
  content = content
    .replace(/^repo:.*$/m, `repo: ${repo}`)
    .replace(/^instance:.*$/m, `instance: ${instance}`)
    .replace(/^ {2}domain:.*$/m, `  domain: [${emits.join(', ')}]`);

  if (subscribes.length > 0) {
    content = content.replace(
      /^subscribes:[\s\S]*$/m,
      `subscribes:\n${subscribes.map((s) => `  - ${s}`).join('\n')}\n`,
    );
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  ensureGitExclude(root);

  const loaded = manifestLib.load(root);
  if (!loaded.ok) {
    process.stderr.write(`Manifest zapisany, ale nie przechodzi walidacji:\n  - ${loaded.errors.join('\n  - ')}\n`);
    return 1;
  }
  manifestLib.syncRegistry(loaded.manifest);

  process.stdout.write(
    `Manifest: ${target}\n` +
      `  repo=${loaded.manifest.repo} instance=${loaded.manifest.instance}\n` +
      `  emits.domain=[${loaded.manifest.emits.domain.join(', ')}]\n` +
      `  subscribes=[${loaded.manifest.subscribes.join(', ')}]\n` +
      `Stan runtime: ${paths.root()}\n` +
      `Plik jest nieśledzony (.git/info/exclude) — repo nie dostaje żadnej zmiany.\n`,
  );
  return 0;
}

function readTemplate() {
  try {
    return fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } catch {
    // Fallback, gdy CLI działa poza drzewem claude-patterns.
    return ['repo: CHANGE_ME', 'instance: CHANGE_ME', 'emits:', '  domain: []', 'subscribes: []', ''].join('\n');
  }
}

/** D3 — wykluczenie w `.git/info/exclude`, NIE w `.gitignore` (zero zmian śledzonych). */
function ensureGitExclude(root) {
  const excludePath = path.join(root, '.git', 'info', 'exclude');
  const entry = '.claude/config/broadcast.yml';
  try {
    if (!fs.existsSync(path.dirname(excludePath))) return false;
    const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
    if (current.split('\n').some((line) => line.trim() === entry)) return true;
    fs.appendFileSync(excludePath, `${current.endsWith('\n') || !current ? '' : '\n'}${entry}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ── emit ──────────────────────────────────────────────────────────────────────

function cmdEmit(args) {
  const ctx = requireManifest();
  if (!ctx) return 2;

  const kind = args.kind || 'discovery';
  if (!schema.ENABLED_KINDS.includes(kind) && !args['allow-experimental']) {
    process.stderr.write(
      `Dopuszczone kind: ${schema.ENABLED_KINDS.join(', ')}.\n` +
        `\`${kind}\` jest zablokowane — OQ5 (kto może emitować) i OQ6 (semantyka u odbiorcy)\n` +
        'czekają na decyzję człowieka. Wymuszenie na własną odpowiedzialność: --allow-experimental\n',
    );
    return 1;
  }

  let body = args.body || '';
  if (args['body-file']) {
    try {
      body = fs.readFileSync(args['body-file'], 'utf8');
    } catch (err) {
      process.stderr.write(`Nie można odczytać --body-file: ${err.message}\n`);
      return 1;
    }
  }

  const message = schema.buildMessage(
    {
      topic: args.topic,
      kind,
      class: args.class,
      severity: args.severity,
      owner: args.owner,
      reply_to: args['reply-to'] || null,
      title: args.title,
      body,
      paths: splitList(args.paths),
      instance: ctx.manifest.instance,
    },
    { manifest: ctx.manifest, branch: gitBranch() },
  );

  const registry = manifestLib.loadRegistry();
  const result = schema.validate(message, { manifest: ctx.manifest, registry, human: !!args.human });

  for (const warning of result.warnings) process.stderr.write(`⚠ ${warning}\n`);

  if (!result.ok) {
    process.stderr.write(`Wiadomość odrzucona:\n  - ${result.errors.join('\n  - ')}\n`);
    return 1;
  }

  // „Martwe topiki" — emisja w próżnię jest legalna, ale musi być widoczna (sekcja Ryzyka).
  const listeners = registry.filter(
    (entry) => entry.instance !== ctx.manifest.instance && subscribesFromRegistry(entry, message.topic),
  );
  // `answer` ma z definicji jednego adresata — pytającego, wskazanego przez `reply_to`.
  // Ostrzeżenie o „martwym topicu" byłoby tu myląco fałszywe.
  const isTargetedAnswer = message.kind === 'answer' && !!message.reply_to;
  if (listeners.length === 0 && !isTargetedAnswer) {
    process.stderr.write(`⚠ topic ${message.topic} nie ma dziś ani jednego subskrybenta w rejestrze\n`);
  }

  if (args['dry-run']) {
    process.stdout.write(`${JSON.stringify(message, null, 2)}\n[dry-run] nic nie zapisano\n`);
    return 0;
  }

  channel.append(message);
  paths.pruneSegments();
  manifestLib.syncRegistry(ctx.manifest);

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ id: message.id, topic: message.topic, listeners: listeners.length })}\n`);
  } else {
    process.stdout.write(
      `Nadano ${message.id} → ${message.topic} [${message.kind}/${message.class}/${message.severity}]` +
        `${message.owner ? ` owner=${message.owner}` : ''}\n` +
        `Subskrybentów (poza tobą): ${listeners.length}\n`,
    );
  }
  return 0;
}

function subscribesFromRegistry(entry, topic) {
  const parsed = manifestLib.splitTopic(topic);
  if (!parsed) return false;
  if (parsed.repo === entry.repo && parsed.name === manifestLib.INBOUND_TOPIC) return true;
  return (entry.subscribes || []).some((sub) => {
    const [repo, name] = String(sub).split('/');
    return repo === parsed.repo && (name === '*' || name === parsed.name);
  });
}

// ── read ──────────────────────────────────────────────────────────────────────

function cmdRead(args) {
  const ctx = requireManifest();
  if (!ctx) return 2;

  const cursor = cursorLib.read(ctx.manifest.instance);
  const { messages, skipped } = channel.readWindow();
  const visible = channel.visibleFor(messages, ctx.manifest);
  const selected = args['include-decided'] ? visible : channel.undecided(visible, cursor);
  const limited = selected.slice(-(Number(args.limit) || 20));

  // Kursor przesuwamy tylko o bajty (bramka), NIE o decyzje — te nadaje `ack`.
  cursorLib.markSegments(ctx.manifest.instance, channel.segmentSizes());
  manifestLib.syncRegistry(ctx.manifest);

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ messages: limited, skipped }, null, 2)}\n`);
    return 0;
  }

  if (limited.length === 0) {
    process.stdout.write('Brak nowych wpisów.\n');
    return 0;
  }

  process.stdout.write(limited.map(renderMessage).join('\n') + '\n');
  if (skipped > 0) process.stderr.write(`⚠ pominięto ${skipped} uszkodzonych linii\n`);
  return 0;
}

function renderMessage(msg) {
  const head =
    `[${msg.severity}] ${msg.topic} · ${msg.kind}/${msg.class} · ${msg.instance}` +
    `${msg.owner ? ` · owner=${msg.owner}` : ''}`;
  const meta = `  id=${msg.id} ts=${msg.ts}${msg.branch ? ` branch=${msg.branch}` : ''}`;
  const body = msg.body ? `  ${String(msg.body).split('\n').join('\n  ')}` : '';
  const files = msg.paths && msg.paths.length ? `  paths: ${msg.paths.join(', ')}` : '';
  return [head, `  ${msg.title}`, meta, body, files].filter(Boolean).join('\n');
}

// ── ack / claim / gate ────────────────────────────────────────────────────────

function cmdAck(args) {
  const ctx = requireManifest();
  if (!ctx) return 2;

  const id = args._[0];
  const decision = args.decision;
  if (!id || !decision) {
    process.stderr.write('Użycie: ack <id> --decision acked|ignored|escalated|applied|dismissed [--note "..."]\n');
    return 1;
  }
  if (decision === 'dismissed' && !args.note) {
    process.stderr.write('`dismissed` wymaga --note z jednym zdaniem uzasadnienia (OQ6)\n');
    return 1;
  }

  // OQ6 (rozstrzygnięte 2026-08-09) — `invalidate` znaczy „sprawdź, zanim napiszesz",
  // NIE „zatrzymaj się". Żeby to nie stało się darmową wymówką („nie zrobiłem, bo ktoś
  // unieważnił"), odbiorca musi zająć stanowisko: `applied` albo `dismissed`, zawsze
  // z jednym zdaniem uzasadnienia. Ślad zostaje w kursorze i jest widoczny w przeglądzie.
  const acked = channel.readWindow().messages.find((m) => m.id === id);
  if (acked && acked.kind === 'invalidate') {
    if (decision !== 'applied' && decision !== 'dismissed') {
      process.stderr.write(
        `Wpis ${id} to \`invalidate\` — wymagana decyzja \`applied\` albo \`dismissed\` (OQ6), nie \`${decision}\`.\n` +
          '`invalidate` znaczy „sprawdź, zanim napiszesz", więc trzeba powiedzieć, co ze sprawdzenia wyszło.\n',
      );
      return 1;
    }
    if (!args.note) {
      process.stderr.write('Decyzja o `invalidate` wymaga --note z jednym zdaniem uzasadnienia (OQ6)\n');
      return 1;
    }
  }

  try {
    cursorLib.recordDecision(ctx.manifest.instance, id, decision, args.note);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }
  cursorLib.markSegments(ctx.manifest.instance, channel.segmentSizes());
  process.stdout.write(`${id} → ${decision}${args.note ? ` (${args.note})` : ''}\n`);
  return 0;
}

function cmdClaim(args) {
  const ctx = requireManifest();
  if (!ctx) return 2;

  const id = args._[0];
  if (!id) {
    process.stderr.write('Użycie: claim <id>\n');
    return 1;
  }

  const result = claimLib.tryClaim(id, ctx.manifest.instance);
  if (result.acquired) {
    process.stdout.write(`Claim wzięty przez ${ctx.manifest.instance} — to ty wykonujesz akcję repo-level.\n`);
    return 0;
  }
  process.stdout.write(
    `Claim zajęty przez ${result.holder?.instance || 'nieznaną instancję'} ` +
      `(${result.holder?.ts || '?'}) — skończ na ACK, nie twórz taska.\n`,
  );
  return 3;
}

function cmdGate(args) {
  // STOP sprawdzamy PRZED manifestem i przed czymkolwiek innym — to jest wyłącznik
  // awaryjny stand-by (`KILL` dotyczy tylko subagentów, a stand-by to main agent).
  const stop = readStop();
  if (stop) {
    const suffix = stop.reason ? ` — ${stop.reason}` : '';
    if (args.json) process.stdout.write(`${JSON.stringify({ stop: true, ...stop })}\n`);
    else process.stdout.write(`STOP${suffix}\n`);
    return 0;
  }

  const ctx = requireManifest();
  if (!ctx) return 2;

  // Rejestr odświeżamy właśnie tutaj: `gate` jest komendą uruchamianą najczęściej
  // (co tick stand-by), a bez tego rozjazd manifestów byłby widoczny dopiero po emisji.
  manifestLib.syncRegistry(ctx.manifest);

  const cursor = cursorLib.read(ctx.manifest.instance);
  const { hasNew, newBytes } = channel.gate(cursor);

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ hasNew, newBytes })}\n`);
  } else {
    process.stdout.write(hasNew ? `NEW ${newBytes}\n` : 'EMPTY\n');
  }
  return 0;
}

// ── inbox (faza 6.4) ──────────────────────────────────────────────────────────

/**
 * Inbox per instancja (ADR 0006, D8) — jedyna droga, którą treść broadcastu trafia
 * do pracującego implementera.
 *
 * `tmux send-keys` jest wykluczony: trafia do stdin panelu, więc gdy implementer stoi
 * na dialogu uprawnień („Allow Edit?") albo na `AskUserQuestion`, wstrzyknięty tekst
 * zostaje potraktowany jako odpowiedź na ten dialog. Inbox + hook `UserPromptSubmit`
 * osiąga to samo bez dotykania stdin.
 *
 * Format: markdown czytelny dla człowieka (`cat` wystarczy), z komentarzem-znacznikiem
 * na początku każdego bloku, żeby hook mógł go sparsować bez zgadywania.
 */
const INBOX_MARKER = /^<!-- broadcast:([0-9A-HJKMNP-TV-Z]{26}) severity=(\w+) ts=(\S+) -->$/;

function cmdInbox(args) {
  const ctx = requireManifest();
  if (!ctx) return 2;

  const action = args._[0] || 'show';
  const instance = typeof args.instance === 'string' ? args.instance : ctx.manifest.instance;
  const target = paths.inboxPath(instance);

  if (action === 'clear') {
    try {
      fs.unlinkSync(target);
      process.stdout.write(`Inbox wyczyszczony: ${target}\n`);
    } catch {
      process.stdout.write('Inbox był pusty.\n');
    }
    return 0;
  }

  if (action === 'show') {
    const entries = readInbox(instance);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
      return 0;
    }
    if (entries.length === 0) {
      process.stdout.write('Inbox pusty.\n');
      return 0;
    }
    process.stdout.write(entries.map((e) => e.raw).join('\n') + '\n');
    return 0;
  }

  if (action !== 'push') {
    process.stderr.write('Użycie: inbox [show|push --id <ULID> [--note "..."]|clear] [--instance <name>]\n');
    return 1;
  }

  const id = args.id;
  if (!id || id === true) {
    process.stderr.write('`inbox push` wymaga --id <ULID>\n');
    return 1;
  }

  const { messages } = channel.readWindow();
  const msg = messages.find((m) => m.id === id);
  if (!msg) {
    process.stderr.write(`Nie znaleziono wiadomości ${id} w oknie kanału (mogła wygasnąć — TTL 72 h)\n`);
    return 1;
  }

  // Stand-by wolno wagę OBNIŻYĆ, nigdy podnieść (D11) — dlatego `--severity` przyjmujemy
  // tylko wtedy, gdy jest słabsza od oryginalnej.
  let severity = msg.severity;
  if (typeof args.severity === 'string' && SEVERITY_RANK[args.severity] > SEVERITY_RANK[msg.severity]) {
    severity = args.severity;
  } else if (typeof args.severity === 'string' && args.severity !== msg.severity) {
    process.stderr.write(`⚠ ignoruję --severity ${args.severity}: wagę wolno tylko obniżyć (wpis ma ${msg.severity})\n`);
  }

  const existing = readInbox(instance);
  if (existing.some((e) => e.id === msg.id)) {
    process.stdout.write(`${msg.id} jest już w inboxie — pomijam.\n`);
    return 0;
  }

  const block = renderInboxEntry(msg, severity, typeof args.note === 'string' ? args.note : '');
  paths.ensureLayout();
  fs.appendFileSync(target, `${block}\n`, 'utf8');
  process.stdout.write(`Do inboxa ${instance}: ${msg.id} [${severity}] ${msg.title}\n`);
  return 0;
}

const SEVERITY_RANK = { critical: 0, important: 1, info: 2 };

function renderInboxEntry(msg, severity, note) {
  const lines = [`<!-- broadcast:${msg.id} severity=${severity} ts=${new Date().toISOString()} -->`];
  lines.push(`[${severity}] ${msg.topic} — ${msg.title}`);
  lines.push(`  od: ${msg.instance}${msg.branch ? ` (${msg.branch})` : ''}${msg.owner ? ` · owner: ${msg.owner}` : ''}`);
  if (msg.body) lines.push(`  ${String(msg.body).replace(/\s+/g, ' ').slice(0, 600)}`);
  if (msg.paths?.length) lines.push(`  pliki: ${msg.paths.slice(0, 5).join(', ')}`);
  if (note) lines.push(`  stand-by: ${note}`);
  return lines.join('\n');
}

/** @returns {Array<{id: string, severity: string, ts: string, raw: string}>} */
function readInbox(instance) {
  let raw;
  try {
    raw = fs.readFileSync(paths.inboxPath(instance), 'utf8');
  } catch {
    return [];
  }

  const entries = [];
  let current = null;
  for (const line of raw.split('\n')) {
    const marker = line.match(INBOX_MARKER);
    if (marker) {
      if (current) entries.push(current);
      current = { id: marker[1], severity: marker[2], ts: marker[3], raw: line };
      continue;
    }
    if (current) current.raw += `\n${line}`;
  }
  if (current) entries.push(current);

  // Uszkodzony/ręcznie edytowany inbox nie może wywrócić hooka — pomijamy resztki.
  return entries.map((e) => ({ ...e, raw: e.raw.replace(/\n+$/, '') }));
}

// ── stop / resume ─────────────────────────────────────────────────────────────

/**
 * Wyłącznik awaryjny wszystkich pętli stand-by (sekcja Ryzyka).
 * Jeden plik zatrzymuje WSZYSTKIE instancje — celowo gruby młot: sytuacja, w której
 * się go używa, to „coś oszalało", a nie precyzyjne strojenie.
 */
function cmdStop(args) {
  paths.ensureLayout();
  const payload = {
    reason: typeof args.reason === 'string' ? args.reason : '',
    ts: new Date().toISOString(),
    by: process.env.USER || 'unknown',
  };
  fs.writeFileSync(paths.stopPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `STOP założony: ${paths.stopPath()}\nWszystkie pętle stand-by zakończą się przy najbliższym ticku.\nWznowienie: resume\n`,
  );
  return 0;
}

function cmdResume() {
  const stop = readStop();
  if (!stop) {
    process.stdout.write('STOP nie był założony — nic do zrobienia.\n');
    return 0;
  }
  try {
    fs.unlinkSync(paths.stopPath());
  } catch (err) {
    process.stderr.write(`Nie mogę usunąć ${paths.stopPath()}: ${err.message}\n`);
    return 1;
  }
  process.stdout.write(`STOP zdjęty (był od ${stop.ts || '?'}${stop.reason ? `, powód: ${stop.reason}` : ''}).\n`);
  return 0;
}

/** @returns {{reason?: string, ts?: string, by?: string}|null} */
function readStop() {
  try {
    const raw = fs.readFileSync(paths.stopPath(), 'utf8');
    try {
      return JSON.parse(raw);
    } catch {
      // Ręcznie utworzony `touch STOP` też musi działać — liczy się obecność pliku.
      return { reason: raw.trim().slice(0, 200) };
    }
  } catch {
    return null;
  }
}

// ── install-hooks ─────────────────────────────────────────────────────────────

/**
 * Wpięcie obu hooków do `<projekt>/.claude/settings.local.json` — PER PROJEKT, nie globalnie.
 *
 * Dlaczego per projekt: skoro cały system ma być porzucalny, wpięcie też musi być
 * porzucalne w jednym miejscu (`--remove`). Wpis globalny dokładałby dwa procesy node
 * do każdego `SessionStart` i każdej edycji we WSZYSTKICH projektach, w tym tych,
 * które o broadcaście nigdy nie słyszały.
 *
 * Dlaczego `settings.local.json`, a NIE `settings.json`: w repach pilota ten drugi jest
 * ŚLEDZONY przez gita. Wpisanie tam hooków złamałoby główną obietnicę ADR („zero zmian
 * śledzonych w repo serwisowym") i przy czterech równoległych branchach produkowałoby
 * dokładnie te konflikty, którym broadcast ma zapobiegać. `settings.local.json` jest
 * gitignorowany, a hooki z obu plików **dokładają się** — sprawdzone empirycznie
 * 2026-08-08 (dwa hooki `SessionStart` w obu plikach, oba odpaliły).
 *
 * `setup-project.sh` nigdzie indziej nie modyfikuje ustawień (dla PM tylko wypisuje
 * podpowiedź). Łamiemy tę konwencję świadomie i tylko tutaj: sekcja jest opt-in,
 * scalanie robi Node (nie bash), zapis jest atomowy i idempotentny.
 */
const HOOK_ENTRIES = [
  {
    event: 'SessionStart',
    matcher: '*',
    script: 'broadcast-session-start.js',
    command: 'node "$HOME/.claude/hooks/broadcast-session-start.js"',
    description: 'Broadcast: read cross-instance channel (ADR 0006). Silent without .claude/config/broadcast.yml.',
  },
  {
    event: 'PostToolUse',
    matcher: 'Edit|Write|MultiEdit',
    script: 'broadcast-task-emit.js',
    command: 'node "$HOME/.claude/hooks/broadcast-task-emit.js"',
    description: 'Broadcast: remind about /broadcast on cross-cluster task files. Once per task per day.',
  },
  {
    // Faza 6.4. Wpięcie jest bezpieczne nawet przed decyzją o wstrzykiwaniu: hook kończy
    // się bez wyjścia, dopóki manifest nie ma `inject: true` (albo BROADCAST_INJECT=on).
    event: 'UserPromptSubmit',
    matcher: '*',
    script: 'broadcast-inbox-inject.js',
    command: 'node "$HOME/.claude/hooks/broadcast-inbox-inject.js"',
    description: 'Broadcast: deliver inbox into the next prompt (ADR 0006 D8/D11). Inert unless inject: true.',
  },
];

function cmdInstallHooks(args) {
  const root = gitRoot(process.cwd()) || process.cwd();
  const settingsPath = args.settings === true || !args.settings
    ? path.join(root, '.claude', 'settings.local.json')
    : path.resolve(args.settings);

  let settings = {};
  let existed = false;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    existed = true;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`Nie mogę sparsować ${settingsPath}: ${err.message}\n(popraw plik ręcznie — nie nadpisuję czegoś, czego nie rozumiem)\n`);
      return 1;
    }
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {};
  const changes = [];

  for (const entry of HOOK_ENTRIES) {
    const bucket = Array.isArray(settings.hooks[entry.event]) ? settings.hooks[entry.event] : [];
    const index = bucket.findIndex((group) =>
      (group.hooks || []).some((hook) => String(hook.command || '').includes(entry.script)),
    );

    if (args.remove) {
      if (index >= 0) {
        bucket.splice(index, 1);
        changes.push(`− ${entry.event}: ${entry.command}`);
      }
      settings.hooks[entry.event] = bucket;
      continue;
    }

    if (index >= 0) continue; // już wpięty — idempotencja
    bucket.push({
      matcher: entry.matcher,
      hooks: [{ type: 'command', command: entry.command }],
      description: entry.description,
    });
    settings.hooks[entry.event] = bucket;
    changes.push(`+ ${entry.event}: ${entry.command}`);
  }

  // Nie zostawiamy pustych sekcji po `--remove`.
  for (const event of Object.keys(settings.hooks)) {
    if (Array.isArray(settings.hooks[event]) && settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  if (changes.length === 0) {
    process.stdout.write(`Bez zmian: ${settingsPath}${args.remove ? ' (hooków broadcastu tam nie było)' : ' (oba hooki już wpięte)'}\n`);
    return 0;
  }

  if (args['dry-run']) {
    process.stdout.write(`[dry-run] ${settingsPath}\n  ${changes.join('\n  ')}\n`);
    return 0;
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const tmp = `${settingsPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, settingsPath);

  process.stdout.write(
    `${existed ? 'Zaktualizowano' : 'Utworzono'}: ${settingsPath}\n  ${changes.join('\n  ')}\n` +
      `${args.remove ? '' : 'Wycofanie: node <ten-plik> install-hooks --remove\n'}`,
  );
  return 0;
}

// ── status ────────────────────────────────────────────────────────────────────

function cmdStatus(args) {
  const loaded = manifestLib.load();
  const manifest = loaded.manifest;
  const registry = manifestLib.loadRegistry();
  const { messages, skipped, segments } = channel.readWindow();
  const cursors = cursorLib.listAll();
  const claims = new Set(claimLib.listAll().map((c) => c.messageId));

  const withoutOwnerDecision = messages.filter((msg) => msg.owner && !claims.has(paths.safeName(msg.id)));
  const deadTopics = [...new Set(messages.map((m) => m.topic))].filter(
    (topic) => !registry.some((entry) => subscribesFromRegistry(entry, topic)),
  );
  const staleQuestions = unansweredQuestions(messages);
  const drift = manifestDrift(registry);

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        { segments, total: messages.length, skipped, withoutOwnerDecision, deadTopics, drift, cursors },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const lines = [];
  lines.push('[BROADCAST STATUS]');
  lines.push(
    manifest
      ? `Instancja: ${manifest.instance} (repo ${manifest.repo}) · kanał: ${paths.root()}`
      : `Instancja: brak manifestu — broadcast wyłączony tutaj · kanał: ${paths.root()}`,
  );
  if (loaded.errors.length) lines.push(`⚠ manifest: ${loaded.errors.join('; ')}`);
  lines.push(`Segmenty: ${segments.join(', ') || '—'} · wpisów w oknie: ${messages.length} · pominiętych linii: ${skipped}`);
  lines.push('');

  const recent = messages.slice(-10).reverse();
  lines.push(`Ostatnie wpisy (${recent.length}/${messages.length}):`);
  if (recent.length === 0) lines.push('  — kanał pusty');
  for (const msg of recent) {
    const mine = manifest && msg.instance === manifest.instance ? ' (moje)' : '';
    const sub = manifest && manifestLib.subscribesTo(manifest, msg.topic) ? '' : ' [nie subskrybuję]';
    lines.push(`  ${msg.ts.slice(5, 16)} ${msg.severity.padEnd(9)} ${msg.topic} — ${msg.title}${mine}${sub}`);
  }
  lines.push('');

  lines.push(`Wpisy z owner, bez claimu (nikt nie podjął): ${withoutOwnerDecision.length}`);
  for (const msg of withoutOwnerDecision.slice(-5)) {
    lines.push(`  ${msg.id} → owner=${msg.owner} · ${msg.topic} — ${msg.title}`);
  }

  lines.push(`Topiki bez subskrybentów: ${deadTopics.length ? deadTopics.join(', ') : '—'}`);

  // OQ7 — cicha rezygnacja jest zakazana: po dwóch takich przypadkach agenty przestaną
  // używać kanału pytań. Raport, nie automatyczna akcja.
  if (staleQuestions.length > 0) {
    lines.push(`⚠ Pytania bez odpowiedzi > ${QUESTION_TIMEOUT_HOURS} h: ${staleQuestions.length}`);
    for (const q of staleQuestions.slice(0, 5)) {
      lines.push(`  ${q.id} · ${q.topic} · od ${q.instance} (${q.ageHours} h) — ${q.title}`);
    }
  }
  lines.push('');

  lines.push('Kursory:');
  if (cursors.length === 0) lines.push('  — żadna instancja jeszcze nie czytała');
  for (const cur of cursors) {
    const age = cur.mtimeMs ? `${Math.round((Date.now() - cur.mtimeMs) / 60000)} min temu` : 'nieznany wiek';
    lines.push(`  ${cur.instance}: ${Object.keys(cur.decisions).length} decyzji · ${age}`);
  }

  if (drift.length) {
    lines.push('');
    lines.push('⚠ Rozjazd manifestów (instancje tego samego repo deklarują różne rzeczy):');
    for (const item of drift) lines.push(`  ${item.repo}: ${item.detail}`);
  }

  lines.push('');
  lines.push('Stan workflow lokalnych runów: project-orchestration/RUN-STATE.md (jeśli projekt go używa).');

  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

/** OQ7 — próg, po którym pytanie bez odpowiedzi trafia do raportu dla człowieka. */
const QUESTION_TIMEOUT_HOURS = 24;

/**
 * Pytania starsze niż próg, na które nie ma `answer` z pasującym `reply_to`.
 * Świadomie tylko RAPORT — żadnej automatycznej eskalacji ani ponowienia. Kanał pytań
 * ma być widoczny dla człowieka, a nie sam sobie generować ruch.
 */
function unansweredQuestions(messages) {
  const answered = new Set(messages.filter((m) => m.kind === 'answer' && m.reply_to).map((m) => m.reply_to));
  const cutoff = Date.now() - QUESTION_TIMEOUT_HOURS * 3600 * 1000;

  return messages
    .filter((m) => m.kind === 'question' && !answered.has(m.id) && Date.parse(m.ts) < cutoff)
    .map((m) => ({
      id: m.id,
      topic: m.topic,
      instance: m.instance,
      title: m.title,
      ageHours: Math.floor((Date.now() - Date.parse(m.ts)) / 3600000),
    }));
}

/** Manifest jest gitignorowany (D3) → instancje jednego repo mogą się rozjechać po cichu. */
function manifestDrift(registry) {
  const byRepo = new Map();
  for (const entry of registry) {
    if (!byRepo.has(entry.repo)) byRepo.set(entry.repo, []);
    byRepo.get(entry.repo).push(entry);
  }

  const drift = [];
  for (const [repo, entries] of byRepo) {
    if (entries.length < 2) continue;
    const shapes = new Set(
      entries.map((e) => JSON.stringify({ emits: e.emits, subscribes: [...(e.subscribes || [])].sort() })),
    );
    if (shapes.size > 1) {
      drift.push({ repo, detail: `${entries.map((e) => e.instance).join(', ')} — różne emits/subscribes` });
    }
  }
  return drift;
}

// ── doctor ────────────────────────────────────────────────────────────────────

function cmdDoctor() {
  const loaded = manifestLib.load();
  const lines = [];

  lines.push(`Katalog stanu: ${paths.root()} ${paths.layoutExists() ? '(istnieje)' : '(BRAK — uruchom init)'}`);
  if (!loaded.manifestPath) {
    lines.push('Manifest: brak — broadcast wyłączony dla tej instancji (to poprawny stan domyślny)');
  } else {
    lines.push(`Manifest: ${loaded.manifestPath}`);
    lines.push(loaded.ok ? '  walidacja: OK' : `  walidacja: BŁĄD\n    - ${loaded.errors.join('\n    - ')}`);
  }
  lines.push(`Rejestr manifestów: ${manifestLib.loadRegistry().length} instancji`);
  const { messages, skipped } = channel.readWindow();
  lines.push(`Kanał: ${messages.length} wpisów w oknie ${paths.SEGMENT_WINDOW} segmentów, ${skipped} pominiętych linii`);

  process.stdout.write(`${lines.join('\n')}\n`);
  return loaded.manifestPath && !loaded.ok ? 1 : 0;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function requireManifest() {
  const loaded = manifestLib.load();
  if (!loaded.manifestPath) {
    process.stderr.write(
      'Brak `.claude/config/broadcast.yml` — broadcast nie jest włączony w tym projekcie.\n' +
        'Włącz: node <claude-patterns>/hooks/lib/broadcast/cli.js init\n',
    );
    return null;
  }
  if (!loaded.ok) {
    process.stderr.write(`Manifest nie przechodzi walidacji:\n  - ${loaded.errors.join('\n  - ')}\n`);
    return null;
  }
  return loaded;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function splitList(value) {
  if (!value || value === true) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function gitBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function gitRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function usage() {
  return [
    'broadcast — kanał wymiany informacji między instancjami Claude Code (ADR 0006)',
    '',
    '  init    założenie manifestu + katalogu stanu (idempotentne)',
    '  emit    nadanie wiadomości (waliduje D1/D4/D5/D9/D11 przed zapisem)',
    '  read    nieprzeczytane wpisy dla tej instancji',
    '  ack     decyzja o wpisie (acked|ignored|escalated|applied|dismissed)',
    '  claim   atomowe przejęcie obowiązku repo-level (O_EXCL)',
    '  install-hooks  wpięcie hooków do .claude/settings.local.json projektu (--remove wycofuje)',
    '  gate    bramka pustego przebiegu: STOP | EMPTY | NEW <bajty>',
    '  inbox   show | push --id <ULID> [--note "..."] | clear   (faza 6.4)',
    '  stop    wyłącznik awaryjny WSZYSTKICH pętli stand-by (--reason "...")',
    '  resume  zdjęcie wyłącznika',
    '  status  raport kanału (wzorzec /pm-status — bez agenta)',
    '  doctor  diagnostyka konfiguracji',
    '',
  ].join('\n');
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[broadcast] ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main };
