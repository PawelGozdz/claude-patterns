#!/usr/bin/env node
/**
 * tests/flow-evals/judge-controls/run.js — eval L1 frameworka kontroli sędziów (TASK-GSTACK-ADOPT-001 B1).
 *
 *   node tests/flow-evals/judge-controls/run.js
 *       Eval deterministyczny na atrapach (zero LLM). Odpalany też z pre-commit.
 *
 *   node tests/flow-evals/judge-controls/run.js --judge <moduł.mjs> [--pack <id>]
 *       Kontrola REALNEGO sędziego: moduł eksportuje domyślnie `async (artifact, rubric) => {scores, verdict}`.
 *       Wypisuje dopuszczenie per paczka, dopisuje wpis do admissions.jsonl, exit 0 tylko gdy dopuszczony.
 *       To wywołuje model (9 wywołań na paczkę) — świadomy, płatny krok, nigdy w pre-commit.
 *
 * E1 pack-format    — realna paczka wczytuje się; zepsute paczki (negative z treścią, defekt nie-minimalny,
 *                     marker w positive, nieznany wymiar, brak pliku) dają błąd jawny.
 * E2 stub-judges    — dobry sędzia DOPUSZCZONY; ślepy (przepuszcza defekt) i sufitowy NIEDOPUSZCZENI, z powodami.
 * E3 edge-cases     — warunki brzegowe progów, mediana odporna na odstającą próbkę, zły wynik sędziego.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const PACKS_DIR = path.join(__dirname, 'packs');
const REAL_PACK = path.join(PACKS_DIR, 'verifier-report');

let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) process.stdout.write(`  ✅ ${name}\n`);
  else { failed++; process.stdout.write(`  ❌ ${name}${detail ? ` — ${detail}` : ''}\n`); }
};
const throwsCode = async (fn) => { try { await fn(); return null; } catch (e) { return e.code ?? e.name; } };

function mutatedPack(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'judge-pack-'));
  for (const f of fs.readdirSync(REAL_PACK)) fs.copyFileSync(path.join(REAL_PACK, f), path.join(dir, f));
  mutate(dir, (rel) => fs.readFileSync(path.join(dir, rel), 'utf8'), (rel, txt) => fs.writeFileSync(path.join(dir, rel), txt));
  return dir;
}
const editMeta = (fn) => (dir, read, write) => { const m = JSON.parse(read('pack.json')); fn(m); write('pack.json', JSON.stringify(m)); };

async function runWithStubs() {
  const jc = await import('./judge-controls.mjs');
  const stubs = await import('./fixtures/stub-judges.mjs');
  const { loadPack, runJudgeControls } = jc;

  // ── E1 ──────────────────────────────────────────────────────────────────────
  process.stdout.write('E1 pack-format\n');
  const pack = loadPack(REAL_PACK);
  check('realna paczka verifier-report wczytana', pack.id === 'verifier-report' && pack.dimensions.length === 4);
  check('defekt dotyka wymiaru z rubryki', pack.dimensions.some((d) => d.id === pack.defect.dimension));
  check('wszystkie paczki w packs/ wczytują się', fs.readdirSync(PACKS_DIR).every((p) => {
    try { loadPack(path.join(PACKS_DIR, p)); return true; } catch { return false; }
  }));
  const bad = [
    ['negative z treścią poza nagłówkami', (d, r, w) => w('negative.md', `${r('negative.md')}\nJakiś tekst\n`), 'NEGATIVE_NOT_EMPTY'],
    ['defekt = positive', (d, r, w) => w('defect.md', r('positive.md')), 'DEFECT_INVALID'],
    ['marker nie występuje w defect', editMeta((m) => { m.defect.marker = 'NIEISTNIEJĄCY MARKER'; }), 'DEFECT_INVALID'],
    ['marker już w positive', editMeta((m) => { m.defect.marker = 'CH8 @ create-demo.handler.ts:41'; }), 'DEFECT_INVALID'],
    ['defekt zmienia za dużo linii', (d, r, w) => w('defect.md', r('defect.md').replace('## Zakres', '## X1').replace('## Pokrycie', '## X2').replace('## Werdykt końcowy', '## X3')), 'DEFECT_NOT_MINIMAL'],
    ['nieznany wymiar defektu', editMeta((m) => { m.defect.dimension = 'nie_ma'; }), 'DEFECT_INVALID'],
    ['zduplikowany wymiar', editMeta((m) => { m.rubric.dimensions.push({ ...m.rubric.dimensions[0] }); }), 'PACK_INVALID'],
    ['zła skala', editMeta((m) => { m.scale = { min: 5, max: 1 }; }), 'PACK_INVALID'],
    ['brak pliku wariantu', (d) => fs.rmSync(path.join(d, 'defect.md')), 'PACK_FILE_MISSING'],
    ['brak pack.json', (d) => fs.rmSync(path.join(d, 'pack.json')), 'PACK_FILE_MISSING'],
    ['pack.json nie-JSON', (d, r, w) => w('pack.json', '{nie json'), 'PACK_INVALID'],
  ];
  for (const [name, mutate, code] of bad) {
    const dir = mutatedPack(mutate);
    try { check(`odrzucona: ${name}`, (await throwsCode(() => loadPack(dir))) === code, `kod: ${await throwsCode(() => loadPack(dir))}`); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  // ── E2 ──────────────────────────────────────────────────────────────────────
  process.stdout.write('E2 stub-judges — dobry dopuszczony, ślepy NIEDOPUSZCZONY\n');
  let calls = 0;
  const counted = (j) => async (...a) => { calls++; return j(...a); };
  const good = await runJudgeControls(counted(stubs.goodStubJudge), pack);
  check('dobry sędzia: ADMITTED', good.verdict === 'ADMITTED' && good.admitted, good.reasons.join(' | '));
  check('dobry sędzia: wszystkie 4 kontrole ok', Object.values(good.checks).every((c) => c.ok));
  check('polityka judge: 3 próbki x 3 warianty = 9 wywołań', calls === 9, `calls=${calls}`);
  check('dobry sędzia: positive nie na suficie', good.medians.positive.actionability === 4);
  check('dobry sędzia: wykrył defekt w dotkniętym wymiarze', good.medians.defect.verdict_consistency < good.medians.positive.verdict_consistency
    && good.medians.defect.verdict_consistency < 3);
  check('dobry sędzia: spadek TYLKO w wymiarze defektu (brak collateral)', good.collateralDrops.length === 0, good.collateralDrops.join());

  const blind = await runJudgeControls(stubs.blindStubJudge, pack);
  check('ślepy sędzia: NOT_ADMITTED', blind.verdict === 'NOT_ADMITTED' && !blind.admitted);
  check('ślepy: przepuścił defekt (detects_defect nie przeszła)', blind.checks.detects_defect.ok === false);
  check('ślepy: odrzuca pusty szablon i przyjmuje positive (to NIE jego wina)', blind.checks.rejects_negative.ok && blind.checks.accepts_positive.ok);
  check('ślepy: powód nazywa wymiar i defekt', blind.reasons.length === 1 && /przepuszcza defekt/.test(blind.reasons[0]) && /verdict_consistency/.test(blind.reasons[0]),
    blind.reasons.join(' | '));

  const ceil = await runJudgeControls(stubs.ceilingStubJudge, pack);
  check('sędzia sufitowy (5/5 wszędzie): NOT_ADMITTED', ceil.verdict === 'NOT_ADMITTED');
  check('sufitowy: zawyża positive, nie odrzuca negative, nie widzi defektu',
    !ceil.checks.positive_not_inflated.ok && !ceil.checks.rejects_negative.ok && !ceil.checks.detects_defect.ok);
  const ceilOk = await runJudgeControls(stubs.ceilingStubJudge, pack, { allowPerfectPositive: true });
  check('allowPerfectPositive wyłącza tylko kontrolę zawyżania', ceilOk.checks.positive_not_inflated.ok && !ceilOk.admitted);

  // ── E3 ──────────────────────────────────────────────────────────────────────
  process.stdout.write('E3 edge-cases — progi, mediana, zły wynik sędziego\n');
  const dims = pack.dimensions.map((d) => d.id);
  const S = (over = {}, base = 4, verdict = 'PASS') => ({ scores: { ...Object.fromEntries(dims.map((d) => [d, base])), ...over }, verdict });
  const NEG = { scores: Object.fromEntries(dims.map((d) => [d, 1])), verdict: 'FAIL' };
  const dd = pack.defect.dimension;
  const run = (script, opts) => runJudgeControls(stubs.scriptedJudge(pack.texts, script), pack, opts);

  const ok = await run({ positive: [S()], negative: [NEG], defect: [S({ [dd]: 2 }, 4, 'FAIL')] });
  check('baza: scenariusz skryptowy ADMITTED', ok.admitted, ok.reasons.join(' | '));

  const atTh = await run({ positive: [S()], negative: [NEG], defect: [S({ [dd]: 3 })] });
  check('defekt oceniony DOKŁADNIE na progu (3) = niewykryty', !atTh.checks.detects_defect.ok);

  const outlierHigh = await run({ positive: [S()], negative: [NEG], defect: [S({ [dd]: 5 }), S({ [dd]: 2 }), S({ [dd]: 2 })] });
  check('jedna wysoka próbka (5,2,2) nie ukrywa defektu: mediana 2', outlierHigh.checks.detects_defect.ok && outlierHigh.medians.defect[dd] === 2);
  const outlierLow = await run({ positive: [S()], negative: [NEG], defect: [S({ [dd]: 2 }), S({ [dd]: 5 }), S({ [dd]: 5 })] });
  check('jedna niska próbka (2,5,5) nie wykrywa defektu: mediana 5', !outlierLow.checks.detects_defect.ok);

  const noDrop = await run({ positive: [S({ [dd]: 2 }, 4, 'PASS')], negative: [NEG], defect: [S({ [dd]: 2 })] });
  check('positive z oceną wymiaru < progu = sędzia nie przyjmuje poprawnego', !noDrop.checks.accepts_positive.ok && !noDrop.admitted);

  const rejectsGood = await run({ positive: [S({}, 4, 'FAIL')], negative: [NEG], defect: [S({ [dd]: 2 }, 4, 'FAIL')] });
  check('sędzia mówi FAIL na poprawnym artefakcie (3/3) = niedopuszczony', !rejectsGood.checks.accepts_positive.ok);

  const acceptsEmpty = await run({ positive: [S()], negative: [S({}, 4, 'PASS')], defect: [S({ [dd]: 2 })] });
  check('sędzia przyjmuje pusty szablon = niedopuszczony', !acceptsEmpty.checks.rejects_negative.ok && /nie odrzuca/.test(acceptsEmpty.reasons.join()));

  const incoherentNeg = await run({ positive: [S()], negative: [S({}, 5, 'FAIL')], defect: [S({ [dd]: 2 })] });
  check('negative: werdykt FAIL, ale oceny 5/5 = niespójny, niedopuszczony', !incoherentNeg.checks.rejects_negative.ok);

  const voteSplit = await run({ positive: [S()], negative: [NEG, NEG, S({}, 4, 'PASS')], defect: [S({ [dd]: 2 })] });
  check('negative odrzucony większością 2/3', voteSplit.checks.rejects_negative.ok);

  const collateral = await run({ positive: [S()], negative: [NEG], defect: [S({ [dd]: 2, grounding: 3 })] });
  check('spadek w innym wymiarze raportowany jako collateral (nie blokuje)', collateral.admitted && collateral.collateralDrops.join() === 'grounding');

  const badOut = [
    ['brak wymiaru w scores', () => ({ scores: { grounding: 4 }, verdict: 'PASS' })],
    ['dodatkowy wymiar', () => ({ scores: { ...S().scores, bonus: 3 }, verdict: 'PASS' })],
    ['verdict spoza PASS/FAIL', () => ({ ...S(), verdict: 'maybe' })],
    ['ocena poza skalą', () => S({ [dd]: 9 })],
    ['ocena nie-liczba', () => S({ [dd]: '4' })],
    ['brak scores', () => ({ verdict: 'PASS' })],
    ['null', () => null],
  ];
  for (const [name, fn] of badOut) {
    const code = await throwsCode(() => runJudgeControls(async () => fn(), pack));
    check(`zły wynik sędziego: ${name} -> BAD_JUDGE_OUTPUT`, code === 'BAD_JUDGE_OUTPUT', `kod: ${code}`);
  }
  check('sędzia nie-funkcja -> BAD_JUDGE', (await throwsCode(() => runJudgeControls('sędzia', pack))) === 'BAD_JUDGE');
  let thrown = 0;
  const boom = async () => { thrown++; throw new Error('sędzia padł'); };
  check('wyjątek sędziego leci wyżej, bez retry', (await throwsCode(() => runJudgeControls(boom, pack))) === 'Error' && thrown === 1, `thrown=${thrown}`);
}

async function runRealJudge(modulePath, packId) {
  const jc = await import('./judge-controls.mjs');
  const mod = await import(pathToFileURL(path.resolve(modulePath)).href);
  const judge = mod.default;
  if (typeof judge !== 'function') throw new Error(`${modulePath}: brak eksportu domyślnego będącego funkcją sędziego`);
  const ids = packId ? [packId] : fs.readdirSync(PACKS_DIR);
  let allOk = true;
  for (const id of ids) {
    const pack = jc.loadPack(path.join(PACKS_DIR, id));
    const rep = await jc.runJudgeControls(judge, pack);
    allOk = allOk && rep.admitted;
    process.stdout.write(`${rep.admitted ? '✅ ADMITTED' : '❌ NOT_ADMITTED'}  ${id}\n`);
    for (const r of rep.reasons) process.stdout.write(`   - ${r}\n`);
    fs.appendFileSync(path.join(__dirname, 'admissions.jsonl'), `${JSON.stringify({
      ts: new Date().toISOString(), judge: path.basename(modulePath), pack: id, verdict: rep.verdict,
      failedChecks: Object.entries(rep.checks).filter(([, c]) => !c.ok).map(([k]) => k), medians: rep.medians,
    })}\n`);
  }
  process.exit(allOk ? 0 : 1);
}

async function main() {
  const args = process.argv.slice(2);
  const at = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--judge')) return runRealJudge(at('--judge'), at('--pack'));
  await runWithStubs();
  process.stdout.write(failed ? `\n❌ ${failed} nieudanych sprawdzeń\n` : '\n✅ wszystkie sprawdzenia przeszły\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { process.stderr.write(`judge-controls: błąd wykonania: ${e.stack || e}\n`); process.exit(1); });
