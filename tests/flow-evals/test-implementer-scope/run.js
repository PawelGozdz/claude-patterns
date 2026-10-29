#!/usr/bin/env node
/**
 * tests/flow-evals/test-implementer-scope/run.js — eval L1 dla hooks/check-test-implementer-scope.js.
 *
 * Zero LLM. Każdy przypadek buduje transkrypt agenta (JSONL z tool_use) w katalogu tymczasowym i uruchamia
 * PRAWDZIWY hook z payloadem SubagentStop. Dwukierunkowo: hook ma blokować zapis kodu produkcyjnego
 * (także przez Bash) i nie ruszać legalnej pracy test-implementera ani innych agentów.
 *
 * Uruchom: node tests/flow-evals/test-implementer-scope/run.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(REPO, 'hooks', 'check-test-implementer-scope.js');

const roots = [];
function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tis-eval-'));
  roots.push(dir);
  for (const [p, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), c);
  }
  return dir;
}
const use = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
function run(dir, tools, extra = {}, env = {}) {
  const transcript = path.join(dir, 'agent-transcript.jsonl');
  fs.writeFileSync(transcript, tools.map((t) => JSON.stringify(t)).join('\n') + '\n');
  const payload = { hook_event_name: 'SubagentStop', agent_type: 'test-implementer', agent_transcript_path: transcript, cwd: dir, ...extra };
  const r = spawnSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, err: r.stderr };
}
const { execFileSync } = require('child_process');
function gitProject(files = {}) {
  // transkrypt agenta leży w prawdziwym użyciu poza repo; harness zapisuje go w katalogu projektu, więc go ignorujemy
  const dir = project({ '.gitignore': 'agent-transcript.jsonl\n', ...files });
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('add', '-A'); g('commit', '-qm', 'base', '--allow-empty');
  return dir;
}
// wpis transkryptu ze znacznikiem czasu (pierwszy wpis wyznacza start agenta)
const useAt = (name, input, ms) => ({ timestamp: new Date(ms).toISOString(), type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const runAt = (dir, tools, extra = {}, env = {}) => run(dir, tools, extra, env);

const H = (d) => path.join(d, 'src/contexts/auth/application/commands/verify-phone-login/handler.ts');

const CASES = [
  {
    name: 'production-edit-is-blocked-and-named',
    run() {
      const d = project();
      const r = run(d, [use('Edit', { file_path: H(d) })]);
      if (r.code !== 2) return `exit ${r.code}, oczekiwano 2`;
      if (!/verify-phone-login\/handler\.ts \(via Edit\)/.test(r.err)) return 'komunikat bez ścieżki i narzędzia: ' + r.err;
      if (!/GAP/.test(r.err)) return 'komunikat nie mówi, co zrobić (zgłosić lukę)';
      return null;
    },
  },
  {
    name: 'legit-test-scope-writes-pass',
    run() {
      const d = project();
      const paths = [
        'src/contexts/auth/application/commands/x/__tests__/handler.spec.ts',
        'src/contexts/auth/application/commands/x/handler.test.ts',
        'test/setup/env.ts',
        'test/results/notes.json',
        'src/contexts/auth/__fixtures__/user.ts',
        'src/contexts/auth/domain/user.mother.ts',
        'src/contexts/auth/infrastructure/repositories/user.repository.mock.ts',
        'vitest.config.ts',
        '.claude/agent-memory/test-implementer/note.md',
        'src/contexts/auth/application/commands/x/handler.e2e-spec.ts',
      ];
      const r = run(d, paths.map((p) => use('Write', { file_path: path.join(d, p) })));
      if (r.code !== 0) return `legalny zapis zablokowany: exit ${r.code} ${r.err}`;
      return null;
    },
  },
  {
    name: 'other-agent-types-and-missing-type-pass',
    run() {
      const d = project();
      const prod = [use('Edit', { file_path: H(d) })];
      if (run(d, prod, { agent_type: 'domain-application-implementer' }).code !== 0) return 'implementer warstwy zablokowany';
      if (run(d, prod, { agent_type: 'infrastructure-implementer' }).code !== 0) return 'infrastructure-implementer zablokowany';
      if (run(d, prod, { agent_type: undefined }).code !== 0) return 'brak agent_type: hook nie może zgadywać';
      if (run(d, prod, { agent_type: 'ecc:test-implementer' }).code !== 2) return 'wariant z prefiksem pluginu nie rozpoznany';
      return null;
    },
  },
  {
    name: 'bash-write-to-production-file-is-caught',
    run() {
      const d = project();
      const cmd = `python3 - <<'EOF'\np='src/contexts/auth/application/commands/verify-phone-login/handler.ts'\ns=open(p).read()\nopen(p,'w').write(s.replace('a','b'))\nEOF`;
      const r = run(d, [use('Bash', { command: cmd })]);
      if (r.code !== 2 || !/handler\.ts \(via Bash\)/.test(r.err)) return `zapis przez python/Bash przeszedł: exit ${r.code} ${r.err}`;
      const sed = run(d, [use('Bash', { command: "sed -i 's/a/b/' src/contexts/auth/application/commands/x/handler.ts" })]);
      if (sed.code !== 2) return 'sed -i na kodzie produkcyjnym przeszedł';
      const redir = run(d, [use('Bash', { command: "echo 'x' >> src/shared/config/config.schema.ts" })]);
      if (redir.code !== 2) return 'przekierowanie >> do kodu produkcyjnego przeszło';
      return null;
    },
  },
  {
    name: 'bash-reads-and-test-runs-are-not-writes',
    run() {
      const d = project();
      const cmds = [
        "sed -n 1,40p src/contexts/auth/application/commands/x/handler.ts",
        "grep -n throw src/contexts/auth/application/commands/x/handler.ts",
        "python3 -c \"import json;print(json.load(open('package.json')))\"",
        'npx vitest run src/contexts/auth/application/commands/x/handler.spec.ts > /tmp/out.log 2>&1; echo EXIT:$?',
        'npm run typecheck 2>&1 | tee /tmp/tc.log',
        'cat src/contexts/auth/application/commands/x/handler.ts',
      ];
      const r = run(d, cmds.map((c) => use('Bash', { command: c })));
      if (r.code !== 0) return `odczyt/uruchomienie testów uznane za zapis: exit ${r.code} ${r.err}`;
      const ok = run(d, [use('Bash', { command: "sed -i 's/a/b/' src/contexts/auth/application/commands/x/handler.spec.ts" })]);
      if (ok.code !== 0) return 'sed -i na pliku spec zablokowany';
      return null;
    },
  },
  {
    name: 'bash-attribution-uses-write-targets-not-mentions',
    run() {
      const d = project();
      // klasy fałszywych alarmów z prawdziwego transkryptu agenta (api-1, 2026-10-20)
      const benign = [
        'tsc -p tsconfig.json > /tmp/tsc.log 2>&1; echo EXIT:$?',
        'S=/tmp/x && bash scripts/test-heavy.sh pnpm exec vitest run --config vitest-integration.config.ts src/a/b.spec.ts > $S/run2.log 2>&1',
        'S=/tmp/x && P=src/contexts/auth/infrastructure/queues/sms-otp-delivery.processor.ts && cp $P $S/processor.good.ts',
        "python3 - <<'EOF'\np='src/contexts/auth/application/commands/x/__tests__/handler.spec.ts'\ns=open(p).read()\nopen(p,'w').write(s.replace('// see src/contexts/auth/application/commands/x/handler.ts and src/shared/config/config.schema.ts','y'))\nEOF",
        'git diff --stat src/contexts/auth/application/commands/x/handler.ts > /tmp/diff.txt',
      ];
      const r = run(d, benign.map((c) => use('Bash', { command: c })));
      if (r.code !== 0) return `fałszywy alarm: wzmianka / odczyt uznane za zapis: ${r.err}`;
      // ...a prawdziwe zapisy nadal wpadają, także przez zmienną i cp
      const real = [
        'G=src/contexts/auth/application/commands; sed -i "s/a/b/" $G/x/handler.ts',
        'cp /tmp/patched.ts src/contexts/auth/application/commands/x/handler.ts',
        "python3 -c \"from pathlib import Path; Path('src/contexts/auth/infrastructure/queues/p.processor.ts').write_text('x')\"",
        "node -e \"require('fs').writeFileSync('src/shared/config/config.schema.ts','x')\"",
      ];
      for (const c of real) {
        const x = run(d, [use('Bash', { command: c })]);
        if (x.code !== 2) return `prawdziwy zapis przeszedł: ${c.slice(0, 70)}`;
      }
      return null;
    },
  },
  {
    name: 'loop-guard-modes-and-off',
    run() {
      const d = project();
      const prod = [use('Write', { file_path: H(d) })];
      const again = run(d, prod, { stop_hook_active: true });
      if (again.code !== 0 || !/outside the test scope/.test(again.err)) return 'stop_hook_active: powinien przepuścić z ostrzeżeniem';
      if (run(d, prod, {}, { TEST_SCOPE_MODE: 'warn' }).code !== 0) return 'tryb warn zablokował';
      const off = run(d, prod, {}, { TEST_SCOPE_MODE: 'off' });
      if (off.code !== 0 || off.err) return 'tryb off nie jest cichy';
      return null;
    },
  },
  {
    name: 'project-can-extend-scope-and-missing-transcript-passes',
    run() {
      const d = project({ '.claude/test-scope.json': JSON.stringify({ allow: ['^src/shared/test-utils/'] }) });
      const r = run(d, [use('Write', { file_path: path.join(d, 'src/shared/test-utils/db.ts') })]);
      if (r.code !== 0) return 'rozszerzenie zakresu z .claude/test-scope.json nie działa: ' + r.err;
      const blocked = run(d, [use('Write', { file_path: path.join(d, 'src/shared/other/db.ts') })]);
      if (blocked.code !== 2) return 'rozszerzenie otworzyło za dużo';
      const p = spawnSync('node', [HOOK], { input: JSON.stringify({ agent_type: 'test-implementer', agent_transcript_path: '/nie/ma/takiego.jsonl', cwd: d }), encoding: 'utf8' });
      if (p.status !== 0) return 'brak transkryptu: hook musi przepuścić';
      return null;
    },
  },
  {
    name: 'business-rules-and-config-outside-scope-are-blocked',
    run() {
      const d = project();
      const r = run(d, [use('Edit', { file_path: path.join(d, 'src/contexts/auth/BUSINESS_RULES.yaml') }), use('Edit', { file_path: path.join(d, 'src/shared/config/config.schema.ts') })]);
      if (r.code !== 2 || !/BUSINESS_RULES\.yaml/.test(r.err) || !/config\.schema\.ts/.test(r.err)) return 'BUSINESS_RULES.yaml / config.schema.ts nie wykryte: ' + r.err;
      return null;
    },
  },
  {
    name: 'script-writes-are-caught-by-the-mtime-layer',
    // python3 fix.py: cel zapisu nie występuje w treści polecenia, heurystyka transkryptu go nie widzi
    run() {
      const d = gitProject({ 'src/a/handler.ts': 'export const a = 1;\n', 'README.md': 'x\n' });
      const started = Date.now() - 60000;
      fs.writeFileSync(path.join(d, 'src/a/handler.ts'), 'export const a = 2;\n'); // zmiana "w czasie życia agenta"
      const r = runAt(d, [useAt('Bash', { command: 'python3 fix.py' }, started)]);
      if (r.code !== 2 || !/src\/a\/handler\.ts/.test(r.err)) return `exit ${r.code}: zapis przez skrypt przeszedł\n${r.err}`;
      return null;
    },
  },
  {
    name: 'mtime-layer-stays-silent-without-a-write-capable-command',
    // zmiany innych agentów w tym samym czasie nie mogą być przypisane temu agentowi
    run() {
      const d = gitProject({ 'src/a/handler.ts': 'export const a = 1;\n' });
      const started = Date.now() - 60000;
      fs.writeFileSync(path.join(d, 'src/a/handler.ts'), 'export const a = 2;\n');
      const r = runAt(d, [useAt('Read', { file_path: path.join(d, 'src/a/handler.ts') }, started), useAt('Bash', { command: 'npx vitest run' }, started)]);
      if (r.code !== 0) return `exit ${r.code}: zmiana bez polecenia zdolnego do zapisu została przypisana agentowi\n${r.err}`;
      return null;
    },
  },
  {
    name: 'mtime-layer-ignores-files-changed-before-the-agent-started-and-test-files',
    run() {
      const d = gitProject({ 'src/a/handler.ts': 'export const a = 1;\n', 'src/a/handler.spec.ts': 'x\n' });
      fs.writeFileSync(path.join(d, 'src/a/handler.ts'), 'export const a = 2;\n');
      fs.utimesSync(path.join(d, 'src/a/handler.ts'), new Date(Date.now() - 3600000), new Date(Date.now() - 3600000));
      const started = Date.now() - 60000;
      fs.writeFileSync(path.join(d, 'src/a/handler.spec.ts'), 'y\n');
      const r = runAt(d, [useAt('Bash', { command: 'python3 gen_tests.py' }, started)]);
      if (r.code !== 0) return `exit ${r.code}: plik sprzed startu agenta albo plik testowy zablokowany\n${r.err}`;
      return null;
    },
  },
  {
    name: 'config-of-the-checks-is-not-writable-by-the-test-implementer',
    run() {
      const d = project();
      for (const p of ['.claude/conformance.json', '.claude/test-scope.json']) {
        const r = run(d, [use('Write', { file_path: path.join(d, p) })]);
        if (r.code !== 2 || !new RegExp(p.replace('.', '\\.')).test(r.err)) return `${p}: exit ${r.code}, oczekiwano 2 (agent nie rozszerza sam swojego zakresu)`;
      }
      return null;
    },
  },
  {
    name: 'allow-all-written-by-the-agent-does-not-excuse-its-other-writes',
    // test-scope.json czytany z HEAD: zapis allow ".*" w trakcie przebiegu nie zadziała
    run() {
      const d = gitProject({ 'README.md': 'x\n' });
      fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(d, '.claude/test-scope.json'), JSON.stringify({ allow: ['.*'] }));
      const r = run(d, [use('Write', { file_path: path.join(d, 'src/a/handler.ts') })]);
      if (r.code !== 2) return `exit ${r.code}: allow z drzewa roboczego (nie z HEAD) usprawiedliwił zapis kodu produkcyjnego`;
      return null;
    },
  },
  {
    name: 'committed-test-scope-still-extends-the-scope',
    run() {
      const d = gitProject({ 'README.md': 'x\n', '.claude/test-scope.json': JSON.stringify({ allow: ['^src/shared/test-kit/'] }) });
      const r = run(d, [use('Write', { file_path: path.join(d, 'src/shared/test-kit/helper.ts') })]);
      if (r.code !== 0) return `exit ${r.code}: zatwierdzone (w HEAD) rozszerzenie zakresu nie działa\n${r.err}`;
      return null;
    },
  },
  {
    name: 'even-a-committed-allow-all-does-not-open-the-check-config-files',
    run() {
      const d = gitProject({ '.claude/test-scope.json': JSON.stringify({ allow: ['.*'] }) });
      for (const p of ['.claude/conformance.json', '.claude/test-scope.json']) {
        const r = run(d, [use('Write', { file_path: path.join(d, p) })]);
        if (r.code !== 2) return `${p}: exit ${r.code}, oczekiwano 2 (plik konfiguracji kontroli jest chroniony niezależnie od allow)`;
      }
      return null;
    },
  },
  {
    name: 'mtime-layer-works-when-cwd-is-a-subdirectory-of-the-repo',
    run() {
      const d = gitProject({ 'pkg/src/h.ts': 'export const a = 1;\n', 'other/src/o.ts': 'export const o = 1;\n' });
      const started = Date.now() - 60000;
      fs.writeFileSync(path.join(d, 'pkg/src/h.ts'), 'export const a = 2;\n');
      fs.writeFileSync(path.join(d, 'other/src/o.ts'), 'export const o = 2;\n'); // poza cwd agenta — nie jego sprawa
      const r = run(d, [useAt('Bash', { command: 'python3 fix.py' }, started)], { cwd: path.join(d, 'pkg') });
      if (r.code !== 2 || !/src\/h\.ts/.test(r.err)) return `exit ${r.code}: warstwa deterministyczna milczy w podkatalogu repo\n${r.err}`;
      if (/other\/src\/o\.ts/.test(r.err)) return 'plik poza cwd agenta został mu przypisany';
      return null;
    },
  },
  {
    name: 'deleted-production-file-counts-only-when-a-command-names-it',
    run() {
      const d = gitProject({ 'src/a/handler.ts': 'export const a = 1;\n', 'src/b/other.ts': 'export const b = 1;\n' });
      const started = Date.now() - 60000;
      fs.rmSync(path.join(d, 'src/a/handler.ts')); fs.rmSync(path.join(d, 'src/b/other.ts'));
      const r = run(d, [useAt('Bash', { command: 'rm src/a/handler.ts' }, started)]);
      if (r.code !== 2 || !/src\/a\/handler\.ts/.test(r.err)) return `exit ${r.code}: usunięcie wskazane w poleceniu przeszło\n${r.err}`;
      if (/src\/b\/other\.ts/.test(r.err)) return 'usunięcie pliku, którego polecenie nie wymienia, zostało przypisane agentowi';
      return null;
    },
  },
  {
    name: 'inferred-violation-message-does-not-tell-the-agent-to-revert-other-peoples-work',
    run() {
      const d = gitProject({ 'src/a/handler.ts': 'export const a = 1;\n' });
      const started = Date.now() - 60000;
      fs.writeFileSync(path.join(d, 'src/a/handler.ts'), 'export const a = 2;\n');
      const r = run(d, [useAt('Bash', { command: 'bash fix.sh' }, started)]);
      if (r.code !== 2) return `exit ${r.code}: bash fix.sh nie uruchomił warstwy deterministycznej`;
      if (!/do NOT revert/.test(r.err)) return 'komunikat nie ostrzega przed cofaniem cudzych zmian';
      return null;
    },
  },
  {
    name: 'redirect-to-tmp-and-snapshots-are-not-violations',
    run() {
      const d = gitProject({ 'src/a/handler.ts': 'export const a = 1;\n', 'src/a/__snapshots__/h.snap': 's\n' });
      fs.writeFileSync(path.join(d, 'src/a/handler.ts'), 'export const a = 2;\n'); // cudza zmiana w oknie
      const started = Date.now() - 60000;
      const r1 = run(d, [useAt('Bash', { command: 'npx vitest run > /tmp/out.log 2>&1' }, started)]);
      if (r1.code !== 0) return `exit ${r1.code}: przekierowanie do /tmp uruchomiło warstwę deterministyczną i przypisało cudzą zmianę\n${r1.err}`;
      fs.writeFileSync(path.join(d, 'src/a/__snapshots__/h.snap'), 's2\n');
      fs.writeFileSync(path.join(d, 'src/a/handler.ts'), 'export const a = 1;\n');
      const r2 = run(d, [useAt('Bash', { command: 'python3 gen.py' }, started)]);
      if (r2.code !== 0) return `exit ${r2.code}: snapshot testowy zablokowany\n${r2.err}`;
      return null;
    },
  },
];

let failed = 0;
for (const t of CASES) {
  let err;
  try { err = t.run(); } catch (e) { err = 'wyjątek: ' + e.message; }
  if (err) { failed++; process.stdout.write(`  ❌ ${t.name} — ${err}\n`); }
  else process.stdout.write(`  ✅ ${t.name}\n`);
}
for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
process.stdout.write(`\n${CASES.length - failed}/${CASES.length} passed\n`);
process.exit(failed ? 1 : 0);
