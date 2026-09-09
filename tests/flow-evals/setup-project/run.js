#!/usr/bin/env node
/**
 * tests/flow-evals/setup-project/run.js — eval L1 dla scripts/setup-project.sh.
 *
 * DLACZEGO: setup-project.sh to 1000+ linii basha, które decydują o tym, co projekt
 * satelitarny w ogóle widzi — agentów, reguły, wzorce, hooki, bramkę pre-commit.
 * Do K104 (TASK-KAIZEN-002) nie miał ani jednego testu, a jego awarie są ciche:
 * brakujący symlink nie rzuca błędu, tylko sprawia, że agent „nie zna" reguły.
 *
 * Skrypt jest NIEINTERAKTYWNY bez `--interactive`, więc odpalamy go w całości —
 * na świeżym repo git w katalogu tymczasowym. Żaden istniejący satelita nie jest
 * dotykany, a jedyne, co skrypt pisze poza PROJECT_DIR, to nic (zweryfikowane:
 * brak odwołań do $HOME).
 *
 * Sprawdzane kontrakty (po jednym na realną awarię, którą audyt 2026-09-07 opisał):
 *   1. `.claude/agents/` — symlinki do agentów z `overlay.agents` runtime.yml (A4)
 *   2. `.claude/rules/`  — symlinki do reguł z `overlay.rules`, nie z `stack_profile` (A4)
 *   3. `.claude/knowledge/patterns/` — symlinki kategorii wzorców
 *   4. `.claude/settings.json` — hooki DOKŁADNIE te z `hooks:` runtime.yml (A7: dwie
 *      równoległe ścieżki provisioningu potrafiły się rozjechać o kluczową bramkę)
 *   5. `.git/hooks/pre-commit` — bramka rematerializacji (K63b)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const YAML = require('yaml');

const REPO = path.resolve(__dirname, '..', '..', '..');
const SETUP = path.join(REPO, 'scripts', 'setup-project.sh');
const COMPOSITIONS = path.join(REPO, 'tests', 'flow-evals', 'materialize-runtime', 'fixtures');

// Reużywamy fixture'ów kompozycji z evalu materializacji — jedna definicja
// „jak wygląda projekt nestjs-ddd", dwa testy o różnym zasięgu.
const CASES = [
  {
    name: 'nestjs-ddd-kysely',
    agents: ['ddd-application-expert.md', 'code-quality-verifier.md', 'test-implementer.md'],
    rules: ['common', 'typescript', 'nestjs-ddd'],
    patterns: ['domain', 'application', 'infrastructure', 'cross-layer'],
  },
  {
    name: 'flutter-clean-arch',
    agents: ['flutter-implementer.md', 'flutter-quality-verifier.md'],
    rules: ['common', 'dart'],
    patterns: ['flutter', 'testing'],
  },
];

function setUpProject(fixtureName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-setup-project-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.copyFileSync(
    path.join(COMPOSITIONS, `${fixtureName}.project.yml`),
    path.join(dir, '.claude', 'config', 'project.yml'),
  );
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  if (git.status !== 0) return { error: `git init: ${git.stderr}`, dir };

  const res = spawnSync('bash', [SETUP, dir], { encoding: 'utf8', cwd: dir });
  if (res.status !== 0) {
    const tail = (res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' | ');
    return { error: `setup-project.sh exit ${res.status}: ${tail}`, dir };
  }
  return { dir, stdout: res.stdout };
}

/** Wszystkie ścieżki `hooks/<nazwa>.js` wymienione w settings.json. */
function hooksInSettings(settingsPath) {
  const found = new Set();
  const text = fs.readFileSync(settingsPath, 'utf8');
  for (const m of text.matchAll(/hooks\/([\w-]+)\.js/g)) found.add(m[1]);
  return found;
}

function checkCase(c) {
  const problems = [];
  const r = setUpProject(c.name);
  if (r.error) return { problems: [r.error], dir: r.dir };
  const { dir } = r;

  const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } };
  const resolves = (p) => { try { fs.statSync(p); return true; } catch { return false; } };

  for (const agent of c.agents) {
    const p = path.join(dir, '.claude', 'agents', agent);
    if (!isLink(p)) problems.push(`.claude/agents/${agent} — brak symlinku (overlay.agents)`);
    else if (!resolves(p)) problems.push(`.claude/agents/${agent} — symlink wisi`);
  }

  for (const rule of c.rules) {
    const p = path.join(dir, '.claude', 'rules', rule);
    if (!isLink(p)) problems.push(`.claude/rules/${rule} — brak symlinku (overlay.rules)`);
    else if (!resolves(p)) problems.push(`.claude/rules/${rule} — symlink wisi`);
  }

  for (const cat of c.patterns) {
    const p = path.join(dir, '.claude', 'knowledge', 'patterns', cat);
    if (!isLink(p)) problems.push(`.claude/knowledge/patterns/${cat} — brak symlinku`);
    else if (!resolves(p)) problems.push(`.claude/knowledge/patterns/${cat} — symlink wisi`);
  }

  // settings.json vs runtime.yml — hooki muszą się zgadzać co do jednego
  const settingsPath = path.join(dir, '.claude', 'settings.json');
  const runtimePath = path.join(dir, '.claude', 'config', 'runtime.yml');
  if (!fs.existsSync(settingsPath)) problems.push('brak .claude/settings.json');
  else if (!fs.existsSync(runtimePath)) problems.push('brak .claude/config/runtime.yml');
  else {
    try { JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
    catch (e) { problems.push(`settings.json nie jest poprawnym JSON-em: ${e.message}`); }
    const expected = new Set(YAML.parse(fs.readFileSync(runtimePath, 'utf8'))?.hooks || []);
    const actual = hooksInSettings(settingsPath);
    for (const h of expected) if (!actual.has(h)) problems.push(`settings.json bez hooka "${h}" z runtime.yml`);
    for (const h of actual) if (!expected.has(h)) problems.push(`settings.json ma hooka "${h}" spoza runtime.yml`);
  }

  const preCommit = path.join(dir, '.git', 'hooks', 'pre-commit');
  if (!fs.existsSync(preCommit)) problems.push('brak .git/hooks/pre-commit (bramka rematerializacji)');
  else {
    try {
      if (!(fs.statSync(preCommit).mode & 0o111)) problems.push('.git/hooks/pre-commit nie jest wykonywalny');
    } catch { /* stat nie powinien tu paść */ }
  }

  return { problems, dir };
}

function main() {
  let failed = 0;
  for (const c of CASES) {
    const started = Date.now();
    const { problems, dir } = checkCase(c);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (problems.length === 0) {
      process.stdout.write(`  ✅ ${c.name} (${secs}s)\n`);
    } else {
      failed++;
      process.stdout.write(`  ❌ ${c.name} (${secs}s)\n${problems.map((p) => `      ${p}`).join('\n')}\n`);
      process.stdout.write(`      katalog testowy zachowany do wglądu: ${dir}\n`);
    }
    if (problems.length === 0) fs.rmSync(dir, { recursive: true, force: true });
  }
  process.stdout.write(`\n${CASES.length - failed}/${CASES.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main();
