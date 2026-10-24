#!/usr/bin/env node
/**
 * tests/flow-evals/telemetry-gate-blame/run.js — eval L1 dla przypisania naruszeń bramki końcowej do warstw
 * (TASK-OBS-012, ADR 0012 aneks).
 *
 * DLACZEGO: odsetek fałszywych GO stoi na polu `step.blamed` pierwszego kroku bramki. Jeśli przypisanie zrzuca
 * winę na złą warstwę, każdy weryfikator wygląda na gorszy, niż jest; jeśli konwerter dopisuje pole do
 * złego kroku albo skrypt historii nie jest idempotentny, liczby w rollupie rozjadą się po cichu.
 * Wszystko na sztucznych danych w katalogu tymczasowym — prawdziwe zdarzenia nie są dotykane.
 *
 * Kontrakty:
 *   1. naruszenie ze ścieżką pliku warstwy wskazuje tę warstwę; bez ścieżki liczy się jako `unblamed`
 *   2. sama nazwa pliku wskazuje warstwę tylko, gdy jest jednoznaczna w całym wyniku
 *   3. bramka `go` daje pustą listę (mianownik), brak warstw/bramki daje null; runda 1 ma pierwszeństwo
 *   4. konwerter dopisuje pole WYŁĄCZNIE do pierwszego kroku bramki końcowej, a zdarzenia przechodzą schemat
 *   5. kolektor niesie wynik w `runResultFields.gateBlame`
 *   6. skrypt historii: uzupełnia, jest idempotentny, nie rusza innych linii, `--dry-run` niczego nie zapisuje
 *   7. eval zarejestrowany w pre-commit-guards
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-gate-blame-'));
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want) ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);

const layers = [
  { id: 'domain', files: ['src/domain/order.ts', 'src/domain/index.ts'] },
  { id: 'app', files: ['src/app/create-order.ts', 'src/app/index.ts', 'src/shared/util.ts'] },
  { id: 'tests', files: ['test/order.spec.ts'] },
];
const result = (over = {}) => ({
  layers,
  finalGate: { verdict: 'NO_GO', violations: [] },
  ...over,
});

const tests = [
  {
    name: 'violation-with-layer-path-blames-that-layer-others-are-unblamed',
    run({ B }) {
      const got = B.blameFromResult(result({
        finalGate: { verdict: 'NO_GO', violations: [
          'src/domain/order.ts:42 brak inwariantu',
          'W ./test/order.spec.ts brak przypadku brzegowego',
          'docs/README.md nieaktualny opis',
          'luka: nie sprawdzono migracji',
        ] },
      }));
      return eq(got, { units: ['domain', 'tests'], unblamed: 2 }, 'przypisanie');
    },
  },
  {
    name: 'bare-file-name-blames-only-when-unique-in-whole-result',
    run({ B }) {
      const viol = (text) => B.blameFromResult(result({ finalGate: { verdict: 'NO_GO', violations: [text] } }));
      return eq(viol('create-order.ts nie obsługuje null'), { units: ['app'], unblamed: 0 }, 'nazwa jednoznaczna')
        || eq(viol('index.ts eksportuje za dużo'), { units: [], unblamed: 1 }, 'index.ts jest w dwóch warstwach — bez właściciela');
    },
  },
  {
    name: 'go-gate-gives-empty-list-and-missing-input-gives-null',
    run({ B }) {
      return eq(B.blameFromResult(result({ finalGate: { verdict: 'GO' } })), { units: [], unblamed: 0 }, 'bramka go')
        || eq(B.blameFromResult({ finalGate: { verdict: 'NO_GO', violations: ['x.ts'] } }), null, 'bez warstw (ręczny Workflow)')
        || eq(B.blameFromResult(result({ finalGate: undefined })), null, 'bez bramki')
        || eq(B.blameFromResult(null), null, 'bez wyniku');
    },
  },
  {
    name: 'round-one-verdict-takes-precedence-over-final',
    run({ B }) {
      // runda 2 dała GO, ale GO warstwy było fałszywe względem rundy 1 — liczy się runda 1
      const got = B.blameFromResult(result({
        finalGateRound1: { verdict: 'NO_GO', violations: ['src/app/create-order.ts błąd'] },
        finalGate: { verdict: 'GO' },
      }));
      return eq(got, { units: ['app'], unblamed: 0 }, 'runda 1');
    },
  },
  {
    name: 'layer-of-verifier-unit-handles-both-id-forms',
    run({ B }) {
      return eq(['testing:route-tests:verifier', 'domain-verify', 'domain-verify-noop', 'plain'].map(B.layerOfVerifierUnit),
        ['testing:route-tests', 'domain', 'domain', 'plain'], 'warstwa z jednostki');
    },
  },
  {
    name: 'converter-marks-only-first-final-gate-and-events-pass-schema',
    run({ L, E }) {
      const step = (n, label, outcome) => ({ type: 'step', ts: `2026-02-01T10:0${n}:00.000Z`, runId: 'wf_t', agentId: `a${n}`, label, outcome, agentType: 'ver-a', model: 'm', costUsd: 0.1 });
      const steps = [
        step(1, 'domain:x-impl', 'ok'), step(2, 'domain:x-verify', 'GO'),
        step(3, 'final-gate', 'NO-GO'), step(4, 'final-gate-2', 'GO'),
      ];
      const run = { type: 'run', ts: '2026-02-01T10:09:00.000Z', runId: 'wf_t', workflowName: 'orchestrate', status: 'completed', finalVerdict: 'NO_GO', taskRef: 'TS-T-1', gateBlame: { units: ['domain:x'], unblamed: 2 } };
      const events = L.legacyRunToEvents({ steps, run, project: 'demo' });
      const gates = events.filter((e) => e.kind === 'step.end' && e.step.role === 'gate');
      const invalid = events.map((e) => E.validateEvent(E.buildEvent(e))).find((errs) => errs.length);
      return eq(gates.map((g) => g.step.blamed), [['domain:x'], undefined], 'blamed tylko na pierwszej bramce')
        || eq(gates[0].step.unblamed, 2, 'unblamed')
        || eq(invalid, undefined, 'zdarzenia przechodzą schemat')
        || eq(L.legacyRunToEvents({ steps, run: { ...run, gateBlame: null }, project: 'demo' }).some((e) => e.step && 'blamed' in e.step), false, 'brak gateBlame = brak pola');
    },
  },
  {
    name: 'collector-carries-blame-in-run-result-fields',
    run({ C }) {
      const got = C.runResultFields({ result: { taskId: 'TS-T-1', ...result({ finalGate: { verdict: 'NO_GO', violations: ['src/domain/order.ts x'] } }) } });
      return eq(got.gateBlame, { units: ['domain'], unblamed: 0 }, 'gateBlame')
        || eq(C.runResultFields({ result: {} }).gateBlame, null, 'bez wyniku bramki');
    },
  },
  {
    name: 'backfill-patches-first-gate-is-idempotent-and-leaves-other-lines',
    run({ K }) {
      const dir = path.join(tmp, 'events');
      fs.mkdirSync(dir, { recursive: true });
      const ev = (n, o) => ({ v: 1, id: `00000000-0000-4000-8000-00000000000${n}`, ts: `2026-02-01T10:0${n}:00.000Z`, host: 'aaaaaaaaaaaa', kind: 'step.end', process: 'orchestrate', project: 'demo', runId: 'wf_t', ...o });
      const lines = [
        ev(1, { step: { id: 'domain:verifier#1', role: 'verifier' }, outcome: 'go' }),
        ev(2, { step: { id: 'final:final:gate#1', role: 'gate' }, outcome: 'no_go' }),
        ev(3, { step: { id: 'final-gate-r2', role: 'gate' }, outcome: 'go' }),
        ev(4, { runId: 'wf_other', step: { id: 'final:final:gate#1', role: 'gate' }, outcome: 'no_go' }),
      ].map((e) => JSON.stringify(e));
      const file = path.join(dir, '2026-02.jsonl');
      fs.writeFileSync(file, lines.join('\n') + '\n');
      const blameByRun = new Map([['wf_t', { units: ['domain'], unblamed: 1 }]]);

      const dry = K.backfillBlame({ blameByRun, dir, dryRun: true });
      if (fs.readFileSync(file, 'utf8') !== lines.join('\n') + '\n') return '--dry-run zmienił plik';
      const first = K.backfillBlame({ blameByRun, dir });
      const after = fs.readFileSync(file, 'utf8').split('\n');
      const second = K.backfillBlame({ blameByRun, dir });
      const gate = JSON.parse(after[1]);
      return eq([dry.patched, first.patched, second.patched, second.unchanged], [1, 1, 0, 1], 'liczniki: dry, pierwszy, drugi, bez zmian')
        || eq([gate.step.blamed, gate.step.unblamed], [['domain'], 1], 'pierwsza bramka uzupełniona')
        || eq([after[0], after[2], after[3]], [lines[0], lines[2], lines[3]], 'pozostałe linie nietknięte (druga bramka, inny przebieg)')
        || eq(fs.readdirSync(dir), ['2026-02.jsonl'], 'brak plików tymczasowych');
    },
  },
  {
    name: 'eval-is-registered-in-pre-commit-guards',
    run() {
      const guards = fs.readFileSync(path.join(REPO, 'scripts', 'pre-commit-guards.mjs'), 'utf8');
      return guards.includes('tests/flow-evals/telemetry-gate-blame/run.js') ? null : 'eval nie jest w pre-commit-guards';
    },
  },
];

(async () => {
  const libs = {
    B: await import(path.join(REPO, 'scripts/lib/final-gate-blame.mjs')),
    L: await import(path.join(REPO, 'scripts/lib/telemetry-legacy.mjs')),
    E: await import(path.join(REPO, 'scripts/lib/telemetry-events.mjs')),
    C: await import(path.join(REPO, 'scripts/workflow-metrics-collect.mjs')),
    K: await import(path.join(REPO, 'scripts/telemetry-backfill-gate-blame.mjs')),
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
