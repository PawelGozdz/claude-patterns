#!/usr/bin/env node
/**
 * tests/flow-evals/telemetry-report/run.js — eval L1 raportu nad rollupami (TASK-OBS-014, ADR 0015 D6).
 *
 * DLACZEGO: pytanie „czy zmiana silnika zmniejszyła NO_GO bramki" miało jedną odpowiedź — ręczny skrypt nad
 * zdarzeniami. Raport czyta wyłącznie rollupy, więc jego liczby muszą się zgadzać z ręcznym rachunkiem na
 * danych, w których wiemy, co jest regresem, a co szumem.
 *
 * Dane syntetyczne w katalogu tymczasowym (CLAUDE_TELEMETRY_ROLLUPS_DIR): projekt `demo`, dwa hosty, dwa
 * silniki (old1111 → new2222 od 2026-03-06), jedna sztuczna przerwa w dniach (03-03), dni spoza okna ze
 * skrajnymi wartościami oraz projekt syntetyczny flow-eval-* i uszkodzony plik, które czytnik musi pominąć.
 * Kontrakty:
 *   1. czytnik: sumowanie po hostach, pominięcie flow-eval-* i uszkodzonych plików, brak katalogu = []
 *   2. okna silnika liczone po dniach Z DANYMI (przerwa nie liczy się), engineShare
 *   3. klasyfikacja: regres, poprawa, szum względny, szum bezwzględny, za mała próba
 *   4. gęstość odstępstw per sygnatura
 *   5. liczniki jakości danych na ręcznie policzonym zestawie
 *   6. tydzień ISO na granicach roku
 *   7. CLI: tekst, --json, --md, błędy użycia (exit 1)
 *   8. loadBaseline korzysta ze wspólnego czytnika; raport nie sięga do zdarzeń; guard w pre-commit
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const LIBS = path.join(REPO, 'scripts', 'lib');
const CLI = path.join(REPO, 'scripts', 'telemetry-report.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-report-'));
const ROLLUPS = path.join(tmp, 'rollups');

// Zestaw „przed": 4 rollupy w oknie (03-02 ×2 hosty, 03-04, 03-05); „po": 4 rollupy (03-06 ×2 hosty, 03-07, 03-09).
// Wartości rozbite na rollupy tak, by SUMY dały: przed first-pass 36/40, fałszywe GO 2/20, NO_GO bramki 2/10,
// powtórki 10/100; po first-pass 28/40 (regres), fałszywe GO 2/20, NO_GO bramki 1/10 (poprawa), powtórki 11/100.
const BEFORE = [
  { day: '2026-03-02', host: 'hostA', fgo: 1, gn: 1, retried: 3, dev: { 'DEV-x': 1, 'DEV-y': 2, 'DEV-z': 1 }, gj: 3, runs: 3 },
  { day: '2026-03-02', host: 'hostB', fgo: 1, gn: 1, retried: 3, dev: { 'DEV-x': 1, 'DEV-y': 2 }, gj: 3, runs: 3 },
  { day: '2026-03-04', host: 'hostA', fgo: 0, gn: 0, retried: 2, dev: {}, gj: 2, runs: 2 },
  { day: '2026-03-05', host: 'hostA', fgo: 0, gn: 0, retried: 2, dev: {}, gj: 2, runs: 2 },
].map((o) => ({ ...o, fp: 9, engines: { old1111: { orchestrate: { started: o.runs } } } }));
const AFTER = [
  { day: '2026-03-06', host: 'hostA', fgo: 1, gn: 1, retried: 3, dev: { 'DEV-x': 2, 'DEV-y': 1, 'DEV-z': 1 }, gj: 3, runs: 3, engines: { new2222: { orchestrate: { started: 3 } } } },
  { day: '2026-03-06', host: 'hostB', fgo: 1, gn: 0, retried: 3, dev: { 'DEV-x': 2 }, gj: 3, runs: 3, engines: { new2222: { orchestrate: { started: 3 } } } },
  { day: '2026-03-07', host: 'hostA', fgo: 0, gn: 0, retried: 3, dev: { 'DEV-x': 1 }, gj: 2, runs: 2, engines: { new2222: { orchestrate: { started: 2 } } } },
  { day: '2026-03-09', host: 'hostA', fgo: 0, gn: 0, retried: 2, dev: {}, gj: 2, runs: 2, engines: { old1111: { orchestrate: { started: 2 } } } },
].map((o) => ({ ...o, fp: 7 }));

function rollup(o) {
  const dev = Object.fromEntries(Object.entries(o.dev || {}).map(([k, n]) => [k, { n, cause: 'config', trigger: 'analyze_gate' }]));
  return {
    v: 1, day: o.day, host: o.host, project: 'demo', events: 1,
    processes: {
      orchestrate: {
        steps: o.steps ?? 25, died: 0, costUsd: o.cost ?? 25, costUsdRetried: o.retried, stepsWithoutCost: 0,
        verification: { units: o.units ?? 10, firstPassGo: o.fp },
        finalGate: { judged: o.gj, noGo: o.gn },
        roles: { verifier: { n: 5, outcomes: { ok: 5 }, causes: { config: 1 }, verdicts: { goJudged: 5, falseGo: o.fgo } } },
      },
    },
    runs: { orchestrate: { started: o.runs } },
    engines: o.engines || {},
    deviations: dev,
  };
}

const put = (dir, project, r) => {
  fs.mkdirSync(path.join(dir, project), { recursive: true });
  fs.writeFileSync(path.join(dir, project, `${r.day}.${r.host}.json`), JSON.stringify(r));
};

const ALL = [
  // dzień przed oknem 3-dniowym: skrajne wartości, które NIE mogą wejść do „przed"
  { day: '2026-03-01', host: 'hostA', fp: 0, fgo: 5, gn: 5, retried: 25, gj: 5, runs: 5, engines: { old1111: { orchestrate: { started: 5 } } } },
  ...BEFORE, ...AFTER,
  // dni po oknie: też muszą zostać poza „po"
  { day: '2026-03-10', host: 'hostA', fp: 0, fgo: 5, gn: 5, retried: 25, gj: 5, runs: 5, engines: { new2222: { orchestrate: { started: 5 } } } },
  { day: '2026-03-11', host: 'hostA', fp: 0, fgo: 5, gn: 5, retried: 25, gj: 5, runs: 5, engines: { new2222: { orchestrate: { started: 5 } } } },
].map(rollup);

for (const r of ALL) put(ROLLUPS, 'demo', r);
put(ROLLUPS, 'flow-eval-xyz', { ...ALL[0], project: 'flow-eval-xyz' }); // syntetyczny projekt evali — pomijany
fs.writeFileSync(path.join(ROLLUPS, 'demo', '2026-03-12.hostA.json'), '{ to nie jest json');

const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_ROLLUPS_DIR: ROLLUPS },
});
const eq = (a, b, what) => (JSON.stringify(a) === JSON.stringify(b) ? null : `${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const near = (a, b) => Math.abs(a - b) < 1e-9;

const tests = [
  {
    name: 'reader-sums-hosts-skips-synthetic-and-broken',
    run(m) {
      const rs = m.reader.readRollups({ dir: ROLLUPS });
      if (rs.some((r) => r.project.startsWith('flow-eval-'))) return 'projekt flow-eval-* nie został pominięty';
      if (rs.length !== ALL.length) return `oczekiwano ${ALL.length} rollupów (uszkodzony pominięty), jest ${rs.length}`;
      const d2 = m.reader.readRollups({ dir: ROLLUPS, since: '2026-03-02', until: '2026-03-02' });
      if (d2.length !== 2) return `dzień 03-02 ma dwa hosty, czytnik zwrócił ${d2.length}`;
      if (m.report.totalsOf(d2).steps !== 50) return 'liczniki z dwóch hostów nie sumują się';
      if (m.reader.readRollups({ dir: path.join(tmp, 'nie-ma') }).length !== 0) return 'brak katalogu nie daje pustej listy';
      return null;
    },
  },
  {
    name: 'engine-windows-count-days-with-data',
    run(m) {
      const rs = m.reader.readRollups({ dir: ROLLUPS });
      const w = m.report.engineWindows(rs, 'new2222', { window: 3 });
      if (!w.found) return 'silnik new2222 nie znaleziony';
      let e = eq(w.beforeDays, ['2026-03-02', '2026-03-04', '2026-03-05'], 'okno przed (przerwa 03-03 nie liczy się)');
      e = e || eq(w.afterDays, ['2026-03-06', '2026-03-07', '2026-03-09'], 'okno po');
      if (e) return e;
      if (w.firstDay !== '2026-03-06') return `pierwszy dzień ${w.firstDay}`;
      if (!near(w.engineShare, 0.8)) return `engineShare ${w.engineShare}, oczekiwano 0.8 (8 z 10 przebiegów)`;
      if (m.report.engineWindows(rs, 'brak0000').found) return 'nieistniejący silnik ma wyniki';
      return null;
    },
  },
  {
    name: 'engine-report-flags-one-regression',
    run(m) {
      const rs = m.reader.readRollups({ dir: ROLLUPS });
      const rep = m.report.reportEngine(rs, 'new2222', { window: 3 });
      const rows = Object.fromEntries(rep.sections[0].rows.map((r) => [r.metric.split(' ')[0], r]));
      const want = { 'first-pass': 'regressed', 'fałszywe': 'noise', NO_GO: 'improved', udział: 'noise', cichy: 'noise' };
      for (const [k, v] of Object.entries(want)) if (!rows[k] || rows[k].verdict !== v) return `${k}: ${rows[k] && rows[k].verdict}, oczekiwano ${v}`;
      if (!near(rows['first-pass'].before, 0.9) || !near(rows['first-pass'].after, 0.7)) return 'first-pass nie 90% → 70%';
      if (!near(rows.NO_GO.before, 0.2) || !near(rows.NO_GO.after, 0.1)) return 'NO_GO bramki nie 20% → 10%';
      if (!near(rows['udział'].before, 0.1) || !near(rows['udział'].after, 0.11)) return 'udział kosztu powtórek nie 10% → 11%';
      return null;
    },
  },
  {
    name: 'classify-regression-improvement-noise-and-small-sample',
    run(m) {
      const def = { better: 'lower' };
      const c = (b, a, nb = 50, na = 50) => m.report.classify(def, { value: b, n: nb }, { value: a, n: na }).verdict;
      const t = [
        [c(0.10, 0.20), 'regressed'], [c(0.20, 0.10), 'improved'],
        [c(0.50, 0.55), 'noise'], // +10% względnie: szum
        [c(0.01, 0.02), 'noise'], // +100% względnie, ale 1 pp: szum bezwzględny
        [c(0.10, 0.20, 5, 50), 'insufficient_data'], [c(0.10, 0.20, 50, 9), 'insufficient_data'],
        [c(null, 0.2), 'insufficient_data'],
        [c(0, 0.2), 'regressed'], // wartość wyjściowa 0: brak względnej zmiany, ale 20 pp to nie szum
      ];
      for (const [got, want] of t) if (got !== want) return `classify: ${got}, oczekiwano ${want} (${JSON.stringify(t.map((x) => x[0]))})`;
      const higher = m.report.classify({ better: 'higher' }, { value: 0.9, n: 50 }, { value: 0.7, n: 50 }).verdict;
      return higher === 'regressed' ? null : `spadek metryki „higher is better": ${higher}`;
    },
  },
  {
    name: 'deviation-density-per-signature',
    run(m) {
      const rs = m.reader.readRollups({ dir: ROLLUPS });
      const w = m.report.engineWindows(rs, 'new2222', { window: 3 });
      const rows = Object.fromEntries(m.report.compareDeviations(w.before, w.after).map((r) => [r.sig, r]));
      // przed: 100 kroków, po: 100 kroków
      if (!near(rows['DEV-x'].before, 2) || !near(rows['DEV-x'].after, 5)) return `DEV-x: ${rows['DEV-x'].before} → ${rows['DEV-x'].after}`;
      const want = { 'DEV-x': 'regressed', 'DEV-y': 'improved', 'DEV-z': 'noise' };
      for (const [k, v] of Object.entries(want)) if (rows[k].verdict !== v) return `${k}: ${rows[k].verdict}, oczekiwano ${v}`;
      return null;
    },
  },
  {
    name: 'data-quality-four-counters',
    run(m) {
      const rs = [
        {
          day: '2026-04-01', host: 'h', project: 'p',
          processes: { orchestrate: { steps: 10, stepsWithoutCost: 4, roles: { x: { n: 10, causes: { other: 1, config: 3 } } } } },
          runs: { orchestrate: { started: 4 }, analyze: { started: 1 } },
          engines: { e1: { orchestrate: { started: 3 } } },
          deviations: { A: { n: 3, cause: 'other' }, B: { n: 1, cause: 'config' } },
          tasks: { T1: { runs: 3, analyzeRuns: 0 } },
        },
        {
          day: '2026-04-02', host: 'h', project: 'p',
          processes: { analyze: { steps: 10, stepsWithoutCost: 1, roles: { y: { n: 10, causes: { plan: 4 } } } } },
          runs: { analyze: { started: 2 } }, engines: {}, deviations: {}, tasks: { T2: { runs: 0, analyzeRuns: 1 } },
        },
      ];
      const rows = m.report.reportDataQuality(rs).sections[0].rows;
      const want = [[1, 8], [3, 4], [5, 20], [4, 7], [3, 7]]; // [licznik, mianownik] w kolejności wierszy
      if (rows.length !== 5) return `oczekiwano 5 wierszy (cztery liczniki, other w dwóch ujęciach), jest ${rows.length}`;
      for (let i = 0; i < want.length; i++) {
        if (rows[i].num !== want[i][0] || rows[i].den !== want[i][1]) return `${rows[i].metric}: ${rows[i].num}/${rows[i].den}, oczekiwano ${want[i][0]}/${want[i][1]}`;
      }
      return null;
    },
  },
  {
    name: 'iso-week-year-boundaries',
    run(m) {
      const t = [['2026-10-21', '2026-W43'], ['2026-01-01', '2026-W01'], ['2024-12-30', '2025-W01'], ['2021-01-03', '2020-W53'], ['2026-12-31', '2026-W53']];
      for (const [d, w] of t) if (m.report.isoWeek(d) !== w) return `${d} → ${m.report.isoWeek(d)}, oczekiwano ${w}`;
      return null;
    },
  },
  {
    name: 'cli-text-json-md-and-usage-errors',
    run() {
      const txt = cli('--engine', 'new2222', '--window', '3');
      if (txt.status !== 0) return `tekst: exit ${txt.status} ${txt.stderr}`;
      if (!/first-pass/.test(txt.stdout) || !/regressed/.test(txt.stdout) || !/80%/.test(txt.stdout)) return 'tekst bez metryk/werdyktu/udziału silnika';
      const js = cli('--engine', 'new2222', '--window', '3', '--json');
      let model;
      try { model = JSON.parse(js.stdout); } catch (e) { return `--json nie jest JSON-em: ${e.message}`; }
      if (!model.sections || model.models[0].window.hash !== 'new2222') return '--json bez modelu';
      const out = path.join(tmp, 'out', 'raport.md');
      const md = cli('--engine', 'new2222', '--window', '3', '--data-quality', '--md', out);
      if (md.status !== 0 || !fs.existsSync(out)) return `--md nie zapisał pliku: ${md.stderr}`;
      const body = fs.readFileSync(out, 'utf8');
      if (!/^# Raport telemetrii/m.test(body) || !/## Metryki jakości/.test(body) || !/## Liczniki jakości danych/.test(body) || !/\| first-pass/.test(body)) return 'markdown bez sekcji/tabeli';
      if (/\d{4}-\d{2}-\d{2}T\d/.test(body)) return 'markdown niesie czas generowania (plik w gicie miałby się zmieniać bez nowych danych)';
      for (const args of [['--by', 'foo'], ['--since', 'wczoraj'], ['--json', '--md', 'x.md'], ['--window', '0'], ['--nieznany']]) {
        if (cli(...args).status !== 1) return `${args.join(' ')} powinno dać exit 1`;
      }
      const empty = spawnSync(process.execPath, [CLI], { encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_ROLLUPS_DIR: path.join(tmp, 'pusto') } });
      return empty.status === 1 ? null : `brak rollupów: exit ${empty.status}, oczekiwano 1`;
    },
  },
  {
    name: 'views-by-process-project-week-role-engine',
    run() {
      for (const by of ['process', 'project', 'week', 'role', 'engine']) {
        const r = cli('--by', by, '--json');
        if (r.status !== 0) return `--by ${by}: exit ${r.status} ${r.stderr}`;
        const rows = JSON.parse(r.stdout).sections[0].rows;
        if (!rows.length) return `--by ${by}: pusty widok`;
      }
      const wk = JSON.parse(cli('--by', 'week', '--json').stdout).sections[0].rows.map((x) => x.key);
      // 01.03.2026 to niedziela (tydzień 9), 02.03 poniedziałek otwiera tydzień 10, 09.03 tydzień 11
      return eq(wk, ['2026-W09', '2026-W10', '2026-W11'], 'tygodnie ISO dla 01–11 marca 2026');
    },
  },
  {
    name: 'wiring-shared-reader-rollups-only-and-pre-commit-guard',
    run(m) {
      const live = fs.readFileSync(path.join(LIBS, 'flow-live.mjs'), 'utf8');
      const fn = live.match(/export function loadBaseline[\s\S]*?\n}\n/);
      if (!fn) return 'brak loadBaseline';
      if (/readdirSync|readFileSync/.test(fn[0]) || !/readRollups\(/.test(fn[0])) return 'loadBaseline ma własną kopię pętli po rollupach';
      const base = m.live.loadBaseline({ project: 'demo', days: 365, now: Date.parse('2026-03-12T00:00:00Z'), dir: ROLLUPS });
      const steps = ALL.reduce((s, r) => s + r.processes.orchestrate.steps, 0);
      if (base.steps !== steps) return `loadBaseline: ${base.steps} kroków, oczekiwano ${steps}`;
      const src = [CLI, path.join(LIBS, 'telemetry-report.mjs'), path.join(LIBS, 'telemetry-report-format.mjs')]
        .map((f) => fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')).join('\n');
      if (/eventsDir|workflow-steps|workflow-metrics-lib|readEvents/.test(src)) return 'raport sięga poza rollupy (zdarzenia / workflow-steps)';
      const guards = fs.readFileSync(path.join(REPO, 'scripts', 'pre-commit-guards.mjs'), 'utf8');
      return /runCheck\('eval: telemetry-report',[^)]*telemetry-report\/run\.js/.test(guards) ? null : 'eval nie jest wpięty w pre-commit-guards.mjs';
    },
  },
];

(async () => {
  const m = {
    reader: await import(path.join(LIBS, 'telemetry-rollup-reader.mjs')),
    report: await import(path.join(LIBS, 'telemetry-report.mjs')),
    live: await import(path.join(LIBS, 'flow-live.mjs')),
  };
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = test.run(m); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
