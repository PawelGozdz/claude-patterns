#!/usr/bin/env node
/**
 * tests/flow-evals/manual-spawn-rules/run.js — eval L1 dla TASK-AGENT-MANUAL-SPAWN-RULES-001 (pkt 1 i 2).
 *
 * Zero LLM. Uruchamia PRAWDZIWE hooki z payloadami zdarzeń, dwukierunkowo:
 *   • inject-implementer-rule-cards (SubagentStart): ręcznie uruchomiony `*-implementer` dostaje karty w
 *     `additionalContext`; inne agenty, projekty bez runtime.yml i awarie konfiguracji nie dostają nic ani nie wywracają startu.
 *   • check-subagent-pattern-reads (SubagentStop): zapis pliku wzorcowego przez Bash bez przeczytania karty blokuje tak
 *     samo jak Edit; odczyt, zapis poza projektem i przeczytana karta nie blokują.
 *
 * Uruchom: node tests/flow-evals/manual-spawn-rules/run.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const INJECT = path.join(REPO, 'hooks', 'inject-implementer-rule-cards.js');
const READS = path.join(REPO, 'hooks', 'check-subagent-pattern-reads.js');
const REMIND = path.join(REPO, 'hooks', 'remind-verifier-after-manual-implementer.js');

const roots = [];
function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msr-eval-'));
  roots.push(dir);
  for (const [p, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), c);
  }
  return dir;
}
const hook = (script, payload, env = {}) => {
  const r = spawnSync('node', [script], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const RUNTIME = [
  'patterns:',
  '  always:',
  '    - cross-layer/always-pattern.md',
  'orchestrate:',
  '  layers:',
  '    - {id: infra, dirs: [infrastructure/], agent: "infrastructure-implementer", patterns: [infrastructure/repo-pattern.md, infrastructure/nocard-pattern.md]}',
  '    - {id: testing, dirs: [__tests__/], agent: "test-implementer"}',
  '',
].join('\n');
const KB = '.claude/knowledge/patterns/';
const withCards = (extra = {}) => project({
  '.claude/config/runtime.yml': RUNTIME,
  [KB + 'cross-layer/always-pattern_summary.md']: '# ALWAYS-CARD\n- X1 never do X\n',
  [KB + 'infrastructure/repo-pattern_summary.md']: '# REPO-CARD\n- R1 repositories map rows\n',
  [KB + 'infrastructure/nocard-pattern.md']: '# full pattern, no card\n',
  ...extra,
});
const start = (dir, agent) => hook(INJECT, { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: agent, cwd: dir });
const context = (r) => { try { return JSON.parse(r.out).hookSpecificOutput.additionalContext; } catch { return null; } };

const use = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
function stop(dir, tools) {
  const t = path.join(dir, 'agent-transcript.jsonl');
  fs.writeFileSync(t, tools.map((x) => JSON.stringify(x)).join('\n') + '\n');
  return hook(READS, { hook_event_name: 'SubagentStop', agent_transcript_path: t, cwd: dir });
}
const REL = 'src/contexts/a/domain/aggregates/order.aggregate.ts';
const agentDone = (dir, subagentType, extra = {}) => hook(REMIND, {
  hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: subagentType, prompt: 'x' },
  tool_response: { status: 'completed' }, cwd: dir, ...extra,
});
const AGG = (d) => path.join(d, REL);

const CASES = [
  {
    name: 'implementer-gets-always-and-layer-cards-as-additionalContext',
    run() {
      const r = start(withCards(), 'infrastructure-implementer');
      const c = context(r);
      if (r.code !== 0) return `exit ${r.code}`;
      if (!c) return 'brak additionalContext: ' + r.out;
      if (!/ALWAYS-CARD/.test(c) || !/REPO-CARD/.test(c)) return 'brakuje karty always albo warstwy';
      if (!/nocard-pattern\.md/.test(c) || /full pattern, no card/.test(c)) return 'wzorzec bez karty ma być wymieniony ścieżką, nie wklejony';
      return null;
    },
  },
  {
    name: 'cards-of-another-layer-agent-are-not-injected',
    run() {
      const c = context(start(withCards(), 'test-implementer'));
      if (!c || !/ALWAYS-CARD/.test(c)) return 'test-implementer ma dostać karty always';
      if (/REPO-CARD/.test(c)) return 'karta warstwy infrastructure trafiła do test-implementera';
      return null;
    },
  },
  {
    name: 'plugin-scoped-agent-name-matches-its-layer',
    run() {
      const c = context(start(withCards(), 'ecc:infrastructure-implementer'));
      return c && /REPO-CARD/.test(c) ? null : 'ecc:infrastructure-implementer nie dostał kart swojej warstwy';
    },
  },
  {
    name: 'non-implementer-agent-gets-nothing',
    run() {
      const r = start(withCards(), 'code-quality-verifier');
      return r.code === 0 && r.out === '' ? null : `verifier dostał wyjście: ${r.out.slice(0, 80)}`;
    },
  },
  {
    name: 'project-without-runtime-yml-gets-nothing',
    run() {
      const r = start(project(), 'test-implementer');
      return r.code === 0 && r.out === '' ? null : `projekt bez silnika dostał wyjście: ${r.out.slice(0, 80)}`;
    },
  },
  {
    name: 'broken-runtime-yml-never-breaks-the-spawn',
    run() {
      const r = start(project({ '.claude/config/runtime.yml': 'patterns: [unclosed\n  : :' }), 'test-implementer');
      return r.code === 0 && r.out === '' ? null : `exit ${r.code}, out ${r.out.slice(0, 80)}`;
    },
  },
  {
    name: 'cwd-in-a-subdirectory-finds-the-project-runtime',
    run() {
      const d = withCards({ 'packages/api/.keep': '' });
      const c = context(start(path.join(d, 'packages/api'), 'infrastructure-implementer'));
      return c && /REPO-CARD/.test(c) ? null : 'runtime.yml w górę drzewa nie został znaleziony';
    },
  },
  {
    name: 'size-cap-lists-cut-cards-instead-of-dropping-them-silently',
    run() {
      const r = hook(INJECT, { agent_type: 'infrastructure-implementer', cwd: withCards() }, { MANUAL_SPAWN_RULES_MAX_BYTES: '30' });
      const c = context(r);
      return c && /size cap/.test(c) && /repo-pattern\.md/.test(c) ? null : 'karta ucięta limitem nie została wymieniona';
    },
  },
  {
    name: 'switch-off-silences-the-injection',
    run() {
      const r = hook(INJECT, { agent_type: 'test-implementer', cwd: withCards() }, { MANUAL_SPAWN_RULES: 'off' });
      return r.out === '' ? null : 'MANUAL_SPAWN_RULES=off nie wyłączył hooka';
    },
  },
  {
    name: 'finished-manual-implementer-gets-a-verifier-reminder-in-parent-context',
    run() {
      const d = project({ '.claude/config/runtime.yml': 'orchestrate:\n  inner_loop: {verify: "my-verifier"}\n' });
      const c = context(agentDone(d, 'test-implementer'));
      if (!c) return 'brak additionalContext';
      return /my-verifier/.test(c) && /\/orchestrate/.test(c) ? null : 'przypomnienie bez weryfikatora z runtime.yml: ' + c;
    },
  },
  {
    name: 'reminder-skips-verifiers-background-launches-other-tools-and-non-engine-projects',
    run() {
      const d = project({ '.claude/config/runtime.yml': 'orchestrate: {}\n' });
      const cases = [
        ['verifier agent', agentDone(d, 'code-quality-verifier')],
        ['async launch', agentDone(d, 'test-implementer', { tool_response: { status: 'async_launched' } })],
        ['other tool', agentDone(d, 'test-implementer', { tool_name: 'Bash' })],
        ['no runtime.yml', agentDone(project(), 'test-implementer')],
      ];
      for (const [what, r] of cases) if (r.code !== 0 || r.out !== '') return `${what}: wyjście ${r.out.slice(0, 60)}`;
      return null;
    },
  },
  {
    name: 'bash-write-of-a-pattern-file-without-reading-the-card-is-blocked',
    run() {
      const d = project();
      const r = stop(d, [use('Bash', { command: `sed -i 's/a/b/' ${REL}` })]);
      if (r.code !== 2) return `sed -i: exit ${r.code}, oczekiwano 2`;
      if (!/order\.aggregate\.ts/.test(r.err) || !/aggregate-pattern\.md/.test(r.err)) return 'komunikat bez pliku i wzorca: ' + r.err;
      const r2 = stop(project(), [use('Bash', { command: `cat > ${REL} <<EOF\nx\nEOF` })]);
      return r2.code === 2 ? null : `przekierowanie: exit ${r2.code}, oczekiwano 2`;
    },
  },
  {
    name: 'bash-write-passes-after-the-card-was-read',
    run() {
      const d = project();
      const r = stop(d, [
        use('Read', { file_path: path.join(d, KB + 'domain/aggregate-pattern_summary.md') }),
        use('Bash', { command: `sed -i 's/a/b/' ${REL}` }),
      ]);
      return r.code === 0 ? null : `exit ${r.code}, oczekiwano 0`;
    },
  },
  {
    name: 'bash-read-and-writes-outside-patterns-or-project-do-not-block',
    run() {
      const d = project();
      const cases = [
        `cat ${AGG(d)} | head`,
        `npx tsc -p tsconfig.json > /tmp/tsc.log`,
        `echo x > /tmp/out/order.aggregate.ts`,
        `git diff -- ${AGG(d)}`,
      ];
      for (const command of cases) {
        const r = stop(d, [use('Bash', { command })]);
        if (r.code !== 0) return `"${command}": exit ${r.code}, oczekiwano 0`;
      }
      return null;
    },
  },
  {
    name: 'edit-tool-still-blocks-as-before',
    run() {
      const d = project();
      return stop(d, [use('Edit', { file_path: AGG(d) })]).code === 2 ? null : 'Edit przestał blokować';
    },
  },
];

let failed = 0;
for (const c of CASES) {
  let res;
  try { res = c.run(); } catch (e) { res = 'wyjątek: ' + e.message; }
  if (res) { failed++; console.log(`  ❌ ${c.name}\n       ${res}`); } else console.log(`  ✅ ${c.name}`);
}
for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed ? 1 : 0);
