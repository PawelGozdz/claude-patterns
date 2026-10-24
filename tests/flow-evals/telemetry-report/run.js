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

// ── TASK-OBS-017: zestawy dla claimów ────────────────────────────────────────────────────────────────
// Hasze muszą być poprawnym hex (claim je waliduje), w odróżnieniu od old1111/new2222 z zestawu wyżej.
const OLD = 'a1b2c3d';
const NEW = 'd4e5f6a';

// 8 dni z danymi (4 przed, 4 po), 6 przebiegów dziennie → 24 po każdej stronie (próg claimu to 20), koszt 100 na okno.
// `before`/`after` = koszt powtórek per dzień (suma 32 z 100 → 32%); `newRuns` = ile z 6 przebiegów szło pod NEW po zmianie.
function claimDir(name, { before, after, newRuns = [6, 6, 6, 6], dev = {} }) {
  const dir = path.join(tmp, name);
  const days = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'];
  days.forEach((day, i) => {
    const isAfter = i >= 4;
    const k = i % 4;
    const engines = isAfter
      ? { [NEW]: { orchestrate: { started: newRuns[k] } }, ...(newRuns[k] < 6 ? { [OLD]: { orchestrate: { started: 6 - newRuns[k] } } } : {}) }
      : { [OLD]: { orchestrate: { started: 6 } } };
    put(dir, 'demo', rollup({ day, host: 'hostA', fp: 9, fgo: 0, gn: 0, retried: (isAfter ? after : before)[k], gj: 3, runs: 6, engines, dev: isAfter ? dev.after : dev.before }));
  });
  return dir;
}

const HISTORY = [
  '## `/orchestrate` — reguły ORC', '',
  '<a id="orc-100"></a>', '', '### ORC-100 — bez deklaracji (2026-03-05)', '', 'Treść.', '',
  '<a id="orc-999"></a>', '', '### ORC-999 — z deklaracją (2026-03-06)', '',
  `**Claim:** metric=retryCost direction=down threshold=0.2 engine=${NEW} process=orchestrate`, '', 'Treść.', '',
  '### ORC-010 / ORC-012 — wspólny wpis (2026-02-01)', '',
  `**Claim:** metric=bogus direction=down threshold=0.2 engine=${NEW}`, '',
].join('\n');

// Kopia skrzynki w katalogu tymczasowym: CLI zawsze dostaje --inbox, więc eval nigdy nie dotyka docs/tasks/_inbox/.
function freshInbox(name, status) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'DEV-test-a.md'), [
    '---', 'id: DEV-test-a', `status: ${status}`, 'resolution: >', '  Naprawione jako ORC-999', '  (druga linia)',
    'claim:', '  metric: retryCost', '  direction: down', '  threshold: 0.2', `  engine: ${NEW}`, '  process: orchestrate',
    'trigger: halt', 'first_seen: 2026-03-01', 'last_seen: 2026-03-01', '---', '', '# DEV-test-a', '', '## Occurrences', '', '- 2026-03-01 demo — test', ''].join('\n'));
  return dir;
}

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
  // ── TASK-OBS-017: claimy, status resolved, raport tygodniowy ───────────────────────────────────────────
  {
    name: 'claim-verdicts-confirmed-regressed-no-effect-and-direction',
    run(m) {
      const claim = (extra = {}) => ({ metric: 'retryCost', direction: 'down', threshold: 0.2, engine: NEW, process: 'orchestrate', ...extra });
      const v = (dir, c) => m.claims.claimVerdict(m.reader.readRollups({ dir }), c);
      const confirmed = v(claimDir('c-confirmed', { before: [8, 8, 8, 8], after: [4, 4, 4, 4] }), claim());
      if (confirmed.verdict !== 'confirmed' || !confirmed.trusted) return `32% → 16%: ${confirmed.verdict}, trusted=${confirmed.trusted}`;
      if (!near(confirmed.before, 0.32) || !near(confirmed.after, 0.16)) return `wartości ${confirmed.before} → ${confirmed.after}`;
      const regressed = v(claimDir('c-regressed', { before: [4, 4, 4, 4], after: [8, 8, 8, 8] }), claim());
      if (regressed.verdict !== 'regressed') return `16% → 32% przy direction=down: ${regressed.verdict}`;
      const noEffect = v(claimDir('c-noeffect', { before: [8, 8, 8, 8], after: [8, 8, 8, 7] }), claim());
      if (noEffect.verdict !== 'no_effect') return `32% → 31%: ${noEffect.verdict}`;
      const up = v(claimDir('c-up', { before: [4, 4, 4, 4], after: [8, 8, 8, 8] }), claim({ direction: 'up' }));
      if (up.verdict !== 'confirmed') return `direction=up, wzrost 16% → 32%: ${up.verdict}`;
      const relBelow = v(claimDir('c-rel', { before: [8, 8, 8, 8], after: [7, 7, 7, 7] }), claim());
      return relBelow.verdict === 'no_effect' ? null : `32% → 28% (-12,5% < progu 20%): ${relBelow.verdict}`;
    },
  },
  {
    name: 'claim-insufficient-data-and-untrusted-engine-share',
    run(m) {
      const rs = m.reader.readRollups({ dir: ROLLUPS });
      const few = m.claims.claimVerdict(rs, { metric: 'retryCost', direction: 'down', threshold: 0.2, engine: 'new2222' });
      if (few.verdict !== 'insufficient_data' || !/przebiegów/.test(few.reason)) return `10 przebiegów po stronie: ${few.verdict} (${few.reason})`;
      const ghost = m.claims.claimVerdict(rs, { metric: 'retryCost', direction: 'down', threshold: 0.2, engine: 'deadbee' });
      if (ghost.verdict !== 'insufficient_data' || !/nie występuje/.test(ghost.reason)) return `nieistniejący hash: ${ghost.verdict}`;
      const mixed = m.claims.claimVerdict(m.reader.readRollups({ dir: claimDir('c-mixed', { before: [8, 8, 8, 8], after: [4, 4, 4, 4], newRuns: [2, 2, 2, 2] }) }),
        { metric: 'retryCost', direction: 'down', threshold: 0.2, engine: NEW, process: 'orchestrate' });
      if (mixed.verdict !== 'confirmed' || mixed.trusted) return `udział silnika 33%: verdict=${mixed.verdict}, trusted=${mixed.trusted}`;
      if (!near(mixed.engineShare, 8 / 24)) return `engineShare ${mixed.engineShare}`;
      if (m.inboxClaims.statusChangeFor({ source: 'inbox', status: 'promoted', errors: [] }, mixed) !== null) return 'niezaufany werdykt zmienił status';
      return null;
    },
  },
  {
    name: 'claim-on-deviation-signature',
    run(m) {
      const dir = claimDir('c-dev', { before: [4, 4, 4, 4], after: [4, 4, 4, 4], dev: { before: { 'DEV-x': 2 }, after: { 'DEV-x': 0 } } });
      const r = m.claims.claimVerdict(m.reader.readRollups({ dir }), { metric: 'DEV-x', direction: 'down', threshold: 0.2, engine: NEW });
      if (r.verdict !== 'confirmed' || !near(r.before, 8) || !near(r.after, 0)) return `sygnatura 8 → 0 na 100 kroków: ${r.verdict} ${r.before}→${r.after}`;
      return null;
    },
  },
  {
    name: 'claim-validation-and-rule-history-parsing',
    run(m) {
      const ok = { metric: 'gateNoGo', direction: 'down', threshold: 0.2, engine: NEW };
      if (m.claims.validateClaim(ok).length) return `poprawny claim odrzucony: ${m.claims.validateClaim(ok)}`;
      for (const bad of [{ ...ok, metric: 'bogus' }, { ...ok, direction: 'sideways' }, { ...ok, threshold: 0 }, { ...ok, threshold: 1.5 }, { ...ok, engine: 'xyz' }, { ...ok, process: 'Bad Name' }]) {
        if (!m.claims.validateClaim(bad).length) return `błędny claim przeszedł: ${JSON.stringify(bad)}`;
      }
      const rules = m.claims.parseRuleHistory(HISTORY);
      const by = Object.fromEntries(rules.map((r) => [r.id, r]));
      let e = eq(rules.map((r) => r.id), ['ORC-100', 'ORC-999', 'ORC-010', 'ORC-012'], 'id wpisów (nagłówek łączony daje dwa)');
      e = e || eq(by['ORC-100'].claim, null, 'ORC-100 bez claimu');
      e = e || eq([by['ORC-999'].date, by['ORC-999'].claim.process, by['ORC-999'].claim.threshold], ['2026-03-06', 'orchestrate', 0.2], 'ORC-999');
      if (e) return e;
      if (!by['ORC-010'].claimErrors.length || !by['ORC-012'].claimErrors.length) return 'claim z metric=bogus bez błędów';
      const without = m.claims.rulesWithoutClaim(HISTORY, ['ORC-100', 'ORC-999', 'ORC-010', 'ORC-404']);
      return eq(without, ['ORC-100', 'ORC-010', 'ORC-404'], 'reguły bez poprawnego claimu (brak wpisu też się liczy)');
    },
  },
  {
    name: 'added-rule-ids-from-staged-diff',
    run(m) {
      const diff = ['--- a/commands/orchestrate.md', '+++ b/commands/orchestrate.md', '@@ -150,0 +151,3 @@',
        '+| ORC-133 | trigger | akcja | prompt | [ORC-133](x#orc-133) |', '+| ANL-044 | trigger | akcja | prompt | — |',
        '+tekst zwykły | ORC-134 | nie wiersz tabeli', '-| ORC-001 | usunięty | x |', ' | ORC-002 | kontekst | x |'].join('\n');
      return eq(m.claims.addedRuleIds(diff), ['ORC-133', 'ANL-044'], 'tylko dodane wiersze tabeli reguł');
    },
  },
  {
    name: 'iso-week-ranges-and-expected-weekly-report',
    run(m) {
      const c = m.claims;
      let e = eq(c.weekRange('2026-W43'), { from: '2026-10-19', to: '2026-10-25' }, 'W43');
      e = e || eq(c.weekRange('2026-W01'), { from: '2025-12-29', to: '2026-01-04' }, 'W01 2026 zaczyna się w grudniu');
      e = e || eq(c.previousWeek('2026-10-26'), '2026-W43', 'tydzień przed poniedziałkiem 26.10');
      // poniedziałek ma dzień luzu (cron robi raport właśnie wtedy), od wtorku raport poprzedniego tygodnia jest wymagany
      e = e || eq([c.expectedWeeklyReport('2026-10-25'), c.expectedWeeklyReport('2026-10-26'), c.expectedWeeklyReport('2026-10-27')], ['2026-W42', '2026-W42', '2026-W43'], 'oczekiwany raport');
      if (e) return e;
      try { c.weekRange('2026-43'); return 'zły format tygodnia przeszedł'; } catch { return null; }
    },
  },
  {
    name: 'cli-write-status-resolves-reopens-and-keeps-text',
    run() {
      const hist = path.join(tmp, 'history.md');
      fs.writeFileSync(hist, HISTORY);
      const runIn = (rollupDir, inboxDir, ...extra) => spawnSync(process.execPath, [CLI, '--claims', '--inbox', inboxDir, '--history', hist, '--today', '2026-04-01', ...extra], {
        encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_ROLLUPS_DIR: rollupDir },
      });
      const inbox = freshInbox('inbox-a', 'promoted');
      const file = path.join(inbox, 'DEV-test-a.md');
      const original = fs.readFileSync(file, 'utf8');
      const confirmedDir = claimDir('c-confirmed', { before: [8, 8, 8, 8], after: [4, 4, 4, 4] });
      const dry = runIn(confirmedDir, inbox);
      if (dry.status !== 0 || fs.readFileSync(file, 'utf8') !== original) return `--claims bez --write-status zmienił plik albo padł: ${dry.stderr}`;
      const w = runIn(confirmedDir, inbox, '--write-status');
      if (w.status !== 0) return `write-status: exit ${w.status} ${w.stderr}`;
      const resolved = fs.readFileSync(file, 'utf8');
      if (!/^status: resolved$/m.test(resolved) || !/^resolved_at: 2026-04-01$/m.test(resolved) || !/^resolved_by: telemetry-report$/m.test(resolved)) return `confirmed nie dał resolved:\n${resolved}`;
      const stripped = resolved.replace(/^(resolved_at|resolved_by):.*\n/gm, '').replace('status: resolved', 'status: promoted');
      if (stripped !== original) return 'zmiana statusu ruszyła coś poza liniami status/resolved_*';
      const index = JSON.parse(fs.readFileSync(path.join(inbox, 'index.json'), 'utf8'));
      const entry = index.entries.find((x) => x.id === 'DEV-test-a');
      if (!entry || entry.status !== 'resolved' || !entry.claim || entry.claim.metric !== 'retryCost') return `index.json bez statusu/claimu: ${JSON.stringify(entry)}`;
      // regres po resolved → reopen jak w report-deviation
      const r = runIn(claimDir('c-regressed', { before: [4, 4, 4, 4], after: [8, 8, 8, 8] }), inbox, '--write-status');
      const reopened = fs.readFileSync(file, 'utf8');
      if (r.status !== 0 || !/^status: proposed$/m.test(reopened) || !/^reopened_at: 2026-04-01$/m.test(reopened) || !/^reopened_from_status: resolved$/m.test(reopened)) return `regressed nie otworzył rekordu:\n${reopened}`;
      if (/^resolved_(at|by):/m.test(reopened)) return 'po reopenie zostały pola resolved_*';
      // niezaufany werdykt (udział silnika 33%) nie zmienia statusu
      const inbox2 = freshInbox('inbox-b', 'promoted');
      runIn(claimDir('c-mixed', { before: [8, 8, 8, 8], after: [4, 4, 4, 4], newRuns: [2, 2, 2, 2] }), inbox2, '--write-status');
      if (!/^status: promoted$/m.test(fs.readFileSync(path.join(inbox2, 'DEV-test-a.md'), 'utf8'))) return 'niezaufany werdykt zmienił status';
      // status inny niż promoted/resolved nie jest ruszany
      const inbox3 = freshInbox('inbox-c', 'dismissed');
      runIn(confirmedDir, inbox3, '--write-status');
      return /^status: dismissed$/m.test(fs.readFileSync(path.join(inbox3, 'DEV-test-a.md'), 'utf8')) ? null : 'dismissed został zmieniony';
    },
  },
  {
    name: 'cli-weekly-report-four-sections-deterministic',
    run() {
      const hist = path.join(tmp, 'history.md');
      fs.writeFileSync(hist, HISTORY);
      const inbox = freshInbox('inbox-w', 'promoted');
      const reports = path.join(tmp, 'reports');
      const run = (...extra) => spawnSync(process.execPath, [CLI, '--weekly', '--week', '2026-W10', '--inbox', inbox, '--history', hist, '--today', '2026-03-12', ...extra], {
        encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_ROLLUPS_DIR: ROLLUPS, CLAUDE_TELEMETRY_REPORTS_DIR: reports },
      });
      const dry = run('--dry-run');
      if (dry.status !== 0) return `dry-run: exit ${dry.status} ${dry.stderr}`;
      if (fs.existsSync(reports)) return '--dry-run zapisał plik raportu';
      const sections = dry.stdout.match(/^## .+$/gm) || [];
      if (sections.length !== 4) return `oczekiwano 4 sekcji, jest ${sections.length}: ${sections.join(' | ')}`;
      if (!/Delta tydzień do tygodnia/.test(sections[0]) || !/Claimy/.test(sections[1]) || !/Jakość danych/.test(sections[2]) || !/Reguły bez claimu/.test(sections[3])) return `kolejność/nazwy sekcji: ${sections.join(' | ')}`;
      if (!/ORC-100/.test(dry.stdout) || /\| ORC-999 \| 2026-03-06 \|/.test(dry.stdout)) return 'lista reguł bez claimu: ORC-100 ma być, ORC-999 (z claimem) nie';
      const w1 = run();
      const target = path.join(reports, '2026-W10.md');
      if (w1.status !== 0 || !fs.existsSync(target)) return `zapis raportu: exit ${w1.status} ${w1.stderr}`;
      const first = fs.readFileSync(target, 'utf8');
      run();
      if (fs.readFileSync(target, 'utf8') !== first) return 'dwa przebiegi na tych samych danych dały różne pliki (raport niedeterministyczny)';
      if (/\d{4}-\d{2}-\d{2}T\d/.test(first)) return 'raport niesie czas generowania';
      for (const bad of [['--engine', 'x'], ['--by', 'week'], ['--claims'], ['--data-quality']]) {
        const r = spawnSync(process.execPath, [CLI, '--weekly', ...bad], { encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_ROLLUPS_DIR: ROLLUPS } });
        if (r.status !== 1) return `--weekly ${bad.join(' ')} powinno dać exit 1`;
      }
      const bare = spawnSync(process.execPath, [CLI, '--week', '2026-W10'], { encoding: 'utf8', env: { ...process.env, CLAUDE_TELEMETRY_ROLLUPS_DIR: ROLLUPS } });
      return bare.status === 1 ? null : '--week bez --weekly powinno dać exit 1';
    },
  },
  {
    name: 'resolved-is-closed-status-and-claim-in-index',
    run(m) {
      const dev = fs.readFileSync(path.join(REPO, 'scripts', 'report-deviation.mjs'), 'utf8');
      if (!/const wasClosed = [^;]*'resolved'/.test(dev)) return 'report-deviation nie traktuje resolved jako zamkniętego (nowe wystąpienie nie otworzyłoby rekordu)';
      const base = { id: 'DEV-x', file: 'DEV-x.md', status: 'resolved', trigger: 'halt', last_seen: '2026-03-01', first_seen: '2026-03-01' };
      const idx = m.inbox.toIndexEntry({ ...base, claim: { metric: 'died', direction: 'down', threshold: 0.2, engine: NEW, process: 'orchestrate' } });
      if (idx.status !== 'resolved' || idx.claim.process !== 'orchestrate' || idx.claim.metric !== 'died') return `indeks bez claimu: ${JSON.stringify(idx)}`;
      if ('claim' in m.inbox.toIndexEntry(base)) return 'rekord bez claimu dostał pole claim w indeksie';
      const stale = m.inbox.staleInboxEntries([{ ...base, last_seen: '2025-01-01', first_seen: '2025-01-01' }], new Date('2026-04-01'));
      return stale.length === 0 ? null : 'resolved nie powinien się starzeć (stan końcowy)';
    },
  },
  {
    name: 'wiring-pre-commit-claim-warning-and-freshness',
    run() {
      const guards = fs.readFileSync(path.join(REPO, 'scripts', 'pre-commit-guards.mjs'), 'utf8');
      if (!/function printClaimWarning/.test(guards) || (guards.match(/printClaimWarning\(\);/g) || []).length !== 2) return 'ostrzeżenie o claimie nie jest wołane w obu ścieżkach wyjścia';
      const fn = guards.match(/function printClaimWarning[\s\S]*?\n}\n/)[0];
      if (/results\.push|process\.exit|failed/.test(fn)) return 'ostrzeżenie o claimie wpływa na wynik (ma być nieblokujące)';
      const fresh = fs.readFileSync(path.join(REPO, 'scripts', 'telemetry-freshness.mjs'), 'utf8');
      if (!/expectedWeeklyReport/.test(fresh) || !/brak raportu tygodniowego/.test(fresh)) return 'telemetry-freshness nie pilnuje raportu tygodniowego';
      return fs.existsSync(path.join(REPO, 'scripts', 'cron', 'telemetry-weekly.sh')) ? null : 'brak wrappera crona';
    },
  },
];

(async () => {
  const m = {
    reader: await import(path.join(LIBS, 'telemetry-rollup-reader.mjs')),
    report: await import(path.join(LIBS, 'telemetry-report.mjs')),
    live: await import(path.join(LIBS, 'flow-live.mjs')),
    claims: await import(path.join(LIBS, 'telemetry-claims.mjs')),
    inboxClaims: await import(path.join(LIBS, 'inbox-claims.mjs')),
    inbox: await import(path.join(LIBS, 'inbox.mjs')),
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
