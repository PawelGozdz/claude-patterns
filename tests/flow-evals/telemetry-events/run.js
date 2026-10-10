#!/usr/bin/env node
/**
 * tests/flow-evals/telemetry-events/run.js — eval L1 dla zdarzeń telemetrii v1 (ADR 0012).
 *
 * DLACZEGO (2026-10-10): skrzynka `_inbox` zna tylko problemy, więc nie da się z niej
 * policzyć, jaki odsetek pracy to błędy. Zdarzenia v1 są mianownikiem — i docelowo
 * kontraktem wysyłki na serwer, więc ich format i prywatność muszą być pilnowane testem,
 * a nie dobrą wolą wołających.
 *
 * Wszystko w katalogu tymczasowym (CLAUDE_TELEMETRY_DIR): prawdziwe dane nie są dotykane.
 * Kontrakty:
 *   1. historyczne wyniki (NO-GO i NO_GO, silent-death, …) normalizują się do listy v1
 *   2. poprawne zdarzenie trafia do <dir>/<RRRR-MM>.jsonl z id (UUID) i host (pseudonim)
 *   3. pole spoza schematu (np. `reason`, `prompt`) jest odrzucane — prywatność u źródła
 *   4. CLI: run-start zwraca runId i zapisuje plan; nieznany outcome = exit 1
 *   5. report-deviation zapisuje `deviation` bez treści powodu
 *   6. konwersja starych rekordów: rola/runda/`fixes` z etykiety, proces kanoniczny vs ręczny,
 *      wynik przebiegu z werdyktu bramki końcowej, zapis idempotentny
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const LIB = path.join(REPO, 'scripts', 'lib', 'telemetry-events.mjs');
const CLI = path.join(REPO, 'scripts', 'telemetry-emit.mjs');
const REPORT = path.join(REPO, 'scripts', 'report-deviation.mjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-telemetry-'));
process.env.CLAUDE_TELEMETRY_DIR = dir;

const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_DIR: dir },
});
const allEvents = (t) => t.readEvents(t.eventsFileFor(new Date().toISOString()));

const tests = [
  {
    name: 'legacy-outcomes-normalize-to-v1',
    run(t) {
      // Wszystkie wartości obecne w workflow-steps.jsonl na 2026-10-10 + statusy przebiegów.
      const expected = {
        'NO-GO': 'no_go', NO_GO: 'no_go', GO: 'go', GO_WITH_CONDITIONS: 'go', ok: 'ok',
        'silent-death': 'died', cached: 'cached', 'not-started': 'skipped',
        completed: 'ok', killed: 'killed', failed: 'failed',
      };
      for (const [raw, want] of Object.entries(expected)) {
        const got = t.normalizeOutcome(raw);
        if (got !== want) return `${raw} → ${got}, oczekiwano ${want}`;
        if (!t.OUTCOMES.includes(got)) return `${got} spoza schematu`;
      }
      if (t.normalizeOutcome('banana') !== 'unknown') return 'nieznana wartość nie daje unknown';
      return null;
    },
  },
  {
    name: 'valid-event-appended-with-id-and-host',
    run(t) {
      const res = t.appendEvent({
        kind: 'step.end', process: 'orchestrate', project: 'demo', runId: 'wf_test-1',
        step: { id: 'engine:impl#1', group: 'engine', role: 'implementer', attempt: 1 },
        outcome: 'go', m: { toolCalls: 7, durationMs: 1200, costUsd: 0.12 },
      });
      if (!res.ok) return 'odrzucone: ' + res.error;
      const evs = allEvents(t);
      const ev = evs[evs.length - 1];
      if (!/^[0-9a-f-]{36}$/.test(ev.id)) return 'brak UUID';
      if (!/^[0-9a-f]{12}$/.test(ev.host)) return 'brak pseudonimu hosta';
      if (ev.host.includes(os.hostname())) return 'host zdradza nazwę maszyny';
      if (t.validateEvent(ev).length) return 'zapisane zdarzenie niezgodne ze schematem';
      return null;
    },
  },
  {
    name: 'fields-outside-schema-rejected',
    run(t) {
      for (const extra of [{ reason: 'skan 10.0.0.5 nie przeszedł' }, { prompt: 'x' }]) {
        const res = t.appendEvent({ kind: 'deviation', process: 'analyze', project: 'demo', runId: 'r1', ...extra });
        if (res.ok) return `pole ${Object.keys(extra)[0]} przeszło do zdarzenia`;
      }
      const bad = t.appendEvent({ kind: 'step.end', process: 'orchestrate', project: 'demo', runId: 'r1', outcome: 'NO-GO' });
      if (bad.ok) return 'nieznormalizowany outcome przeszedł walidację';
      return null;
    },
  },
  {
    name: 'cli-run-start-plan-and-usage-errors',
    run(t) {
      const start = cli('run-start', '--process', 'analyze', '--project', '/opt/projects/demo',
        '--task', 'TS-005', '--plan', 'research:panel:architect,questions:panel:analyst');
      if (start.status !== 0) return 'run-start exit ' + start.status + ': ' + start.stderr;
      const runId = start.stdout.trim();
      if (!/^analyze-/.test(runId)) return 'run-start nie wypisał runId: ' + runId;
      const ev = allEvents(t).find((e) => e.runId === runId && e.kind === 'run.start');
      if (!ev) return 'brak zdarzenia run.start';
      if (ev.project !== 'demo') return 'project nie jest nazwą katalogu: ' + ev.project;
      if (!ev.plan || ev.plan.length !== 2 || ev.plan[0].role !== 'architect') return 'plan niezapisany';

      const step = cli('step', '--process', 'analyze', '--project', 'demo', '--run-id', runId,
        '--step-id', 'research', '--outcome', 'NO_GO', '--cause', 'verifier', '--tool-calls', '4');
      if (step.status !== 0) return 'step exit ' + step.status + ': ' + step.stderr;
      const st = allEvents(t).find((e) => e.runId === runId && e.kind === 'step.end');
      if (!st || st.outcome !== 'no_go' || st.m.toolCalls !== 4) return 'step źle zapisany';

      if (cli('step', '--process', 'analyze', '--project', 'demo', '--run-id', runId,
        '--step-id', 'x', '--outcome', 'banana').status !== 1) return 'nieznany outcome nie dał exit 1';
      if (cli('run-end', '--process', 'nope', '--project', 'demo', '--run-id', runId,
        '--outcome', 'ok').status !== 1) return 'proces spoza listy nie dał exit 1';
      return null;
    },
  },
  {
    name: 'legacy-canonical-run-roles-rounds-and-fix-link',
    run(t, L) {
      // Kształt etykiet kanonicznego skryptu z 2026-10: <warstwa>:<jednostka>-<rola>[-<runda>].
      const at = (s) => `2026-10-01T10:00:${String(s).padStart(2, '0')}.000Z`;
      const step = (agentId, label, outcome, s) => ({ type: 'step', runId: 'wf_canon-1', agentId, label, outcome,
        ts: at(s), workflowName: 'orchestrate', agentType: 'x-implementer', model: 'claude-sonnet-5', attempt: 1,
        toolCalls: 3, durationMs: 1000.4, inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, costUsd: 0.1 });
      const steps = [
        step('a1', 'domain:rules-impl', 'ok', 1), step('a2', 'domain:rules-diff-gate-1', 'ok', 2),
        step('a3', 'domain:rules-checks-1', 'ok', 3), step('a4', 'domain:rules-verify', 'NO-GO', 4),
        step('a5', 'domain:rules-impl', 'ok', 5), step('a6', 'domain:rules-diff-gate-2', 'ok', 6),
        step('a7', 'domain:rules-verify', 'GO', 7), step('a8', 'final-gate', 'silent-death', 8),
      ];
      const run = { type: 'run', runId: 'wf_canon-1', workflowName: 'orchestrate', ts: at(0), status: 'completed',
        escalatedAt: 'final-gate', totalToolCalls: 24, durationMs: 9000, costUsd: 0.8 };
      const evs = L.legacyRunToEvents({ steps, run, project: 'demo' });
      const bad = evs.map((f) => t.validateEvent(t.buildEvent(f))).find((e) => e.length);
      if (bad) return 'zdarzenie niezgodne ze schematem: ' + bad.join('; ');
      if (evs[0].kind !== 'run.start' || evs[evs.length - 1].kind !== 'run.end') return 'brak run.start/run.end';
      if (evs[evs.length - 1].outcome !== 'halted') return 'przebieg z escalatedAt nie jest halted';
      const byAgent = Object.fromEntries(evs.filter((e) => e.kind === 'step.end').map((e, i) => [steps[i].agentId, e]));
      const v1 = byAgent.a4; const fix = byAgent.a5; const v2 = byAgent.a7;
      if (v1.step.role !== 'verifier' || v1.outcome !== 'no_go' || v1.cause !== 'verifier') return 'werdykt NO-GO źle sklasyfikowany: ' + JSON.stringify(v1.step);
      if (fix.step.role !== 'implementer' || fix.step.attempt !== 2) return 'druga runda impl bez attempt=2';
      if (fix.step.fixes !== v1.step.id) return `naprawa nie wskazuje werdyktu: ${fix.step.fixes} ≠ ${v1.step.id}`;
      if (byAgent.a6.step.role !== 'probe' || byAgent.a6.step.attempt !== 2) return 'sonda rundy 2 źle sparsowana';
      if (v2.step.id === v1.step.id) return 'dwa werdykty mają to samo step.id';
      if (byAgent.a8.step.role !== 'gate' || byAgent.a8.outcome !== 'died' || byAgent.a8.cause !== 'silent') return 'cichy zgon bramki źle sklasyfikowany';
      if (byAgent.a1.m.durationMs !== 1000) return 'durationMs nie jest liczbą całkowitą';
      return null;
    },
  },
  {
    name: 'legacy-adhoc-workflow-process-taskref-and-zero-round',
    run(t, L) {
      const steps = [{ type: 'step', runId: 'wf_adhoc-1', agentId: 'b1', label: 'fix-typecheck-0', outcome: 'ok',
        ts: '2026-09-01T10:00:00.000Z', workflowName: 'ts-sec-097-domain' }];
      const evs = L.legacyRunToEvents({ steps, run: null, project: 'demo' });
      const st = evs.find((e) => e.kind === 'step.end');
      if (evs[0].process !== 'workflow') return 'ręczny skrypt nie jest procesem workflow';
      if (evs[0].taskRef !== 'TS-SEC-097') return 'taskRef z nazwy: ' + evs[0].taskRef;
      if (st.step.role !== 'fixer' || st.step.attempt !== 1) return 'runda -0 / rola fixer: ' + JSON.stringify(st.step);
      if (t.validateEvent(t.buildEvent(st)).length) return 'zdarzenie niezgodne ze schematem';
      if (L.taskRefFromWorkflowName('orchestrate') !== null) return 'kanoniczna nazwa dała taskRef';
      return null;
    },
  },
  {
    name: 'canonical-run-outcome-follows-final-gate-verdict',
    run(t, L) {
      // Kanoniczny skrypt zawsze kończy się `completed` — bez werdyktu bramki 420/420 przebiegów
      // wyglądało na udane (2026-10-10).
      const step = { type: 'step', runId: 'wf_fg-1', agentId: 'd1', label: 'final-gate', outcome: 'GO',
        ts: '2026-10-02T10:00:00.000Z', workflowName: 'orchestrate' };
      const run = (extra) => ({ type: 'run', runId: 'wf_fg-1', workflowName: 'orchestrate',
        ts: '2026-10-02T09:00:00.000Z', status: 'completed', escalatedAt: null, ...extra });
      const end = (r, steps = [step]) => L.legacyRunToEvents({ steps, run: r, project: 'demo' }).pop();
      if (end(run({ finalVerdict: 'NO_GO', taskRef: 'TS-005' })).outcome !== 'no_go') return 'NO_GO bramki nie dał run.end no_go';
      if (end(run({ finalVerdict: 'NO_GO', taskRef: 'TS-005' })).taskRef !== 'TS-005') return 'taskRef z result.taskId pominięty';
      if (end(run({ finalVerdict: 'GO' })).outcome !== 'ok') return 'GO bramki nie dał ok';
      if (end(run({}), [{ ...step, outcome: 'NO_GO' }]).outcome !== 'no_go') return 'bez finalVerdict nie użyto kroku bramki';
      if (end(run({ status: 'killed' })).outcome !== 'killed') return 'killed nadpisany werdyktem';
      return null;
    },
  },
  {
    name: 'dedup-append-is-idempotent',
    run(t, L) {
      const steps = [{ type: 'step', runId: 'wf_dedup-1', agentId: 'c1', label: 'web:x-impl', outcome: 'ok',
        ts: '2026-08-15T10:00:00.000Z', workflowName: 'orchestrate' }];
      const evs = L.legacyRunToEvents({ steps, run: null, project: 'demo' });
      const first = t.appendEventsDedup(evs);
      const again = t.appendEventsDedup(L.legacyRunToEvents({ steps, run: null, project: 'demo' }));
      if (first.written !== evs.length) return 'pierwszy zapis: ' + JSON.stringify(first);
      if (again.written !== 0 || again.skipped !== evs.length) return 'powtórka zdublowała: ' + JSON.stringify(again);
      if (!fs.existsSync(path.join(dir, '2026-08.jsonl'))) return 'zdarzenie nie trafiło do pliku swojego miesiąca';
      return null;
    },
  },
  {
    name: 'report-deviation-emits-event-without-reason',
    run() {
      // Statycznie: report-deviation pisze do prawdziwej skrzynki repo, więc nie odpalamy go
      // w evalu — sprawdzamy, że emituje zdarzenie i że NIE przekazuje do niego powodu.
      const src = fs.readFileSync(REPORT, 'utf8');
      const fn = src.match(/function emitDeviationEvent[\s\S]*?\n}\n/);
      if (!fn) return 'brak emitDeviationEvent';
      if (/reason/.test(fn[0].replace(/\/\/.*$/gm, ''))) return 'zdarzenie deviation niesie treść powodu';
      if (!/emitDeviationEvent\(args, id\)/.test(src)) return 'main nie emituje zdarzenia';
      if (!/return id;\n\s*}\n/.test(src)) return 'gałąź --once-per-project nie zwraca id (zdarzenie by przepadło)';
      return null;
    },
  },
];

(async () => {
  const t = await import(LIB);
  const L = await import(path.join(REPO, 'scripts', 'lib', 'telemetry-legacy.mjs'));
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = test.run(t, L); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
