#!/usr/bin/env node
// Eval: blokady z hooków w metrykach (TASK-OBS-011, ADR 0012 aneks).
// Uruchamia PRAWDZIWE hooki (spawn) z CLAUDE_TELEMETRY_DIR w katalogu tymczasowym.
// Pilnuje: blokada → jedno zdarzenie z id reguły; przepuszczenie → zero; w zdarzeniu nie ma treści
// komendy ani ścieżek; zapis kończy się PRZED process.exit; błąd zapisu nie zmienia decyzji hooka.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const HOOKS = path.join(REPO, 'hooks');
const SECRET = 'sekretny-token-8a1f';

function sandbox(name) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-telemetry-eval-'));
  const cwd = path.join(base, name);
  fs.mkdirSync(path.join(cwd, '.claude', 'run-state'), { recursive: true });
  return { base, cwd, telemetry: path.join(base, 'telemetry') };
}

// CLAUDE_TELEMETRY_DIR to sam katalog zdarzeń (pliki RRRR-MM.jsonl), a nie korzeń z podkatalogiem events/.
function events(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
}

function run(hook, payload, { env = {}, telemetry } = {}) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HOOKS, hook)], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, CLAUDE_TELEMETRY_DIR: telemetry, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - t0 };
}

const rootGrep = (cwd, command) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

// Transkrypt JSONL w formacie, który czytają hooki wzorców: jedna linia = jedno tool_use.
function transcript(base, name, toolUses) {
  const file = path.join(base, `${name}.jsonl`);
  fs.writeFileSync(file, toolUses.map((t) => JSON.stringify(t)).join('\n') + '\n');
  return file;
}

const tests = [
  {
    name: 'block-produces-one-event-with-rule-id',
    run() {
      const s = sandbox('proj-a');
      const r = run('block-root-grep.js', rootGrep(s.cwd, `grep -rn ${SECRET} .`), { telemetry: s.telemetry });
      const ev = events(s.telemetry);
      if (r.status !== 0 || !r.stdout.includes('"permissionDecision":"deny"')) return `decyzja hooka zmieniona: status=${r.status}`;
      if (ev.length !== 1) return `oczekiwano 1 zdarzenia, jest ${ev.length}`;
      const e = ev[0];
      if (e.process !== 'hook' || e.kind !== 'step.end' || e.outcome !== 'halted') return `zły kształt: ${e.process}/${e.kind}/${e.outcome}`;
      if (e.step.role !== 'block-root-grep:root-grep' || e.step.id !== 'root-grep') return `zła reguła: ${JSON.stringify(e.step)}`;
      if (e.project !== 'proj-a') return `projekt = ${e.project}, oczekiwano proj-a`;
      if (!/^hook-\d{8}$/.test(e.runId)) return `runId = ${e.runId}`;
      return null;
    },
  },
  {
    name: 'pass-through-leaves-nothing',
    run() {
      const s = sandbox('proj-b');
      const r = run('block-root-grep.js', rootGrep(s.cwd, 'grep -rn foo src/'), { telemetry: s.telemetry });
      if (r.status !== 0) return `status ${r.status}`;
      if (fs.existsSync(s.telemetry)) return 'przepuszczenie utworzyło katalog telemetrii';
      return null;
    },
  },
  {
    name: 'no-command-text-or-paths-in-event',
    run() {
      const s = sandbox('proj-c');
      run('block-root-grep.js', rootGrep(s.cwd, `grep -rn ${SECRET} .`), { telemetry: s.telemetry });
      const raw = JSON.stringify(events(s.telemetry));
      if (!raw.length || raw === '[]') return 'brak zdarzenia do sprawdzenia';
      if (raw.includes(SECRET) || raw.includes('grep -rn')) return 'w zdarzeniu jest treść komendy';
      if (raw.includes(s.base) || raw.includes(os.tmpdir())) return 'w zdarzeniu jest ścieżka';
      return null;
    },
  },
  {
    name: 'exit-2-hook-writes-before-exit',
    run() {
      const s = sandbox('proj-d');
      fs.writeFileSync(path.join(s.cwd, '.claude', 'run-state', 'orchestrating.json'), '{}');
      const r = run('block-subagent-commit.js',
        { tool_name: 'Bash', agent_id: 'a1', tool_input: { command: 'git commit -m x' }, cwd: s.cwd }, { telemetry: s.telemetry });
      const ev = events(s.telemetry);
      if (r.status !== 2) return `status ${r.status}, oczekiwano 2`;
      if (ev.length !== 1 || ev[0].step.role !== 'block-subagent-commit:subagent-git') return `zdarzenia: ${JSON.stringify(ev.map((e) => e.step))}`;
      return null;
    },
  },
  {
    name: 'no-marker-no-block-no-event',
    run() {
      const s = sandbox('proj-e');
      const r = run('block-subagent-commit.js',
        { tool_name: 'Bash', agent_id: 'a1', tool_input: { command: 'git commit -m x' }, cwd: s.cwd }, { telemetry: s.telemetry });
      if (r.status !== 0) return `status ${r.status}`;
      if (events(s.telemetry).length) return 'zdarzenie bez blokady';
      return null;
    },
  },
  {
    name: 'workflow-lint-one-event-per-distinct-rule',
    run() {
      const s = sandbox('proj-f');
      const r = run('pre-workflow-lint.js', { tool_name: 'Workflow', tool_input: { script: 'agent("a")\nagent("b")' }, cwd: s.cwd }, { telemetry: s.telemetry });
      const roles = events(s.telemetry).map((e) => e.step.role);
      if (r.status !== 2) return `status ${r.status}`;
      if (!roles.length || new Set(roles).size !== roles.length) return `role: ${JSON.stringify(roles)}`;
      if (!roles.every((x) => /^pre-workflow-lint:WL\d+$/.test(x))) return `role: ${JSON.stringify(roles)}`;
      return null;
    },
  },
  {
    name: 'workflow-lint-warn-mode-is-not-a-block',
    run() {
      const s = sandbox('proj-g');
      const r = run('pre-workflow-lint.js', { tool_name: 'Workflow', tool_input: { script: 'agent("a")' }, cwd: s.cwd },
        { telemetry: s.telemetry, env: { WORKFLOW_LINT: 'warn' } });
      if (r.status !== 0) return `status ${r.status}`;
      if (events(s.telemetry).length) return 'ostrzeżenie zapisane jako blokada';
      return null;
    },
  },
  {
    name: 'watchdog-kill-switch-uses-kind-as-rule',
    run() {
      const s = sandbox('proj-h');
      fs.writeFileSync(path.join(s.cwd, '.claude', 'run-state', 'KILL'), '');
      const r = run('productivity-watchdog.js', { tool_name: 'Bash', agent_id: 'a1', tool_input: { command: 'ls' }, cwd: s.cwd }, { telemetry: s.telemetry });
      const ev = events(s.telemetry);
      if (r.status !== 2) return `status ${r.status}`;
      if (ev.length !== 1 || ev[0].step.role !== 'productivity-watchdog:kill-switch') return `zdarzenia: ${JSON.stringify(ev.map((e) => e.step))}`;
      if (ev[0].project !== 'proj-h') return `projekt = ${ev[0].project}`;
      return null;
    },
  },
  {
    name: 'approval-gate-block-records-rule-and-warn-mode-does-not',
    run() {
      const s = sandbox('proj-l');
      const dir = path.join(s.cwd, 'project-orchestration', 'analysis');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'T-1.analysis.md'), '---\nstatus: awaiting-human\n---\n');
      const payload = { tool_name: 'Write', tool_input: { file_path: path.join(s.cwd, 'src', 'a.ts') }, cwd: s.cwd };
      const warn = run('check-approval-before-impl.js', payload, { telemetry: s.telemetry });
      if (warn.status !== 0 || events(s.telemetry).length) return `tryb warn: status ${warn.status}, zdarzeń ${events(s.telemetry).length}`;
      const block = run('check-approval-before-impl.js', payload, { telemetry: s.telemetry, env: { APPROVAL_GATE_MODE: 'block' } });
      const ev = events(s.telemetry);
      if (block.status !== 2) return `tryb block: status ${block.status}`;
      if (ev.length !== 1 || ev[0].step.role !== 'check-approval-before-impl:approval-gate') return `zdarzenia: ${JSON.stringify(ev.map((e) => e.step))}`;
      return null;
    },
  },
  {
    name: 'delegation-strict-block-records-rule',
    run() {
      const s = sandbox('proj-m');
      fs.writeFileSync(path.join(s.cwd, '.claude', 'run-state', 'orchestrating.json'), JSON.stringify({ ts: new Date().toISOString() }));
      const payload = { tool_name: 'Write', tool_input: { file_path: path.join(s.cwd, 'src', 'a.ts') }, cwd: s.cwd };
      const r = run('check-delegation.js', payload, { telemetry: s.telemetry });
      const ev = events(s.telemetry);
      if (r.status !== 2) return `status ${r.status}`;
      if (ev.length !== 1 || !/^check-delegation:(orchestrating-strict|pattern-file)$/.test(ev[0].step.role)) return `zdarzenia: ${JSON.stringify(ev.map((e) => e.step))}`;
      const sub = run('check-delegation.js', { ...payload, agent_id: 'a1' }, { telemetry: s.telemetry });
      if (sub.status !== 0 || events(s.telemetry).length !== 1) return 'subagent przepuszczony powinien nic nie zapisać';
      return null;
    },
  },
  {
    name: 'patterns-read-block-records-rule-and-read-pattern-passes',
    run() {
      const s = sandbox('proj-pr');
      const file = path.join(s.cwd, 'src', 'domain', 'aggregates', 'order.aggregate.ts');
      const t = transcript(s.base, 'plain', [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]);
      const blocked = run('check-patterns-read.js', { tool_name: 'Write', tool_input: { file_path: file }, transcript_path: t, cwd: s.cwd }, { telemetry: s.telemetry });
      const ev = events(s.telemetry);
      if (blocked.status !== 2) return `bez przeczytanego wzorca status ${blocked.status}, oczekiwano 2`;
      if (ev.length !== 1 || ev[0].step.role !== 'check-patterns-read:patterns-read') return `zdarzenia po blokadzie: ${JSON.stringify(ev.map((e) => e.step))}`;
      if (JSON.stringify(ev).includes('order.aggregate')) return 'w zdarzeniu jest ścieżka pliku';
      const s2 = sandbox('proj-pr2');
      const t2 = transcript(s2.base, 'read', [{ type: 'tool_use', name: 'Read', input: { file_path: '/p/.claude/knowledge/patterns/domain/aggregate-pattern.md' } }]);
      const passed = run('check-patterns-read.js', { tool_name: 'Write', tool_input: { file_path: file }, transcript_path: t2, cwd: s2.cwd }, { telemetry: s2.telemetry });
      if (passed.status !== 0) return `z przeczytanym wzorcem status ${passed.status}, oczekiwano 0`;
      if (events(s2.telemetry).length !== 0) return 'przepuszczenie zostawiło zdarzenie';
      return null;
    },
  },
  {
    name: 'pattern-grounding-block-records-rule-and-read-pattern-passes',
    run() {
      const s = sandbox('proj-pg');
      const file = path.join(s.cwd, 'src', 'domain', 'aggregates', 'order.aggregate.ts');
      const edit = { type: 'tool_use', name: 'Write', input: { file_path: file } };
      const t = transcript(s.base, 'edit-only', [edit]);
      const blocked = run('check-subagent-pattern-reads.js', { agent_transcript_path: t, cwd: s.cwd }, { telemetry: s.telemetry });
      const ev = events(s.telemetry);
      if (blocked.status !== 2) return `bez przeczytanego wzorca status ${blocked.status}, oczekiwano 2`;
      if (ev.length !== 1 || ev[0].step.role !== 'check-subagent-pattern-reads:pattern-grounding') return `zdarzenia po blokadzie: ${JSON.stringify(ev.map((e) => e.step))}`;
      if (JSON.stringify(ev).includes('order.aggregate')) return 'w zdarzeniu jest ścieżka pliku';
      const s2 = sandbox('proj-pg2');
      const read = { type: 'tool_use', name: 'Read', input: { file_path: '/p/.claude/knowledge/patterns/domain/aggregate-pattern_summary.md' } };
      const t2 = transcript(s2.base, 'edit-and-read', [read, edit]);
      const passed = run('check-subagent-pattern-reads.js', { agent_transcript_path: t2, cwd: s2.cwd }, { telemetry: s2.telemetry });
      if (passed.status !== 0) return `z przeczytanym wzorcem status ${passed.status}, oczekiwano 0`;
      if (events(s2.telemetry).length !== 0) return 'przepuszczenie zostawiło zdarzenie';
      return null;
    },
  },
  {
    name: 'unwritable-telemetry-does-not-change-the-decision',
    run() {
      const s = sandbox('proj-i');
      const blocker = path.join(s.base, 'plik');
      fs.writeFileSync(blocker, 'x');
      const bad = path.join(blocker, 'telemetry'); // katalog „pod plikiem" — mkdir musi paść
      const ok = run('block-root-grep.js', rootGrep(s.cwd, 'grep -rn x .'), { telemetry: s.telemetry });
      const broken = run('block-root-grep.js', rootGrep(s.cwd, 'grep -rn x .'), { telemetry: bad });
      if (broken.status !== ok.status || broken.stdout !== ok.stdout) return 'błąd zapisu zmienił decyzję hooka';
      return null;
    },
  },
  {
    name: 'kill-switch-env-disables-writing',
    run() {
      const s = sandbox('proj-j');
      const r = run('block-root-grep.js', rootGrep(s.cwd, 'grep -rn x .'), { telemetry: s.telemetry, env: { HOOK_TELEMETRY: 'off' } });
      if (r.status !== 0 || !r.stdout.includes('deny')) return 'decyzja zmieniona';
      if (events(s.telemetry).length) return 'HOOK_TELEMETRY=off nie wyłączył zapisu';
      return null;
    },
  },
  {
    name: 'overhead-of-a-block-is-small',
    run() {
      const s = sandbox('proj-k');
      const median = (env) => {
        const xs = [];
        for (let i = 0; i < 7; i++) xs.push(run('block-root-grep.js', rootGrep(s.cwd, 'grep -rn x .'), { telemetry: s.telemetry, env }).ms);
        return xs.sort((a, b) => a - b)[3];
      };
      const off = median({ HOOK_TELEMETRY: 'off' });
      const on = median({});
      if (on - off > 60) return `narzut ${on - off} ms (z zapisem ${on}, bez ${off})`;
      return null;
    },
  },
  {
    name: 'eval-is-registered-in-pre-commit',
    run() {
      const guards = fs.readFileSync(path.join(REPO, 'scripts', 'pre-commit-guards.mjs'), 'utf8');
      return guards.includes('tests/flow-evals/hook-telemetry/run.js') ? null : 'brak wpisu w pre-commit-guards.mjs';
    },
  },
];

let failed = 0;
for (const t of tests) {
  let err;
  try { err = t.run(); } catch (e) { err = `wyjątek: ${e.message}`; }
  console.log(err ? `  ❌ ${t.name}\n       ${err}` : `  ✅ ${t.name}`);
  if (err) failed++;
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
