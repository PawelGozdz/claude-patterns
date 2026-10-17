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
        || eq([bad({ verifier: 1, go: 2 }), bad({ cause: 'config', day: '2026-10-16' }), bad({ h: '5a164d2d0145' })], [false, false, false], 'nie krzyczy na poprawne');
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
