#!/usr/bin/env node
// PreToolUse(Bash) hook — deny recursive searches over the repo root.
//
// Why: Claude Code ≥ 2.1.259 asks the user for permission when `grep -r`,
// `rg` or `git grep` walks a directory containing a file covered by a
// `Read(.env)` deny rule (every repo root here). Deny rules apply even in
// bypassPermissions mode, so an Explore agent grepping `.` stalls the whole
// flow with a prompt every few seconds. Denying here (with a reason) lets the
// agent adapt on its own — Grep tool, or a scoped `grep -r … src/ docs/`.
//
// Verified 2026-09-03: `--exclude=.env` does NOT avoid the prompt; grepping a
// subdirectory without `.env` and the Grep tool both do.

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { return process.exit(0); }
  if (input.tool_name !== 'Bash') return process.exit(0);
  const cmd = (input.tool_input && input.tool_input.command) || '';
  const hit = findRootSearch(cmd);
  if (!hit) return process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Blocked by block-root-grep hook: \`${hit}\` walks the repo root, which holds .env ` +
        '(covered by the Read(.env) deny rule) and would force a permission prompt on the user. ' +
        'Use the Grep tool instead, or scope the Bash search to subdirectories that have no .env ' +
        '(e.g. `grep -rn PATTERN src/ docs/ test/`). --exclude=.env does not help.',
    },
  }));
  process.exit(0);
});

const ROOTISH = new Set(['.', './', '*', './*', '$PWD', '"$PWD"', '${PWD}']);

// Split on unquoted `|`, `||`, `&&`, `;`, newline — a `\|` inside a quoted grep
// pattern must NOT start a new segment (false positive found 2026-09-04).
function splitSegments(command) {
  const out = [];
  let cur = '';
  let q = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (q) {
      cur += ch;
      if (ch === '\\' && q === '"' && i + 1 < command.length) { cur += command[++i]; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) { cur += ch + command[++i]; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '|' || ch === ';' || ch === '\n' || (ch === '&' && command[i + 1] === '&')) {
      out.push(cur); cur = '';
      if (ch === '&' || (ch === '|' && command[i + 1] === '|')) i++;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function findRootSearch(command) {
  const segments = splitSegments(command);
  for (const seg of segments) {
    const toks = tokenize(seg);
    if (toks.length === 0) continue;
    let i = 0;
    // skip leading env assignments / sudo / timeout N
    while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++;
    if (toks[i] === 'timeout' && /^\d/.test(toks[i + 1] || '')) i += 2;
    const cmd = toks[i];
    const rest = toks.slice(i + 1);
    if (cmd === 'git' && rest[0] === 'grep') {
      if (!rest.includes('--')) return seg;
      continue;
    }
    if (cmd === 'rg') {
      const ops = operands(rest, RG_VALUE_OPTS);
      if (ops.length <= 1 || ops.slice(1).some(isRootish)) return seg;
      continue;
    }
    if (cmd === 'grep' || cmd === 'egrep' || cmd === 'fgrep') {
      const recursive = rest.some((t) => /^-[A-Za-z]*[rR]/.test(t) || t === '--recursive' || t === '--dereference-recursive');
      if (!recursive) continue;
      const ops = operands(rest, GREP_VALUE_OPTS);
      const hasPatternOpt = rest.some((t) => /^-(e|f|-regexp|-file)(=|$)/.test(t));
      const paths = hasPatternOpt ? ops : ops.slice(1);
      if (paths.length === 0 || paths.some(isRootish)) return seg;
    }
  }
  return null;
}

const GREP_VALUE_OPTS = new Set(['-e', '-f', '-m', '-A', '-B', '-C', '-d', '-D', '--include', '--exclude', '--exclude-dir', '--regexp', '--file', '--max-count', '--color', '--colour', '--label']);
const RG_VALUE_OPTS = new Set(['-e', '-f', '-g', '-t', '-T', '-m', '-A', '-B', '-C', '-M', '-j', '--regexp', '--file', '--glob', '--iglob', '--type', '--type-not', '--max-count', '--max-depth', '--max-filesize', '--color', '--colors', '--context-separator', '--path-separator', '--pre', '--sort', '--sortr', '--threads', '--replace', '-r']);

function operands(tokens, valueOpts) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') { out.push(...tokens.slice(i + 1)); break; }
    if (t.startsWith('-') && t.length > 1) {
      if (!t.includes('=') && valueOpts.has(t)) i++; // consume option value
      continue;
    }
    out.push(t);
  }
  return out;
}

function isRootish(t) {
  const s = t.replace(/^['"]|['"]$/g, '');
  return ROOTISH.has(s) || s === process.cwd() || s === process.cwd() + '/';
}

function tokenize(s) {
  const out = [];
  const re = /"([^"\\]|\\.)*"|'[^']*'|\S+/g;
  let m;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}
