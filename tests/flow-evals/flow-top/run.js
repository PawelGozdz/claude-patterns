#!/usr/bin/env node
/**
 * tests/flow-evals/flow-top/run.js — eval L1 dla widoku przebiegu na żywo (TASK-OBS-008).
 *
 * DLACZEGO: flow-top ma być zaufanym wskaźnikiem „gdzie jesteśmy". Psuje się po cichu na trzy sposoby:
 * plan znika, gdy przebieg jeszcze trwa (wynik końcowy nie istnieje, plan siedzi tylko w skrypcie),
 * kroki dokładkowe (`…-final-fix`) mnożą wiersze ponad plan, a „naprawione/otwarte" liczy się inaczej
 * niż w agregatach, z którymi widok porównuje średnią. Wszystko na sztucznych danych.
 *
 * Kontrakty:
 *   1. plan z przebiegu W TOKU (bez result) — z literału w wf.script; nawiasy w napisach nie mylą parsera
 *   2. postęp N/M liczy kroki planu zakończone; agent w toku oznacza swoją jednostkę ▶ z licznikami
 *   3. NO-GO → naprawione (kolejny GO) albo otwarte (ostatni werdykt NO-GO)
 *   4. kroki dokładkowe wpadają do jednostki z planu, bez własnych wierszy
 *   5. średnia z rollupów: okno dni, wiele hostów, proces orchestrate; brak historii nie psuje widoku
 *   6. koszt = suma costOf; brak ceny → „koszt ?"
 *   7. flow-top opisany w howto, a eval zarejestrowany w pre-commit
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-flowtop-'));
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);

const NOW = Date.parse('2026-10-17T12:00:00Z');
const PLAN = [
  { id: 'core:a:implementer', group: 'core:a', role: 'implementer' },
  { id: 'core:a:verifier', group: 'core:a', role: 'verifier' },
  { id: 'core:b:implementer', group: 'core:b', role: 'implementer' },
  { id: 'core:b:verifier', group: 'core:b', role: 'verifier' },
  { id: 'final:gate', group: 'final', role: 'gate' },
];

// Skrypt z argumentami jak w prawdziwym przebiegu: tablica planu wśród innych pól, z "]" i "[" w napisach.
const script = (plan = PLAN) => `const a = ${JSON.stringify({
  task: { id: 'TS-X-001', title: 'tytuł z [nawiasami] i "cudzysłowem"' },
  notes: ['a ] b', 'c [ d'],
  telemetryPlan: plan,
}, null, 1)}\nconst report = { telemetryPlan: a.telemetryPlan }`;

let seq = 0;
const agent = (label, state, extra = {}) => ({
  type: 'workflow_agent', label, state, agentId: `ag${++seq}`, agentType: 'impl-agent', model: 'claude-sonnet-5-5',
  startedAt: NOW - 600000 + seq * 1000, toolCalls: 5, durationMs: 20000, ...extra,
});
const wfOf = (agents, extra = {}) => ({
  runId: 'wf_test', timestamp: new Date(NOW - 600000).toISOString(), startTime: NOW - 600000, status: 'running',
  workflowName: 'orchestrate', script: script(), workflowProgress: [{ type: 'workflow_phase', index: 1, title: 'Warstwy' }, ...agents], ...extra,
});
const journalOf = (agents, verdicts) => agents
  .filter((a) => verdicts[a.agentId])
  .map((a) => ({ type: 'result', agentId: a.agentId, result: { verdict: verdicts[a.agentId] } }));

const tests = [
  {
    name: 'plan-from-running-script-despite-brackets-in-strings',
    run({ live }) {
      const wf = wfOf([]);
      return eq(live.extractPlan(wf), PLAN.map((p) => p.id), 'plan z skryptu')
        || eq(live.extractTaskRef(wf), 'TS-X-001', 'task z argumentów skryptu')
        || eq(live.extractPlan({ result: { telemetryPlan: [{ id: 'z' }] }, script: '' }), ['z'], 'plan z wyniku, gdy jest');
    },
  },
  {
    name: 'progress-counts-finished-plan-steps-and-marks-running-unit',
    run({ live }) {
      const ag = [agent('core:a-impl', 'done'), agent('core:a-verify', 'done'), agent('core:b-impl', 'running', { toolCalls: 7 })];
      const v = live.buildLiveView({ wf: wfOf(ag), journal: journalOf(ag, { [ag[1].agentId]: 'GO' }), project: 'p', now: NOW });
      const b = v.units.find((u) => u.key === 'core:b');
      return eq([v.plan.done, v.plan.total], [2, 5], 'postęp planu')
        || eq(v.units.map((u) => `${u.key}:${u.state}`), ['core:a:done', 'core:b:running', 'final:pending'], 'stany jednostek')
        || eq([b.current.toolCalls, b.current.label], [7, 'core:b-impl'], 'bieżący agent')
        || eq(v.running.length, 1, 'agenci w toku');
    },
  },
  {
    name: 'no-go-is-fixed-after-later-go-and-open-otherwise',
    run({ live }) {
      const fixed = [agent('core:a-impl', 'done'), agent('core:a-verify', 'done'), agent('core:a-impl', 'done'), agent('core:a-verify', 'done')];
      const vf = live.buildLiveView({ wf: wfOf(fixed), journal: journalOf(fixed, { [fixed[1].agentId]: 'NO_GO', [fixed[3].agentId]: 'GO' }), project: 'p', now: NOW });
      const open = [agent('core:a-impl', 'done'), agent('core:a-verify', 'done'), agent('core:a-impl', 'done'), agent('core:a-verify', 'done')];
      const vo = live.buildLiveView({ wf: wfOf(open), journal: journalOf(open, { [open[1].agentId]: 'NO_GO', [open[3].agentId]: 'NO_GO' }), project: 'p', now: NOW });
      const row = (v) => v.units.find((u) => u.key === 'core:a');
      return eq([row(vf).noGo, row(vf).repair, vf.repairs.fixed], [1, 'fixed', 1], 'naprawione')
        || eq([row(vo).noGo, row(vo).repair, vo.repairs.open], [2, 'open', 1], 'otwarte');
    },
  },
  {
    name: 'extra-steps-fold-into-plan-units',
    run({ live }) {
      const ag = [agent('core:a-impl', 'done'), agent('core:a-verify', 'done'), agent('core:a-final-fix', 'done'),
        agent('core:a-final-fix-checks', 'done'), agent('final-fix-fp-core:a', 'done'), agent('final-gate', 'done')];
      const v = live.buildLiveView({ wf: wfOf(ag), journal: [], project: 'p', now: NOW });
      return eq(v.units.map((u) => u.key), ['core:a', 'core:b', 'final'], 'wiersze = jednostki planu');
    },
  },
  {
    name: 'baseline-window-hosts-and-missing-history',
    run({ live }) {
      const dir = path.join(tmp, 'rollups');
      const put = (day, host, steps, fix, causes) => {
        const f = path.join(dir, 'p', `${day}.${host}.json`);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify({
          processes: { orchestrate: { steps, repairs: { fixSteps: fix }, roles: { verifier: { causes } } }, analyze: { steps: 99, repairs: { fixSteps: 99 }, roles: {} } },
          runs: { orchestrate: { started: 2 } },
        }));
      };
      put('2026-10-16', 'h1', 100, 10, { verifier: 4 });
      put('2026-10-16', 'h2', 100, 30, { verifier: 1, silent: 2 });
      put('2026-08-01', 'h1', 1000, 500, { other: 50 }); // poza oknem
      const b = live.loadBaseline({ project: 'p', now: NOW, days: 30, dir });
      const none = live.loadBaseline({ project: 'brak', now: NOW, days: 30, dir });
      return eq([b.steps, b.fixSteps, b.runs, b.causes], [200, 40, 4, { verifier: 5, silent: 2 }], 'agregat okna')
        || eq(none.steps, 0, 'brak historii')
        || (live.renderLive(live.buildLiveView({ wf: wfOf([]), journal: [], project: 'p', now: NOW }), none).includes('brak historii') ? null : 'render bez historii');
    },
  },
  {
    name: 'cost-is-sum-and-unknown-renders-question-mark',
    run({ live }) {
      const ag = [agent('core:a-impl', 'done'), agent('core:a-verify', 'done')];
      const withCost = live.buildLiveView({ wf: wfOf(ag), journal: [], project: 'p', now: NOW, costOf: () => 1.25 });
      const without = live.buildLiveView({ wf: wfOf(ag), journal: [], project: 'p', now: NOW });
      return eq(withCost.costUsd, 2.5, 'suma kosztu')
        || eq(without.costUsd, null, 'brak ceny')
        || (live.renderLive(without, null).includes('koszt ?') ? null : 'render bez kosztu')
        || (live.renderLive(withCost, null).includes('~$2.50') ? null : 'render z kosztem')
        || (live.renderLive(withCost, null).includes('2/5 kroków planu') ? null : 'render postępu');
    },
  },
  {
    name: 'flow-top-is-documented-and-eval-registered',
    run() {
      const guards = fs.readFileSync(path.join(REPO, 'scripts/pre-commit-guards.mjs'), 'utf8');
      const doc = fs.readFileSync(path.join(REPO, 'docs/TELEMETRY-HOWTO.md'), 'utf8');
      if (!guards.includes('tests/flow-evals/flow-top/run.js')) return 'eval flow-top nie jest w pre-commit-guards';
      return doc.includes('flow-top.mjs') ? null : 'flow-top.mjs nie jest opisany w docs/TELEMETRY-HOWTO.md';
    },
  },
];

(async () => {
  const libs = { live: await import(path.join(REPO, 'scripts/lib/flow-live.mjs')) };
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
