#!/usr/bin/env node
/**
 * check-test-implementer-scope.js — SubagentStop hook (write scope of the test-implementer)
 *
 * Why it exists: juz-ide-api-1, TS-SEC-D0-BETA-HARDENING-001 (2026-10-20). A hand-spawned
 * `test-implementer` changed PRODUCTION code (`verify-phone-login/handler.ts`, through a Bash
 * `python3 … s.replace`, per the 2026-10-21 transcript audit) and a production fix (HIGH-2) went
 * through the same agent; nothing reviewed it afterwards: the engine verifier never sees a
 * hand-spawned agent, and the pattern-reads hook only checks that a card was READ. A test layer
 * that edits the code under test no longer proves anything ("tests prove rules, they do not
 * repeat the implementation").
 *
 * What it does, at SubagentStop of an agent whose type is `test-implementer`:
 *   1. Scan the agent's OWN transcript (`agent_transcript_path`).
 *   2. Collect every file it wrote through Write/Edit/MultiEdit, plus files a Bash command
 *      writes (sed -i, perl -pi, tee, `>`/`>>`, python/node write calls) — HEURISTIC, see below.
 *   3. Every path outside the test scope is a violation: block the stop (exit 2) so the agent
 *      reverts it and reports the needed production change as a gap instead.
 *
 * Test scope (allowed): *.spec.* / *.test.* / *.e2e-spec.*, __tests__/, test(s)/, fixtures/, __mocks__/,
 * testing/, *.fixture|mother|mock|stub|fake.*, vitest/jest/playwright config, .claude/, project-orchestration/.
 * A project extends it in `.claude/test-scope.json`: { "allow": ["<regex on the repo-relative path>", …] }.
 *
 * Bash detection is a heuristic: it flags a command that has a write construct AND names a source-looking
 * path (ts/js/json/yaml/sql…) outside the scope. It cannot see a write hidden behind a script or an
 * interpreter reading its program from a file. It closes the observed hole, it is not a sandbox.
 *
 * Loop guard: `stop_hook_active` set ⇒ we already intervened once ⇒ pass (warn on stderr).
 * Modes (env TEST_SCOPE_MODE): block (default) — exit 2 · warn — stderr, exit 0 · off — disabled.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MODE = process.env.TEST_SCOPE_MODE || 'block';
const AGENT_RE = /(^|[:/])test-implementer$/i;

const ALLOW = [
  /\.(spec|test|e2e-spec)\.[cm]?[jt]sx?$/,
  /(^|\/)(__tests__|tests?|__fixtures__|fixtures?|__mocks__|testing)\//,
  /\.(fixture|mother|mock|stub|fake)\.[cm]?[jt]s$/,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /(^|\/)(vitest|jest|playwright)[\w.-]*\.config\.[cm]?[jt]s$/,
  // `.claude/` poza konfiguracją kontroli: agent od testów nie może sam poszerzyć swojego zakresu (`test-scope.json`
  // z `allow: [".*"]`) ani wystawić sobie wyjątku od reguł ciała pliku (`conformance.json`) — to robi człowiek.
  /^\.claude\/(?!conformance\.json$|test-scope\.json$)/,
  /^project-orchestration\//,
];

// Polecenie Bash zdolne zapisać plik tak, że cel nie widać w treści (skrypt, pętla, `cd dir && sed -i`, `git apply`).
// Samo takie polecenie niczego nie blokuje: uruchamia drugą, deterministyczną warstwę (pliki zmienione w czasie życia agenta).
const WRITE_CAPABLE = new RegExp(
  '\\b(?:python3?|node|deno|bun|perl|ruby|bash|sh|zsh|tee|cp|mv|rm|ln|truncate|install|patch|rsync|dd)\\b' +
  '|\\bsed\\s+(?:-\\S+\\s+)*-\\w*i|\\bawk\\s+-i\\s+inplace|--(?:write|fix)\\b' +
  '|\\bgit\\s+(?:apply|checkout|restore|stash|reset|am)\\b' +
  '|(?:^|[^>&\\d=])>>?\\s*(?!/tmp/|/dev/)[^\\s&|;<>()]');

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

// Zakres rozszerza człowiek, więc czytamy go z HEAD, nie z drzewa roboczego: agent, który zapisał `allow: [".*"]`,
// nie może tym zapisem usprawiedliwić reszty swoich zmian. Poza repozytorium git (testy, katalog bez gita) czytamy plik.
const PROTECTED = /^\.claude\/(?:conformance|test-scope)\.json$/;

function loadExtraAllow(cwd) {
  try {
    const inGit = spawnSync('git', ['rev-parse', '--git-dir'], { cwd, encoding: 'utf8' }).status === 0;
    let src = null;
    if (inGit) {
      const g = spawnSync('git', ['show', 'HEAD:./.claude/test-scope.json'], { cwd, encoding: 'utf8' });
      if (g.status === 0) src = g.stdout;
    } else {
      src = fs.readFileSync(path.join(cwd, '.claude', 'test-scope.json'), 'utf8');
    }
    if (src == null) return [];
    return (JSON.parse(src).allow || []).map((r) => new RegExp(r));
  } catch { return []; }
}

// Pliki zmienione i nieśledzone według gita (bez usuniętych) — kandydaci drugiej warstwy. null = to nie repozytorium git.
// Ścieżki z `git status --porcelain` są względem KORZENIA repo, a hook liczy względem cwd (podkatalog monorepo): zwracamy ścieżki
// względem cwd, bez tych spoza cwd. { path, deleted } — usunięty plik nie ma mtime, więc osobna ścieżka dowodowa.
function gitChangedPaths(cwd) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 5000 });
  if (top.status !== 0) return null;
  const root = top.stdout.trim();
  const r = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20000 });
  if (r.status !== 0) return null;
  const tok = r.stdout.split('\0').filter(Boolean);
  const out = [];
  for (let i = 0; i < tok.length; i++) {
    const xy = tok[i].slice(0, 2);
    const abs = path.join(root, tok[i].slice(3));
    if (xy[0] === 'R' || xy[0] === 'C') i++; // następny token to ścieżka źródłowa
    const rel = toRel(abs, cwd);
    if (rel) out.push({ path: rel, abs, deleted: xy.includes('D') });
  }
  return out;
}

function toRel(p, cwd) {
  const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
  const rel = path.relative(cwd, abs);
  return rel.startsWith('..') ? null : rel.split(path.sep).join('/'); // outside the project (e.g. /tmp) — not our business
}

function toolUses(entry) {
  if (entry?.type === 'tool_use') return [entry];
  const content = entry?.message?.content || entry?.content || [];
  return Array.isArray(content) ? content.filter((b) => b?.type === 'tool_use') : [];
}

// ── Bash: which files does a command WRITE? ──────────────────────────────────────
// Attribution is deliberately narrow. The first version flagged every path in a command that contained a write
// construct anywhere, and on the real transcript that listed files the agent only read (`tsc -p tsconfig.json > log`,
// a YAML heredoc that merely MENTIONS production files). A path counts only when it is the TARGET of a write:
//   • the word after `>` / `>>` / `tee` / the destination of `cp` / `mv`,
//   • the files of `sed -i` / `perl -pi` in the same shell segment,
//   • in a python/node snippet: a path assigned to p/f/path/file/…, or the first argument of open(…,'w') /
//     Path(…).write_* / writeFileSync(…). Paths inside string content are NOT targets.
// `$VAR` is resolved from simple `NAME=value` assignments in the same command; an unresolved `$VAR` is skipped.
const SRC_EXT = /\.(?:[cm]?[jt]sx?|json|ya?ml|sql|prisma|env[\w.]*)$/;

function resolveVars(command) {
  const vars = {};
  for (const m of command.matchAll(/(?:^|[\s;&])([A-Za-z_]\w*)=(?!=)(["']?)([^\s;&|"']+)\2/g)) vars[m[1]] = m[3];
  const sub = (t) => t.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (_, n) => (n in vars ? vars[n] : '$'));
  return { sub };
}

function bashWrites(command, cwd) {
  const { sub } = resolveVars(command);
  const targets = new Set();
  const add = (raw, requireSlash) => {
    const t = sub(String(raw).replace(/^['"`]|['"`,;)]+$/g, ''));
    if (!t || t.includes('$') || t.startsWith('-') || t.startsWith('/tmp/') || t.startsWith('/dev/')) return;
    if (!SRC_EXT.test(t) || (requireSlash && !t.includes('/'))) return;
    const rel = toRel(t, cwd);
    if (rel) targets.add(rel);
  };
  // redirections and tee: the single word that follows
  for (const m of command.matchAll(/(?:^|[^>&\d=])>>?\s*([^\s&|;<>()]+)/g)) add(m[1], false);
  for (const m of command.matchAll(/\btee\s+(?:-\S+\s+)*([^\s|;&]+)/g)) add(m[1], false);
  // cp / mv: the last argument of the segment is the destination
  for (const seg of command.split(/\n|;|&&|\|\|/)) {
    const cm = seg.match(/\b(?:cp|mv)\s+((?:-\S+\s+)*)(.+)$/);
    if (cm) { const args = cm[2].trim().split(/\s+/); if (args.length >= 2) add(args[args.length - 1], false); }
    // sed -i / perl -pi: every source-looking file argument in this segment
    if (/\bsed\s+(?:-[a-zA-Z]*\s+)*-[a-zA-Z]*i|\bperl\s+-[a-zA-Z]*i/.test(seg)) for (const t of seg.split(/\s+/)) add(t, true);
  }
  // python / node: path-valued assignments and the target of an explicit write
  if (/\.write(?:_text|_bytes)?\(|open\([^)]*['"][wa]b?\+?['"]|\b(?:writeFileSync|appendFileSync|writeFile)\b/.test(command)) {
    for (const m of command.matchAll(/\b(?:p|f|fn|path|file|target|dst|out)\s*=\s*['"]([^'"\n]+)['"]/g)) add(m[1], true);
    for (const m of command.matchAll(/open\(\s*['"]([^'"\n]+)['"]\s*,\s*['"][wa]/g)) add(m[1], true);
    for (const m of command.matchAll(/Path\(\s*['"]([^'"\n]+)['"]\s*\)\.write_/g)) add(m[1], true);
    for (const m of command.matchAll(/\b(?:writeFileSync|appendFileSync|writeFile)\(\s*['"`]([^'"`\n]+)['"`]/g)) add(m[1], true);
  }
  return [...targets];
}

function main() {
  const raw = readStdinSync();
  if (!raw || MODE === 'off') process.exit(0);
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const agentType = payload.agent_type || payload.subagent_type || '';
  if (!AGENT_RE.test(String(agentType))) process.exit(0);

  const transcript = payload.agent_transcript_path;
  if (!transcript) process.exit(0);
  let lines;
  try { lines = fs.readFileSync(transcript, 'utf8').split('\n').filter(Boolean); } catch { process.exit(0); }

  const cwd = payload.cwd || process.cwd();
  const allow = ALLOW.concat(loadExtraAllow(cwd));
  const inScope = (rel) => !PROTECTED.test(rel) && allow.some((re) => re.test(rel));

  const violations = new Map(); // rel path → how
  let startedAt = null;
  let writeCapable = false;
  const bashCommands = [];
  const inferred = new Set(); // naruszenia wnioskowane z mtime/statusu gita (nie z treści poleceń) — mogły być cudzą pracą
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (startedAt == null && entry && entry.timestamp) { const ms = Date.parse(entry.timestamp); if (!Number.isNaN(ms)) startedAt = ms; }
    for (const tu of toolUses(entry)) {
      const input = tu.input || {};
      if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tu.name)) {
        const p = input.file_path || input.path || input.notebook_path;
        const rel = p && toRel(p, cwd);
        if (rel && !inScope(rel)) violations.set(rel, tu.name);
      } else if (tu.name === 'Bash' && typeof input.command === 'string') {
        for (const rel of bashWrites(input.command, cwd)) if (!inScope(rel)) violations.set(rel, 'Bash');
        bashCommands.push(input.command);
        if (WRITE_CAPABLE.test(input.command)) writeCapable = true;
      }
    }
  }
  // Warstwa deterministyczna: heurystyka powyżej nie widzi zapisu ukrytego w skrypcie, pętli czy `cd dir && sed -i`. Gdy agent
  // uruchomił polecenie zdolne do zapisu, plik poza zakresem, zmieniony w czasie jego życia (mtime od pierwszego wpisu
  // transkryptu), jest podejrzany. Bez takiego polecenia mtime nic nie znaczy (zmiany innych agentów), więc warstwa milczy.
  if (writeCapable && startedAt != null) {
    for (const { path: rel, abs, deleted } of gitChangedPaths(cwd) || []) {
      if (violations.has(rel) || inScope(rel)) continue;
      if (deleted) {
        // usunięcie nie ma mtime; liczymy je agentowi tylko wtedy, gdy któreś jego polecenie wymienia ten plik z nazwy
        const base = path.basename(rel);
        if (bashCommands.some((c) => c.includes(rel) || (base.length >= 4 && c.includes(base)))) { violations.set(rel, 'usunięty poleceniem Bash'); inferred.add(rel); }
        continue;
      }
      try {
        if (fs.statSync(abs).mtimeMs >= startedAt - 2000) { violations.set(rel, 'zmieniony w czasie życia agenta, zapis nierozpoznany w poleceniu'); inferred.add(rel); }
      } catch { /* plik zniknął między statusem a stat */ }
    }
  }
  if (!violations.size) process.exit(0);

  const list = [...violations].map(([p, how]) => `  - ${p} (via ${how})`).join('\n');
  const msg = [
    'test-implementer scope: you changed files outside the test scope:',
    list,
    inferred.size
      ? 'Entries marked "zmieniony w czasie życia agenta" / "usunięty poleceniem Bash" are INFERRED from git, not from your own commands: if you did not make a change (another agent or the main session may have), do NOT revert it — say so in your answer. Revert only your own changes and report the production change you need as a GAP in your'
      : 'Revert these changes (restore the original content) and report the production change you need as a GAP in your',
    'answer — the production code belongs to the layer implementer and goes through the verifier. Tests must prove the',
    'rules, not bend the code to fit. A justified helper outside the scope: ask for it in `.claude/test-scope.json` (`allow`).',
  ].join('\n');
  process.stderr.write(msg + '\n');
  if (MODE === 'warn' || payload.stop_hook_active) process.exit(0);
  process.exit(2);
}
main();
