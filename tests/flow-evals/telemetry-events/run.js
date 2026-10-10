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
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = test.run(t); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
