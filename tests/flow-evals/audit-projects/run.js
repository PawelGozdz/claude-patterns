#!/usr/bin/env node
/**
 * tests/flow-evals/audit-projects/run.js — eval L1 dla scripts/audit-projects.mjs.
 *
 * DLACZEGO (2026-10-10): audyt flotowy meldował „0 martwych dowiązań", bo skanował
 * stare ścieżki (.claude/knowledge/{skills,rules}), a feature-flags miał martwe
 * .claude/skills/continuous-learning-v2. Do tej pory nic nie testowało samego audytu,
 * więc taki błąd wychodził dopiero z ręcznego porównania z rzeczywistością.
 *
 * Wszystko w katalogu tymczasowym (--root): żaden prawdziwy projekt nie jest dotykany.
 * Kontrakty:
 *   1. martwe dowiązanie (wpis i jeden poziom w głąb) jest BŁĘDEM; żywe — nie; .claude/worktrees ignorowany
 *   2. katalogi `_*` są pomijane w całości
 *   3. higiena gita: absolutny symlink, .bak, zależność kompozycji w .gitignore
 *   4. settings.json bez deny .env; ręczny CLAUDE.md bez CLAUDE-LOCAL.md
 *   5. staleness: zmiana TYLKO generatora (inputs_hash ten sam) = INFO, zmiana wejść = BŁĄD
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const AUDIT = path.join(REPO, 'scripts', 'audit-projects.mjs');
const MATERIALIZE = path.join(REPO, 'scripts', 'materialize-runtime.mjs');
const COMPOSITION = path.join(REPO, 'tests', 'flow-evals', 'materialize-runtime', 'fixtures', 'nestjs-ddd-kysely.project.yml');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-audit-'));
const write = (p, c = '') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const mkProject = (name) => {
  const P = path.join(root, name);
  write(path.join(P, '.claude/config/project.yml'), 'name: x\n');
  return P;
};
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });

// 1) martwe dowiązania
const dead = mkProject('deadproj');
fs.mkdirSync(path.join(dead, '.claude/skills'), { recursive: true });
fs.symlinkSync('/nonexistent/skill-gone', path.join(dead, '.claude/skills/gone'));
write(path.join(dead, 'real.md'), 'x');
fs.symlinkSync(path.join(dead, 'real.md'), path.join(dead, '.claude/skills/alive'));
fs.mkdirSync(path.join(dead, '.claude/knowledge/patterns/cat'), { recursive: true });
fs.symlinkSync('/nonexistent/pattern.md', path.join(dead, '.claude/knowledge/patterns/cat/p.md'));
fs.mkdirSync(path.join(dead, '.claude/worktrees/w/.claude/skills'), { recursive: true });
fs.symlinkSync('/nonexistent/wt', path.join(dead, '.claude/worktrees/w/.claude/skills/wt-dead'));

// 2) katalog `_*` — z martwym dowiązaniem, ale ma zniknąć z raportu
const hidden = mkProject('_hidden');
fs.mkdirSync(path.join(hidden, '.claude/skills'), { recursive: true });
fs.symlinkSync('/nonexistent/hidden', path.join(hidden, '.claude/skills/hidden-dead'));

// 3) + 4) git, settings, CLAUDE.md
const g = mkProject('gitproj');
run('git', ['init', '-q'], g);
fs.mkdirSync(path.join(g, '.claude/agents'), { recursive: true });
fs.symlinkSync('/opt/elsewhere/agent.md', path.join(g, '.claude/agents/abs.md'));
write(path.join(g, '.claude/config/old.bak'), 'x');
write(path.join(g, '.claude/blocks/local.yml'), 'name: local\n');
write(path.join(g, '.gitignore'), '.claude/blocks/\n');
write(path.join(g, '.claude/settings.json'), JSON.stringify({ permissions: { deny: ['Read(./.env.*.local)'] } }));
write(path.join(g, 'CLAUDE.md'), '# ręczny\n');
run('git', ['add', '-f', '.gitignore', '.claude/agents/abs.md', '.claude/config/old.bak', '.claude/config/project.yml'], g);

// 5) staleness — realna materializacja, potem ręczne rozjechanie hashy
const stale = path.join(root, 'staleproj');
write(path.join(stale, '.claude/config/project.yml'), fs.readFileSync(COMPOSITION, 'utf8'));
const mat = run('node', [MATERIALIZE, stale, REPO]);
const rtPath = path.join(stale, '.claude/config/runtime.yml');
const rtOriginal = mat.status === 0 ? fs.readFileSync(rtPath, 'utf8') : '';

const audit = () => run('node', [AUDIT, '--root', root, '--all']).stdout;
const section = (out, name) => {
  const m = out.match(new RegExp(`^${name}\\b[^\\n]*\\n((?:    .*\\n?)*)`, 'm'));
  return m ? m[1] : '';
};

const checks = [];
const expect = (label, cond, detail) => checks.push({ label, ok: Boolean(cond), detail });

expect('materializacja fixture\'u', mat.status === 0 && /^inputs_hash:/m.test(rtOriginal), (mat.stderr || '').trim().slice(0, 200));

// wariant A: zmiana tylko generatora (source_hash inny, inputs_hash ten sam) => INFO
fs.writeFileSync(rtPath, rtOriginal.replace(/^source_hash:.*$/m, 'source_hash: "000000000000"'));
let out = audit();
expect('tylko generator => INFO (i):', /i generator zmieniony/.test(out) && !/✗ runtime\.yml nieaktualny/.test(out), out.slice(0, 600));

// wariant B: zmiana wejść (inputs_hash inny) => BŁĄD
fs.writeFileSync(rtPath, rtOriginal.replace(/^source_hash:.*$/m, 'source_hash: "000000000000"')
  .replace(/^inputs_hash:.*$/m, 'inputs_hash: "111111111111"'));
out = audit();
expect('zmiana wejść => BŁĄD (✗)', /✗ runtime\.yml nieaktualny: zmieniły się wejścia/.test(out));

// wariant C: runtime.yml bez inputs_hash => jak dawniej, z etykietą
fs.writeFileSync(rtPath, rtOriginal.replace(/^source_hash:.*$/m, 'source_hash: "000000000000"')
  .replace(/^inputs_hash:.*\n/m, ''));
out = audit();
expect('brak inputs_hash => BŁĄD z etykietą', /✗ runtime\.yml nieaktualny \(brak inputs_hash/.test(out));

const d = section(out, 'deadproj');
expect('martwy wpis wykryty', /✗ martwe dowiązanie: \.claude\/skills\/gone → \/nonexistent\/skill-gone/.test(d), d);
expect('martwy link poziom w głąb wykryty', /knowledge\/patterns\/cat\/p\.md/.test(d), d);
expect('żywy link niezgłoszony', !/skills\/alive/.test(d), d);
expect('worktrees ignorowane', !/wt-dead/.test(d), d);
expect('katalog _* pominięty', !/_hidden|hidden-dead/.test(out));

const gp = section(out, 'gitproj');
expect('absolutny symlink w gicie', /✗ symlink z absolutną ścieżką w gicie.*agents\/abs\.md → \/opt\/elsewhere/.test(gp), gp);
expect('śledzony .bak', /✗ śledzone pliki \.bak.*old\.bak/.test(gp), gp);
expect('zależność kompozycji w .gitignore', /✗ plik, od którego zależy kompozycja, jest w \.gitignore.*blocks\/local\.yml/.test(gp), gp);
expect('settings: deny bez Read(.env)', /✗ permissions\.deny nie obejmuje odczytu \.env/.test(gp), gp);
expect('ręczny CLAUDE.md bez CLAUDE-LOCAL', /✗ ręcznie pisany CLAUDE\.md bez CLAUDE-LOCAL\.md/.test(gp), gp);

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  process.stdout.write(`  ${c.ok ? '✅' : '❌'} ${c.label}${c.ok || !c.detail ? '' : `\n      ${String(c.detail).replace(/\n/g, '\n      ')}`}\n`);
}
fs.rmSync(root, { recursive: true, force: true });
process.stdout.write(`\n${checks.length - failed}/${checks.length} passed\n`);
process.exit(failed ? 1 : 0);
