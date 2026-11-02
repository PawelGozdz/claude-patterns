#!/usr/bin/env node
/**
 * tests/flow-evals/test-guard/run.js — eval L1 dla ORC-149 (testy tylko `pnpm test:{e2e|integration} <pliki>`).
 *
 * Zero LLM. Dwukierunkowo, na PRAWDZIWYCH artefaktach:
 *   • hooks/block-unscoped-tests.js (PreToolUse/Bash): payload zdarzenia → deny albo przepuszczenie;
 *   • tools/scoped-tests/run.mjs (--dry-run) w tymczasowym repo git: z jakich plików i jakim skryptem składa komendę.
 *
 * Uruchom: node tests/flow-evals/test-guard/run.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(REPO, 'hooks', 'block-unscoped-tests.js');
const TOOL = path.join(REPO, 'tools', 'scoped-tests', 'run.mjs');

const roots = [];
function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(d);
  return d;
}
function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
  return r.stdout;
}

function runHook(command, cwd) {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: cwd || os.tmpdir() }), encoding: 'utf8' });
  let decision = null;
  try { decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; } catch { /* brak JSON = przepuszczone */ }
  return { decision, status: r.status, out: r.stdout };
}

const DENY = [
  ['npm run test', 'npm run test'],
  ['npm test', 'npm test'],
  ['npx vitest', 'npx vitest run src/a.spec.ts'],
  ['pnpm exec vitest', 'pnpm exec vitest run'],
  ['pnpm vitest', 'pnpm vitest run'],
  ['vitest wprost', 'vitest run src/a.spec.ts'],
  ['jest z node_modules', './node_modules/.bin/jest'],
  ['goły pnpm test', 'pnpm test'],
  ['pnpm test z plikiem (unit)', 'pnpm test src/a.spec.ts'],
  ['goły pnpm test:e2e', 'pnpm test:e2e'],
  ['goły pnpm test:integration', 'pnpm test:integration'],
  ['pnpm test:e2e -- plik', 'pnpm test:e2e -- src/a.e2e.spec.ts'],
  ['pnpm test:integration katalog', 'pnpm test:integration src/contexts/'],
  ['pnpm test:integration glob', 'pnpm test:integration src/**/*.integration.spec.ts'],
  ['pnpm -r test:e2e', 'pnpm -r test:e2e src/a.e2e.spec.ts'],
  ['skrypt niedozwolony', 'pnpm test:security'],
  ['test:changed', 'pnpm test:changed'],
  ['xargs', 'git diff --name-only | xargs pnpm test:integration'],
  ['bash -c', 'bash -c "pnpm test"'],
  ['podstawienie $()', 'echo $(npm run test)'],
  ['łańcuch z jednym złym', 'pnpm test:e2e src/a.e2e.spec.ts && npx vitest run'],
  ['yarn', 'yarn test'],
  ['turbo', 'turbo run test'],
  ['playwright test', 'npx playwright test'],
  ['env i timeout', 'NODE_OPTIONS=--x timeout 600 npm run test:e2e'],
];
const ALLOW = [
  ['e2e z plikami', 'pnpm test:e2e src/a.e2e.spec.ts src/b.e2e.spec.ts'],
  ['integration z plikami i przekierowaniem', 'pnpm test:integration src/a.integration.spec.ts src/b.integration.spec.ts 2>&1 | tail -50'],
  ['kontynuacja linii z \\', 'pnpm test:integration \\\n  src/a.integration.spec.ts \\\n  src/b.integration.spec.ts'],
  ['alias l2/l3 (marketing-hub, grant-flow)', 'pnpm test:l2 src/a.integration.spec.ts'],
  ['cd, env i --filter', 'cd apps/api && NODE_OPTIONS=--x pnpm --filter api test:e2e src/a.e2e.spec.ts'],
  ['pnpm run + flaga po plikach', 'pnpm run test:integration src/a.integration.spec.ts --reporter verbose'],
  ['grep w treści którego jest komenda', 'grep -n "npm run test" README.md'],
  ['commit z komendą w opisie', 'git commit -m "docs: pnpm test and npx vitest"'],
  ['build i typecheck', 'pnpm build && pnpm typecheck'],
  ['lint', 'pnpm lint:check'],
  ['pytest (poza regułą)', 'pytest tests/'],
  ['npx playwright install', 'npx playwright install'],
];

const CASES = [];
for (const [name, cmd] of DENY) {
  CASES.push({ name: 'blokuje: ' + name, run() { const r = runHook(cmd); return r.decision === 'deny' ? null : 'miało być deny, jest ' + (r.decision || 'przepuszczone') + ' dla: ' + cmd; } });
}
for (const [name, cmd] of ALLOW) {
  CASES.push({ name: 'przepuszcza: ' + name, run() { const r = runHook(cmd); return r.decision === null && r.status === 0 ? null : 'miało przejść, jest ' + r.decision + ' dla: ' + cmd + ' ' + r.out.slice(0, 200); } });
}

CASES.push({
  name: 'komunikat deny podaje pożądaną formę i dozwolone skrypty',
  run() {
    const r = runHook('npm run test');
    if (!/pnpm test:e2e <plik_1>/.test(r.out) || !/test:integration/.test(r.out) || !/Pełny zestaw odpala człowiek/.test(r.out)) return 'komunikat bez instrukcji: ' + r.out.slice(0, 300);
    return null;
  },
});
CASES.push({
  name: 'payload nie-Bash i zepsuty JSON przechodzą (hook nigdy nie wywraca sesji)',
  run() {
    const a = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_name: 'Edit', tool_input: { command: 'npm run test' } }), encoding: 'utf8' });
    const b = spawnSync('node', [HOOK], { input: '{nie json', encoding: 'utf8' });
    if (a.status !== 0 || a.stdout || b.status !== 0 || b.stdout) return 'hook zareagował na nie-Bash albo zepsuty JSON';
    return null;
  },
});
CASES.push({
  name: 'allowUnit w .claude/test-guard.json otwiera tylko pnpm test <pliki>, nie gołe pnpm test',
  run() {
    const root = tmp('tg-unit-');
    write(root, '.claude/test-guard.json', JSON.stringify({ allowUnit: true }));
    if (runHook('pnpm test src/a.spec.ts', root).decision !== null) return 'allowUnit nie przepuścił pnpm test <plik>';
    if (runHook('pnpm test', root).decision !== 'deny') return 'allowUnit nie może otwierać gołego pnpm test';
    if (runHook('npx vitest run src/a.spec.ts', root).decision !== 'deny') return 'allowUnit nie może otwierać npx vitest';
    if (runHook('pnpm test -- src/a.spec.ts', root).decision !== 'deny') return 'allowUnit nie może otwierać `--`';
    return null;
  },
});
CASES.push({
  name: 'allow w .claude/test-guard.json dodaje skrypt, ale dalej tylko z plikami',
  run() {
    const root = tmp('tg-allow-');
    write(root, '.claude/test-guard.json', JSON.stringify({ allow: ['test:harness'] }));
    if (runHook('pnpm test:harness src/a.spec.ts', root).decision !== null) return 'dopisany skrypt nie przeszedł';
    if (runHook('pnpm test:harness', root).decision !== 'deny') return 'dopisany skrypt bez plików musi być zablokowany';
    return null;
  },
});
CASES.push({
  name: 'zepsuty .claude/test-guard.json = najostrzejsza polityka, nie wyłączenie',
  run() {
    const root = tmp('tg-bad-');
    write(root, '.claude/test-guard.json', '{nie json');
    if (runHook('npm run test', root).decision !== 'deny') return 'zepsuta konfiguracja otworzyła bramkę';
    return null;
  },
});

// ── tools/scoped-tests ──
function repoWithChanges() {
  const root = tmp('tg-tool-');
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'a@b.c');
  git(root, 'config', 'user.name', 'x');
  write(root, 'package.json', JSON.stringify({ name: 'root', scripts: {} }));
  write(root, 'apps/api/package.json', JSON.stringify({ name: 'api', scripts: { test: 'vitest run', 'test:integration': 'x', 'test:e2e': 'y' } }));
  write(root, 'apps/api/src/old.integration.spec.ts', 'x');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  return root;
}
function tool(root, ...args) {
  return spawnSync('node', [TOOL, '--dry-run', ...args], { cwd: root, encoding: 'utf8' });
}

CASES.push({
  name: 'tool: zmienione pliki dzieli na test:integration / test:e2e z jawną listą i pomija jednostkowe',
  run() {
    const root = repoWithChanges();
    write(root, 'apps/api/src/old.integration.spec.ts', 'zmiana');
    write(root, 'apps/api/src/a.e2e.spec.ts', 'x');
    write(root, 'apps/api/src/b.spec.ts', 'x');
    const r = tool(root);
    if (r.status !== 0) return 'exit ' + r.status + ': ' + r.stdout + r.stderr;
    if (!r.stdout.includes('pnpm test:integration src/old.integration.spec.ts')) return 'brak przebiegu integration: ' + r.stdout;
    if (!r.stdout.includes('pnpm test:e2e src/a.e2e.spec.ts')) return 'brak przebiegu e2e: ' + r.stdout;
    if (/pnpm test src\/b\.spec\.ts/.test(r.stdout)) return 'plik jednostkowy poszedł do uruchomienia mimo polityki';
    if (!/POMINIĘTO 1 plik/.test(r.stdout)) return 'brak głośnej informacji o pominiętym pliku jednostkowym: ' + r.stdout;
    return null;
  },
});
CASES.push({
  name: 'tool: brak zmienionych plików testowych = exit 3 (skipped), nigdy cała suita',
  run() {
    const root = repoWithChanges();
    write(root, 'apps/api/src/handler.ts', 'x');
    const r = tool(root);
    if (r.status !== 3 || !/SKIPPED/.test(r.stdout)) return 'oczekiwano exit 3 + SKIPPED: ' + r.status + ' ' + r.stdout;
    if (/pnpm test/.test(r.stdout.replace(/cały zestaw nigdy/, ''))) return 'narzędzie nie może uruchamiać nic bez plików';
    return null;
  },
});
CASES.push({
  name: 'tool: same pliki jednostkowe = exit 3 z komunikatem o polityce',
  run() {
    const root = repoWithChanges();
    write(root, 'apps/api/src/only.spec.ts', 'x');
    const r = tool(root);
    if (r.status !== 3 || !/POMINIĘTO 1 plik/.test(r.stdout)) return 'exit ' + r.status + ': ' + r.stdout;
    return null;
  },
});
CASES.push({
  name: 'tool: allowUnit uruchamia jednostkowe jako pnpm test <plik>',
  run() {
    const root = repoWithChanges();
    write(root, '.claude/test-guard.json', JSON.stringify({ allowUnit: true }));
    write(root, 'apps/api/src/only.spec.ts', 'x');
    const r = tool(root);
    if (r.status !== 0 || !r.stdout.includes('pnpm test src/only.spec.ts')) return 'exit ' + r.status + ': ' + r.stdout;
    return null;
  },
});
CASES.push({
  name: 'tool: --only zawęża do warstwy, --files rozwiązuje ścieżkę względną do pakietu',
  run() {
    const root = repoWithChanges();
    write(root, 'apps/api/src/a.integration.spec.ts', 'x');
    write(root, 'apps/api/other/c.integration.spec.ts', 'x');
    const scoped = tool(root, '--only', 'src');
    if (!scoped.stdout.includes('src/a.integration.spec.ts') || scoped.stdout.includes('other/c.integration.spec.ts')) return '--only nie zawęził: ' + scoped.stdout;
    git(root, 'add', '-A');
    const explicit = tool(root, '--files', 'src/a.integration.spec.ts');
    if (!explicit.stdout.includes('pnpm test:integration src/a.integration.spec.ts')) return '--files nie znalazł pliku względem pakietu: ' + explicit.stdout;
    return null;
  },
});
CASES.push({
  name: 'tool: marketing-hub (test:l2/test:l3 zamiast integration/e2e) dostaje swoje nazwy skryptów',
  run() {
    const root = tmp('tg-mh-');
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'a@b.c');
    git(root, 'config', 'user.name', 'x');
    write(root, 'apps/api/package.json', JSON.stringify({ scripts: { 'test:l2': 'a', 'test:l3': 'b' } }));
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'init');
    write(root, 'apps/api/src/a.integration.spec.ts', 'x');
    write(root, 'apps/api/src/b.e2e.spec.ts', 'x');
    const r = tool(root);
    if (!r.stdout.includes('pnpm test:l2 src/a.integration.spec.ts') || !r.stdout.includes('pnpm test:l3 src/b.e2e.spec.ts')) return r.stdout;
    return null;
  },
});
CASES.push({
  name: 'to, co tool uruchamia, hook przepuszcza (jedna definicja reguły)',
  run() {
    const root = repoWithChanges();
    write(root, 'apps/api/src/a.e2e.spec.ts', 'x');
    write(root, 'apps/api/src/b.integration.spec.ts', 'x');
    const lines = tool(root).stdout.split('\n').map((l) => /\) (pnpm .+)$/.exec(l)).filter(Boolean).map((m) => m[1]);
    if (lines.length !== 2) return 'oczekiwano 2 komend, jest ' + lines.length;
    for (const cmd of lines) if (runHook(cmd).decision !== null) return 'hook blokuje komendę narzędzia: ' + cmd;
    return null;
  },
});

let failed = 0;
for (const t of CASES) {
  let err;
  try { err = t.run(); } catch (e) { err = 'wyjątek: ' + e.message; }
  if (err) { failed++; console.log('  ❌ ' + t.name + ' — ' + err); } else console.log('  ✅ ' + t.name);
}
for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed ? 1 : 0);
