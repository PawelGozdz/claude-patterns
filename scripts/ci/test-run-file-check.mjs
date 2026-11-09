#!/usr/bin/env node
// Test hooka run-file-check (blok file-check): uruchamia go jak harness — JSON na stdin —
// na tymczasowym projekcie z własnym runtime.yml i komendą-wydmuszką.
//   node scripts/ci/test-run-file-check.mjs      # exit 1 przy pierwszym błędzie
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(REPO, 'hooks', 'run-file-check.js');

const project = mkdtempSync(join(tmpdir(), 'file-check-'));
mkdirSync(join(project, '.claude', 'config'), { recursive: true });
mkdirSync(join(project, 'src', 'dir with space'), { recursive: true });
mkdirSync(join(project, 'docs'), { recursive: true });

// Komenda-wydmuszka: kod 1 i komunikat, gdy plik zawiera BAD; z argumentem `slow` śpi 3 s.
writeFileSync(join(project, 'check.mjs'),
  "import { readFileSync } from 'node:fs';\n" +
  "if (process.argv[2] === 'slow') await new Promise((r) => setTimeout(r, 3000));\n" +
  "const f = process.argv.at(-1);\n" +
  "if (readFileSync(f, 'utf8').includes('BAD')) {\n" +
  "  console.error('> pkg@1.0.0 lint:file /x');\n" +
  "  console.error('naruszenie: ' + f);\n" +
  "  console.error('ELIFECYCLE  Command failed with exit code 1.');\n" +
  "  process.exit(1);\n" +
  "}\n");

const runtime = (fileCheck) => `schema_version: 1\nparams:\n${fileCheck}`;
const write = (p, c) => writeFileSync(join(project, p), c);
write('.claude/config/runtime.yml', runtime(
  '  file-check:\n    command: ["node", "check.mjs", "{FILE}"]\n    globs: ["src/**/*.ts"]\n    exclude: ["**/*.gen.ts"]\n    timeout_s: 10\n'));

write('src/bad.ts', 'BAD');
write('src/ok.ts', 'fine');
write('src/x.gen.ts', 'BAD');
write('src/dir with space/bad.ts', 'BAD');
write('docs/bad.md', 'BAD');

function runHook(file) {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(project, file) } });
  const r = spawnSync('node', [HOOK], { input, encoding: 'utf8' });
  let ctx = null;
  try { ctx = JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? null; } catch { /* echo wejścia, nie JSON hooka */ }
  return { status: r.status, ctx };
}

const failures = [];
const expect = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? `: ${detail}` : ''}`); };

let r = runHook('src/bad.ts');
expect('plik naruszający → feedback', r.status === 0 && r.ctx?.includes('naruszenie') && r.ctx.includes('src/bad.ts'), JSON.stringify(r));
expect('linia komendy ma ścieżkę zamiast {FILE}', r.ctx?.includes('$ node check.mjs src/bad.ts') && !r.ctx.includes('{FILE}'), JSON.stringify(r));
expect('szum pnpm jest odfiltrowany', r.ctx?.includes('naruszenie') && !/ELIFECYCLE|pkg@1\.0\.0/.test(r.ctx), JSON.stringify(r));
r = runHook('src/ok.ts');
expect('plik poprawny → cisza', r.status === 0 && r.ctx === null, JSON.stringify(r));
r = runHook('src/x.gen.ts');
expect('exclude wygrywa z globs', r.status === 0 && r.ctx === null, JSON.stringify(r));
r = runHook('docs/bad.md');
expect('plik spoza globs → cisza', r.status === 0 && r.ctx === null, JSON.stringify(r));
r = runHook('src/dir with space/bad.ts');
expect('ścieżka ze spacją to jeden argument', r.status === 0 && r.ctx?.includes('dir with space'), JSON.stringify(r));
r = runHook('src/nie-istnieje.ts');
expect('nieistniejący plik → cisza', r.status === 0 && r.ctx === null, JSON.stringify(r));

write('.claude/config/runtime.yml', runtime(
  '  file-check:\n    command: ["nie-ma-takiego-binarium", "{FILE}"]\n    globs: ["src/**/*.ts"]\n'));
r = runHook('src/bad.ts');
expect('brak binarium → cisza, exit 0', r.status === 0 && r.ctx === null, JSON.stringify(r));

write('.claude/config/runtime.yml', runtime(
  '  file-check:\n    command: ["node", "check.mjs", "slow", "{FILE}"]\n    globs: ["src/**/*.ts"]\n    timeout_s: 1\n'));
r = runHook('src/bad.ts');
expect('timeout → cisza, exit 0', r.status === 0 && r.ctx === null, JSON.stringify(r));

write('.claude/config/runtime.yml', runtime('  inny-blok:\n    x: 1\n'));
r = runHook('src/bad.ts');
expect('brak params.file-check → cisza', r.status === 0 && r.ctx === null, JSON.stringify(r));

rmSync(project, { recursive: true, force: true });

if (failures.length) {
  console.error(`run-file-check: ${failures.length} błąd(ów)\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('run-file-check: 11 przypadków OK');
