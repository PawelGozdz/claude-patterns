#!/usr/bin/env node
/**
 * tests/flow-evals/version-sync/run.js — eval L1 dla kontroli jednej wersji (TASK-GSTACK-ADOPT-001, C1).
 *
 * DLACZEGO: METADATA.yml jest źródłem prawdy dla wersji, a package.json i package-lock.json ją powtarzają.
 * Przed tą kontrolą rozjechały się trzy miejsca naraz (3.8.0 / 3.6.0 / 3.5.0). Test dwukierunkowy:
 * `count-assets --check` przechodzi na zgodnych plikach i failuje na celowo rozjechanych kopiach.
 *
 * Kontrakty:
 *   1. realne repo: wersje zgodne, exit 0
 *   2. package.json z inną wersją = exit 1 i nazwa pliku w wyjściu
 *   3. package-lock.json z inną wersją = exit 1
 *   4. package.json bez pola version = exit 1
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-version-'));
const meta = fs.readFileSync(path.join(REPO, 'METADATA.yml'), 'utf8').match(/^version:\s*"?([\d.]+)"?/m)[1];

const writeJson = (name, obj) => { const p = path.join(tmp, name); fs.writeFileSync(p, JSON.stringify(obj)); return p; };
const check = (env) => spawnSync(process.execPath, [path.join(REPO, 'scripts/count-assets.mjs'), '--check'], {
  encoding: 'utf8', env: { ...process.env, ...env },
});

const tests = [
  {
    name: 'repo-versions-in-sync',
    run() {
      const r = check({});
      return r.status === 0 ? null : `exit ${r.status}: ${(r.stdout + r.stderr).split('\n').filter((l) => l.includes('✗')).join(' | ')}`;
    },
  },
  {
    name: 'matching-copies-pass',
    run() {
      const r = check({
        COUNT_ASSETS_PACKAGE_JSON: writeJson('ok-pkg.json', { version: meta }),
        COUNT_ASSETS_PACKAGE_LOCK: writeJson('ok-lock.json', { version: meta, packages: { '': { version: meta } } }),
      });
      return r.status === 0 ? null : `exit ${r.status}, oczekiwano 0`;
    },
  },
  {
    name: 'drifted-package-json-fails',
    run() {
      const r = check({
        COUNT_ASSETS_PACKAGE_JSON: writeJson('bad-pkg.json', { version: '0.0.1' }),
        COUNT_ASSETS_PACKAGE_LOCK: writeJson('ok-lock2.json', { version: meta, packages: { '': { version: meta } } }),
      });
      if (r.status !== 1) return `exit ${r.status}, oczekiwano 1`;
      return /✗ package\.json\.version/.test(r.stdout) ? null : 'wyjście nie wskazuje package.json.version';
    },
  },
  {
    name: 'drifted-lockfile-fails',
    run() {
      const r = check({
        COUNT_ASSETS_PACKAGE_JSON: writeJson('ok-pkg3.json', { version: meta }),
        COUNT_ASSETS_PACKAGE_LOCK: writeJson('bad-lock.json', { version: '0.0.1', packages: { '': { version: '0.0.1' } } }),
      });
      return r.status === 1 && /✗ package-lock\.json\.version/.test(r.stdout) ? null : `exit ${r.status}, oczekiwano 1 ze wskazaniem lockfile'a`;
    },
  },
  {
    name: 'drifted-lockfile-root-package-fails',
    run() {
      // Regres z przeglądu: sprawdzane było tylko `version` na górze lockfile'a, a `packages[""].version` mogło się rozjechać po cichu.
      const r = check({
        COUNT_ASSETS_PACKAGE_JSON: writeJson('ok-pkg5.json', { version: meta }),
        COUNT_ASSETS_PACKAGE_LOCK: writeJson('half-lock.json', { version: meta, packages: { '': { version: '0.0.1' } } }),
      });
      return r.status === 1 && /✗ package-lock packages\[""\]/.test(r.stdout) ? null : `exit ${r.status}, oczekiwano 1 ze wskazaniem packages[""]`;
    },
  },
  {
    name: 'missing-version-field-fails',
    run() {
      const r = check({
        COUNT_ASSETS_PACKAGE_JSON: writeJson('nover-pkg.json', { name: 'x' }),
        COUNT_ASSETS_PACKAGE_LOCK: writeJson('ok-lock4.json', { version: meta, packages: { '': { version: meta } } }),
      });
      return r.status === 1 ? null : `exit ${r.status}, oczekiwano 1`;
    },
  },
];

let failed = 0;
for (const test of tests) {
  let err;
  try { err = test.run(); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
  console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
  if (err) failed++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
