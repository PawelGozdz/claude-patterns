#!/usr/bin/env node
/**
 * tests/flow-evals/pre-commit-telemetry/run.js — eval L1 dla telemetrii bramek pre-commit (TASK-OBS-010).
 *
 * DLACZEGO: ~35 bramek `scripts/pre-commit-guards.mjs` nie zostawiało śladu poza ekranem commitującego,
 * więc nie dało się odróżnić bramki martwej od zawsze czerwonej z cudzej winy. Telemetria ma dwa sposoby
 * na ciche zepsucie: (a) etykieta dynamiczna („zmienione: a.js, b.js") wyjeżdża jako nazwa kroku i niesie
 * nazwy plików poza maszynę, (b) zapis wolniejszy niż 100 ms/commit albo zmieniający wynik bramek sprawia,
 * że ktoś odpina go przez `--no-verify`. Wszystko w katalogu tymczasowym (CLAUDE_TELEMETRY_DIR).
 *
 * Eval NIE odpala pre-commit-guards.mjs (sam jest jedną z bramek — byłaby rekurencja); sprawdza bibliotekę
 * i, statycznie, podpięcie w skrypcie.
 *
 * Kontrakty:
 *   1. jeden commit = run.start + krok per bramka + run.end, wspólny runId, zdarzenia przechodzą schemat
 *   2. z agregatu da się policzyć odsetek porażek per bramka (process × role)
 *   3. w zdarzeniach i agregacie nie ma ścieżek ani nazw plików; id spoza białej listy → unknown-gate
 *   4. statyczne etykiety dają unikalne, bezpieczne id; wołania z etykietą dynamiczną podają id jawnie
 *   5. best-effort: zepsuty katalog zapisu nie rzuca; zapis jest po zebraniu wyników, przed kodem wyjścia
 *   6. narzut zapisu < 100 ms także przy dużej historii zdarzeń (brak skanu dedupu)
 *   7. eval jest zarejestrowany w pre-commit
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const GUARDS = path.join(REPO, 'scripts', 'pre-commit-guards.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-precommit-'));
let seq = 0;
const freshDir = () => { const d = path.join(tmp, `ev${seq++}`); process.env.CLAUDE_TELEMETRY_DIR = d; return d; };
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);

const readAll = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
      .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  : [];
const gate = (id, ok = true, ms = 20, at = Date.now()) => ({ id, ok, startedAt: at, endedAt: at + ms });

const tests = [
  {
    name: 'one-commit-is-one-run-with-a-step-per-gate',
    run({ pt, ev }) {
      const dir = freshDir();
      const t0 = Date.now();
      const res = pt.emitPrecommitRun({ results: [gate('eval-hooks'), gate('validate-agents', false), gate('lint-patterns-strict')], startedAt: t0 });
      const events = readAll(dir);
      const kinds = events.map((e) => e.kind);
      const invalid = events.flatMap((e) => ev.validateEvent(e));
      return eq(res.written, 5, 'zapisane')
        || eq(kinds, ['run.start', 'step.end', 'step.end', 'step.end', 'run.end'], 'kolejność zdarzeń')
        || eq(new Set(events.map((e) => e.runId)).size, 1, 'jeden runId')
        || eq([...new Set(events.map((e) => e.process))], ['pre-commit'], 'proces')
        || eq(events.filter((e) => e.kind === 'step.end').map((e) => [e.step.role, e.outcome, e.cause || null]),
          [['eval-hooks', 'ok', null], ['validate-agents', 'failed', 'config'], ['lint-patterns-strict', 'ok', null]], 'rola/wynik/przyczyna')
        || eq(events.at(-1).outcome, 'failed', 'run.end po porażce bramki')
        || eq(events.every((e) => e.kind !== 'step.end' || Number.isInteger(e.m.durationMs)), true, 'durationMs w każdym kroku')
        || eq(invalid, [], 'zdarzenia zgodne ze schematem');
    },
  },
  {
    name: 'rollup-yields-failure-rate-per-gate',
    run({ pt, roll }) {
      const dir = freshDir();
      for (const hooksOk of [true, true, false]) {
        pt.emitPrecommitRun({ results: [gate('eval-hooks', hooksOk), gate('validate-skills')], startedAt: Date.now() });
      }
      const [r] = [...roll.buildRollups(readAll(dir)).values()];
      const roles = r.processes['pre-commit'].roles;
      return eq(roles['eval-hooks'].outcomes, { ok: 2, failed: 1 }, 'eval-hooks')
        || eq(roles['validate-skills'].outcomes, { ok: 3 }, 'validate-skills')
        || eq(roles['eval-hooks'].causes, { test: 1 }, 'przyczyna porażki')
        || eq(r.runs['pre-commit'].started, 3, 'liczba commitów')
        || eq(r.runs['pre-commit'].ended, { ok: 2, failed: 1 }, 'wyniki commitów');
    },
  },
  {
    name: 'no-file-names-in-events-or-rollup',
    run({ pt, roll }) {
      const dir = freshDir();
      // Id z nazwami plików (etykieta dynamiczna przekazana bez jawnego id) nie może wyjechać.
      pt.emitPrecommitRun({
        results: [gate('zmienione: scripts/a.js, b.mjs'), gate('audit-projects --gate (zmienione: blocks/x.yml)'), gate('eval-hooks')],
        startedAt: Date.now(),
      });
      const events = readAll(dir);
      const roles = events.filter((e) => e.kind === 'step.end').map((e) => e.step.role);
      const blob = JSON.stringify([events.map(({ id, ts, host, ...rest }) => rest), [...roll.buildRollups(events).values()]]);
      return eq(roles, ['unknown-gate', 'unknown-gate', 'eval-hooks'], 'id spoza białej listy')
        || eq(/\.(m?js|ya?ml|md|json)\b|\/|zmienione/.test(blob), false, 'ścieżki/nazwy plików w danych');
    },
  },
  {
    name: 'static-labels-give-unique-safe-ids-and-dynamic-labels-pass-explicit-id',
    run({ pt }) {
      const src = fs.readFileSync(GUARDS, 'utf8');
      const staticLabels = [...src.matchAll(/runCheck\('([^']+)'/g)].map((m) => m[1]);
      const ids = staticLabels.map(pt.gateId);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      const unsafe = ids.filter((id) => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) || id === 'unknown-gate');
      // Wołanie z etykietą w backtickach (dynamiczną) MUSI mieć czwarty argument — jawne id.
      const dynamic = [...src.matchAll(/runCheck\(`[^`]*`,\s*'node',\s*\[[^\]]*\](,\s*'[a-z0-9-]+')?\)/g)];
      return eq(staticLabels.length >= 30, true, `znaleziono statyczne bramki (${staticLabels.length})`)
        || eq(dup, [], 'kolizje id (dwie bramki w jednym kubełku)')
        || eq(unsafe, [], 'id niebezpieczne')
        || eq(dynamic.length >= 2, true, `wołania z etykietą dynamiczną (${dynamic.length})`)
        || eq(dynamic.filter((m) => !m[1]).length, 0, 'dynamiczna etykieta bez jawnego id');
    },
  },
  {
    name: 'best-effort-never-throws-and-runs-after-results-before-exit',
    run({ pt }) {
      // Katalog zapisu pod zwykłym plikiem → mkdir/append musi zawieść, a funkcja nie rzucić.
      const blocker = path.join(tmp, 'blocker');
      fs.writeFileSync(blocker, 'x');
      process.env.CLAUDE_TELEMETRY_DIR = path.join(blocker, 'sub');
      let threw = null;
      let res;
      try { res = pt.emitPrecommitRun({ results: [gate('eval-hooks')], startedAt: Date.now() }); } catch (e) { threw = e.message; }
      let threwOnGarbage = null;
      try { pt.emitPrecommitRun({ results: null, startedAt: 'zle' }); } catch (e) { threwOnGarbage = e.message; }
      const src = fs.readFileSync(GUARDS, 'utf8');
      const emitAt = src.indexOf('emitPrecommitRun({');
      const failedAt = src.indexOf('const failed = results.filter');
      const lastCheckAt = src.lastIndexOf('runCheck(');
      return eq(threw, null, 'rzuca przy zepsutym katalogu')
        || eq(Boolean(res && res.error), true, 'błąd zwrócony w polu error')
        || eq(threwOnGarbage, null, 'rzuca na śmieciowym wejściu')
        || eq(emitAt > lastCheckAt && emitAt < failedAt, true, 'zapis po ostatniej bramce, przed wyliczeniem wyniku')
        || eq(/process\.exit\([^)]*telemetry/.test(src), false, 'kod wyjścia nie zależy od telemetrii');
    },
  },
  {
    name: 'write-overhead-is-under-100ms-even-with-a-large-history',
    run({ pt }) {
      const dir = freshDir();
      fs.mkdirSync(dir, { recursive: true });
      // Historia, którą skan dedupu musiałby przeczytać (~30 tys. linii ≈ 5 MB).
      const line = JSON.stringify({ v: 1, id: '00000000-0000-0000-0000-000000000000', ts: '2026-10-01T00:00:00.000Z', kind: 'step.end', process: 'orchestrate', project: 'demo', host: 'aaaaaaaaaaaa', runId: 'wf_x', step: { id: 's', role: 'verifier' }, outcome: 'ok' });
      fs.writeFileSync(path.join(dir, '2026-10.jsonl'), (line + '\n').repeat(30000));
      const results = Array.from({ length: 36 }, (_, i) => gate(`gate-${i}`, i !== 7));
      const times = [];
      for (let i = 0; i < 5; i++) {
        const t = process.hrtime.bigint();
        pt.emitPrecommitRun({ results, startedAt: Date.now() });
        times.push(Number(process.hrtime.bigint() - t) / 1e6);
      }
      times.sort((a, b) => a - b);
      const median = times[2];
      return eq(median < 100, true, `mediana zapisu ${median.toFixed(1)} ms (limit 100)`);
    },
  },
  {
    name: 'eval-is-registered-in-pre-commit',
    run() {
      const src = fs.readFileSync(GUARDS, 'utf8');
      return src.includes('tests/flow-evals/pre-commit-telemetry/run.js') ? null : 'eval nie jest w pre-commit-guards';
    },
  },
];

(async () => {
  const libs = {
    pt: await import(path.join(REPO, 'scripts/lib/precommit-telemetry.mjs')),
    ev: await import(path.join(REPO, 'scripts/lib/telemetry-events.mjs')),
    roll: await import(path.join(REPO, 'scripts/lib/telemetry-rollup.mjs')),
  };
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
