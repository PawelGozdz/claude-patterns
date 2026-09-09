#!/usr/bin/env node
/**
 * tests/flow-evals/project-yml/run.js — eval L1 dla scripts/lib/project-yml.mjs (K65).
 *
 * Deterministyczny scorer: (fixture, tryb, ścieżka) → oczekiwany stdout + kod wyjścia.
 * Zero LLM, zero sieci. Wzór: tests/flow-evals/hooks/run.js.
 *
 * Dwie warstwy:
 *   1. KONTRAKT parsera — wartości, których oczekują skrypty basha (skalary, listy,
 *      brak klucza = kod 1, wartość złożona w trybie `get` = kod 2).
 *   2. SPÓJNOŚĆ trzech skryptów — setup-project.sh, generate-claude-md.sh i
 *      migrate-v2.sh muszą zwrócić DOKŁADNIE to samo dla tej samej ścieżki.
 *      To jest test na regresję z K65: kopie grep/sed rozjechały się na komentarzu
 *      inline (jedna go ucinała, druga wciągała do wartości), a nic tego nie łapało.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const PARSER = path.join(REPO, 'scripts', 'lib', 'project-yml.mjs');
const FIXTURE = path.join(__dirname, 'fixtures', 'project.yml');

// ── 1. Kontrakt parsera ────────────────────────────────────────────────────
const CASES = [
  { name: 'get: skalar prosty', mode: 'get', pathq: 'project.name', out: ['fixture-project'] },
  // Ten przypadek jest sednem K65: komentarz po wartości NIE jest częścią wartości.
  { name: 'get: komentarz inline odcięty', mode: 'get', pathq: 'project.stack_profile', out: ['nestjs-ddd'] },
  { name: 'get: komentarz inline odcięty (language)', mode: 'get', pathq: 'project.language', out: ['typescript'] },
  { name: 'get: cudzysłowy zdjęte, przecinek i # zachowane', mode: 'get', pathq: 'project.description',
    out: ['Opis z przecinkiem, cudzysłowem i # hashem w środku'] },
  { name: 'get: wartość z przecinkami', mode: 'get', pathq: 'project.stack', out: ['NestJS, TypeScript, PostgreSQL'] },
  { name: 'get: bool', mode: 'get', pathq: 'project.pm_system', out: ['true'] },
  { name: 'get: klucz zagnieżdżony poza project', mode: 'get', pathq: 'cost.opus', out: ['<30%'] },
  // Forma `[a, b]` jest kontraktem wobec setup-project.sh (`tr -d '[] '` → `a,b`).
  { name: 'get: lista inline w formie [a, b]', mode: 'get', pathq: 'broadcast.emits', out: ['[geo, pricing]'] },
  { name: 'get: brak klucza → kod 1, pusty stdout', mode: 'get', pathq: 'project.nie_ma', out: [], code: 1 },
  { name: 'get: brak całej sekcji → kod 1', mode: 'get', pathq: 'nie_ma.wcale', out: [], code: 1 },
  { name: 'get: wartość złożona → kod 2', mode: 'get', pathq: 'contexts', out: [], code: 2 },

  { name: 'list: lista blokowa, komentarze odcięte', mode: 'list', pathq: 'skills',
    out: ['security', 'testing', 'quality'] },
  { name: 'list: ścieżki bez opisu', mode: 'list', pathq: 'docs', out: ['DOC_A.md', 'DOC_B.md'] },
  { name: 'list: lista inline pod ścieżką kropkowaną', mode: 'list', pathq: 'project.stack_blocks',
    out: ['nestjs', 'ddd', 'kysely'] },
  { name: 'list: element złożony jako JSON', mode: 'list', pathq: 'contexts',
    out: ['{"name":"auth","tests":279}'] },
  { name: 'list: pusta lista → kod 1', mode: 'list', pathq: 'empty_list', out: [], code: 1 },
  { name: 'list: nie-lista → kod 2', mode: 'list', pathq: 'project.name', out: [], code: 2 },
];

function runParser(mode, pathq, file = FIXTURE) {
  const res = spawnSync('node', [PARSER, file, mode, pathq], { encoding: 'utf8' });
  return { code: res.status, lines: (res.stdout || '').split('\n').filter((l) => l !== '') };
}

// ── 2. Spójność trzech skryptów basha ──────────────────────────────────────
// Wycinamy z każdego skryptu definicję yml_get/yml_list i wołamy ją w izolacji,
// zamiast uruchamiać cały setup (interaktywny, dotyka dysku). Ważne jest jedno:
// czy trzy skrypty na tym samym pliku odpowiadają tak samo.
const BASH_SCRIPTS = ['setup-project.sh', 'generate-claude-md.sh', 'migrate-v2.sh'];
const SHARED_KEYS = ['project.name', 'project.stack_profile', 'project.language', 'project.description'];
// yml_list ma tylko dwa skrypty — i to na nim rozjazd był widoczny gołym okiem:
// generate-claude-md.sh ucinał komentarz przy elemencie listy, setup-project.sh nie.
const LIST_SCRIPTS = ['setup-project.sh', 'generate-claude-md.sh'];
const SHARED_LISTS = ['skills', 'docs'];

function bashFn(script, fnName, arg) {
  const src = fs.readFileSync(path.join(REPO, 'scripts', script), 'utf8');
  const fn = src.match(new RegExp(`^${fnName}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
  if (!fn) return { err: `nie znalazłem definicji ${fnName}() w ${script}` };
  const prog = [
    'set -euo pipefail',
    `SCRIPT_DIR=${JSON.stringify(path.join(REPO, 'scripts'))}`,
    `PROJECT_YML=${JSON.stringify(FIXTURE)}`,
    fn[0],
    `${fnName} ${JSON.stringify(arg)}`,
  ].join('\n');
  const res = spawnSync('bash', ['-c', prog], { encoding: 'utf8' });
  if (res.status !== 0) return { err: `${script}: bash exit ${res.status} ${(res.stderr || '').trim()}` };
  return { value: (res.stdout || '').replace(/\n$/, '') };
}

function main() {
  let failed = 0;
  const fail = (msg) => { failed++; process.stdout.write(`  ❌ ${msg}\n`); };
  const pass = (msg) => process.stdout.write(`  ✅ ${msg}\n`);

  for (const c of CASES) {
    const expectCode = c.code ?? 0;
    const r = runParser(c.mode, c.pathq);
    if (r.code !== expectCode) { fail(`${c.name} — kod ${r.code}, oczekiwano ${expectCode}`); continue; }
    if (JSON.stringify(r.lines) !== JSON.stringify(c.out)) {
      fail(`${c.name} — stdout ${JSON.stringify(r.lines)}, oczekiwano ${JSON.stringify(c.out)}`);
      continue;
    }
    pass(c.name);
  }

  // Brak pliku to błąd twardy (kod 2), nie ciche zero — inaczej literówka w ścieżce
  // wygląda jak „pole nieustawione".
  const missing = runParser('get', 'project.name', path.join(__dirname, 'nie-ma-takiego.yml'));
  if (missing.code === 2) pass('get: brak pliku → kod 2'); else fail(`get: brak pliku — kod ${missing.code}, oczekiwano 2`);

  const consistency = (scripts, fnName, arg, expected, label) => {
    const results = scripts.map((s) => [s, bashFn(s, fnName, arg)]);
    const broken = results.find(([, r]) => r.err);
    if (broken) { fail(`spójność ${arg} — ${broken[1].err}`); return; }
    const values = [...new Set(results.map(([, r]) => r.value))];
    if (values.length !== 1) {
      fail(`spójność ${arg} — skrypty się rozjechały: ${results.map(([s, r]) => `${s}=${JSON.stringify(r.value)}`).join(', ')}`);
      return;
    }
    if (values[0] !== expected) { fail(`spójność ${arg} — bash zwrócił ${JSON.stringify(values[0])}, parser ${JSON.stringify(expected)}`); return; }
    pass(`${label}: ${arg} = ${JSON.stringify(values[0])}`);
  };

  for (const key of SHARED_KEYS)
    consistency(BASH_SCRIPTS, 'yml_get', key, runParser('get', key).lines[0] ?? '', 'spójność 3 skryptów (yml_get)');
  for (const section of SHARED_LISTS)
    consistency(LIST_SCRIPTS, 'yml_list', section, runParser('list', section).lines.join('\n'), 'spójność 2 skryptów (yml_list)');

  const total = CASES.length + 1 + SHARED_KEYS.length + SHARED_LISTS.length;
  process.stdout.write(`\n${total - failed}/${total} passed\n`);
  process.exit(failed ? 1 : 0);
}

main();
