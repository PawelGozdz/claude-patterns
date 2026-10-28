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
 *   7. process `review-panel` (aneks TASK-GSTACK-ADOPT-001): poprawne zdarzenia przechodzą, a złamanie którejkolwiek
 *      reguły (findings przy ok obowiązkowe, przy skipped zabronione, outcome tylko ok|skipped, step.findings tylko
 *      w review-panel, nazwa reviewera, pole spoza schematu) jest odrzucane; dotychczasowe procesy bez zmian
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
    name: 'legacy-run-start-carries-plan-and-engine',
    run(t, L) {
      const step = { type: 'step', runId: 'wf_plan-1', agentId: 'p1', label: 'domain:x-impl', outcome: 'ok', ts: '2026-10-10T10:00:01.000Z', workflowName: 'orchestrate' };
      const plan = [{ id: 'domain:implementer', group: 'domain', role: 'implementer' }, { id: 'final:gate', group: 'final', role: 'gate' }];
      const run = { type: 'run', runId: 'wf_plan-1', workflowName: 'orchestrate', ts: '2026-10-10T10:05:00.000Z', status: 'completed', plan, engine: '1a99827' };
      const start = L.legacyRunToEvents({ steps: [step], run, project: 'demo' })[0];
      const bad = t.validateEvent(t.buildEvent(start));
      if (bad.length) return 'run.start niezgodny ze schematem: ' + bad.join('; ');
      if (start.engine !== '1a99827' || JSON.stringify(start.plan) !== JSON.stringify(plan)) return 'run.start bez planu/engine: ' + JSON.stringify(start);
      const old = L.legacyRunToEvents({ steps: [step], run: { ...run, plan: null, engine: null }, project: 'demo' })[0];
      if ('plan' in old || 'engine' in old) return 'stary rekord bez planu dostał puste pola: ' + JSON.stringify(old);
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
      if (!/emitDeviationEvent\(args, record\)/.test(src)) return 'main nie emituje zdarzenia';
      if (!/bez nowego wystąpienia`\);\n\s*return \{ id, category/.test(src)) return 'gałąź --once-per-project nie zwraca rekordu (zdarzenie by przepadło)';
      if (!/cause: CAUSES\.includes\(category\)/.test(fn[0])) return 'zdarzenie deviation bez kategorii (cause)';
      return null;
    },
  },
  {
    name: 'inbox-category-shares-cause-vocabulary',
    run(t) {
      // Podział „jakie błędy" ma być jeden dla skrzynki i metryk — kategoria ze skrzynki
      // musi być wartością `cause` ze schematu.
      for (const trig of ['halt', 'blocked_by_prior', 'no_go', 'workflow_lint', 'agent_note', 'analyze_gate', 'analyze_note', 'setup_drift', 'nowy_trigger']) {
        const c = t.defaultCategory(trig);
        if (!t.CAUSES.includes(c)) return `${trig} → ${c} spoza listy cause`;
      }
      if (t.defaultCategory('setup_drift') !== 'config' || t.defaultCategory('no_go') !== 'verifier') return 'mapowanie triggerów zmienione';
      const src = fs.readFileSync(REPORT, 'utf8');
      if (!/category: args\.category \|\| defaultCategory\(args\.trigger, args\.rule\)/.test(src)) return 'nowy rekord skrzynki bez pola category';
      if (!/fm\.category = fm\.category \|\|/.test(src)) return 'istniejąca kategoria (np. z triage) bywa nadpisywana';
      return null;
    },
  },
  {
    name: 'cause-has-pattern-card-and-plan',
    run(t) {
      // ADR 0015 D5: dwie przyczyny, które dotąd lądowały w `other`.
      for (const c of ['pattern_card', 'plan']) {
        if (!t.CAUSES.includes(c)) return `cause bez ${c}`;
        const errs = t.validateEvent(t.buildEvent({
          kind: 'deviation', process: 'orchestrate', project: 'p', runId: 'r-1', cause: c,
        }));
        if (errs.length) return `zdarzenie z cause=${c} odrzucone: ${errs.join('; ')}`;
      }
      return null;
    },
  },
  {
    name: 'analyze-rules-map-to-plan-and-pattern-card',
    run(t) {
      const want = [
        ['analyze_note', 'ANZ-LAYER-MISMATCH', 'plan'],
        ['analyze_note', 'ANZ-PATTERN-MISMATCH', 'pattern_card'],
        ['analyze_gate', 'ANZ-LAYER-MISMATCH', 'plan'],
        ['analyze_gate', 'ANZ-AGENT-MISSING', 'config'], // reguła nie o warstwach — zostaje domyślna triggera
        ['analyze_note', null, 'other'],
        ['halt', 'ANZ-LAYER-MISMATCH', 'other'], // ANZ-* liczy się tylko dla triggerów analizy
        ['agent_note', 'ANZ-PATTERN-MISMATCH', 'other'],
      ];
      for (const [trig, rule, exp] of want) {
        const got = t.defaultCategory(trig, rule);
        if (got !== exp) return `defaultCategory(${trig}, ${rule}) = ${got}, oczekiwano ${exp}`;
      }
      if (t.defaultCategory('analyze_gate') !== 'config') return 'wywołanie z jednym argumentem zmieniło wynik';
      return null;
    },
  },
  {
    name: 'agent-note-without-category-is-usage-error',
    run() {
      // Odmowa następuje przed zapisem, więc prawdziwa skrzynka nie jest dotykana.
      const base = ['--project', 'eval-agent-note', '--trigger', 'agent_note', '--reason', 'eval: notatka bez kategorii'];
      const run = (extra) => spawnSync(process.execPath, [REPORT, ...base, ...extra], {
        encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_DIR: dir },
      });
      const bare = run([]);
      if (bare.status !== 1) return `agent_note bez --category: exit ${bare.status}, oczekiwano 1`;
      if (!/wymaga --category/.test(bare.stderr) || !/pattern_card/.test(bare.stderr)) return `komunikat bez listy kategorii: ${bare.stderr.trim()}`;
      const bad = run(['--category', 'nie_ma_takiej']);
      if (bad.status !== 1) return `nieznana kategoria: exit ${bad.status}, oczekiwano 1`;
      const src = fs.readFileSync(REPORT, 'utf8');
      if (!/args\.trigger === 'agent_note' && !args\.category/.test(src)) return 'brak sprawdzenia agent_note w main';
      return null;
    },
  },
  {
    name: 'review-panel-valid-events-pass-and-old-processes-kept',
    run(t) {
      for (const old of ['orchestrate', 'workflow', 'analyze', 'audit', 'setup', 'blog-seed', 'pre-commit', 'hook']) {
        if (!t.PROCESSES.includes(old)) return `schemat stracił process ${old} (zmiana ma być addytywna)`;
      }
      if (!t.PROCESSES.includes('review-panel')) return 'schemat nie zna process review-panel';
      const base = { kind: 'step.end', process: 'review-panel', project: 'demo', runId: 'rp-test-1' };
      const good = [
        { ...base, step: { id: 'eagle', role: 'eagle', findings: 3 }, outcome: 'ok' },
        { ...base, step: { id: 'nitpicker', role: 'nitpicker', findings: 0 }, outcome: 'ok' },
        { ...base, step: { id: 'newbie', role: 'newbie' }, outcome: 'skipped' },
      ];
      for (const g of good) {
        const errs = t.validateEvent(t.buildEvent(g));
        if (errs.length) return `poprawne zdarzenie odrzucone: ${errs.join('; ')} ${JSON.stringify(g)}`;
      }
      // zdarzenia innych procesów (bez step.findings) walidują się jak dotąd
      const orch = t.validateEvent(t.buildEvent({ kind: 'step.end', process: 'orchestrate', project: 'demo', runId: 'wf_1', step: { id: 'a:impl', role: 'implementer', blamed: ['a'], unblamed: 0 }, outcome: 'go' }));
      if (orch.length) return `orchestrate step.end przestał przechodzić: ${orch.join('; ')}`;
      return null;
    },
  },
  {
    name: 'review-panel-malformed-events-rejected',
    run(t) {
      const base = { kind: 'step.end', process: 'review-panel', project: 'demo', runId: 'rp-test-1' };
      const okStep = { id: 'eagle', role: 'eagle', findings: 1 };
      const bad = {
        'ok bez findings': { ...base, step: { id: 'eagle', role: 'eagle' }, outcome: 'ok' },
        'skipped z findings': { ...base, step: { id: 'eagle', role: 'eagle', findings: 0 }, outcome: 'skipped' },
        'outcome go': { ...base, step: okStep, outcome: 'go' },
        'outcome failed': { ...base, step: okStep, outcome: 'failed' },
        'brak outcome': { ...base, step: okStep },
        'brak step': { ...base, outcome: 'skipped' },
        'kind run.end': { ...base, kind: 'run.end', step: okStep, outcome: 'ok' },
        'findings ujemne': { ...base, step: { ...okStep, findings: -1 }, outcome: 'ok' },
        'findings ułamek': { ...base, step: { ...okStep, findings: 0.5 }, outcome: 'ok' },
        'findings napis': { ...base, step: { ...okStep, findings: '3' }, outcome: 'ok' },
        'findings null': { ...base, step: { ...okStep, findings: null }, outcome: 'ok' },
        'nazwa z wielkiej litery': { ...base, step: { id: 'Eagle', role: 'Eagle', findings: 1 }, outcome: 'ok' },
        'nazwa ze ścieżką': { ...base, step: { id: 'a/b', role: 'a/b', findings: 1 }, outcome: 'ok' },
        'brak role': { ...base, step: { id: 'eagle', findings: 1 }, outcome: 'ok' },
        'pole spoza schematu (branch)': { ...base, branch: 'feature/x', step: okStep, outcome: 'ok' },
        'pole spoza schematu w step': { ...base, step: { ...okStep, text: 'finding' }, outcome: 'ok' },
        'step.id ≠ step.role': { ...base, step: { id: 'eagle', role: 'newbie', findings: 1 }, outcome: 'ok' },
        'm.costUsd': { ...base, step: okStep, outcome: 'ok', m: { costUsd: 0.1 } },
        'cause': { ...base, step: okStep, outcome: 'ok', cause: 'other' },
        'cause null': { ...base, step: okStep, outcome: 'ok', cause: null },
        'taskRef': { ...base, step: okStep, outcome: 'ok', taskRef: 'TS-001' },
        'step.fixes': { ...base, step: { ...okStep, fixes: 'x' }, outcome: 'ok' },
        'step.attempt': { ...base, step: { ...okStep, attempt: 2 }, outcome: 'ok' },
        'step.agent': { ...base, step: { ...okStep, agent: 'reviewer-eagle' }, outcome: 'ok' },
        'findings w orchestrate': { kind: 'step.end', process: 'orchestrate', project: 'demo', runId: 'wf_1', step: { id: 'a', role: 'implementer', findings: 2 }, outcome: 'ok' },
        'findings w hook': { kind: 'step.end', process: 'hook', project: 'demo', runId: 'hook-1', step: { id: 'x', role: 'x', findings: 0 }, outcome: 'halted' },
      };
      for (const [name, fields] of Object.entries(bad)) {
        const errs = t.validateEvent(t.buildEvent(fields));
        if (!errs.length) return `zdarzenie „${name}" przeszło walidację`;
      }
      return null;
    },
  },
  {
    name: 'review-panel-emit-helper-writes-and-never-throws',
    run(t) {
      const res = t.emitReviewPanelRun({ project: 'demo-rp', entries: [
        { reviewer: 'eagle', outcome: 'ran', findings: 2 }, { reviewer: 'newbie', outcome: 'skipped' }] });
      if (res.error || res.written !== 2 || res.rejected.length) return 'zapis: ' + JSON.stringify(res);
      const evs = allEvents(t).filter((e) => e.runId === res.runId);
      if (evs.length !== 2 || !evs.every((e) => t.validateEvent(e).length === 0)) return 'zapisane zdarzenia niezgodne ze schematem';
      if (evs[0].step.findings !== 2 || evs[0].outcome !== 'ok' || evs[1].outcome !== 'skipped' || 'findings' in evs[1].step) return 'ran/skipped źle odwzorowane';
      for (const entries of [
        [{ reviewer: 'Zły', outcome: 'ran', findings: 1 }], [{ reviewer: 'eagle', outcome: 'ran' }],
        [{ reviewer: 'eagle', outcome: 'ran', findings: -1 }], [{ reviewer: 'eagle', outcome: 'maybe' }],
      ]) {
        const r = t.emitReviewPanelRun({ project: 'demo-rp', entries });
        if (!r.error || r.written !== 0) return `złe wejście ${JSON.stringify(entries)} nie dało błędu bez rzucania: ${JSON.stringify(r)}`;
      }
      // deterministyczne id (migracja) + dedup = idempotencja
      const entry = { reviewer: 'ops', outcome: 'ran', findings: 0, id: t.deterministicId('rp-test|ops') };
      const first = t.emitReviewPanelRun({ project: 'demo-rp', ts: '2026-08-01T00:00:00.000Z', runId: 'rpm-test', entries: [entry] }, { dedup: true });
      const again = t.emitReviewPanelRun({ project: 'demo-rp', ts: '2026-08-01T00:00:00.000Z', runId: 'rpm-test', entries: [entry] }, { dedup: true });
      if (first.written !== 1 || again.written !== 0 || again.skipped !== 1) return 'powtórny zapis z tym samym id zdublował: ' + JSON.stringify([first, again]);
      return null;
    },
  },
  {
    name: 'project-name-cannot-be-dot-or-dotdot',
    run(t) {
      // Nazwa projektu trafia do ścieżki rollupu: „.” i „..” wyprowadziłyby plik poza katalog.
      const mk = (project) => t.validateEvent(t.buildEvent({ kind: 'step.end', process: 'orchestrate', project, runId: 'r1', outcome: 'ok', step: { id: 'a' } }));
      for (const bad of ['.', '..']) if (!mk(bad).length) return `project "${bad}" przeszedł walidację`;
      for (const good of ['_claude-patterns', 'a.b', '.hidden', '...', 'aegis-flow', 'x..y']) {
        const e = mk(good);
        if (e.length) return `project "${good}" odrzucony: ${e.join('; ')}`;
      }
      const agg = fs.readFileSync(path.join(REPO, 'scripts', 'telemetry-aggregate.mjs'), 'utf8');
      if (!/SAFE_NAME = \/\^\(\?!\\\.\{1,2\}\$\)/.test(agg)) return 'telemetry-aggregate nie odrzuca „.” i „..” w nazwie projektu';
      return null;
    },
  },
  {
    name: 'validator-supports-conditionals',
    run(t) {
      // Konstrukcje dodane do minimalnego walidatora: allOf, if/then/else, not, required bez properties.
      const schema = {
        type: 'object',
        allOf: [
          { if: { required: ['a'], properties: { a: { const: 1 } } }, then: { required: ['b'] }, else: { not: { required: ['b'] } } },
        ],
      };
      const v = (x) => t.validateWith(schema, x).length === 0;
      if (!v({ a: 1, b: 2 })) return 'if prawdziwe, then spełnione — odrzucone';
      if (v({ a: 1 })) return 'if prawdziwe, then niespełnione — przyjęte';
      if (!v({ a: 2 })) return 'if fałszywe, else spełnione — odrzucone';
      if (v({ a: 2, b: 1 })) return 'if fałszywe, else (not required) niespełnione — przyjęte';
      const eqSchema = { type: 'object', 'x-equalProperties': ['id', 'role'] };
      if (t.validateWith(eqSchema, { id: 'a', role: 'a' }).length || t.validateWith(eqSchema, { id: 'a' }).length) return 'x-equalProperties odrzuca poprawne';
      if (!t.validateWith(eqSchema, { id: 'a', role: 'b' }).length) return 'x-equalProperties przepuszcza różne wartości';
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
