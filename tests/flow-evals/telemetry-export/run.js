#!/usr/bin/env node
/**
 * tests/flow-evals/telemetry-export/run.js — eval L1 dla paczki agregatów na serwer (TASK-OBS-008).
 *
 * DLACZEGO: serwer zespołu ma dostać same liczniki. Gwarancję trzyma biała lista, ale psuje się cicho:
 * ktoś doda do rollupu pole z treścią (ścieżka, id zadania, sygnatura odstępstwa z fragmentem zgłoszenia)
 * i wyjedzie ono razem z resztą, jeśli eksport kopiuje „wszystko, co jest". Ten eval pilnuje, że
 * nieznane i wrażliwe rzeczy nie przechodzą, a ponowna wysyłka niczego nie dubluje.
 * Wszystko na sztucznych danych w katalogu tymczasowym.
 *
 * Kontrakty:
 *   1. pola spoza białej listy (taskRef, runId, nowe klucze) nie trafiają do paczki
 *   2. dynamiczne klucze ze ścieżką/spacją/wielkimi literami są odrzucane i zgłaszane w `dropped`
 *   3. odstępstwa wychodzą jako liczniki (cause, trigger) — bez sygnatur
 *   4. id jest stabilne (projekt|dzień|host); contentHash zmienia się z treścią, id nie
 *   5. ten sam wejściowy zestaw → bajt w bajt ta sama paczka; --since i host filtrują
 *   6. findLeaks łapie ścieżkę i id zadania w kluczu oraz wartości; czysta paczka przechodzi
 *   7. CLI: exit 0 dla prawdziwych rollupów, zły --since = exit 1; eval zarejestrowany w pre-commit
 *   9. process `review-panel` (aneks TASK-GSTACK-ADOPT-001): liczniki per reviewer (n, findings) wychodzą przez białą listę, pola spoza niej nie;
 *      paczka przechodzi skan wycieków
 *   8. blok `tasks` wychodzi tylko jako rozkłady (TASK-OBS-012); liczniki werdyktów przechodzą przez białą listę,
 *      agent z niebezpiecznym kluczem odpada; findLeaks łapie formaty `BOT-005a`, `TS-SIM-002A`, `DS009-…`
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-export-'));
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);

const rollup = (over = {}) => ({
  _generated: 'GENERATED', v: 1, project: 'proj-a', day: '2026-10-16', host: 'h1', events: 10, stepsTotal: 8,
  processes: {
    orchestrate: {
      steps: 8, costUsd: 1.5, died: 0, retried: 1, costUsdRetried: 0.2, stepsWithoutCost: 0,
      repairs: { fixSteps: 2, fixed: 1, open: 1 }, verification: { units: 3, firstPassGo: 2 },
      roles: { verifier: { n: 3, costUsd: 0.5, toolCalls: 12, durationMs: { n: 3, p50: 100, p90: 200 }, outcomes: { go: 2, no_go: 1 }, causes: { verifier: 1 } } },
    },
  },
  runs: { orchestrate: { started: 1, costUsd: 1.5, durationMs: { n: 1, p50: 9, p90: 9 }, ended: { ok: 1 } } },
  engines: { abc1234: { orchestrate: { started: 1, steps: 8, costUsd: 1.5, died: 0, stepsWithoutCost: 0, ended: { ok: 1 } } } },
  deviations: {
    'DEV-agent_note-karta-logger-zaklada-token': { cause: 'config', trigger: 'agent_note', n: 2 },
    'DEV-other': { cause: 'config', trigger: 'agent_note', n: 1 },
  },
  ...over,
});
const put = (dir, r, name) => {
  const f = path.join(dir, r.project, name || `${r.day}.${r.host}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(r));
};

const tests = [
  {
    name: 'unknown-and-sensitive-fields-do-not-leave',
    run({ ex }) {
      const base = rollup();
      const rec = ex.projectRollup(rollup({
        taskRef: 'TS-SECRET-001', runId: 'wf_x', notes: 'tajne',
        processes: { orchestrate: { ...base.processes.orchestrate, taskRef: 'TS-SECRET-001', cwd: '/opt/projects/x' } },
      }));
      const s = JSON.stringify(rec);
      return ['TS-SECRET', 'wf_x', 'tajne', '/opt/projects', '_generated'].map((t) => (s.includes(t) ? `wyciekło: ${t}` : null)).find(Boolean) || null;
    },
  },
  {
    name: 'unsafe-dynamic-keys-are-dropped-and-reported',
    run({ ex }) {
      const ctx = { dropped: [] };
      const r = rollup();
      r.processes.orchestrate.roles['Zła Rola/ścieżka'] = r.processes.orchestrate.roles.verifier;
      r.processes.orchestrate.roles.verifier.outcomes['/opt/x'] = 1;
      const rec = ex.projectRollup(r, ctx);
      return eq(Object.keys(rec.processes.orchestrate.roles), ['verifier'], 'role w paczce')
        || eq(Object.keys(rec.processes.orchestrate.roles.verifier.outcomes), ['go', 'no_go'], 'klucze outcomes')
        || eq(ctx.dropped.length, 2, 'zgłoszone odrzucenia');
    },
  },
  {
    name: 'deviations-leave-as-counters-without-signatures',
    run({ ex }) {
      const rec = ex.projectRollup(rollup());
      return eq(rec.deviations, [{ cause: 'config', trigger: 'agent_note', n: 3 }], 'odstępstwa zsumowane per (cause, trigger)');
    },
  },
  {
    name: 'tasks-block-leaves-only-distributions',
    run({ ex }) {
      // runs 1/2/3/5 → histogram 1,1,1,4plus; koszt do GO policzony tylko dla tasków z GO: [1, 3, 10] → p50 3, p90 10
      const tasks = {
        'TS-AAA-001': { runs: 1, reachedGo: true, costToGoUsd: 1, costUsd: 1, spanMs: 100 },
        'TS-BBB-002': { runs: 2, reachedGo: true, costToGoUsd: 3, costUsd: 4, spanMs: 200 },
        'TS-CCC-003': { runs: 5, reachedGo: false, costToGoUsd: null, costUsd: 99, spanMs: 300 },
        'BOT-005a': { runs: 3, reachedGo: true, costToGoUsd: 10, costUsd: 12, spanMs: 400 },
      };
      const rec = ex.projectRollup(rollup({ tasks }));
      const text = JSON.stringify(rec);
      const leaked = ['TS-AAA', 'TS-BBB', 'TS-CCC', 'BOT-005a', 'spanMs', '"costUsd":99'].find((t) => text.includes(t));
      return (leaked ? `wyciekło: ${leaked}` : null)
        || eq(rec.tasks, { n: 4, reachedGo: 3, costToGoUsd: { n: 3, p50: 3, p90: 10 }, runs: { 1: 1, 2: 1, 3: 1, '4plus': 1 } }, 'rozkłady tasków')
        || eq(ex.findLeaks(rec), [], 'paczka z rozkładami jest czysta')
        || eq('tasks' in ex.projectRollup(rollup()), false, 'rollup bez tasks nie dostaje bloku');
    },
  },
  {
    name: 'verdict-counters-pass-by-whitelist-and-unsafe-agent-keys-drop',
    run({ ex }) {
      const r = rollup();
      const v = { goJudged: 5, falseGo: 1, noGoJudged: 2, falseNoGo: 1, path: '/opt/x' };
      r.processes.orchestrate.roles.verifier.verdicts = v;
      r.processes.orchestrate.roles.verifier.agents = { 'ver-a': { ...v }, 'Zły Agent/ścieżka': { ...v } };
      r.processes.orchestrate.finalGate = { judged: 2, noGo: 1, noGoAttributed: 1, blamedUnits: 2, unattributed: 1, blamedUnmatched: 1, cwd: '/opt/x' };
      const ctx = { dropped: [] };
      const rec = ex.projectRollup(r, ctx);
      const role = rec.processes.orchestrate.roles.verifier;
      return eq(role.verdicts, { goJudged: 5, falseGo: 1, noGoJudged: 2, falseNoGo: 1 }, 'liczniki werdyktów bez cudzych pól')
        || eq(Object.keys(role.agents), ['ver-a'], 'agenci w paczce')
        || eq(ctx.dropped.length, 1, 'odrzucony agent zgłoszony')
        || eq(rec.processes.orchestrate.finalGate, { judged: 2, noGo: 1, noGoAttributed: 1, blamedUnits: 2, unattributed: 1, blamedUnmatched: 1 }, 'bramka')
        || eq('verdicts' in ex.projectRollup(rollup()).processes.orchestrate.roles.verifier, false, 'stary rollup nie dostaje pustego bloku');
    },
  },
  {
    name: 'review-panel-counters-pass-whitelist',
    run({ ex }) {
      const r = rollup();
      r.processes['review-panel'] = {
        steps: 4, costUsd: 0, died: 0, stepsWithoutCost: 0, repairs: { fixSteps: 0, fixed: 0, open: 0 }, verification: { units: 0, firstPassGo: 0 },
        roles: {
          eagle: { n: 2, costUsd: 0, toolCalls: 0, outcomes: { ok: 2 }, causes: {}, findings: 5, text: 'treść findingu', durationMs: { n: 0, p50: null, p90: null } },
          'Zły Reviewer/ścieżka': { n: 1, outcomes: { skipped: 1 } },
        },
      };
      const ctx = { dropped: [] };
      const rec = ex.projectRollup(r, ctx);
      const eagle = rec.processes['review-panel'].roles.eagle;
      return eq(eagle.findings, 5, 'findings w paczce')
        || eq(eagle.n, 2, 'n w paczce')
        || eq('text' in eagle, false, 'pole spoza białej listy wyjechało')
        || eq(Object.keys(rec.processes['review-panel'].roles), ['eagle'], 'rola z niebezpiecznym kluczem odpada')
        || eq(ctx.dropped.length, 1, 'odrzucona rola zgłoszona')
        || eq(ex.findLeaks(rec), [], 'skan wycieków na bloku review-panel')
        || eq('findings' in ex.projectRollup(rollup()).processes.orchestrate.roles.verifier, false, 'stary rollup nie dostaje findings');
    },
  },
  {
    name: 'id-is-stable-and-content-hash-follows-content',
    run({ ex }) {
      const a = ex.projectRollup(rollup());
      const b = ex.projectRollup(rollup());
      const c = ex.projectRollup(rollup({ stepsTotal: 9 }));
      const other = ex.projectRollup(rollup({ host: 'h2' }));
      return eq(a, b, 'ten sam rollup')
        || eq([a.id === c.id, a.contentHash === c.contentHash], [true, false], 'zmiana treści: id stałe, hash inny')
        || eq(a.id === other.id, false, 'inny host = inne id');
    },
  },
  {
    name: 'batch-is-deterministic-and-filters-by-since-and-host',
    run({ ex }) {
      const dir = path.join(tmp, 'r1');
      put(dir, rollup({ day: '2026-10-10' }));
      put(dir, rollup({ day: '2026-10-16' }));
      put(dir, rollup({ day: '2026-10-16', host: 'h2' }));
      put(dir, rollup({ project: 'proj-b', day: '2026-10-16' }));
      fs.writeFileSync(path.join(dir, 'proj-a', 'zepsuty.json'), '{nie json');
      const a = ex.buildBatch({ dir });
      const b = ex.buildBatch({ dir });
      return eq(JSON.stringify(a.batch) === JSON.stringify(b.batch), true, 'determinizm')
        || eq(a.batch.rollups.length, 4, 'wszystkie poprawne pliki')
        || eq(a.dropped.length, 1, 'uszkodzony plik zgłoszony')
        || eq(ex.buildBatch({ dir, since: '2026-10-12' }).batch.rollups.length, 3, 'od dnia')
        || eq(ex.buildBatch({ dir, host: 'h2' }).batch.rollups.length, 1, 'filtr hosta')
        || eq(a.leaks, [], 'czysta paczka bez wycieków');
    },
  },
  {
    name: 'leak-scan-catches-paths-and-task-ids-in-keys-and-values',
    run({ ex }) {
      const bad = (v) => ex.findLeaks({ a: v }).length > 0;
      return eq([bad({ '/opt/x': 1 }), bad({ k: 'a b' }), bad({ k: 'TS-FOO-123' }), bad({ 'TASK-OBS-008': 1 }), bad({ k: 'C:\\x' })], [true, true, true, true, true], 'wykryte')
        // formaty z danych (TASK-OBS-012): litera po numerze, prefiks z cyframi
        || eq([bad({ 'BOT-005a': 1 }), bad({ 'TS-SIM-002A': 1 }), bad({ 'FP-005b': 1 }), bad({ 'DS009-PUBLIKACJA-WIRING': 1 }), bad({ k: 'TS-AIG-081a' })], [true, true, true, true, true], 'nowe formaty id')
        || eq([bad({ verifier: 1, go: 2 }), bad({ cause: 'config', day: '2026-10-16' }), bad({ h: '5a164d2d0145' })], [false, false, false], 'nie krzyczy na poprawne')
        || eq([bad({ '4plus': 1, 'ver-a': 2 }), bad({ kind: 'rollup-batch' }), bad({ id: '0c5e1f2a-9b7d-4a31-8e6f-2d4b6a8c0e1f' })], [false, false, false], 'nie krzyczy na histogram, agentów i uuid');
    },
  },
  {
    name: 'cli-passes-on-real-rollups-rejects-bad-since-and-eval-is-registered',
    run() {
      const cli = path.join(REPO, 'scripts/telemetry-export.mjs');
      const real = spawnSync('node', [cli, '--check'], { encoding: 'utf8' });
      const bad = spawnSync('node', [cli, '--since', 'wczoraj'], { encoding: 'utf8' });
      const guards = fs.readFileSync(path.join(REPO, 'scripts/pre-commit-guards.mjs'), 'utf8');
      return eq(real.status, 0, `exit CLI na prawdziwych rollupach (${(real.stderr || '').slice(0, 120)})`)
        || eq(bad.status, 1, 'zły --since = exit 1')
        || (guards.includes('tests/flow-evals/telemetry-export/run.js') ? null : 'eval nie jest w pre-commit-guards');
    },
  },
];

(async () => {
  const libs = { ex: await import(path.join(REPO, 'scripts/lib/telemetry-export.mjs')) };
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
