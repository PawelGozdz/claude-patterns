#!/usr/bin/env node
/**
 * tests/flow-evals/lint-ratchet/run.js — eval L1 dla tools/lint-ratchet/run.mjs (TASK-ORC-LINT-DELEGATION-001, E1).
 *
 * Zero LLM. PRAWDZIWE repo git w katalogu tymczasowym ze skryptem `lint:r`, który udaje ratchet projektu:
 * wypisuje argumenty, kończy się 1, gdy plik zawiera BAD, i 2, gdy zawiera BROKEN. Sprawdzamy kontrakt narzędzia:
 * kto liczy zakres (kod, nie sonda), kiedy jest `skipped` (kod 3) i że pusta lista NIGDY nie oznacza pełnego lintu.
 *
 * Uruchom: node tests/flow-evals/lint-ratchet/run.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const TOOL = path.join(REPO, 'tools', 'lint-ratchet', 'run.mjs');

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const LINT = `const fs = require('fs');
const args = process.argv.slice(2);
console.log('ARGS ' + args.join(' '));
const files = args.slice(args.indexOf('--files') + 1);
let code = 0;
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  if (t.includes('BROKEN')) process.exit(2);
  if (t.includes('BAD')) code = 1;
}
process.exit(code);
`;

/** Repo z jednym commitem; zwraca { dir, sha }. */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-ratchet-'));
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', scripts: { 'lint:r': 'node lint.mjs.cjs' } }));
  fs.writeFileSync(path.join(dir, 'lint.mjs.cjs'), LINT);
  for (const f of ['src/domain/a.ts', 'src/app/b.ts', 'docs/x.md']) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), 'ok\n');
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD').trim() };
}
const write = (dir, f, text) => { fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };
function run(dir, ...args) {
  const r = spawnSync('node', [TOOL, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const expect = (cond, msg) => (cond ? null : msg);

const cases = [
  {
    name: 'no-script-name-or-unsafe-name-is-skipped',
    run() {
      const { dir } = makeRepo();
      for (const bad of [[], ['--script', 'a;rm -rf x'], ['--script', 'a b'], ['--script', '$(x)']]) {
        const r = run(dir, ...bad);
        if (r.code !== 3 || !/SKIPPED/.test(r.out)) return `${JSON.stringify(bad)} → kod ${r.code}: ${r.out}`;
      }
      return null;
    },
  },
  {
    name: 'script-missing-from-package-json-is-skipped',
    run() {
      const { dir } = makeRepo();
      write(dir, 'src/domain/a.ts', 'changed\n');
      const r = run(dir, '--script', 'lint:nie-ma');
      return expect(r.code === 3 && /brak skryptu/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'no-changed-files-is-skipped-never-a-full-lint',
    run() {
      const { dir } = makeRepo();
      const r = run(dir, '--script', 'lint:r');
      return expect(r.code === 3 && /nic do sprawdzenia/.test(r.out) && !/ARGS/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'clean-change-is-green-and-script-gets-only-changed-files',
    run() {
      const { dir } = makeRepo();
      write(dir, 'src/domain/a.ts', 'changed\n');
      const r = run(dir, '--script', 'lint:r');
      return expect(r.code === 0 && /ARGS --files src\/domain\/a\.ts/.test(r.out) && /zielono — 1 plik/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'regression-exit-1-is-red-and-keeps-the-project-report',
    run() {
      const { dir } = makeRepo();
      write(dir, 'src/app/b.ts', 'BAD\n');
      const r = run(dir, '--script', 'lint:r');
      return expect(r.code === 1 && /ARGS/.test(r.out) && /CZERWONO/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'untracked-new-file-is-checked',
    run() {
      const { dir } = makeRepo();
      write(dir, 'src/app/nowy.ts', 'BAD\n');
      const r = run(dir, '--script', 'lint:r');
      return expect(r.code === 1 && /src\/app\/nowy\.ts/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'only-narrows-to-the-layer-scope',
    run() {
      const { dir } = makeRepo();
      write(dir, 'src/domain/a.ts', 'changed\n');
      write(dir, 'src/app/b.ts', 'BAD\n');
      const r = run(dir, '--script', 'lint:r', '--only', 'src/domain/');
      return expect(r.code === 0 && !/src\/app\/b\.ts/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'skip-drops-foreign-work-from-before-the-run',
    run() {
      const { dir } = makeRepo();
      write(dir, 'src/app/b.ts', 'BAD\n');
      const r = run(dir, '--script', 'lint:r', '--skip', 'src/app/b.ts');
      return expect(r.code === 3 && /SKIPPED/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'match-filters-non-code-files-and-empty-result-is-skipped',
    run() {
      const { dir } = makeRepo();
      write(dir, 'docs/x.md', 'BAD\n');
      const def = run(dir, '--script', 'lint:r');
      if (def.code !== 3) return `domyślny match przepuścił .md: kod ${def.code}: ${def.out}`;
      write(dir, 'src/app/b.ts', 'changed\n');
      const strict = run(dir, '--script', 'lint:r', '--match', '^src/domain/.*\\.ts$');
      return expect(strict.code === 3, `własny --match nie zawęził: kod ${strict.code}: ${strict.out}`);
    },
  },
  {
    name: 'tool-error-exit-2-is-skipped-not-red-and-not-green',
    run() {
      const { dir } = makeRepo();
      write(dir, 'src/app/b.ts', 'BROKEN\n');
      const r = run(dir, '--script', 'lint:r');
      return expect(r.code === 3 && /błąd narzędzia/.test(r.out), `kod ${r.code}: ${r.out}`);
    },
  },
  {
    name: 'base-goes-before-files-and-must-be-a-commit-hash',
    run() {
      const { dir, sha } = makeRepo();
      write(dir, 'src/domain/a.ts', 'changed\n');
      const ok = run(dir, '--script', 'lint:r', '--base', sha, '--dry-run');
      if (!new RegExp(`--base ${sha} --files src/domain/a\\.ts`).test(ok.out)) return `kolejność opcji: ${ok.out}`;
      const bad = run(dir, '--script', 'lint:r', '--base', 'HEAD; rm -rf /');
      return expect(bad.code === 3, `zły --base nie dał skipped: kod ${bad.code}: ${bad.out}`);
    },
  },
  {
    name: 'base-diff-sees-changes-committed-after-the-start-sha',
    run() {
      const { dir, sha } = makeRepo();
      write(dir, 'src/app/b.ts', 'BAD\n');
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', 'w trakcie przebiegu');
      const r = run(dir, '--script', 'lint:r', '--base', sha);
      return expect(r.code === 1, `commit w trakcie przebiegu ukrył naruszenie: kod ${r.code}: ${r.out}`);
    },
  },
];

let failed = 0;
for (const c of cases) {
  let err;
  try { err = c.run(); } catch (e) { err = 'wyjątek: ' + e.message; }
  console.log(err ? `  ❌ ${c.name} — ${err}` : `  ✅ ${c.name}`);
  if (err) failed++;
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
