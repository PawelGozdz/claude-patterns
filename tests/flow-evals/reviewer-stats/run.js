#!/usr/bin/env node
/**
 * tests/flow-evals/reviewer-stats/run.js — eval L1 adaptacyjnego doboru reviewerów (TASK-GSTACK-ADOPT-001, B3).
 *
 * DLACZEGO: reguła „pomiń reviewera po 10 pustych wywołaniach" może zawieść na dwa sposoby, oba groźne:
 * wyciąć reviewera za wcześnie albo wyciąć takiego, którego nigdy nie wolno (security), a uszkodzony
 * dziennik, zamiast zatrzymać dobór, mógłby po cichu wyjść jako „zero findingów" i wyciąć wszystkich.
 * Eval pilnuje obu kierunków na syntetycznym dzienniku w katalogu tymczasowym.
 *
 * Kontrakty:
 *   1. seria zer >= 10 (od końca) -> GATE_CANDIDATE, SKIP; 9 -> nie; finding w ostatnim wywołaniu zeruje serię
 *   2. NEVER_GATE (security, compliance, pragmatist) nie jest kandydatem mimo 15 zer; decyzja RUN
 *   3. brak pliku / brak wpisów reviewera = „brak danych" = RUN (nic nie znika po cichu)
 *   4. pominięcia nie liczą się jako wywołania; po PROBE_EVERY pominięciach kandydat dostaje PROBE, finding go uwalnia
 *   5. statystyka per projekt; --all-projects sumuje
 *   6. uszkodzony dziennik (zły JSON, brak findings, zły outcome, zła wersja) -> exit 2, numer linii, brak tabeli
 *   7. --record: zapis, walidacja wejścia, odmowa zapisu NEVER_GATE jako pominiętego, end-to-end 10x -> kandydat
 *   8. --check-config: przechodzi na repo; pada przy uszkodzonym dzienniku i przy repo bez podpięcia
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CLI = path.join(REPO, 'scripts', 'reviewer-stats.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-reviewer-stats-'));

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

let seq = 0;
function line(project, reviewer, outcome, findings) {
  const rec = { v: 1, ts: new Date(Date.UTC(2026, 9, 1, 0, 0, seq++)).toISOString(), project, reviewer, outcome };
  if (outcome === 'ran') rec.findings = findings;
  return JSON.stringify(rec);
}
function ran(project, reviewer, counts) { return counts.map((n) => line(project, reviewer, 'ran', n)); }
function skipped(project, reviewer, n) { return Array.from({ length: n }, () => line(project, reviewer, 'skipped')); }

function logFile(name, lines) {
  const f = path.join(tmp, `${name}.jsonl`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}
function cli(args, file, env = {}) {
  const r = spawnSync('node', [CLI, ...args, ...(file ? ['--file', file] : [])], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function stats(file, project = 'demo') {
  const r = cli(['--json', '--project', project], file);
  return { r, byName: r.code === 0 ? Object.fromEntries(JSON.parse(r.out).reviewers.map((s) => [s.reviewer, s])) : {} };
}

const zeros = (n) => Array(n).fill(0);

// 1 + 2 + 4: główne scenariusze jednego dziennika
const main = logFile('main', [
  ...ran('demo', 'nitpicker', zeros(10)),                 // dokładnie próg -> kandydat
  ...ran('demo', 'newbie', zeros(9)),                     // niedobór danych
  ...ran('demo', 'tester', [...zeros(12), 1]),            // finding na końcu zeruje serię
  ...ran('demo', 'skeptic', [3, ...zeros(10)]),           // stary finding, potem 10 zer od końca -> kandydat
  ...ran('demo', 'security', zeros(15)),                  // NEVER_GATE mimo zer
  ...ran('demo', 'compliance', zeros(15)),
  ...ran('demo', 'pragmatist', zeros(15)),
  ...ran('demo', 'user', zeros(10)), ...skipped('demo', 'user', 4),     // kandydat, pominięty 4x -> nadal SKIP
  ...ran('demo', 'ops', zeros(10)), ...skipped('demo', 'ops', 10),      // kandydat, 10 pominięć -> PROBE
  ...ran('demo', 'money', zeros(10)), ...skipped('demo', 'money', 10), ...ran('demo', 'money', [2]), // probe znalazł -> RUN
  ...ran('other', 'newbie', [1, 1]),                      // inny projekt
  ...ran('other', 'nitpicker', [5]),
]);
{
  const { r, byName: s } = stats(main);
  check('1 stats exit 0', r.code === 0, r.err);
  check('1 nitpicker: seria 10 -> kandydat', s.nitpicker?.gateCandidate === true && s.nitpicker.decision === 'SKIP', JSON.stringify(s.nitpicker));
  check('1 nitpicker: liczniki', s.nitpicker?.invocations === 10 && s.nitpicker.invocationsWithFindings === 0 && s.nitpicker.zeroStreak === 10);
  check('1 newbie: 9 wywołań -> NIE kandydat', s.newbie?.gateCandidate === false && s.newbie.decision === 'RUN');
  check('1 tester: finding na końcu -> NIE kandydat', s.tester?.gateCandidate === false && s.tester.zeroStreak === 0 && s.tester.invocationsWithFindings === 1);
  check('1 skeptic: 10 zer od końca mimo starego findingu -> kandydat', s.skeptic?.gateCandidate === true && s.skeptic.invocationsWithFindings === 1 && s.skeptic.zeroStreak === 10);
  for (const n of ['security', 'compliance', 'pragmatist']) {
    check(`2 ${n}: NEVER_GATE nie jest kandydatem mimo 15 zer`, s[n]?.neverGate === true && s[n].gateCandidate === false && s[n].decision === 'RUN' && s[n].zeroStreak === 15, JSON.stringify(s[n]));
  }
  check('4 pominięcia nie są wywołaniami', s.user?.invocations === 10 && s.user.skippedSinceRun === 4 && s.user.decision === 'SKIP');
  check('4 10 pominięć -> PROBE', s.ops?.decision === 'PROBE' && s.ops.gateCandidate === true, JSON.stringify(s.ops));
  check('4 finding z PROBE uwalnia', s.money?.gateCandidate === false && s.money.decision === 'RUN' && s.money.zeroStreak === 0 && s.money.skippedSinceRun === 0);
  check('5 projekt other nie miesza się z demo', !('other' in s) && s.newbie.invocations === 9);

  const o = stats(main, 'other').byName;
  check('5 projekt other: osobna statystyka', o.nitpicker?.invocations === 1 && o.nitpicker.gateCandidate === false && o.newbie?.invocations === 2);
  const allR = cli(['--json', '--all-projects'], main);
  const all = Object.fromEntries(JSON.parse(allR.out).reviewers.map((x) => [x.reviewer, x]));
  check('5 --all-projects sumuje', all.nitpicker?.invocations === 11 && all.newbie?.invocations === 11);

  const txt = cli(['--project', 'demo'], main);
  check('1 tekst: znaczniki [GATE_CANDIDATE] i [NEVER_GATE]',
    /reviewer-nitpicker.*\[GATE_CANDIDATE\]/.test(txt.out) && /reviewer-security.*\[NEVER_GATE\]/.test(txt.out)
    && !/reviewer-security.*\[GATE_CANDIDATE\]/.test(txt.out) && !/reviewer-newbie.*\[GATE_CANDIDATE\]/.test(txt.out), txt.out);

  // --select: plan panelu -> RUN/SKIP z powodem; nic nie znika bez wzmianki
  const sel = cli(['--select', 'reviewer-eagle,nitpicker,newbie,security,user,ops,unknownone', '--json', '--project', 'demo'], main);
  const j = JSON.parse(sel.out);
  const runNames = j.run.map((x) => x.reviewer);
  const skipNames = j.skip.map((x) => x.reviewer);
  check('3 select: reviewer bez danych (eagle) -> RUN z powodem', runNames.includes('eagle') && j.run.find((x) => x.reviewer === 'eagle').reason === 'brak danych');
  check('3 select: nieznany -> RUN', runNames.includes('unknownone'));
  check('2 select: security -> RUN', runNames.includes('security') && !skipNames.includes('security'));
  check('1 select: nitpicker i user -> SKIP z powodem', skipNames.includes('nitpicker') && skipNames.includes('user') && j.skip.every((x) => x.reason.length > 10));
  check('1 select: newbie (9 wywołań) -> RUN', runNames.includes('newbie'));
  check('4 select: ops -> PROBE trafia do run i probe', runNames.includes('ops') && j.probe.includes('ops'));
  check('select: każdy zaplanowany reviewer ma wynik', runNames.length + skipNames.length === 7, `${runNames.length}+${skipNames.length}`);
}

// 3: brak pliku
{
  const missing = path.join(tmp, 'nie-ma.jsonl');
  const r = cli(['--project', 'demo'], missing);
  check('3 brak pliku: exit 0 i komunikat „brak danych"', r.code === 0 && /Brak danych/.test(r.out), r.out + r.err);
  const j = JSON.parse(cli(['--json', '--project', 'demo'], missing).out);
  check('3 brak pliku: --json pusta lista', Array.isArray(j.reviewers) && j.reviewers.length === 0);
  const sel = JSON.parse(cli(['--select', 'eagle,nitpicker', '--json', '--project', 'demo'], missing).out);
  check('3 brak pliku: select -> wszyscy RUN, nikt nie pominięty', sel.run.length === 2 && sel.skip.length === 0);
}

// 6: uszkodzony dziennik -> jawny błąd, nie ciche zero
{
  const good = ran('demo', 'nitpicker', zeros(10));
  const variants = {
    'zły JSON': [...good, '{to nie jest json'],
    'brak findings przy ran': [...good, JSON.stringify({ v: 1, ts: '2026-10-01T00:00:00Z', project: 'demo', reviewer: 'newbie', outcome: 'ran' })],
    'ujemne findings': [...good, JSON.stringify({ v: 1, ts: '2026-10-01T00:00:00Z', project: 'demo', reviewer: 'newbie', outcome: 'ran', findings: -1 })],
    'zły outcome': [...good, JSON.stringify({ v: 1, ts: '2026-10-01T00:00:00Z', project: 'demo', reviewer: 'newbie', outcome: 'maybe' })],
    'zła wersja': [...good, JSON.stringify({ v: 2, ts: '2026-10-01T00:00:00Z', project: 'demo', reviewer: 'newbie', outcome: 'skipped' })],
    'wpis nie-obiekt': [...good, '42'],
  };
  for (const [name, lines] of Object.entries(variants)) {
    const f = logFile(`bad-${name.replace(/\W+/g, '_')}`, lines);
    for (const args of [['--project', 'demo'], ['--json', '--project', 'demo'], ['--select', 'nitpicker', '--project', 'demo']]) {
      const r = cli(args, f);
      check(`6 ${name} [${args[0]}]: exit 2`, r.code === 2, `code=${r.code}`);
      check(`6 ${name} [${args[0]}]: numer linii w błędzie`, new RegExp(`:${good.length + 1}:`).test(r.err), r.err);
      check(`6 ${name} [${args[0]}]: brak wyniku na stdout (nie ciche zero)`, r.out.trim() === '', r.out);
    }
  }
}

// 7: --record
{
  const f = path.join(tmp, 'rec.jsonl');
  const r1 = cli(['--record', '--project', 'demo', '--branch', 'feature/x', '--ran', 'reviewer-eagle=2,newbie=0', '--skipped', 'nitpicker'], f);
  check('7 record: exit 0', r1.code === 0, r1.err);
  const written = fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check('7 record: 3 wpisy, prefiks reviewer- znormalizowany', written.length === 3 && written[0].reviewer === 'eagle' && written[0].findings === 2 && written[2].outcome === 'skipped');
  check('7 record: brak treści poza liczbami (klucze)', written.every((w) => Object.keys(w).every((k) => ['v', 'ts', 'project', 'branch', 'reviewer', 'outcome', 'findings'].includes(k))));

  const before = fs.readFileSync(f, 'utf8');
  for (const [name, args] of Object.entries({
    'NEVER_GATE jako pominięty': ['--record', '--project', 'demo', '--skipped', 'security'],
    'zły format --ran': ['--record', '--project', 'demo', '--ran', 'eagle'],
    'ujemne': ['--record', '--project', 'demo', '--ran', 'eagle=-1'],
    'zła nazwa': ['--record', '--project', 'demo', '--ran', 'Ea gle=1'],
    'brak projektu': ['--record', '--ran', 'eagle=1'],
    'pusty zapis': ['--record', '--project', 'demo'],
    'duplikat': ['--record', '--project', 'demo', '--ran', 'eagle=1,eagle=2'],
  })) {
    const r = cli(args, f);
    check(`7 record odrzuca: ${name}`, r.code === 1 && r.err.length > 0, `code=${r.code} ${r.err}`);
  }
  check('7 record: odrzucone wywołania nic nie zapisały', fs.readFileSync(f, 'utf8') === before);
  check('7 record: NEVER_GATE jako ran jest dozwolone', cli(['--record', '--project', 'demo', '--ran', 'security=0'], f).code === 0);

  const e2e = path.join(tmp, 'e2e.jsonl');
  for (let i = 0; i < 10; i += 1) cli(['--record', '--project', 'demo', '--ran', 'nitpicker=0,security=0,eagle=1'], e2e);
  const s = Object.fromEntries(JSON.parse(cli(['--json', '--project', 'demo'], e2e).out).reviewers.map((x) => [x.reviewer, x]));
  check('7 e2e: 10x --record zer -> nitpicker kandydat', s.nitpicker.gateCandidate === true);
  check('7 e2e: security po 10 zerach nie jest kandydatem', s.security.gateCandidate === false && s.security.neverGate === true);
  check('7 e2e: eagle z findingami nie jest kandydatem', s.eagle.gateCandidate === false);
  // zapis do dziennika, w którym jest śmieć, nie maskuje go przy odczycie
  fs.appendFileSync(e2e, 'śmieci\n');
  check('7 e2e: śmieć dopisany do dziennika -> odczyt exit 2', cli(['--project', 'demo'], e2e).code === 2);
}

// zmienna środowiskowa wskazuje plik
{
  const f = logFile('env', ran('demo', 'nitpicker', zeros(10)));
  const r = spawnSync('node', [CLI, '--json', '--project', 'demo'], { encoding: 'utf8', env: { ...process.env, REVIEW_PANEL_STATS_FILE: f } });
  check('REVIEW_PANEL_STATS_FILE wskazuje dziennik', r.status === 0 && JSON.parse(r.stdout).reviewers[0].gateCandidate === true, r.stderr);
}

// błędy użycia
{
  check('nieznany argument -> exit 1', cli(['--nie-ma'], null).code === 1);
  check('--project bez wartości -> exit 1', cli(['--project'], null).code === 1);
}

// 8: --check-config
{
  const ok = cli(['--check-config'], path.join(tmp, 'brak.jsonl'));
  check('8 check-config przechodzi na repo', ok.code === 0 && /OK/.test(ok.out), ok.out + ok.err);
  const corrupt = logFile('cfg-bad', ['nie json']);
  const bad = cli(['--check-config'], corrupt);
  check('8 check-config pada na uszkodzonym dzienniku', bad.code === 1 && /uszkodzony JSON/.test(bad.err), bad.err);

  // repo bez podpięcia w skillu/komendzie i bez agentów -> problemy z konkretnych plików
  const fake = path.join(tmp, 'fake-repo');
  fs.mkdirSync(path.join(fake, 'skills', 'quality', 'review-panel'), { recursive: true });
  fs.mkdirSync(path.join(fake, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(fake, 'skills', 'quality', 'review-panel', 'SKILL.md'), '# bez wzmianki\n');
  fs.writeFileSync(path.join(fake, 'commands', 'review-panel.md'), '# bez wzmianki\n');
  const probe = spawnSync('node', ['--input-type=module', '-e', `
    import { checkConfig } from ${JSON.stringify(CLI)};
    console.log(JSON.stringify(checkConfig(${JSON.stringify(path.join(tmp, 'brak.jsonl'))}, ${JSON.stringify(fake)})));`], { encoding: 'utf8' });
  const problems = probe.status === 0 ? JSON.parse(probe.stdout) : [];
  check('8 check-config: brak agentów NEVER_GATE zgłoszony', problems.some((p) => p.includes('reviewer-security.md')), probe.stderr + probe.stdout);
  check('8 check-config: brak podpięcia w skillu i komendzie zgłoszony',
    problems.some((p) => p.includes('SKILL.md') && p.includes('--select')) && problems.some((p) => p.includes('commands/review-panel.md') && p.includes('--record')));
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) {
  console.error(`eval reviewer-stats: ${failures}/${checks} kontroli nie przeszło`);
  process.exit(1);
}
console.log(`eval reviewer-stats: ${checks} kontroli OK`);
