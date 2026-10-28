#!/usr/bin/env node
/**
 * tests/flow-evals/telemetry-rollups/run.js — eval L1 dla agregatów dziennych telemetrii i indeksu
 * skrzynki (ADR 0012 krok 5; TASK-OBS-005).
 *
 * DLACZEGO: dashboard i serwer czytają agregaty zamiast surowych zdarzeń, więc liczby w nich muszą
 * zgadzać się z ręcznym przeliczeniem, a plik w gicie nie może zawierać niczego z prywatnych pól.
 * Zdarzenia są sztuczne (projekt `demo`), z wynikami policzonymi ręcznie w komentarzach —
 * prawdziwe dane nie są dotykane (CLAUDE_TELEMETRY_DIR / CLAUDE_TELEMETRY_ROLLUPS_DIR → tmp).
 *
 * Kontrakty:
 *   1. liczniki per proces × rola × outcome zgadzają się z ręcznym przeliczeniem
 *   2. first-pass: pierwszy werdykt jednostki, a nie rundy naprawcze; przebieg przez północ nie dubluje
 *   3. skuteczność napraw: kolejny werdykt jednostki `go` = naprawiona, inaczej otwarta
 *   4. percentyle nearest-rank; koszt kroków bez `costUsd` jest liczony osobno
 *   5. host rozdziela pliki (percentyle nie sumują się między maszynami)
 *   6. w agregacie nie ma taskRef, runId ani ścieżek
 *   7. CLI: idempotentny, nazwa pliku <projekt>/<dzień>.<host>.json, --check wykrywa rozjazd
 *   8. indeks skrzynki: domyślna kategoria z triggera, brak `sources` = orchestrate, uszkodzony
 *      nagłówek pominięty, ręczna edycja wykrywana przez --check
 *   9. pre-commit-guards ma oba wpisy
 *  10. fałszywe GO / NO_GO per rola i agent (TASK-OBS-012): przebieg bez przypisania nie wchodzi do liczników,
 *      workflow nie dostaje werdyktów (brak `fixes`)
 *  12. process `review-panel` (aneks TASK-GSTACK-ADOPT-001): liczy się per reviewer (ok/skipped + findings), nie ma kosztu ani przebiegów,
 *      a blok orchestrate w tym samym dniu i projekcie jest identyczny jak bez zdarzeń panelu (nic nie fałszuje metryk)
 *  11. blok `tasks`: dwa przebiegi przez północ → jeden wpis w dniu ostatniego run.end; id taska tylko jako klucz tego bloku
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const LIB = path.join(REPO, 'scripts', 'lib', 'telemetry-rollup.mjs');
const AGG = path.join(REPO, 'scripts', 'telemetry-aggregate.mjs');
const IDX = path.join(REPO, 'scripts', 'generate-inbox-index.mjs');
const REPORT = path.join(REPO, 'scripts', 'report-deviation.mjs');
const GUARDS = path.join(REPO, 'scripts', 'pre-commit-guards.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-rollups-'));
const HOST_A = 'aaaaaaaaaaaa';
const HOST_B = 'bbbbbbbbbbbb';
const RUN = 'wf_secret-run-1';

const ev = (o) => ({ v: 1, id: crypto.randomUUID(), host: HOST_A, project: 'demo', runId: RUN, taskRef: 'TS-SECRET-1', ...o });
const step = (ts, id, role, outcome, extra = {}) => ev({
  kind: 'step.end', process: 'orchestrate', ts, outcome,
  step: { id, role, ...(extra.step || {}) }, ...(extra.top || {}), ...(extra.m ? { m: extra.m } : {}),
});

// Dzień 2026-01-02, host A. Ręczne przeliczenie:
//   jednostki weryfikacji: domain (no_go → naprawa → go), app (go), infra (no_go → naprawa → no_go),
//   late (no_go 23:59 → go po północy)
//   pierwsze werdykty: domain no_go, app go, infra no_go, late no_go → units 4, firstPassGo 1
//   werdykty 1. dnia: go 2 (domain#2, app), no_go 4 (domain#1, infra#1, infra#2, late#1)
//   naprawy: domain (fixed), infra (open) → fixSteps 2, fixed 1, open 1
//   implementer: 5 kroków z czasem 1000/2000/3000/4000/10000 → p50 3000, p90 10000, jeden zgon
//   zdarzeń hosta A w dniu: 1 run.start + 11 kroków + 1 run.end + 2 deviation + 3 workflow = 18
const D1 = '2026-01-02';
const events = [
  ev({ kind: 'run.start', process: 'orchestrate', ts: `${D1}T10:00:00.000Z` }),
  step(`${D1}T10:01:00.000Z`, 'domain:verifier#1', 'verifier', 'no_go', { top: { cause: 'verifier' }, m: { costUsd: 0.5, durationMs: 100, toolCalls: 3 } }),
  step(`${D1}T10:02:00.000Z`, 'domain:implementer#2', 'implementer', 'ok', { step: { attempt: 2, fixes: 'domain:verifier#1' }, m: { costUsd: 1, durationMs: 1000 } }),
  step(`${D1}T10:03:00.000Z`, 'domain:verifier#2', 'verifier', 'go', { step: { attempt: 2 }, m: { costUsd: 0.25, durationMs: 100 } }),
  step(`${D1}T10:04:00.000Z`, 'app:verifier#1', 'verifier', 'go', { m: { costUsd: 0.25, durationMs: 100 } }),
  step(`${D1}T10:05:00.000Z`, 'infra:verifier#1', 'verifier', 'no_go', { top: { cause: 'test' }, m: { costUsd: 0.5, durationMs: 100 } }),
  step(`${D1}T10:06:00.000Z`, 'infra:implementer#2', 'implementer', 'ok', { step: { attempt: 2, fixes: 'infra:verifier#1' }, m: { costUsd: 2, durationMs: 2000 } }),
  step(`${D1}T10:07:00.000Z`, 'infra:verifier#2', 'verifier', 'no_go', { step: { attempt: 2 }, top: { cause: 'test' }, m: { costUsd: 0.5, durationMs: 100 } }),
  step(`${D1}T10:08:00.000Z`, 'engine:implementer#1', 'implementer', 'died', { top: { cause: 'silent' }, m: { durationMs: 3000 } }),
  step(`${D1}T10:09:00.000Z`, 'a:implementer#1', 'implementer', 'ok', { m: { costUsd: 1, durationMs: 4000 } }),
  step(`${D1}T10:10:00.000Z`, 'b:implementer#1', 'implementer', 'ok', { m: { costUsd: 1, durationMs: 10000 } }),
  step(`${D1}T23:59:59.000Z`, 'late:verifier#1', 'verifier', 'no_go', { m: { costUsd: 0.1 } }),
  step('2026-01-03T00:00:05.000Z', 'late:verifier#2', 'verifier', 'go', { step: { attempt: 2 }, m: { costUsd: 0.1 } }),
  ev({ kind: 'run.end', process: 'orchestrate', ts: `${D1}T10:30:00.000Z`, outcome: 'no_go', m: { durationMs: 1800000, costUsd: 6.2 } }),
  ev({ kind: 'deviation', process: 'orchestrate', ts: `${D1}T10:31:00.000Z`, signature: 'DEV-x', trigger: 'no_go', cause: 'verifier' }),
  ev({ kind: 'deviation', process: 'orchestrate', ts: `${D1}T10:32:00.000Z`, signature: 'DEV-x', trigger: 'no_go', cause: 'verifier' }),
  // workflow: inny schemat id rundy (`.2`) i krok bez roli
  ev({ kind: 'step.end', process: 'workflow', ts: `${D1}T11:00:00.000Z`, outcome: 'no_go', step: { id: 'verify:core', role: 'verifier' } }),
  ev({ kind: 'step.end', process: 'workflow', ts: `${D1}T11:01:00.000Z`, outcome: 'go', step: { id: 'verify:core.2', role: 'verifier' } }),
  ev({ kind: 'step.end', process: 'workflow', ts: `${D1}T11:02:00.000Z`, outcome: 'ok', step: { id: 'misc' } }),
  // inna maszyna: osobny plik
  ev({ host: HOST_B, kind: 'step.end', process: 'orchestrate', ts: `${D1}T12:00:00.000Z`, outcome: 'go', step: { id: 'app:verifier#1', role: 'verifier' } }),
];

// Poprawność werdyktów (TASK-OBS-012), dzień DV, host A, projekt demo. Ręczne przeliczenie:
//   RUN_V: alpha go, beta go, gamma no_go → naprawa → go, delta no_go → go BEZ naprawy; pierwsza bramka
//          no_go wskazuje beta i ghost (ghost nie ma werdyktu), 1 naruszenie bez właściciela
//   RUN_G: eps go, bramka go z pustym blamed (mianownik)
//   RUN_N: zeta go, bramka no_go BEZ pola blamed (przebieg bez przypisania nie wchodzi do liczników)
//   goJudged: alpha, beta, gamma(#2), delta(#2), eps = 5; falseGo: beta = 1
//   noGoJudged: gamma#1, delta#1 = 2; falseNoGo: delta = 1 (gamma miała krok z `fixes`)
//   ver-a: go alpha, gamma(#2), eps → goJudged 3; no_go gamma#1 → noGoJudged 1
//   ver-b: go beta, delta(#2) → goJudged 2, falseGo 1; no_go delta#1 → noGoJudged 1, falseNoGo 1
//   bramka: judged 2 (V i G), noGo 1, noGoAttributed 1, blamedUnits 2, unattributed 1, blamedUnmatched 1
const DV = '2026-02-10';
const RUN_V = 'wf_v-run';
const RUN_G = 'wf_g-run';
const RUN_N = 'wf_n-run';
const vstep = (runId, hhmm, id, role, outcome, step = {}) => ev({
  runId, kind: 'step.end', process: 'orchestrate', ts: `${DV}T${hhmm}:00.000Z`, outcome,
  step: { id, role, ...step },
});
const verdictEvents = [
  ev({ runId: RUN_V, kind: 'run.start', process: 'orchestrate', ts: `${DV}T10:00:00.000Z` }),
  vstep(RUN_V, '10:01', 'alpha:verifier#1', 'verifier', 'go', { agent: 'ver-a' }),
  vstep(RUN_V, '10:02', 'beta:verifier#1', 'verifier', 'go', { agent: 'ver-b' }),
  vstep(RUN_V, '10:03', 'gamma:verifier#1', 'verifier', 'no_go', { agent: 'ver-a' }),
  vstep(RUN_V, '10:04', 'gamma:implementer#2', 'implementer', 'ok', { attempt: 2, fixes: 'gamma:verifier#1' }),
  vstep(RUN_V, '10:05', 'gamma:verifier#2', 'verifier', 'go', { agent: 'ver-a', attempt: 2 }),
  vstep(RUN_V, '10:06', 'delta:verifier#1', 'verifier', 'no_go', { agent: 'ver-b' }),
  vstep(RUN_V, '10:07', 'delta:verifier#2', 'verifier', 'go', { agent: 'ver-b', attempt: 2 }),
  vstep(RUN_V, '10:08', 'final:final:gate#1', 'gate', 'no_go', { blamed: ['beta', 'ghost'], unblamed: 1 }),
  ev({ runId: RUN_V, kind: 'run.end', process: 'orchestrate', ts: `${DV}T10:09:00.000Z`, outcome: 'no_go' }),
  vstep(RUN_G, '11:01', 'eps:verifier#1', 'verifier', 'go', { agent: 'ver-a' }),
  vstep(RUN_G, '11:02', 'final:final:gate#1', 'gate', 'go', { blamed: [], unblamed: 0 }),
  vstep(RUN_N, '12:01', 'zeta:verifier#1', 'verifier', 'go', { agent: 'ver-a' }),
  vstep(RUN_N, '12:02', 'final:final:gate#1', 'gate', 'no_go'),
];

// Task na dwa przebiegi przez północ (TASK-OBS-012), projekt proj-t, host A. Ręczne przeliczenie TS-TWO-1:
//   analyze 02-12 22:00–22:20 (krok 0.5) → orchestrate O1 02-12 23:00–23:50 (kroki 1, 0.5, bramka no_go 0.25)
//   → orchestrate O2 02-13 00:10–00:40 (krok 2, bramka go 0.25, krok PO bramce 9)
//   runs 2, analyzeRuns 1, costUsd 13.5, costToGoUsd 4.5 (bez kroku po bramce), spanMs 22:00 → 00:40 = 9 600 000
//   blok ląduje w dniu ostatniego run.end (02-13), nie w 02-12
// TS-ONE-1: jeden przebieg bez bramki go → reachedGo false, costToGoUsd null, blok w dniu 02-12
const tev = (o) => ev({ project: 'proj-t', taskRef: 'TS-TWO-1', ...o });
const tstep = (runId, process, ts, id, role, outcome, costUsd, taskRef = 'TS-TWO-1') =>
  tev({ taskRef, runId, kind: 'step.end', process, ts, outcome, step: { id, role }, m: { costUsd } });
const taskEvents = [
  tev({ runId: 'wf_a1', kind: 'run.start', process: 'analyze', ts: '2026-02-12T22:00:00.000Z' }),
  tstep('wf_a1', 'analyze', '2026-02-12T22:05:00.000Z', 'security:panel', 'panel', 'ok', 0.5),
  tev({ runId: 'wf_a1', kind: 'run.end', process: 'analyze', ts: '2026-02-12T22:20:00.000Z', outcome: 'halted' }),
  tev({ runId: 'wf_o1', kind: 'run.start', process: 'orchestrate', ts: '2026-02-12T23:00:00.000Z' }),
  tstep('wf_o1', 'orchestrate', '2026-02-12T23:05:00.000Z', 'a:implementer#1', 'implementer', 'ok', 1),
  tstep('wf_o1', 'orchestrate', '2026-02-12T23:10:00.000Z', 'a:verifier#1', 'verifier', 'go', 0.5),
  tstep('wf_o1', 'orchestrate', '2026-02-12T23:20:00.000Z', 'final:final:gate#1', 'gate', 'no_go', 0.25),
  tev({ runId: 'wf_o1', kind: 'run.end', process: 'orchestrate', ts: '2026-02-12T23:50:00.000Z', outcome: 'no_go' }),
  tev({ runId: 'wf_o2', kind: 'run.start', process: 'orchestrate', ts: '2026-02-13T00:10:00.000Z' }),
  tstep('wf_o2', 'orchestrate', '2026-02-13T00:15:00.000Z', 'a:implementer#2', 'implementer', 'ok', 2),
  tstep('wf_o2', 'orchestrate', '2026-02-13T00:30:00.000Z', 'final:final:gate#1', 'gate', 'go', 0.25),
  tstep('wf_o2', 'orchestrate', '2026-02-13T00:35:00.000Z', 'doc:fixer', 'fixer', 'ok', 9),
  tev({ runId: 'wf_o2', kind: 'run.end', process: 'orchestrate', ts: '2026-02-13T00:40:00.000Z', outcome: 'ok' }),
  tev({ taskRef: 'TS-ONE-1', runId: 'wf_x1', kind: 'run.start', process: 'orchestrate', ts: '2026-02-12T09:00:00.000Z' }),
  tstep('wf_x1', 'orchestrate', '2026-02-12T09:05:00.000Z', 'a:implementer#1', 'implementer', 'ok', 1, 'TS-ONE-1'),
  tev({ taskRef: 'TS-ONE-1', runId: 'wf_x1', kind: 'run.end', process: 'orchestrate', ts: '2026-02-12T09:30:00.000Z', outcome: 'no_go' }),
];
events.push(...verdictEvents, ...taskEvents);

const rollupOf = (r, host = HOST_A, day = D1) => r.get(`demo|${day}|${host}`);
// Kolejność kluczy w pamięci zależy od kolejności zdarzeń (sortuje dopiero serializacja) — porównujemy bez niej.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const eq = (got, want, what) => (canon(got) === canon(want) ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);

const tests = [
  {
    name: 'counts-match-hand-calculation',
    run(T, r) {
      const d = rollupOf(r);
      const o = d.processes.orchestrate;
      return eq(o.roles.verifier.outcomes, { go: 2, no_go: 4 }, 'werdykty 1. dnia')
        || eq(o.roles.implementer.outcomes, { died: 1, ok: 4 }, 'implementer')
        || eq(o.roles.verifier.causes, { test: 2, verifier: 1 }, 'cause weryfikatora')
        || eq(o.died, 1, 'zgony')
        || eq(d.runs.orchestrate.ended, { no_go: 1 }, 'run.end')
        || eq(d.runs.orchestrate.started, 1, 'run.start')
        || eq(d.deviations['DEV-x'].n, 2, 'gęstość odstępstw')
        || eq(d.processes.workflow.roles.none.n, 1, 'krok bez roli');
    },
  },
  {
    name: 'first-pass-counts-first-verdict-only',
    run(T, r) {
      return eq(rollupOf(r).processes.orchestrate.verification, { units: 4, firstPassGo: 1 }, 'orchestrate')
        || eq(rollupOf(r).processes.workflow.verification, { units: 1, firstPassGo: 0 }, 'workflow (verify:core → verify:core.2)');
    },
  },
  {
    name: 'midnight-run-does-not-double-count-units',
    run(T, r) {
      // druga runda `late` zapadła po północy — nie jest „pierwszym werdyktem” jednostki
      return eq(rollupOf(r, HOST_A, '2026-01-03').processes.orchestrate.verification, { units: 0, firstPassGo: 0 }, 'dzień po północy');
    },
  },
  {
    name: 'repairs-fixed-vs-open',
    run(T, r) {
      return eq(rollupOf(r).processes.orchestrate.repairs, { fixSteps: 2, fixed: 1, open: 1 }, 'naprawy');
    },
  },
  {
    name: 'repair-share-and-cost-gaps',
    run(T, r) {
      const o = rollupOf(r).processes.orchestrate;
      // attempt > 1: domain impl#2 (1) + domain verifier#2 (0.25) + infra impl#2 (2) + infra verifier#2 (0.5) = 3.75
      return eq(o.retried, 4, 'kroki z attempt>1')
        || eq(o.costUsdRetried, 3.75, 'koszt napraw')
        || eq(o.stepsWithoutCost, 1, 'krok bez costUsd (died)')
        || eq(o.costUsd, 7.1, 'koszt łączny w dniu');
    },
  },
  {
    name: 'percentiles-nearest-rank',
    run(T, r) {
      // 1000,2000,3000,4000,10000 → p50 = 3. element, p90 = 5. element
      return eq(rollupOf(r).processes.orchestrate.roles.implementer.durationMs, { n: 5, p50: 3000, p90: 10000 }, 'czas implementera');
    },
  },
  {
    name: 'hosts-get-separate-rollups',
    run(T, r) {
      const b = rollupOf(r, HOST_B);
      if (!b) return 'brak agregatu drugiej maszyny';
      return eq(b.processes.orchestrate.verification, { units: 1, firstPassGo: 1 }, 'host B')
        || eq(rollupOf(r).events, 18, 'host A nie bierze zdarzeń hosta B');
    },
  },
  {
    name: 'no-private-fields-in-serialized-rollup',
    run(T, r) {
      const text = [...r.values()].map((x) => T.serializeRollup(x)).join('\n');
      for (const bad of ['taskRef', 'runId', RUN, '/home/', '/opt/', 'domain:verifier', 'verify:core']) {
        if (text.includes(bad)) return `agregat zawiera "${bad}"`;
      }
      // id taska wolno mieć wyłącznie jako klucz bloku `tasks` (ADR 0015 D3), nigdzie indziej
      for (const x of r.values()) {
        const { tasks, ...rest } = x;
        if (T.serializeRollup(rest).includes('TS-SECRET-1')) return 'id taska poza blokiem tasks';
      }
      return null;
    },
  },
  {
    name: 'verdict-correctness-false-go-and-false-no-go',
    run(T, r) {
      const o = rollupOf(r, HOST_A, DV).processes.orchestrate;
      const agents = o.roles.verifier.agents;
      return eq(o.roles.verifier.verdicts, { goJudged: 5, falseGo: 1, noGoJudged: 2, falseNoGo: 1 }, 'werdykty roli')
        || eq(agents['ver-a'], { goJudged: 3, noGoJudged: 1 }, 'ver-a')
        || eq(agents['ver-b'], { goJudged: 2, falseGo: 1, noGoJudged: 1, falseNoGo: 1 }, 'ver-b')
        || eq(o.finalGate, { judged: 2, noGo: 1, noGoAttributed: 1, blamedUnits: 2, unattributed: 1, blamedUnmatched: 1 }, 'bramka');
    },
  },
  {
    name: 'run-without-blame-field-is-not-counted',
    run(T, r) {
      // RUN_N ma werdykt go zeta i bramkę no_go bez `blamed` — ani licznik, ani mianownik go nie widzą
      const total = rollupOf(r, HOST_A, DV).processes.orchestrate.roles.verifier.verdicts.goJudged;
      return eq(total, 5, 'goJudged bez przebiegu bez przypisania');
    },
  },
  {
    name: 'false-no-go-counts-only-orchestrate-without-fix-step',
    run(T, r) {
      // D1: domain (naprawa), infra (no_go → no_go), late (no_go → go BEZ naprawy, po północy) → 3 rozstrzygalne, 1 fałszywy
      return eq(rollupOf(r).processes.orchestrate.roles.verifier.verdicts, { noGoJudged: 3, falseNoGo: 1 }, 'D1')
        || eq(rollupOf(r).processes.workflow.roles.verifier.verdicts, undefined, 'workflow nie dostaje werdyktów');
    },
  },
  {
    name: 'task-block-two-runs-across-midnight-lands-on-last-run-end-day',
    run(T, r) {
      const two = r.get('proj-t|2026-02-13|' + HOST_A);
      const want = { runs: 2, analyzeRuns: 1, costUsd: 13.5, stepsWithoutCost: 0, reachedGo: true, costToGoUsd: 4.5, spanMs: 9600000 };
      return eq(two && two.tasks && two.tasks['TS-TWO-1'], want, 'TS-TWO-1')
        || eq(r.get('proj-t|2026-02-12|' + HOST_A).tasks['TS-TWO-1'], undefined, 'task nie liczy się do dnia pierwszego przebiegu')
        || eq(r.get('proj-t|2026-02-12|' + HOST_A).tasks['TS-ONE-1'],
          { runs: 1, analyzeRuns: 0, costUsd: 1, stepsWithoutCost: 0, reachedGo: false, costToGoUsd: null, spanMs: 1800000 }, 'task bez GO');
    },
  },
  {
    name: 'serialization-is-order-independent',
    run(T, r) {
      const a = T.serializeRollup(rollupOf(r));
      const b = T.serializeRollup(rollupOf(T.buildRollups([...events].reverse())));
      return a === b ? null : 'kolejność zdarzeń zmienia plik (zmiany w gicie bez zmiany danych)';
    },
  },
  {
    name: 'cli-idempotent-named-per-host-and-check-detects-drift',
    run() {
      const evDir = path.join(tmp, 'events');
      const outDir = path.join(tmp, 'rollups');
      fs.mkdirSync(evDir, { recursive: true });
      fs.writeFileSync(path.join(evDir, '2026-01.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
      const env = { ...process.env, CLAUDE_TELEMETRY_DIR: evDir, CLAUDE_TELEMETRY_ROLLUPS_DIR: outDir };
      const run = (...a) => spawnSync(process.execPath, [AGG, ...a], { encoding: 'utf8', env });
      const first = run();
      if (first.status !== 0) return `pierwszy przebieg exit ${first.status}: ${first.stderr}`;
      const file = path.join(outDir, 'demo', `${D1}.${HOST_A}.json`);
      if (!fs.existsSync(file)) return `brak pliku ${path.relative(tmp, file)}`;
      if (!fs.existsSync(path.join(outDir, 'demo', `${D1}.${HOST_B}.json`))) return 'brak pliku hosta B';
      const before = fs.readFileSync(file, 'utf8');
      const second = run();
      if (!/zapisano 0/.test(second.stdout)) return `drugi przebieg coś zapisał: ${second.stdout}`;
      if (fs.readFileSync(file, 'utf8') !== before) return 'przeliczenie zmieniło plik';
      if (run('--check').status !== 0) return '--check na świeżych agregatach nie przechodzi';
      fs.writeFileSync(file, before.replace('"events": 18', '"events": 20'));
      if (run('--check').status === 0) return '--check nie wykrył ręcznej edycji';
      if (run('--day', D1).status !== 0 || fs.readFileSync(file, 'utf8') !== before) return 'przeliczenie dnia nie nadpisało edytowanego pliku';
      if (run('--day', 'wczoraj').status === 0) return 'zła data przyjęta';
      return null;
    },
  },
  {
    name: 'inbox-index-defaults-and-drift-detection',
    run() {
      const dir = path.join(tmp, 'inbox');
      fs.mkdirSync(dir, { recursive: true });
      const rec = (name, fm) => fs.writeFileSync(path.join(dir, name), `---\n${fm}\n---\n\n# x\n`);
      rec('DEV-b.md', 'id: DEV-b\nstatus: proposed\ntrigger: no_go\noccurrences: 3\nprojects:\n  - demo\nfirst_seen: 2026-10-01\nlast_seen: 2026-10-03');
      rec('DEV-a.md', 'id: DEV-a\nstatus: dismissed\ntrigger: setup_drift\ncategory: infra\nsources:\n  - audit\noccurrences: 1\nprojects: []\nfirst_seen: 2026-10-02\nlast_seen: 2026-10-02');
      rec('DEV-broken.md', 'id: DEV-broken\nstatus: proposed\nstatus: dismissed');
      fs.writeFileSync(path.join(dir, 'README.md'), '# nie rekord\n');
      const run = (...a) => spawnSync(process.execPath, [IDX, '--dir', dir, ...a], { encoding: 'utf8' });
      if (run().status !== 0) return 'generowanie nieudane';
      const file = path.join(dir, 'index.json');
      const idx = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!/GENERATED/.test(idx._generated)) return 'brak znacznika GENERATED';
      if (idx.count !== 2 || idx.entries.map((e) => e.id).join() !== 'DEV-a,DEV-b') return `wpisy: ${idx.entries.map((e) => e.id)} (uszkodzony nagłówek ma być pominięty, kolejność po id)`;
      const [a, b] = idx.entries;
      if (b.category !== 'verifier') return `brak category dostał "${b.category}" zamiast defaultCategory(no_go)`;
      if (a.category !== 'infra') return 'istniejąca category nadpisana';
      if (b.sources.join() !== 'orchestrate') return 'brak sources nie dał orchestrate';
      if (b.first_seen !== '2026-10-01') return `data jako ${typeof b.first_seen} ${b.first_seen}`;
      if (run('--check').status !== 0) return '--check na świeżym indeksie nie przechodzi';
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"DEV-a"', '"DEV-zmieniony"'));
      if (run('--check').status === 0) return '--check nie wykrył ręcznej edycji indeksu';
      rec('DEV-c.md', 'id: DEV-c\nstatus: proposed\ntrigger: halt');
      run();
      if (run('--check').status !== 0) return 'po regeneracji --check nie przechodzi';
      if (!JSON.parse(fs.readFileSync(file, 'utf8')).entries.some((e) => e.id === 'DEV-c')) return 'nowy rekord nie trafił do indeksu';
      return null;
    },
  },
  {
    name: 'report-deviation-uses-shared-reader',
    run() {
      const src = fs.readFileSync(REPORT, 'utf8');
      if (!/from '\.\/lib\/inbox\.mjs'/.test(src)) return 'report-deviation nie importuje wspólnego czytnika';
      if (/function readInboxEntries/.test(src)) return 'kopia readInboxEntries została w report-deviation';
      const res = spawnSync(process.execPath, [REPORT, '--list'], { encoding: 'utf8' });
      return res.status === 0 ? null : `--list exit ${res.status}: ${res.stderr}`;
    },
  },
  {
    // Przebiegi z `engine` w run.start liczone osobno per wersja; bez `engine` — bez bloku (stare agregaty nie drgną).
    name: 'counters-split-per-engine',
    run(T) {
      const mk = (runId, engine, ts, outcome, cost) => [
        ev({ runId, kind: 'run.start', process: 'orchestrate', ts: `${ts}T10:00:00.000Z`, ...(engine ? { engine } : {}) }),
        ev({ runId, kind: 'step.end', process: 'orchestrate', ts: `${ts}T10:01:00.000Z`, outcome: 'ok', step: { id: 'a:implementer#1', role: 'implementer' }, ...(cost === null ? {} : { m: { costUsd: cost } }) }),
        ev({ runId, kind: 'run.end', process: 'orchestrate', ts: `${ts}T10:02:00.000Z`, outcome }),
      ];
      const d = '2026-02-01';
      const r = T.buildRollups([...mk('r1', 'abc1234', d, 'go', 1), ...mk('r2', 'abc1234', d, 'no_go', null), ...mk('r3', 'def5678', d, 'go', 2), ...mk('r4', null, d, 'go', 5)]);
      const got = r.get(`demo|${d}|${HOST_A}`).engines;
      return eq(got.abc1234.orchestrate, { started: 2, ended: { go: 1, no_go: 1 }, steps: 2, died: 0, costUsd: 1, stepsWithoutCost: 1 }, 'engine abc1234')
        || eq(got.def5678.orchestrate.started, 1, 'engine def5678')
        || eq(Object.keys(got).sort(), ['abc1234', 'def5678'], 'przebieg bez engine nie tworzy bloku')
        || eq(Object.keys(T.buildRollups(mk('r5', null, d, 'go', 1)).get(`demo|${d}|${HOST_A}`)).includes('engines'), false, 'brak engines bez engine');
    },
  },
  {
    name: 'review-panel-counts-per-reviewer-without-touching-orchestrate',
    run(T) {
      const d = '2026-03-01';
      const base = [
        ev({ runId: 'r-o', kind: 'run.start', process: 'orchestrate', ts: `${d}T10:00:00.000Z`, engine: 'abc1234' }),
        ev({ runId: 'r-o', kind: 'step.end', process: 'orchestrate', ts: `${d}T10:01:00.000Z`, outcome: 'go', step: { id: 'a:verifier#1', role: 'verifier' }, m: { costUsd: 0.5 } }),
        ev({ runId: 'r-o', kind: 'step.end', process: 'orchestrate', ts: `${d}T10:02:00.000Z`, outcome: 'died', cause: 'silent', step: { id: 'b:implementer#1', role: 'implementer' } }),
        ev({ runId: 'r-o', kind: 'run.end', process: 'orchestrate', ts: `${d}T10:03:00.000Z`, outcome: 'ok' }),
      ];
      const rp = (ts, reviewer, findings) => ev({
        runId: 'rp-1', taskRef: undefined, kind: 'step.end', process: 'review-panel', ts: `${d}T${ts}.000Z`,
        outcome: findings === undefined ? 'skipped' : 'ok', step: { id: reviewer, role: reviewer, ...(findings === undefined ? {} : { findings }) },
      });
      const panel = [rp('11:00:00', 'eagle', 3), rp('11:00:01', 'nitpicker', 0), rp('11:05:00', 'eagle', 2), rp('11:05:01', 'nitpicker')];
      const key = `demo|${d}|${HOST_A}`;
      const without = T.buildRollups(base).get(key);
      const withPanel = T.buildRollups([...base, ...panel]).get(key);
      const err = eq(withPanel.processes.orchestrate, without.processes.orchestrate, 'blok orchestrate zmienił się po dodaniu zdarzeń panelu')
        || eq(withPanel.runs, without.runs, 'runs zmienione przez panel')
        || eq(withPanel.engines, without.engines, 'engines zmienione przez panel');
      if (err) return err;
      const p = withPanel.processes['review-panel'];
      return eq(p.steps, 4, 'kroki review-panel')
        || eq(p.costUsd, 0, 'koszt review-panel') || eq(p.died, 0, 'zgony review-panel')
        || eq(p.stepsWithoutCost, 0, 'review-panel nie ma kosztu z natury — nie jest luką pomiaru')
        || eq(p.roles.eagle.outcomes, { ok: 2 }, 'eagle outcomes') || eq(p.roles.eagle.findings, 5, 'eagle findings')
        || eq(p.roles.nitpicker.outcomes, { ok: 1, skipped: 1 }, 'nitpicker outcomes') || eq(p.roles.nitpicker.findings, 0, 'nitpicker findings')
        || eq('review-panel' in withPanel.runs, false, 'panel nie tworzy przebiegów (brak run.start)')
        || eq(withPanel.stepsTotal, without.stepsTotal + 4, 'stepsTotal')
        || eq('findings' in without.processes.orchestrate.roles.verifier, false, 'findings tylko tam, gdzie je podano')
        || (JSON.stringify(withPanel).includes('rp-1') ? 'runId panelu wyciekł do agregatu' : null);
    },
  },
  {
    name: 'pre-commit-guards-registered',
    run() {
      const src = fs.readFileSync(GUARDS, 'utf8');
      if (!src.includes('tests/flow-evals/telemetry-rollups/run.js')) return 'eval nie jest w pre-commit-guards';
      if (!src.includes("scripts/generate-inbox-index.mjs', '--check'")) return 'generate-inbox-index --check nie jest w pre-commit-guards';
      return null;
    },
  },
];

(async () => {
  const T = await import(LIB);
  const rollups = T.buildRollups(events);
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = test.run(T, rollups); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
