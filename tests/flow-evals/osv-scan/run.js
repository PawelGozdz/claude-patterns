#!/usr/bin/env node
/**
 * tests/flow-evals/osv-scan/run.js — eval L1 dla skanu zależności (TASK-GSTACK-ADOPT-001, C1).
 *
 * DLACZEGO: skan, który po cichu przepuszcza wyjątek bez daty wygaśnięcia, albo cron, który pada
 * na braku narzędzia, jest gorszy niż brak skanu. Test dwukierunkowy: poprawna konfiguracja przechodzi,
 * każde celowo zepsute wejście (brak ignoreUntil, brak reason, zła data) failuje. Skrypt crona
 * biegnie z atrapą `osv-scanner` w tymczasowym PATH — prawdziwe narzędzie nie jest potrzebne.
 *
 * Kontrakty:
 *   1. pusta konfiguracja i wyjątek z ignoreUntil + reason przechodzą
 *   2. IgnoredVulns bez ignoreUntil / bez reason / z nieistniejącą datą = błąd
 *   3. wygasły wyjątek = ostrzeżenie, nie błąd; PackageOverrides z ignore=true wymaga effectiveUntil
 *   4. .osv-scanner.toml z repo przechodzi walidację
 *   5. osv-scan.sh: brak osv-scanner = exit 0 z komunikatem; błędna konfiguracja = exit 1 bez wołania skanera
 *   6. osv-scan.sh woła skaner z oboma lockfile'ami i przekazuje jego kod wyjścia
 *   7. docker-compose.yml nie używa qdrant/qdrant:latest
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-osv-'));
const NOW = new Date('2026-10-28T12:00:00Z');
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);

const GOOD = '[[IgnoredVulns]]\nid = "GHSA-aaaa-bbbb-cccc"\nignoreUntil = 2026-12-31\nreason = "Tylko devDependency, ścieżka podatna nieużywana."\n';

function makeBin(name, osvBody) {
  const bin = path.join(tmp, name, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const [n, target] of [['dirname', '/usr/bin/dirname'], ['date', '/usr/bin/date'], ['node', process.execPath]]) {
    fs.symlinkSync(fs.existsSync(target) ? target : `/bin/${n}`, path.join(bin, n));
  }
  if (osvBody) {
    fs.writeFileSync(path.join(bin, 'osv-scanner'), osvBody, { mode: 0o755 });
  }
  return bin;
}

function runScript(bin, extraEnv = {}) {
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  return spawnSync('/bin/bash', [path.join(REPO, 'scripts/cron/osv-scan.sh')], {
    encoding: 'utf8', env: { PATH: bin, HOME: home, ...extraEnv },
  });
}

const tests = [
  {
    name: 'valid-configs-pass',
    run({ v }) {
      const empty = v.validateConfig('# nic\n', NOW);
      const good = v.validateConfig(GOOD, NOW);
      return eq([empty.errors, good.errors, good.checked], [[], [], 1], 'poprawne konfiguracje');
    },
  },
  {
    name: 'ignored-vuln-without-expiry-fails',
    run({ v }) {
      const r = v.validateConfig('[[IgnoredVulns]]\nid = "GHSA-x"\nreason = "Uzasadnienie wystarczająco długie."\n', NOW);
      return r.errors.length === 1 && /ignoreUntil/.test(r.errors[0]) ? null : `oczekiwano błędu o ignoreUntil, jest ${JSON.stringify(r.errors)}`;
    },
  },
  {
    name: 'ignored-vuln-without-reason-or-with-bad-date-fails',
    run({ v }) {
      const noReason = v.validateConfig('[[IgnoredVulns]]\nid = "GHSA-x"\nignoreUntil = 2026-12-31\n', NOW);
      const badDate = v.validateConfig('[[IgnoredVulns]]\nid = "GHSA-x"\nignoreUntil = 2026-02-30\nreason = "Uzasadnienie wystarczająco długie."\n', NOW);
      const notDate = v.validateConfig('[[IgnoredVulns]]\nid = "GHSA-x"\nignoreUntil = "kiedyś"\nreason = "Uzasadnienie wystarczająco długie."\n', NOW);
      return eq([noReason.errors.length, badDate.errors.length, notDate.errors.length], [1, 1, 1], 'liczba błędów (brak reason / 30 lutego / nie-data)');
    },
  },
  {
    name: 'expired-is-warning-and-overrides-need-expiry',
    run({ v }) {
      const expired = v.validateConfig(GOOD.replace('2026-12-31', '2026-01-01'), NOW);
      const e1 = eq([expired.errors.length, expired.warnings.length], [0, 1], 'wygasły wyjątek (błędy, ostrzeżenia)');
      if (e1) return e1;
      const ov = '[[PackageOverrides]]\nname = "lodash"\necosystem = "npm"\nignore = true\nreason = "Uzasadnienie wystarczająco długie."\n';
      const bad = v.validateConfig(ov, NOW);
      const ok = v.validateConfig(ov + 'effectiveUntil = 2026-12-31\n', NOW);
      const notIgnored = v.validateConfig('[[PackageOverrides]]\nname = "x"\nlicense.override = ["MIT"]\n', NOW);
      return eq([bad.errors.length, ok.errors.length, notIgnored.errors.length], [1, 0, 0], 'PackageOverrides');
    },
  },
  {
    name: 'repo-config-passes',
    run({ v }) {
      const r = v.validateConfig(fs.readFileSync(path.join(REPO, '.osv-scanner.toml'), 'utf8'), NOW);
      return r.errors.length ? `.osv-scanner.toml z repo nie przechodzi: ${r.errors.join('; ')}` : null;
    },
  },
  {
    name: 'cron-script-missing-tool-exits-zero',
    run() {
      const bin = makeBin('notool');
      const r = runScript(bin);
      if (r.status !== 0) return `exit ${r.status}, oczekiwano 0 (stderr: ${r.stderr.trim()})`;
      return /nie jest zainstalowany/.test(r.stderr) ? null : 'brak czytelnego komunikatu o braku osv-scanner';
    },
  },
  {
    name: 'cron-script-bad-config-exits-one-without-scanning',
    run() {
      const marker = path.join(tmp, 'called-bad');
      const bin = makeBin('badcfg', `#!/bin/bash\necho called > "${marker}"\nexit 0\n`);
      const cfg = path.join(tmp, 'bad.osv-scanner.toml');
      fs.writeFileSync(cfg, '[[IgnoredVulns]]\nid = "GHSA-bad"\nreason = "Uzasadnienie wystarczająco długie."\n');
      const r = runScript(bin, { OSV_SCAN_CONFIG: cfg });
      if (r.status !== 1) return `exit ${r.status}, oczekiwano 1`;
      if (fs.existsSync(marker)) return 'skaner został wywołany mimo błędnej konfiguracji';
      return /ignoreUntil/.test(r.stderr) ? null : 'komunikat nie wskazuje brakującego ignoreUntil';
    },
  },
  {
    name: 'cron-script-runs-scanner-on-both-lockfiles-and-passes-exit-code',
    run() {
      const out = path.join(tmp, 'args-good');
      const stub = (code) => `#!/bin/bash\nif [ "$1 $2" = "scan source" ] && [ "$3" = "--help" ]; then exit 0; fi\necho "$@" > "${out}"\nexit ${code}\n`;
      const clean = runScript(makeBin('clean', stub(0)));
      if (clean.status !== 0) return `czysty skan: exit ${clean.status}, oczekiwano 0 (${clean.stderr.trim()})`;
      const args = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
      if (!args.includes('package-lock.json') || !args.includes('knowledge-retriever/package-lock.json') || !args.includes('--config=')) {
        return `skaner dostał: ${args.trim() || '(nic)'}`;
      }
      const dirty = runScript(makeBin('dirty', stub(1)));
      return dirty.status === 1 ? null : `skan z podatnościami: exit ${dirty.status}, oczekiwano 1`;
    },
  },
  {
    name: 'header-with-trailing-comment-is-still-validated',
    run({ v }) {
      // Regres z przeglądu: `[[IgnoredVulns]] # …` nie pasował do nagłówka i wyjątek bez daty przechodził jako „0 wyjątków".
      const r = v.validateConfig('[[IgnoredVulns]] # tymczasowo\nid = "GHSA-x"\nreason = "Uzasadnienie wystarczająco długie."\n', NOW);
      return r.errors.length === 1 && /ignoreUntil/.test(r.errors[0]) ? null : `oczekiwano błędu o ignoreUntil, jest ${JSON.stringify(r.errors)}`;
    },
  },
  {
    name: 'unrecognized-header-and-inline-form-fail-loudly',
    run({ v }) {
      const broken = v.validateConfig('[[IgnoredVulns\nid = "GHSA-x"\n', NOW);
      const inline = v.validateConfig('IgnoredVulns = [{ id = "GHSA-x" }]\n', NOW);
      return eq([broken.errors.length, inline.errors.length], [1, 1], 'nierozpoznany nagłówek / zapis inline')
        || (/nierozpoznany/.test(broken.errors[0]) ? null : `komunikat: ${broken.errors[0]}`)
        || (/inline/.test(inline.errors[0]) ? null : `komunikat: ${inline.errors[0]}`);
    },
  },
  {
    name: 'hash-char-inside-quoted-reason-is-content',
    run({ v }) {
      const r = v.validateConfig(GOOD.replace('Tylko devDependency, ścieżka podatna nieużywana.', 'Zob. #123 w trackerze, ścieżka nieużywana.'), NOW);
      return eq(r.errors, [], 'reason z # w cudzysłowie');
    },
  },
  {
    name: 'cli-run-through-symlink-and-space-path-still-validates',
    run() {
      // Regres z przeglądu: uruchomienie przez symlink kończyło się cicho exit 0 (porównanie ścieżki bez realpath).
      const dir = path.join(tmp, 'sym link dir');
      fs.mkdirSync(dir, { recursive: true });
      const link = path.join(dir, 'osv-ignore-check.mjs');
      fs.symlinkSync(path.join(REPO, 'scripts/osv-ignore-check.mjs'), link);
      const cfg = path.join(tmp, 'sym-bad.toml');
      fs.writeFileSync(cfg, '[[IgnoredVulns]]\nid = "GHSA-x"\nreason = "Uzasadnienie wystarczająco długie."\n');
      const viaLink = spawnSync('node', [link, cfg], { encoding: 'utf8' });
      const direct = spawnSync('node', [path.join(REPO, 'scripts/osv-ignore-check.mjs'), cfg], { encoding: 'utf8' });
      return eq([viaLink.status, direct.status], [1, 1], 'exit przez symlink / bezpośrednio');
    },
  },
  {
    name: 'script-executable-and-qdrant-pinned',
    run() {
      if (!(fs.statSync(path.join(REPO, 'scripts/cron/osv-scan.sh')).mode & 0o111)) return 'osv-scan.sh nie jest wykonywalny';
      const compose = fs.readFileSync(path.join(REPO, 'mcp-server/knowledge-retriever/docker-compose.yml'), 'utf8');
      const image = compose.match(/^\s*image:\s*qdrant\/qdrant:(\S+)/m);
      if (!image) return 'nie znaleziono obrazu qdrant/qdrant w docker-compose.yml';
      return /^v?\d+\.\d+\.\d+$/.test(image[1]) ? null : `obraz Qdrant niepodpięty do dokładnej wersji: ${image[1]}`;
    },
  },
];

(async () => {
  const libs = { v: await import(path.join(REPO, 'scripts/osv-ignore-check.mjs')) };
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = test.run(libs); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
