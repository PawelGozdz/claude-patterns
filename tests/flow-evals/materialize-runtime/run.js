#!/usr/bin/env node
/**
 * tests/flow-evals/materialize-runtime/run.js — eval L1 dla scripts/materialize-runtime.mjs.
 *
 * DLACZEGO: materializacja to 900 linii, przez które przechodzi KAŻDA konfiguracja
 * każdego projektu satelitarnego, i do K104 (TASK-KAIZEN-002) nie miała ani jednego
 * testu. Cichy regres tutaj nie objawia się wyjątkiem — objawia się projektem, który
 * po prostu przestaje mieć w panelu blokujący stage albo gubi połowę wzorców.
 *
 * Co robi: dla każdego fixture'u kompozycji materializuje runtime.yml w katalogu
 * tymczasowym i porównuje go — po sparsowaniu YAML-a — ze złotym plikiem
 * `fixtures/<nazwa>.expected.yml`. Sprawdza też, że powstał `installed.yml`
 * z `contract_version`.
 *
 * POLA NIESTABILNE, pomijane w porównaniu:
 *   - materialized_at  — znacznik czasu, inny w każdym przebiegu
 *   - source_hash      — hash treści bloków; zmienia się przy KAŻDEJ edycji dowolnego
 *                        bloku, więc porównywanie go zamieniłoby ten eval w przypominajkę
 *                        o odświeżeniu goldenów, a nie w test zachowania
 *
 * Aktualizacja goldenów po ŚWIADOMEJ zmianie kompozycji:
 *   node tests/flow-evals/materialize-runtime/run.js --update
 * i PRZECZYTAJ diff przed commitem — golden przyjęty bez czytania nie testuje niczego.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const YAML = require('yaml');

const REPO = path.resolve(__dirname, '..', '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const MATERIALIZE = path.join(REPO, 'scripts', 'materialize-runtime.mjs');
const UPDATE = process.argv.includes('--update');

const UNSTABLE_KEYS = ['materialized_at', 'source_hash'];

function stripUnstable(obj) {
  const out = { ...obj };
  for (const k of UNSTABLE_KEYS) delete out[k];
  return out;
}

/** Materializuje jeden fixture. Zwraca { runtimeText, runtime, installed, stdout }. */
function materialize(projectYmlPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-materialize-'));
  const cfg = path.join(dir, '.claude', 'config');
  fs.mkdirSync(cfg, { recursive: true });
  fs.copyFileSync(projectYmlPath, path.join(cfg, 'project.yml'));

  const res = spawnSync('node', [MATERIALIZE, dir, REPO], { encoding: 'utf8' });
  if (res.status !== 0) {
    return { error: `materialize-runtime.mjs exit ${res.status}: ${(res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' | ')}`, dir };
  }

  const runtimePath = path.join(cfg, 'runtime.yml');
  const installedPath = path.join(cfg, 'installed.yml');
  if (!fs.existsSync(runtimePath)) return { error: 'brak .claude/config/runtime.yml po materializacji', dir };

  const runtimeText = fs.readFileSync(runtimePath, 'utf8');
  const installed = fs.existsSync(installedPath) ? YAML.parse(fs.readFileSync(installedPath, 'utf8')) : null;
  return { runtimeText, runtime: YAML.parse(runtimeText), installed, dir, stderr: (res.stderr || '').trim() };
}

/** Różnice między dwiema strukturami — ścieżka + obie wartości, pierwsze 8. */
function diff(expected, actual, prefix = '', acc = []) {
  const keys = new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})]);
  for (const k of keys) {
    if (acc.length >= 8) return acc;
    const p = prefix ? `${prefix}.${k}` : k;
    const e = expected?.[k];
    const a = actual?.[k];
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (isObj(e) && isObj(a)) { diff(e, a, p, acc); continue; }
    if (JSON.stringify(e) !== JSON.stringify(a)) {
      acc.push(`      ${p}:\n        oczekiwano: ${JSON.stringify(e)}\n        otrzymano:  ${JSON.stringify(a)}`);
    }
  }
  return acc;
}

function main() {
  const cases = fs.readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.project.yml'))
    .map((f) => f.replace(/\.project\.yml$/, ''))
    .sort();

  if (cases.length === 0) {
    process.stdout.write('brak fixture\'ów w tests/flow-evals/materialize-runtime/fixtures/\n');
    process.exit(1);
  }

  let failed = 0;
  for (const name of cases) {
    const projectYml = path.join(FIXTURES, `${name}.project.yml`);
    const goldenPath = path.join(FIXTURES, `${name}.expected.yml`);
    const r = materialize(projectYml);

    if (r.error) {
      failed++;
      process.stdout.write(`  ❌ ${name} — ${r.error}\n`);
      continue;
    }

    if (UPDATE || !fs.existsSync(goldenPath)) {
      // Golden zapisujemy BEZ pól niestabilnych — inaczej każdy przebieg dawałby
      // diff w gicie i nikt nie odróżniłby prawdziwej zmiany od znacznika czasu.
      const lines = r.runtimeText.split('\n')
        .filter((l) => !UNSTABLE_KEYS.some((k) => l.startsWith(`${k}:`)));
      fs.writeFileSync(goldenPath, lines.join('\n'));
      process.stdout.write(`  ✍️  ${name} — golden zapisany (${lines.length} linii) — PRZECZYTAJ diff\n`);
      continue;
    }

    const expected = stripUnstable(YAML.parse(fs.readFileSync(goldenPath, 'utf8')));
    const actual = stripUnstable(r.runtime);
    const differences = diff(expected, actual);

    const problems = [];
    if (differences.length) problems.push(`runtime.yml odbiega od goldenu:\n${differences.join('\n')}`);
    if (!r.installed) problems.push('brak .claude/config/installed.yml');
    else if (!r.installed.contract_version) problems.push('installed.yml bez contract_version');

    if (problems.length) {
      failed++;
      process.stdout.write(`  ❌ ${name}\n${problems.map((p) => `      ${p}`).join('\n')}\n`);
    } else {
      process.stdout.write(`  ✅ ${name} (${(actual.stack_blocks || []).length} bloków, kontrakt ${r.installed.contract_version})\n`);
    }
  }

  if (UPDATE) {
    process.stdout.write('\ngoldeny zaktualizowane — przejrzyj `git diff` przed commitem\n');
    process.exit(0);
  }
  process.stdout.write(`\n${cases.length - failed}/${cases.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main();
