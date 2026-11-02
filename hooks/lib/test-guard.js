'use strict';
// Wspólna logika bramki testów: hook block-unscoped-tests.js (co wolno uruchomić) i
// tools/scoped-tests/run.mjs (czym silnik uruchamia testy w sondzie). Jedna definicja, żeby
// hook i narzędzie nie mogły się rozjechać: to, co narzędzie odpala, hook musiałby przepuścić.
//
// Reguła (user, 2026-10-31): test runner wolno uruchomić WYŁĄCZNIE jako
//   pnpm test:e2e <plik> [<plik>…]   albo   pnpm test:integration <plik> [<plik>…]
// czyli skrypt projektu z jawną listą plików, bez `--`. Żadnego npx/vitest/jest wprost, żadnego
// `npm run test`, żadnego gołego `pnpm test*` (uruchamia cały pakiet) i żadnego katalogu/globa.

const fs = require('fs');
const path = require('path');

// L2/L3 w marketing-hub i grant-flow to ten sam podział co integration/e2e w juz-ide-api.
const DEFAULT_ALLOW = ['test:e2e', 'test:integration', 'test:l2', 'test:l3'];
const UNIT_SCRIPTS = ['test', 'test:l1', 'test:unit'];
const RUNNER_BINS = new Set(['vitest', 'jest', 'mocha', 'ava', 'jasmine', 'karma', 'tap', 'playwright', 'cypress']);
const MANAGERS = new Set(['pnpm', 'npm', 'yarn', 'bun']);
const WRAPPERS = new Set(['env', 'time', 'nohup', 'command', 'exec', 'sudo', 'nice', 'ionice', 'stdbuf', 'then', 'do', 'else', 'if', 'while', '!']);
const FILE_TOKEN = /^[^*?\s]+\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(spec|test|e2e-spec)\.[cm]?[jt]sx?$/;
const INTEGRATION_FILE = /\.integration\.(spec|test)\.[cm]?[jt]sx?$/;
const E2E_FILE = /\.(e2e\.(spec|test)|e2e-spec)\.[cm]?[jt]sx?$/;

function loadConfig(startDir) {
  const cfg = { allowUnit: false, allow: [], source: null };
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, '.claude', 'test-guard.json');
    if (fs.existsSync(p)) {
      try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        cfg.allowUnit = j.allowUnit === true;
        cfg.allow = Array.isArray(j.allow) ? j.allow.filter((s) => typeof s === 'string' && /^test(:[\w-]+)*$/.test(s)) : [];
        cfg.source = p;
      } catch { /* zepsuty plik = domyślna (najostrzejsza) polityka */ }
      return cfg;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return cfg;
}

function allowedScripts(cfg) {
  return new Set([...DEFAULT_ALLOW, ...(cfg.allow || []), ...(cfg.allowUnit ? UNIT_SCRIPTS : [])]);
}

function classifyTestFile(file) {
  if (E2E_FILE.test(file)) return 'e2e';
  if (INTEGRATION_FILE.test(file)) return 'integration';
  return 'unit';
}

// ── tokenizacja powłoki (cudzysłowy, cięcie na separatory) ──
function splitSegments(command) {
  const src = String(command).replace(/\\\r?\n/g, ' ');
  const out = [];
  let cur = '';
  let q = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      cur += ch;
      if (ch === '\\' && q === '"' && i + 1 < src.length) { cur += src[++i]; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '\\' && i + 1 < src.length) { cur += ch + src[++i]; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '|' || ch === ';' || ch === '\n' || ch === '&') {
      // `&>`, `2>&1`, `>&2` to przekierowania, nie separator
      if (ch === '&' && (src[i + 1] === '>' || src[i - 1] === '>')) { cur += ch; continue; }
      out.push(cur);
      cur = '';
      if ((ch === '&' || ch === '|') && src[i + 1] === ch) i++;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function tokenize(seg) {
  const toks = [];
  let cur = '';
  let had = false;
  let q = null;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (q) {
      if (ch === '\\' && q === '"' && i + 1 < seg.length) { cur += seg[++i]; continue; }
      if (ch === q) { q = null; continue; }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; had = true; continue; }
    if (ch === '\\' && i + 1 < seg.length) { cur += seg[++i]; had = true; continue; }
    if (/\s/.test(ch)) { if (had || cur) toks.push(cur); cur = ''; had = false; continue; }
    cur += ch;
  }
  if (had || cur) toks.push(cur);
  // przekierowania (`> log`, `2>&1`, `<file`, `&>x`) nie są argumentami komendy
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^\d*(>>?|<)&?\d*$/.test(t) || /^&>>?$/.test(t)) { if (!/&\d+$/.test(t)) i++; continue; }
    if (/^\d*(>>?|<)\S/.test(t) || /^&>\S/.test(t)) continue;
    out.push(t);
  }
  return out;
}

const VALUE_FLAGS = new Set(['-C', '--dir', '-F', '--filter', '--workspace', '--loglevel', '--config', '--prefix']);

// Rozbiera `pnpm|npm|yarn|bun …` do { manager, script | bin, rest, flags }.
function parseManager(manager, toks) {
  let i = 0;
  const flags = [];
  const skipFlags = () => {
    while (i < toks.length && toks[i].startsWith('-') && toks[i] !== '--') {
      flags.push(toks[i]);
      if (!toks[i].includes('=') && VALUE_FLAGS.has(toks[i])) i++;
      i++;
    }
  };
  skipFlags();
  const sub = toks[i++];
  if (sub == null) return null;
  if (['run', 'run-script', 'rum', 'urn'].includes(sub)) {
    skipFlags();
    const script = toks[i++];
    return script == null ? null : { manager, script, rest: toks.slice(i), flags };
  }
  if (['exec', 'x', 'dlx'].includes(sub)) {
    skipFlags();
    const bin = toks[i++];
    return bin == null ? null : { manager, bin: path.basename(bin).replace(/@.*$/, ''), rest: toks.slice(i), flags };
  }
  const name = sub === 't' || sub === 'tst' ? 'test' : sub;
  if (RUNNER_BINS.has(name)) return { manager, bin: name, rest: toks.slice(i), flags };
  return { manager, script: name, rest: toks.slice(i), flags };
}

function isTestScript(s) { return typeof s === 'string' && /^test(:|$)/.test(s); }

function runnerHit(bin, rest) {
  if (!RUNNER_BINS.has(bin)) return false;
  if (bin === 'playwright') return rest.includes('test');
  if (bin === 'cypress') return rest.includes('run');
  return true;
}

// Zwraca null (nie jest uruchomieniem testów albo jest zgodne z regułą) albo { rule, segment, detail }.
function checkSegment(seg, cfg, depth) {
  if ((depth || 0) > 3) return null;
  // podpowłoki: $(…) i `…` — sprawdź ich wnętrze osobno
  const nested = [];
  seg.replace(/\$\(([^()]*)\)/g, (_, inner) => { nested.push(inner); return ''; });
  seg.replace(/`([^`]*)`/g, (_, inner) => { nested.push(inner); return ''; });
  for (const inner of nested) {
    for (const s of splitSegments(inner)) {
      const v = checkSegment(s, cfg, (depth || 0) + 1);
      if (v) return v;
    }
  }
  const toks = tokenize(seg.replace(/^[({\s]+/, ''));
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || WRAPPERS.has(t)) { i++; continue; }
    if (t === 'timeout' && /^\d/.test(toks[i + 1] || '')) { i += 2; continue; }
    break;
  }
  if (i >= toks.length) return null;
  const cmd = path.basename(toks[i]);
  const rest = toks.slice(i + 1);

  if (['bash', 'sh', 'zsh', 'dash'].includes(cmd)) {
    const ci = rest.findIndex((x) => /^-[a-z]*c$/.test(x));
    if (ci >= 0 && rest[ci + 1] != null) {
      for (const s of splitSegments(rest[ci + 1])) {
        const v = checkSegment(s, cfg, (depth || 0) + 1);
        if (v) return v;
      }
    }
    return null;
  }

  if (cmd === 'xargs') {
    const j = rest.findIndex((x) => {
      const b = path.basename(x);
      return MANAGERS.has(b) || RUNNER_BINS.has(b) || ['npx', 'bunx', 'pnpx'].includes(b);
    });
    if (j < 0) return null;
    // plik-lista z stdin jest niewidoczna: pusta lista = cały pakiet, więc xargs nie przechodzi nigdy
    const inner = checkSegment(rest.slice(j).join(' '), { ...cfg, anyFile: true }, (depth || 0) + 1);
    const isTestRun = inner || /\btest(:|\b)/.test(rest.slice(j).join(' '));
    return isTestRun ? { rule: 'xargs', segment: seg, detail: 'lista plików z xargs/stdin jest niewidoczna dla bramki (pusta lista = cały pakiet)' } : null;
  }

  if (['turbo', 'nx', 'lerna', 'rush'].includes(cmd)) {
    return rest.some(isTestScript) ? { rule: 'orchestrator', segment: seg, detail: `${cmd} uruchamia testy wielu pakietów` } : null;
  }

  if (runnerHit(cmd, rest)) {
    return { rule: 'direct-runner', segment: seg, detail: `${cmd} wprost omija skrypty projektu (konfiguracja, flock testów ciężkich)` };
  }

  if (['npx', 'bunx', 'pnpx'].includes(cmd)) {
    let k = 0;
    while (k < rest.length && rest[k].startsWith('-')) k++;
    const bin = rest[k] ? path.basename(rest[k]).replace(/@.*$/, '') : '';
    return runnerHit(bin, rest.slice(k + 1)) ? { rule: 'direct-runner', segment: seg, detail: `${cmd} ${bin} omija skrypty projektu` } : null;
  }

  if (!MANAGERS.has(cmd)) return null;
  const p = parseManager(cmd, rest);
  if (!p) return null;
  if (p.bin) {
    return runnerHit(p.bin, p.rest) ? { rule: 'direct-runner', segment: seg, detail: `${cmd} … ${p.bin} omija skrypty projektu` } : null;
  }
  if (!isTestScript(p.script)) return null;

  if (cmd !== 'pnpm') return { rule: 'manager', segment: seg, detail: `${cmd} ${p.script}: testy tylko przez pnpm` };
  if (p.flags.some((f) => f === '-r' || f === '--recursive' || f === '--parallel' || f === '--workspace-root')) {
    return { rule: 'recursive', segment: seg, detail: 'uruchomienie we wszystkich pakietach workspace' };
  }
  if (!allowedScripts(cfg).has(p.script)) {
    return { rule: 'script', segment: seg, detail: `skrypt \`${p.script}\` nie jest dozwolony (dozwolone: ${[...allowedScripts(cfg)].join(', ')})` };
  }
  if (p.rest.includes('--')) return { rule: 'double-dash', segment: seg, detail: '`--` wycina filtr plików i uruchamia cały zestaw' };
  const positionals = [];
  for (let k = 0; k < p.rest.length; k++) {
    const t = p.rest[k];
    if (t.startsWith('-')) {
      const next = p.rest[k + 1];
      if (!t.includes('=') && next != null && !next.startsWith('-') && !FILE_TOKEN.test(next)) k++; // wartość flagi
      continue;
    }
    positionals.push(t);
  }
  if (cfg.anyFile) return null;
  if (positionals.length === 0) return { rule: 'no-files', segment: seg, detail: `\`pnpm ${p.script}\` bez plików uruchamia cały zestaw` };
  const bad = positionals.filter((t) => !FILE_TOKEN.test(t));
  if (bad.length) return { rule: 'not-a-file', segment: seg, detail: `argumenty nie są jawnymi plikami testowymi: ${bad.join(' ')}` };
  return null;
}

function findViolation(command, cfg) {
  const c = cfg || loadConfig();
  for (const seg of splitSegments(command)) {
    const v = checkSegment(seg, c, 0);
    if (v) return v;
  }
  return null;
}

module.exports = {
  DEFAULT_ALLOW, UNIT_SCRIPTS, TEST_FILE, loadConfig, allowedScripts, classifyTestFile,
  splitSegments, tokenize, findViolation, checkSegment,
};
