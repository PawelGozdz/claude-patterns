#!/usr/bin/env node
/**
 * tests/flow-evals/reviewer-stats/run.js — eval L1 adaptacyjnego doboru reviewerów (TASK-GSTACK-ADOPT-001, B3).
 *
 * DLACZEGO: reguła „pomiń reviewera po 10 pustych wywołaniach" może zawieść na dwa sposoby, oba groźne:
 * wyciąć reviewera za wcześnie albo wyciąć takiego, którego nigdy nie wolno (security), a uszkodzony
 * wpis, zamiast zatrzymać dobór, mógłby po cichu wyjść jako „zero findingów" i wyciąć wszystkich.
 * Od przeniesienia statystyki do telemetrii v1 (ADR 0012, aneks „review-panel") dane to zdarzenia
 * `process: review-panel`; eval buduje je ręcznie (niezależnie od helpera emisji), więc pilnuje też kontraktu schematu.
 * Wszystko w katalogach tymczasowych: CLAUDE_TELEMETRY_DIR i HOME wskazują na tmp, prawdziwe dane nie są dotykane.
 *
 * Kontrakty:
 *   1. seria zer >= 10 (od końca) -> GATE_CANDIDATE, SKIP; 9 -> nie; finding w ostatnim wywołaniu zeruje serię
 *   2. NEVER_GATE (security, compliance, pragmatist) nie jest kandydatem mimo 15 zer; decyzja RUN
 *   3. brak katalogu / brak wpisów reviewera = „brak danych" = RUN (nic nie znika po cichu)
 *   4. pominięcia nie liczą się jako wywołania; po PROBE_EVERY pominięciach kandydat dostaje PROBE, finding go uwalnia
 *   5. statystyka per projekt; --all-projects sumuje; cudze zdarzenia telemetrii nie wpływają na wynik
 *   6. uszkodzone zdarzenie review-panel (zły JSON, brak findings, zły outcome, zła wersja, pole spoza schematu) -> exit 2, numer linii, brak tabeli
 *   7. --record: zdarzenia telemetrii zgodne ze schematem, walidacja wejścia, odmowa zapisu NEVER_GATE jako pominiętego, end-to-end 10x -> kandydat
 *   8. --check-config: przechodzi na repo; pada przy uszkodzonym zdarzeniu / starym dzienniku i przy repo bez podpięcia
 *   9. migracja starego dziennika: brak pliku = nic; import + .migrated; idempotencja; uszkodzony plik nietknięty; REVIEW_PANEL_STATS_FILE już nie działa
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CLI = path.join(REPO, 'scripts', 'reviewer-stats.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-reviewer-stats-'));
const HOME = path.join(tmp, 'home');
fs.mkdirSync(HOME, { recursive: true });
const NOLEGACY = path.join(tmp, 'brak-dziennika.jsonl');

let failures = 0;
let checks = 0;
function check(name, cond, detail = '') {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Zdarzenie telemetrii v1 zbudowane ręcznie: ran -> outcome ok + step.findings, skipped -> outcome skipped.
let seq = 0;
function ev(project, reviewer, outcome, findings, extra = {}) {
  const e = {
    v: 1, id: crypto.randomUUID(), ts: new Date(Date.UTC(2026, 9, 1, 0, 0, seq++)).toISOString(), host: 'aaaaaaaaaaaa',
    kind: 'step.end', process: 'review-panel', project, runId: `rp-test-${seq}`,
    step: outcome === 'ran' ? { id: reviewer, role: reviewer, findings } : { id: reviewer, role: reviewer },
    outcome: outcome === 'ran' ? 'ok' : 'skipped',
    ...extra,
  };
  return JSON.stringify(e);
}
const line = (project, reviewer, outcome, findings) => ev(project, reviewer, outcome, findings);
function ran(project, reviewer, counts) { return counts.map((n) => line(project, reviewer, 'ran', n)); }
function skipped(project, reviewer, n) { return Array.from({ length: n }, () => line(project, reviewer, 'skipped')); }

// Katalog zdarzeń z jednym plikiem miesiąca.
function eventsDirWith(name, lines) {
  const d = path.join(tmp, name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, '2026-10.jsonl'), lines.join('\n') + '\n');
  return d;
}
function cli(args, dir, env = {}) {
  const r = spawnSync('node', [CLI, ...args, '--legacy-file', NOLEGACY], {
    encoding: 'utf8', env: { ...process.env, HOME, CLAUDE_TELEMETRY_DIR: dir, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function cliLegacy(args, dir, legacy) {
  const r = spawnSync('node', [CLI, ...args, '--legacy-file', legacy], { encoding: 'utf8', env: { ...process.env, HOME, CLAUDE_TELEMETRY_DIR: dir } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function stats(dir, project = 'demo') {
  const r = cli(['--json', '--project', project], dir);
  return { r, byName: r.code === 0 ? Object.fromEntries(JSON.parse(r.out).reviewers.map((s) => [s.reviewer, s])) : {} };
}
const readAll = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
  .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

const zeros = (n) => Array(n).fill(0);

// 1 + 2 + 4: główne scenariusze jednego katalogu zdarzeń (+ cudze zdarzenia, które mają być ignorowane)
const foreign = JSON.stringify({ v: 1, id: crypto.randomUUID(), ts: '2026-10-01T00:00:00.000Z', host: 'aaaaaaaaaaaa', kind: 'deviation', process: 'orchestrate', project: 'demo', runId: 'r1', signature: 'review-panel-nitpicker', cause: 'other' });
const main = eventsDirWith('main', [
  ...ran('demo', 'nitpicker', zeros(10)),                 // dokładnie próg -> kandydat
  foreign,                                                // napis review-panel w cudzym zdarzeniu: ignorowany
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
  check('5 cudze zdarzenie z napisem review-panel nie tworzy reviewera', !('review-panel-nitpicker' in s));

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

// 3: brak katalogu
{
  const missing = path.join(tmp, 'nie-ma-katalogu');
  const r = cli(['--project', 'demo'], missing);
  check('3 brak katalogu: exit 0 i komunikat „brak danych"', r.code === 0 && /Brak danych/.test(r.out), r.out + r.err);
  const j = JSON.parse(cli(['--json', '--project', 'demo'], missing).out);
  check('3 brak katalogu: --json pusta lista', Array.isArray(j.reviewers) && j.reviewers.length === 0);
  const sel = JSON.parse(cli(['--select', 'eagle,nitpicker', '--json', '--project', 'demo'], missing).out);
  check('3 brak katalogu: select -> wszyscy RUN, nikt nie pominięty', sel.run.length === 2 && sel.skip.length === 0);
}

// 6: uszkodzone zdarzenie review-panel -> jawny błąd, nie ciche zero
{
  const good = ran('demo', 'nitpicker', zeros(10));
  const valid = () => JSON.parse(line('demo', 'newbie', 'ran', 0));
  const variants = {
    'zły JSON (ucięta linia)': line('demo', 'newbie', 'ran', 0).slice(0, -12),
    'brak findings przy ok': JSON.stringify({ ...valid(), step: { id: 'newbie', role: 'newbie' } }),
    'ujemne findings': JSON.stringify({ ...valid(), step: { id: 'newbie', role: 'newbie', findings: -1 } }),
    'findings niecałkowite': JSON.stringify({ ...valid(), step: { id: 'newbie', role: 'newbie', findings: 1.5 } }),
    'findings przy skipped': JSON.stringify({ ...valid(), outcome: 'skipped' }),
    'zły outcome': JSON.stringify({ ...valid(), outcome: 'failed' }),
    'zła wersja': JSON.stringify({ ...valid(), v: 2 }),
    'zły kind': JSON.stringify({ ...valid(), kind: 'run.end' }),
    'step.id ≠ step.role': JSON.stringify({ ...valid(), step: { id: 'newbie', role: 'eagle', findings: 0 } }),
    'zła nazwa reviewera': JSON.stringify({ ...valid(), step: { id: 'Zły Reviewer', role: 'Zły Reviewer', findings: 0 } }),
    'pole spoza schematu': JSON.stringify({ ...valid(), branch: 'feature/x' }),
    'wpis nie-obiekt': '"review-panel"',
  };
  for (const [name, bad] of Object.entries(variants)) {
    const d = eventsDirWith(`bad-${name.replace(/\W+/g, '_')}`, [...good, bad]);
    for (const args of [['--project', 'demo'], ['--json', '--project', 'demo'], ['--select', 'nitpicker', '--project', 'demo']]) {
      const r = cli(args, d);
      check(`6 ${name} [${args[0]}]: exit 2`, r.code === 2, `code=${r.code} ${r.err}`);
      check(`6 ${name} [${args[0]}]: numer linii w błędzie`, new RegExp(`2026-10\\.jsonl:${good.length + 1}:`).test(r.err), r.err);
      check(`6 ${name} [${args[0]}]: brak wyniku na stdout (nie ciche zero)`, r.out.trim() === '', r.out);
    }
  }
  // kierunek odwrotny: uszkodzona linia cudzego procesu (bez napisu review-panel) nie blokuje doboru
  const d = eventsDirWith('foreign-garbage', [...good, '{to jest śmieć innego procesu']);
  check('6 uszkodzona linia cudzego procesu nie blokuje statystyki', stats(d).r.code === 0);
}

// 7: --record
{
  const d = path.join(tmp, 'rec');
  const r1 = cli(['--record', '--project', 'demo', '--branch', 'feature/x', '--ran', 'reviewer-eagle=2,newbie=0', '--skipped', 'nitpicker'], d);
  check('7 record: exit 0', r1.code === 0, r1.err);
  const written = readAll(d);
  check('7 record: 3 zdarzenia, prefiks reviewer- znormalizowany',
    written.length === 3 && written[0].step.id === 'eagle' && written[0].step.findings === 2 && written[2].outcome === 'skipped', JSON.stringify(written));
  check('7 record: process review-panel, step.end, wspólny runId przebiegu',
    written.every((w) => w.process === 'review-panel' && w.kind === 'step.end' && w.project === 'demo' && w.runId === written[0].runId));
  check('7 record: ran -> ok + findings, skipped -> skipped bez findings',
    written[0].outcome === 'ok' && written[1].outcome === 'ok' && written[1].step.findings === 0 && !('findings' in written[2].step));
  check('7 record: brak treści poza liczbami (klucze), gałąź nie trafia do telemetrii',
    written.every((w) => Object.keys(w).every((k) => ['v', 'id', 'ts', 'host', 'kind', 'process', 'project', 'runId', 'step', 'outcome'].includes(k))
      && Object.keys(w.step).every((k) => ['id', 'role', 'findings'].includes(k)))
    && !fs.readFileSync(path.join(d, fs.readdirSync(d)[0]), 'utf8').includes('feature/x'));
  const sch = spawnSync('node', ['--input-type=module', '-e', `
    import { validateEvent } from ${JSON.stringify(path.join(REPO, 'scripts', 'lib', 'telemetry-events.mjs'))};
    const evs = ${JSON.stringify(written)};
    console.log(JSON.stringify(evs.map((e) => validateEvent(e))));`], { encoding: 'utf8' });
  check('7 record: zdarzenia zgodne ze schematem telemetrii', sch.status === 0 && JSON.parse(sch.stdout).every((e) => e.length === 0), sch.stderr + sch.stdout);

  const snapshot = () => JSON.stringify(readAll(d));
  const before = snapshot();
  for (const [name, args] of Object.entries({
    'NEVER_GATE jako pominięty': ['--record', '--project', 'demo', '--skipped', 'security'],
    'zły format --ran': ['--record', '--project', 'demo', '--ran', 'eagle'],
    'ujemne': ['--record', '--project', 'demo', '--ran', 'eagle=-1'],
    'zła nazwa': ['--record', '--project', 'demo', '--ran', 'Ea gle=1'],
    'brak projektu': ['--record', '--ran', 'eagle=1'],
    'pusty zapis': ['--record', '--project', 'demo'],
    'duplikat': ['--record', '--project', 'demo', '--ran', 'eagle=1,eagle=2'],
  })) {
    const r = cli(args, d);
    check(`7 record odrzuca: ${name}`, r.code === 1 && r.err.length > 0, `code=${r.code} ${r.err}`);
  }
  check('7 record: odrzucone wywołania nic nie zapisały', snapshot() === before);
  check('7 record: NEVER_GATE jako ran jest dozwolone', cli(['--record', '--project', 'demo', '--ran', 'security=0'], d).code === 0);

  // zapis niemożliwy (CLAUDE_TELEMETRY_DIR wskazuje na plik) -> jawny błąd exit 1, nie ciche „zapisano"
  const blocker = path.join(tmp, 'plik-zamiast-katalogu');
  fs.writeFileSync(blocker, 'x');
  const fail = cli(['--record', '--project', 'demo', '--ran', 'eagle=1'], blocker);
  check('7 record: błąd zapisu -> exit 1 z komunikatem', fail.code === 1 && /nie mogę zapisać/.test(fail.err), `code=${fail.code} ${fail.err}`);

  const e2e = path.join(tmp, 'e2e');
  for (let i = 0; i < 10; i += 1) cli(['--record', '--project', 'demo', '--ran', 'nitpicker=0,security=0,eagle=1'], e2e);
  const s = Object.fromEntries(JSON.parse(cli(['--json', '--project', 'demo'], e2e).out).reviewers.map((x) => [x.reviewer, x]));
  check('7 e2e: 10x --record zer -> nitpicker kandydat', s.nitpicker.gateCandidate === true);
  check('7 e2e: security po 10 zerach nie jest kandydatem', s.security.gateCandidate === false && s.security.neverGate === true);
  check('7 e2e: eagle z findingami nie jest kandydatem', s.eagle.gateCandidate === false);
  // zapis do katalogu, w którym jest uszkodzone zdarzenie panelu, nie maskuje go przy odczycie
  fs.appendFileSync(path.join(e2e, fs.readdirSync(e2e)[0]), '{"process":"review-panel", śmieci\n');
  check('7 e2e: śmieć dopisany do zdarzeń -> odczyt exit 2', cli(['--project', 'demo'], e2e).code === 2);
}

// zmienne środowiskowe
{
  const d = eventsDirWith('env', ran('demo', 'nitpicker', zeros(10)));
  const r = spawnSync('node', [CLI, '--json', '--project', 'demo', '--legacy-file', NOLEGACY], { encoding: 'utf8', env: { ...process.env, HOME, CLAUDE_TELEMETRY_DIR: d } });
  check('CLAUDE_TELEMETRY_DIR wskazuje katalog zdarzeń', r.status === 0 && JSON.parse(r.stdout).reviewers[0].gateCandidate === true, r.stderr);
  // REVIEW_PANEL_STATS_FILE (stary dziennik) już nie jest czytany
  const old = path.join(tmp, 'old-env.jsonl');
  fs.writeFileSync(old, Array.from({ length: 10 }, (_, i) => JSON.stringify({ v: 1, ts: `2026-10-01T00:00:0${i}.000Z`, project: 'demo', reviewer: 'ops', outcome: 'ran', findings: 0 })).join('\n') + '\n');
  const e = spawnSync('node', [CLI, '--json', '--project', 'demo', '--legacy-file', NOLEGACY], { encoding: 'utf8', env: { ...process.env, HOME, CLAUDE_TELEMETRY_DIR: path.join(tmp, 'pusty'), REVIEW_PANEL_STATS_FILE: old } });
  check('REVIEW_PANEL_STATS_FILE jest ignorowane', e.status === 0 && JSON.parse(e.stdout).reviewers.length === 0, e.stderr + e.stdout);
}

// błędy użycia
{
  check('nieznany argument -> exit 1', cli(['--nie-ma'], path.join(tmp, 'x')).code === 1);
  check('--project bez wartości -> exit 1', cli(['--project'], path.join(tmp, 'x')).code === 1);
  check('--file (stary przełącznik) -> exit 1', cli(['--file', 'a'], path.join(tmp, 'x')).code === 1);
}

// 9: migracja starego dziennika
{
  const oldLine = (ts, reviewer, outcome, findings, extra = {}) => JSON.stringify({ v: 1, ts, project: 'demo', branch: 'feature/stary', reviewer, outcome, ...(outcome === 'ran' ? { findings } : {}), ...extra });
  const legacyLines = [
    ...Array.from({ length: 9 }, (_, i) => oldLine(`2026-08-01T00:00:0${i}.000Z`, 'nitpicker', 'ran', 0)),
    oldLine('2026-08-02T00:00:00.000Z', 'eagle', 'ran', 3),
    oldLine('2026-08-02T00:00:01.000Z', 'user', 'skipped'),
  ];
  const legacyText = legacyLines.join('\n') + '\n';
  const fresh = (name) => {
    const dir = path.join(tmp, `mig-${name}`);
    const legacy = path.join(tmp, `mig-${name}.invocations.jsonl`);
    return { dir, legacy };
  };

  // brak pliku -> nic
  {
    const { dir, legacy } = fresh('none');
    const r = cliLegacy(['--json', '--project', 'demo'], dir, legacy);
    check('9 brak starego dziennika: exit 0, brak komunikatu o migracji', r.code === 0 && !/zmigrowano/.test(r.err), r.err);
    check('9 brak starego dziennika: nie powstaje .migrated ani katalog zdarzeń', !fs.existsSync(`${legacy}.migrated`) && !fs.existsSync(dir));
  }

  // import + .migrated + idempotencja + dalszy zapis
  {
    const { dir, legacy } = fresh('ok');
    fs.writeFileSync(legacy, legacyText);
    const r = cliLegacy(['--json', '--project', 'demo'], dir, legacy);
    check('9 migracja: exit 0 i komunikat na stderr', r.code === 0 && /zmigrowano 11 wpis/.test(r.err), `${r.code} ${r.err}`);
    check('9 migracja: stdout to czysty JSON', (() => { try { JSON.parse(r.out); return true; } catch { return false; } })(), r.out);
    check('9 migracja: plik przemianowany na .migrated, oryginał zniknął, treść bajt w bajt',
      !fs.existsSync(legacy) && fs.existsSync(`${legacy}.migrated`) && fs.readFileSync(`${legacy}.migrated`, 'utf8') === legacyText);
    const evs = readAll(dir);
    check('9 migracja: 11 zdarzeń review-panel bez gałęzi, w miesiącu ze starego ts',
      evs.length === 11 && evs.every((e) => e.process === 'review-panel') && fs.existsSync(path.join(dir, '2026-08.jsonl'))
      && !JSON.stringify(evs).includes('feature/stary'));
    const s = Object.fromEntries(JSON.parse(r.out).reviewers.map((x) => [x.reviewer, x]));
    check('9 migracja: statystyka widzi stare dane (9 zer, finding, pominięcie)',
      s.nitpicker?.invocations === 9 && s.nitpicker.zeroStreak === 9 && s.eagle?.findings === 3 && s.user?.skippedTotal === 1, JSON.stringify(s));

    // drugi raz nic nie importuje i niczego nie dubluje
    const again = cliLegacy(['--json', '--project', 'demo'], dir, legacy);
    check('9 migracja: ponowne wywołanie nie dubluje', again.code === 0 && readAll(dir).length === 11 && !/zmigrowano/.test(again.err));

    // nowy zapis po migracji: 10. zero domyka serię (kolejność po ts: stare przed nowymi)
    const rec = cliLegacy(['--record', '--project', 'demo', '--ran', 'nitpicker=0'], dir, legacy);
    const s2 = Object.fromEntries(JSON.parse(cliLegacy(['--json', '--project', 'demo'], dir, legacy).out).reviewers.map((x) => [x.reviewer, x]));
    check('9 migracja + zapis: 9 starych zer + 1 nowe = kandydat', rec.code === 0 && s2.nitpicker.zeroStreak === 10 && s2.nitpicker.gateCandidate === true, JSON.stringify(s2.nitpicker));

    // drugi stary dziennik nie nadpisuje poprzedniego archiwum
    fs.writeFileSync(legacy, oldLine('2026-09-01T00:00:00.000Z', 'ops', 'ran', 1) + '\n');
    const third = cliLegacy(['--json', '--project', 'demo'], dir, legacy);
    const archives = fs.readdirSync(tmp).filter((f) => f.startsWith('mig-ok.invocations.jsonl.migrated'));
    check('9 migracja: istniejące .migrated nie jest nadpisane', third.code === 0 && archives.length === 2 && fs.readFileSync(`${legacy}.migrated`, 'utf8') === legacyText, archives.join(','));
  }

  // pozostałość po przerwanej migracji (.migrating + zdarzenia już zapisane) -> dokończenie bez duplikatów
  {
    const { dir, legacy } = fresh('crash');
    fs.writeFileSync(legacy, legacyText);
    check('9 crash: pierwsze wywołanie importuje', cliLegacy(['--project', 'demo'], dir, legacy).code === 0);
    fs.copyFileSync(`${legacy}.migrated`, `${legacy}.migrating`); // jakby przemianowanie na .migrated się nie udało
    const r = cliLegacy(['--project', 'demo'], dir, legacy);
    check('9 crash: pozostałość .migrating dokończona bez duplikatów', r.code === 0 && readAll(dir).length === 11 && !fs.existsSync(`${legacy}.migrating`), `${r.err} ${readAll(dir).length}`);
  }

  // uszkodzony stary dziennik: exit 2, plik nietknięty, nic nie zaimportowane
  {
    const { dir, legacy } = fresh('bad');
    const bad = [...legacyLines, '{to nie jest json'].join('\n') + '\n';
    fs.writeFileSync(legacy, bad);
    for (const args of [['--project', 'demo'], ['--select', 'nitpicker', '--project', 'demo'], ['--record', '--project', 'demo', '--ran', 'eagle=1']]) {
      const r = cliLegacy(args, dir, legacy);
      check(`9 uszkodzony stary dziennik [${args[0]}]: exit 2 z numerem linii`, r.code === 2 && new RegExp(`:${legacyLines.length + 1}:`).test(r.err), `${r.code} ${r.err}`);
    }
    check('9 uszkodzony stary dziennik: plik nietknięty, brak .migrated/.migrating, brak zdarzeń',
      fs.readFileSync(legacy, 'utf8') === bad && !fs.existsSync(`${legacy}.migrated`) && !fs.existsSync(`${legacy}.migrating`) && !fs.existsSync(dir));
    const cfg = cliLegacy(['--check-config'], dir, legacy);
    check('9 check-config zgłasza uszkodzony stary dziennik i go nie migruje', cfg.code === 1 && /uszkodzony JSON/.test(cfg.err) && fs.existsSync(legacy), cfg.err);
  }
}

// 9b: równoległe uruchomienia na jednym starym dzienniku (rewizja po przeglądzie): dokładnie N zdarzeń, żaden proces nie pada stack trace'em
{
  const dir = path.join(tmp, 'mig-parallel');
  const legacy = path.join(tmp, 'mig-parallel.invocations.jsonl');
  const N = 1500;
  fs.writeFileSync(legacy, Array.from({ length: N }, (_, i) => JSON.stringify({
    v: 1, ts: new Date(Date.UTC(2026, 7, 1, 0, 0, i)).toISOString(), project: 'demo', reviewer: i % 2 ? 'eagle' : 'nitpicker', outcome: 'ran', findings: 0,
  })).join('\n') + '\n');
  const script = [1, 2, 3, 4].map((i) => `(node ${JSON.stringify(CLI)} --select eagle,nitpicker --project demo --json --legacy-file ${JSON.stringify(legacy)} > ${JSON.stringify(path.join(tmp, `par-o${i}`))} 2> ${JSON.stringify(path.join(tmp, `par-e${i}`))}; echo $? > ${JSON.stringify(path.join(tmp, `par-c${i}`))}) &`).join('\n') + '\nwait\n';
  spawnSync('sh', ['-c', script], { env: { ...process.env, HOME, CLAUDE_TELEMETRY_DIR: dir } });
  const codes = [1, 2, 3, 4].map((i) => fs.readFileSync(path.join(tmp, `par-c${i}`), 'utf8').trim());
  const errs = [1, 2, 3, 4].map((i) => fs.readFileSync(path.join(tmp, `par-e${i}`), 'utf8'));
  const all = readAll(dir);
  check('9b równolegle: wszystkie 4 procesy kończą się exit 0', codes.every((c) => c === '0'), `${codes} ${errs.join('|').slice(0, 300)}`);
  check('9b równolegle: żaden proces nie kończy stack trace\'em', errs.every((e) => !/\n\s+at /.test(e) && !/ENOENT/.test(e)), errs.join('|').slice(0, 300));
  check(`9b równolegle: dokładnie ${N} zdarzeń i ${N} unikalnych id`, all.length === N && new Set(all.map((e) => e.id)).size === N, `${all.length} / ${new Set(all.map((e) => e.id)).size}`);
  check('9b równolegle: .migrated istnieje, oryginał, .migrating i blokada zniknęły',
    fs.existsSync(`${legacy}.migrated`) && !fs.existsSync(legacy) && !fs.existsSync(`${legacy}.migrating`) && !fs.existsSync(`${legacy}.lock`));
  const out = codes.map((_, i) => JSON.parse(fs.readFileSync(path.join(tmp, `par-o${i + 1}`), 'utf8')));
  check('9b równolegle: każdy proces widzi pełną statystykę (nie połowiczną)', out.every((j) => j.run.length + j.skip.length === 2));
  const st = Object.fromEntries(JSON.parse(cliLegacy(['--json', '--project', 'demo'], dir, legacy).out).reviewers.map((x) => [x.reviewer, x]));
  check('9b równolegle: liczniki = N/2 na reviewera', st.eagle.invocations === N / 2 && st.nitpicker.invocations === N / 2, JSON.stringify(st));

  // zastarzała blokada (proces zabity w trakcie) jest odzyskiwana; świeża blokada nie jest ruszana, tylko czekamy i kończymy błędem
  const stale = path.join(tmp, 'mig-stale.invocations.jsonl');
  fs.writeFileSync(stale, JSON.stringify({ v: 1, ts: '2026-08-01T00:00:00.000Z', project: 'demo', reviewer: 'ops', outcome: 'ran', findings: 0 }) + '\n');
  fs.writeFileSync(`${stale}.lock`, 'pid:0');
  const old = new Date(Date.now() - 3600 * 1000);
  fs.utimesSync(`${stale}.lock`, old, old);
  const r = cliLegacy(['--json', '--project', 'demo'], path.join(tmp, 'mig-stale'), stale);
  check('9b zastarzała blokada odzyskana, migracja przechodzi', r.code === 0 && fs.existsSync(`${stale}.migrated`) && !fs.existsSync(`${stale}.lock`), `${r.code} ${r.err}`);
}

// 10: drobne poprawki po przeglądzie
{
  // duplikat zdarzenia (to samo id) liczy się raz — nawet gdyby migracja kiedyś się zdublowała
  const one = line('demo', 'ops', 'ran', 0);
  const dupDir = eventsDirWith('dups', [one, one, one]);
  check('10 duplikat id liczony raz', stats(dupDir).byName.ops?.invocations === 1);

  // zdarzenia natywne: kolejność zapisu, nie ts (cofnięty zegar nie ukrywa findingu)
  const back = eventsDirWith('clock-back', [
    ...ran('demo', 'nitpicker', zeros(10)),
    JSON.stringify({ ...JSON.parse(line('demo', 'nitpicker', 'ran', 3)), ts: '2020-01-01T00:00:00.000Z' }),
  ]);
  const b = stats(back).byName.nitpicker;
  check('10 cofnięty zegar: finding zapisany później zeruje serię', b.zeroStreak === 0 && b.decision === 'RUN', JSON.stringify(b));

  // zaimportowane (rpm-) są porządkowane po ts, niezależnie od kolejności w pliku
  const rpm = (ts, n) => JSON.stringify({ ...JSON.parse(line('demo', 'nitpicker', 'ran', n)), ts, runId: `rpm-${ts.slice(0, 4)}${n}` });
  const mig = eventsDirWith('rpm-order', [rpm('2026-08-02T00:00:00.000Z', 0), rpm('2026-08-01T00:00:00.000Z', 5)]);
  const m = stats(mig).byName.nitpicker;
  check('10 zaimportowane wpisy sortowane po ts (finding z 08-01 jest przed zerem z 08-02)', m.zeroStreak === 1, JSON.stringify(m));

  // niepoprawny ts = jawny błąd z numerem linii
  const nan = eventsDirWith('bad-ts', [...ran('demo', 'nitpicker', zeros(2)), JSON.stringify({ ...JSON.parse(line('demo', 'newbie', 'ran', 0)), ts: 'wczoraj' })]);
  const r = cli(['--project', 'demo'], nan);
  check('10 niepoprawny ts: exit 2 z numerem linii', r.code === 2 && /2026-10\.jsonl:3:.*ts/.test(r.err) && r.out.trim() === '', `${r.code} ${r.err}`);

  // projekt „.” i „..” odrzucony w obu miejscach (CLI i schemat), nazwy z „_” i kropką w środku przechodzą
  for (const bad of ['.', '..']) {
    const rr = cli(['--record', '--project', bad, '--ran', 'eagle=1'], path.join(tmp, 'dots'));
    check(`10 --project ${bad} odrzucony`, rr.code === 1 && !fs.existsSync(path.join(tmp, 'dots')), `${rr.code} ${rr.err}`);
  }
  for (const good of ['_claude-patterns', 'a.b', '.hidden', '...']) {
    const rr = cli(['--record', '--project', good, '--ran', 'eagle=1'], path.join(tmp, `dots-ok-${good}`));
    check(`10 --project ${good} dozwolony`, rr.code === 0, `${rr.code} ${rr.err}`);
  }
}

// 8: --check-config
{
  const ok = cli(['--check-config'], path.join(tmp, 'brak'));
  check('8 check-config przechodzi na repo', ok.code === 0 && /OK/.test(ok.out), ok.out + ok.err);
  const corrupt = eventsDirWith('cfg-bad', ['{"process":"review-panel", nie json']);
  const bad = cli(['--check-config'], corrupt);
  check('8 check-config pada na uszkodzonym zdarzeniu', bad.code === 1 && /uszkodzony JSON/.test(bad.err), bad.err);

  // repo bez podpięcia w skillu/komendzie i bez agentów -> problemy z konkretnych plików
  const fake = path.join(tmp, 'fake-repo');
  fs.mkdirSync(path.join(fake, 'skills', 'quality', 'review-panel'), { recursive: true });
  fs.mkdirSync(path.join(fake, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(fake, 'skills', 'quality', 'review-panel', 'SKILL.md'), '# bez wzmianki\n');
  fs.writeFileSync(path.join(fake, 'commands', 'review-panel.md'), '# bez wzmianki\n');
  const probe = spawnSync('node', ['--input-type=module', '-e', `
    import { checkConfig } from ${JSON.stringify(CLI)};
    console.log(JSON.stringify(checkConfig({ repo: ${JSON.stringify(fake)}, dir: ${JSON.stringify(path.join(tmp, 'brak'))}, legacyFile: ${JSON.stringify(NOLEGACY)} })));`], { encoding: 'utf8' });
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
