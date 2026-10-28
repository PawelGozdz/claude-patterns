#!/usr/bin/env node
/**
 * tests/flow-evals/eval-policy/run.js — eval L1 dla tests/flow-evals/lib/eval-policy.mjs (TASK-GSTACK-ADOPT-001 B2).
 * Uruchom przy każdej zmianie polityki powtórzeń: node tests/flow-evals/eval-policy/run.js
 *
 * E1 panelVerdict   — tabela przypadków granicznych: 2/3, 1/3, brak kontraktu, mediana parzysta/nieparzysta,
 *                     błędy wejścia (nieznany rodzaj, zła liczba prób).
 * E2 collectAttempts — dokładnie tyle prób, ile przewiduje polityka; wyjątek próby nie jest ponawiany.
 * E3 recordRerun    — jeden zapisany rerun na (run, przypadek), drugi = błąd; uszkodzony log = błąd jawny.
 *
 * Zero LLM, zero sieci. Dziennik rerunów z E3 trafia do katalogu tymczasowego, nie do repo.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) process.stdout.write(`  ✅ ${name}\n`);
  else { failed++; process.stdout.write(`  ❌ ${name}${detail ? ` — ${detail}` : ''}\n`); }
};

const P = (contractViolation = false) => ({ pass: true, contractViolation });
const F = (contractViolation = false) => ({ pass: false, contractViolation });
const J = (scores) => ({ scores });

async function main() {
  const pol = await import('../lib/eval-policy.mjs');
  const { panelVerdict, median, collectAttempts, recordRerun, rerunCount, rerunLogPath, EvalPolicyError } = pol;

  // ── E1: tabela przypadków ────────────────────────────────────────────────────
  process.stdout.write('E1 panelVerdict — przypadki graniczne\n');
  // expect: {verdict, passed, total} albo {throws: kod}
  const TABLE = [
    // rule: 1 próba, każda porażka = porażka
    ['rule: przeszła',                      'rule', [{ pass: true }],  {}, { verdict: 'PASS', passed: 1, total: 1 }],
    ['rule: nie przeszła',                  'rule', [{ pass: false }], {}, { verdict: 'FAIL', passed: 0, total: 1 }],
    ['rule: 2 próby = błąd liczby prób',    'rule', [{ pass: true }, { pass: true }], {}, { throws: 'BAD_ATTEMPT_COUNT' }],
    ['rule: 0 prób = błąd liczby prób',     'rule', [], {}, { throws: 'BAD_ATTEMPT_COUNT' }],
    ['rule: brak pola pass',                'rule', [{}], {}, { throws: 'BAD_RESULT' }],
    // behavior: >= 2/3 i brak naruszenia kontraktu
    ['behavior: 3/3',                       'behavior', [P(), P(), P()], {}, { verdict: 'PASS', passed: 3, total: 3 }],
    ['behavior: 2/3 (granica, PASS)',       'behavior', [P(), F(), P()], {}, { verdict: 'PASS', passed: 2, total: 3 }],
    ['behavior: 2/3, porażka na końcu',     'behavior', [P(), P(), F()], {}, { verdict: 'PASS', passed: 2, total: 3 }],
    ['behavior: 1/3 (FAIL)',                'behavior', [F(), P(), F()], {}, { verdict: 'FAIL', passed: 1, total: 3 }],
    ['behavior: 0/3',                       'behavior', [F(), F(), F()], {}, { verdict: 'FAIL', passed: 0, total: 3 }],
    ['behavior: 3/3 + naruszenie kontraktu w przechodzącej próbie', 'behavior', [P(), P(true), P()], {}, { verdict: 'FAIL', passed: 3, total: 3 }],
    ['behavior: 2/3 + naruszenie kontraktu w nieudanej próbie',     'behavior', [P(), F(true), P()], {}, { verdict: 'FAIL', passed: 2, total: 3 }],
    ['behavior: brak kontraktu (pole contractViolation)', 'behavior', [{ pass: true }, { pass: true }, { pass: true }], {}, { throws: 'BAD_RESULT' }],
    ['behavior: kontrakt nie-boolean',      'behavior', [P(), P(), { pass: true, contractViolation: 'no' }], {}, { throws: 'BAD_RESULT' }],
    ['behavior: 2 próby = błąd',            'behavior', [P(), P()], {}, { throws: 'BAD_ATTEMPT_COUNT' }],
    ['behavior: 4 próby = błąd',            'behavior', [P(), P(), P(), P()], {}, { throws: 'BAD_ATTEMPT_COUNT' }],
    ['behavior: nie-tablica',               'behavior', 'PPP', {}, { throws: 'BAD_RESULT' }],
    // judge: mediana z 3 próbek per wymiar
    ['judge: mediany równe progowi (PASS)', 'judge', [J({ a: 3, b: 4 }), J({ a: 3, b: 4 }), J({ a: 3, b: 4 })], {}, { verdict: 'PASS', passed: 2, total: 2, medians: { a: 3, b: 4 } }],
    ['judge: mediana 2 < progu 3 (FAIL)', 'judge', [J({ a: 2, b: 5 }), J({ a: 2, b: 5 }), J({ a: 2, b: 5 })], {}, { verdict: 'FAIL', passed: 1, total: 2, medians: { a: 2, b: 5 } }],
    ['judge: odstająca próbka nie zmienia mediany (5,1,1 -> 1)', 'judge', [J({ a: 5 }), J({ a: 1 }), J({ a: 1 })], {}, { verdict: 'FAIL', passed: 0, total: 1, medians: { a: 1 } }],
    ['judge: odstająca próbka w drugą stronę (1,5,5 -> 5)', 'judge', [J({ a: 1 }), J({ a: 5 }), J({ a: 5 })], {}, { verdict: 'PASS', passed: 1, total: 1, medians: { a: 5 } }],
    ['judge: własny próg 4',                'judge', [J({ a: 3 }), J({ a: 3 }), J({ a: 4 })], { threshold: 4 }, { verdict: 'FAIL', passed: 0, total: 1, medians: { a: 3 } }],
    ['judge: kolejność kluczy nieistotna',  'judge', [J({ a: 4, b: 2 }), J({ b: 2, a: 4 }), J({ a: 4, b: 2 })], {}, { verdict: 'FAIL', passed: 1, total: 2, medians: { a: 4, b: 2 } }],
    ['judge: różne wymiary w próbkach',     'judge', [J({ a: 4 }), J({ a: 4, b: 4 }), J({ a: 4 })], {}, { throws: 'BAD_RESULT' }],
    ['judge: ocena nie-liczba',             'judge', [J({ a: 4 }), J({ a: 'pięć' }), J({ a: 4 })], {}, { throws: 'BAD_RESULT' }],
    ['judge: NaN',                          'judge', [J({ a: 4 }), J({ a: NaN }), J({ a: 4 })], {}, { throws: 'BAD_RESULT' }],
    ['judge: pusty obiekt scores',          'judge', [J({}), J({}), J({})], {}, { throws: 'BAD_RESULT' }],
    ['judge: ocena poza skalą',             'judge', [J({ a: 4 }), J({ a: 9 }), J({ a: 4 })], { scale: { min: 1, max: 5 } }, { throws: 'BAD_RESULT' }],
    ['judge: 2 próbki = błąd',              'judge', [J({ a: 4 }), J({ a: 4 })], {}, { throws: 'BAD_ATTEMPT_COUNT' }],
    // rodzaj
    ['nieznany rodzaj',                     'flaky', [P()], {}, { throws: 'UNKNOWN_KIND' }],
    ['rodzaj null',                         null, [P()], {}, { throws: 'UNKNOWN_KIND' }],
    ['rodzaj z prototypu (toString)',       'toString', [P()], {}, { throws: 'UNKNOWN_KIND' }],
  ];
  for (const [name, kind, results, opts, expect] of TABLE) {
    let got; let err;
    try { got = panelVerdict(kind, results, opts); } catch (e) { err = e; }
    if (expect.throws) {
      check(name, err instanceof EvalPolicyError && err.code === expect.throws,
        err ? `kod ${err.code ?? err.name}: ${err.message}` : `nie rzuciło, zwróciło ${JSON.stringify(got)}`);
    } else {
      const okMedians = !expect.medians || JSON.stringify(got?.medians) === JSON.stringify(expect.medians);
      check(name, !err && got.verdict === expect.verdict && got.passed === expect.passed
        && got.total === expect.total && okMedians && typeof got.reason === 'string' && got.reason.length > 0,
      err ? `rzuciło ${err.message}` : JSON.stringify(got));
    }
  }

  process.stdout.write('E1b median — nieparzysta / parzysta liczba wartości\n');
  check('nieparzysta: [3,1,2] -> 2', median([3, 1, 2]) === 2);
  check('nieparzysta: jedna wartość', median([4]) === 4);
  check('parzysta: [1,2,3,4] -> 2.5', median([1, 2, 3, 4]) === 2.5);
  check('parzysta: [5,1] -> 3', median([5, 1]) === 3);
  check('nie mutuje wejścia', (() => { const a = [3, 1, 2]; median(a); return a.join() === '3,1,2'; })());
  for (const [name, input] of [['pusta tablica', []], ['nie-tablica', 'abc'], ['NaN w środku', [1, NaN, 3]]]) {
    let err; try { median(input); } catch (e) { err = e; }
    check(`błąd jawny: ${name}`, err instanceof EvalPolicyError && err.code === 'BAD_RESULT', err?.message);
  }

  process.stdout.write('E1c polityka — stałe i niemutowalność\n');
  check('rule=1, behavior=3, judge=3', pol.EVAL_POLICY.rule.attempts === 1 && pol.EVAL_POLICY.behavior.attempts === 3 && pol.EVAL_POLICY.judge.attempts === 3);
  check('behavior.minPass = 2', pol.EVAL_POLICY.behavior.minPass === 2);
  check('EVAL_POLICY zamrożona', Object.isFrozen(pol.EVAL_POLICY) && Object.isFrozen(pol.EVAL_POLICY.behavior));
  check('wynik panelVerdict zamrożony', Object.isFrozen(panelVerdict('rule', [{ pass: true }])));

  // ── E2: collectAttempts ─────────────────────────────────────────────────────
  process.stdout.write('E2 collectAttempts — bez ukrytego retry\n');
  for (const [kind, n] of [['rule', 1], ['behavior', 3], ['judge', 3]]) {
    let calls = 0;
    const res = await collectAttempts(kind, async (i) => { calls++; return { i }; });
    check(`${kind}: dokładnie ${n} wywołań`, calls === n && res.length === n && res.map((r) => r.i).join() === [...Array(n).keys()].join(), `calls=${calls}`);
  }
  {
    let calls = 0; let err;
    try { await collectAttempts('behavior', async (i) => { calls++; if (i === 1) throw new Error('padło'); return {}; }); }
    catch (e) { err = e; }
    check('wyjątek próby leci wyżej, bez ponowienia', err?.message === 'padło' && calls === 2, `calls=${calls}`);
  }
  {
    let err; try { await collectAttempts('nope', async () => ({})); } catch (e) { err = e; }
    check('nieznany rodzaj = błąd', err?.code === 'UNKNOWN_KIND');
  }

  // ── E3: recordRerun ─────────────────────────────────────────────────────────
  process.stdout.write('E3 recordRerun — jeden zapisany rerun, nie ukryty retry\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-policy-'));
  try {
    const log = rerunLogPath(dir);
    check('rerunLogPath = <dir>/reruns.jsonl', log === path.join(dir, 'reruns.jsonl'));
    const base = { runId: 'run-1', caseId: 'case-A', kind: 'behavior', reason: 'timeout dostawcy w próbie 2' };
    const rec = recordRerun(log, { ...base, previousVerdict: 'FAIL' }, { ts: '2026-10-28T00:00:00.000Z' });
    check('zapis: rekord zwrócony i w pliku', rec.caseId === 'case-A' && rec.ts === '2026-10-28T00:00:00.000Z'
      && JSON.parse(fs.readFileSync(log, 'utf8').trim()).previousVerdict === 'FAIL');
    check('rerunCount = 1', rerunCount(log, 'run-1', 'case-A') === 1);
    let err; try { recordRerun(log, base); } catch (e) { err = e; }
    check('drugi rerun tego samego przypadku/runu = RERUN_EXHAUSTED', err?.code === 'RERUN_EXHAUSTED', err?.message);
    check('odmowa nie dopisała linii', fs.readFileSync(log, 'utf8').trim().split('\n').length === 1);
    recordRerun(log, { ...base, caseId: 'case-B' });
    recordRerun(log, { ...base, runId: 'run-2' });
    check('inny przypadek i inny run mają własny limit', fs.readFileSync(log, 'utf8').trim().split('\n').length === 3);
    for (const [name, entry] of [['brak powodu', { ...base, reason: '  ' }], ['brak caseId', { ...base, caseId: undefined }], ['zły rodzaj', { ...base, kind: 'x' }]]) {
      let e2; try { recordRerun(log, entry); } catch (e) { e2 = e; }
      check(`walidacja: ${name}`, e2 instanceof EvalPolicyError, e2?.message);
    }
    const bad = path.join(dir, 'bad.jsonl');
    fs.writeFileSync(bad, '{nie json\n');
    let e3; try { recordRerun(bad, { ...base, runId: 'r', caseId: 'c' }); } catch (e) { e3 = e; }
    check('uszkodzony log = CORRUPT_LOG (nie połykany)', e3?.code === 'CORRUPT_LOG', e3?.message);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  process.stdout.write(failed ? `\n❌ ${failed} nieudanych sprawdzeń\n` : '\n✅ wszystkie sprawdzenia przeszły\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { process.stderr.write(`eval-policy: błąd wykonania: ${e.stack || e}\n`); process.exit(1); });
