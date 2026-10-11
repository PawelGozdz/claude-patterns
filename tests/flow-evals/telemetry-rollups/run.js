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
      for (const bad of ['taskRef', 'TS-SECRET-1', 'runId', RUN, '/home/', '/opt/', 'domain:verifier', 'verify:core']) {
        if (text.includes(bad)) return `agregat zawiera "${bad}"`;
      }
      return null;
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
