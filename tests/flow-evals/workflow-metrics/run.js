#!/usr/bin/env node
/**
 * tests/flow-evals/workflow-metrics/run.js — evale L1 systemu metryk workflow (TASK-OBS-002 §6).
 * Uruchamiaj przy każdej zmianie collectora/raportu/konformancji:
 *   node tests/flow-evals/workflow-metrics/run.js
 *
 * E1 collector-golden  — PRAWDZIWE, zarchiwizowane fixture'y przebiegu wf_379c0a41-ff2
 *                        (TS-TOKEN-TOPUP-001/A2, 2026-08-14: 2× silent-death implementera).
 *                        Collector musi wyprodukować DOKŁADNIE oczekiwane rekordy — regresyjna
 *                        kotwica formatu i parsera transkryptów (dedup usage po message.id).
 * E2 budget-regression — spreparowane rekordy 2 runów: wzrost >50% kosztu i utrata wyniku dają
 *                        REGRESSION; szum <20% NIE alarmuje.
 * E3 conformance       — plan zgodny → OK; pominięty verify + agent spoza slotu → DEVIATIONS.
 *
 * Fixtures cenowe: fixtures/prices.json to ZAMROŻONA kopia — celowo niezależna od
 * scripts/workflow-metrics-prices.default.json, żeby aktualizacja cennika nie psuła goldenów.
 */

const path = require('path');
const FIX = path.join(__dirname, 'fixtures');

let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) process.stdout.write(`  ✅ ${name}\n`);
  else { failed++; process.stdout.write(`  ❌ ${name}${detail ? ` — ${detail}` : ''}\n`); }
};

async function main() {
  const { collectRun } = await import('../../../scripts/workflow-metrics-collect.mjs');
  const { buildRegressionReport, buildSessionsReport } = await import('../../../scripts/workflow-metrics-report.mjs');
  const { checkConformance, parsePlan, unitKey, parseLabel } = await import('../../../scripts/workflow-conformance.mjs');
  const { estimateCostUsd } = await import('../../../scripts/workflow-metrics-lib.mjs');
  const YAML = (await import('yaml')).default;
  const fs = require('fs');

  // ── E1: collector-golden na realnych fixture'ach ─────────────────────────────
  process.stdout.write('E1 collector-golden (wf_379c0a41-ff2)\n');
  const prices = JSON.parse(fs.readFileSync(path.join(FIX, 'prices.json'), 'utf8'));
  const runDir = path.join(FIX, 'wf_379c0a41-ff2');
  const { steps, run } = collectRun({
    wfPath: path.join(runDir, 'wf_379c0a41-ff2.json'),
    runDir,
    prices,
    project: '-opt-projects-juz-ide-api-1',
    sessionId: '6284f48f-e640-462b-8edd-6f8a0d2e51a6',
    runtimeYmlHash: 'fixturehash1',
  });

  check('2 kroki', steps.length === 2, `got ${steps.length}`);
  const s1 = steps.find((s) => s.agentId === 'a2c33965e5813f482');
  const s2 = steps.find((s) => s.agentId === 'acde630999990897c');
  check('oba kroki silent-death', s1?.outcome === 'silent-death' && s2?.outcome === 'silent-death',
    `got ${s1?.outcome}/${s2?.outcome}`);
  check('reason z logów workflow', /StructuredOutput/.test(s1?.reason ?? '') && /StructuredOutput/.test(s2?.reason ?? ''));
  // 4 liczniki z transkryptu (dedup: ostatnia linia usage per message.id) — kotwica parsera
  const u1 = { inputTokens: 80, outputTokens: 36694, cacheWriteTokens: 129354, cacheReadTokens: 3670819 };
  const u2 = { inputTokens: 80, outputTokens: 23253, cacheWriteTokens: 94740, cacheReadTokens: 3191150 };
  for (const [k, v] of Object.entries(u1)) check(`A2-impl-1.${k} = ${v}`, s1?.[k] === v, `got ${s1?.[k]}`);
  for (const [k, v] of Object.entries(u2)) check(`A2-impl-2.${k} = ${v}`, s2?.[k] === v, `got ${s2?.[k]}`);
  // koszt z 4 liczników × cennik sonnet-5 (intro): dokładna wartość, nie przybliżenie
  check('A2-impl-1.costUsd = 1.424649', s1?.costUsd === 1.424649, `got ${s1?.costUsd}`);
  check('A2-impl-2.costUsd = 1.10777', s2?.costUsd === 1.10777, `got ${s2?.costUsd}`);
  check('ts kroku = startedAt z workflowProgress', new Date(s1?.ts).getTime() === 1786745782230, `got ${s1?.ts}`);
  check('metadane kroku', s1?.label === 'A2-impl-1' && s1?.phase === 'Infrastructure'
    && s1?.agentType === 'infrastructure-implementer' && s1?.model === 'claude-sonnet-5'
    && s1?.toolCalls === 58 && s1?.reportedTokens === 129373);
  check('rekord run: status/escalatedAt', run.status === 'completed' && run.escalatedAt === 'A2');
  check('rekord run: koszt = suma kroków', run.costUsd === 2.532419, `got ${run.costUsd}`);
  check('rekord run: totalTokens/toolCalls z wf', run.totalTokens === 239167 && run.totalToolCalls === 121 && run.agentCount === 2);

  // odporność na uszkodzone wejście (regresja po review 2026-08-15):
  // wf_*.json w połowie zapisu → collectRun zwraca null zamiast wywalić proces
  const corrupted = collectRun({ wfPath: path.join(FIX, 'corrupted-wf.json'), runDir: null, prices });
  check('uszkodzony wf.json → null (nie crash)', corrupted === null, `got ${JSON.stringify(corrupted)}`);
  // niekompletny wpis cennika → null zamiast NaN zatruwającego sumy
  const usage = { inputTokens: 100, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0 };
  check('niepełny cennik → null (nie NaN)',
    estimateCostUsd(usage, 'x-model', { models: { 'x-model': { input: 2, output: 10 } } }) === null);

  // ── E2: budget-regression na spreparowanym workflow-steps ────────────────────
  process.stdout.write('\nE2 budget-regression\n');
  const mkStep = (runId, label, costUsd, outcome) => ({
    type: 'step', runId, taskId: 'T1', label, costUsd, outcome, ts: null,
    outputTokens: 0, durationMs: 0,
  });
  const runs2 = [
    { type: 'run', runId: 'wf_r1', ts: '2026-08-01T10:00:00Z' },
    { type: 'run', runId: 'wf_r2', ts: '2026-08-02T10:00:00Z' },
  ];
  const steps2 = [
    // wzrost kosztu +60% tego samego labela → REGRESSION
    mkStep('wf_r1', 'impl:domain', 1.0, 'ok'), mkStep('wf_r2', 'impl:domain', 1.6, 'ok'),
    // utrata wyniku (ok → silent-death) → REGRESSION
    mkStep('wf_r1', 'impl:infra', 0.5, 'ok'), mkStep('wf_r2', 'impl:infra', 0.5, 'silent-death'),
    // szum +10% → BRAK alarmu
    mkStep('wf_r1', 'verify:domain', 1.0, 'GO'), mkStep('wf_r2', 'verify:domain', 1.1, 'GO'),
  ];
  const rows = buildRegressionReport(steps2, runs2);
  const rowFor = (label) => rows.find((r) => r.key === `T1::${label}`);
  check('wzrost +60% → REGRESSION', rowFor('impl:domain')?.flag === 'REGRESSION',
    `got ${JSON.stringify(rowFor('impl:domain'))}`);
  check('ok → silent-death → REGRESSION', rowFor('impl:infra')?.flag === 'REGRESSION',
    `got ${JSON.stringify(rowFor('impl:infra'))}`);
  check('szum +10% → cisza', rowFor('verify:domain') === undefined,
    `got ${JSON.stringify(rowFor('verify:domain'))}`);
  check('delta policzona', rowFor('impl:domain')?.deltaPct === 60);

  // ── E4: --sessions — delta KUMULATYWNYCH wpisów ECC costs.jsonl ─────────────
  process.stdout.write('\nE4 sessions-delta\n');
  const ce = (session_id, timestamp, cost, extra = {}) => ({
    session_id, timestamp, estimated_cost_usd: cost, model: 'claude-sonnet-5',
    transcript_path: '/home/x/.claude/projects/-opt-projects-demo/t.jsonl', ...extra,
  });
  const costEntries = [
    // sesja A: kumulatywnie 1.0 → 3.0 tego samego dnia → dzień liczy 3.0 (nie 4.0)
    ce('sesA', '2026-08-14T10:00:00Z', 1.0), ce('sesA', '2026-08-14T11:00:00Z', 3.0),
    // sesja B przez północ: dzień1 last 2.0, dzień2 last 5.0 → 2.0 + 3.0 (delta, nie 5.0)
    ce('sesB', '2026-08-14T23:00:00Z', 2.0), ce('sesB', '2026-08-15T01:00:00Z', 5.0),
  ];
  const sr = buildSessionsReport(costEntries, {});
  const day14 = sr.days.find((d) => d.day === '2026-08-14');
  const day15 = sr.days.find((d) => d.day === '2026-08-15');
  check('kumulatywne wpisy → ostatni per dzień (3.0+2.0)', day14?.sessionUsd === 5.0, `got ${day14?.sessionUsd}`);
  check('sesja przez północ → delta, nie suma (5.0-2.0)', day15?.sessionUsd === 3.0, `got ${day15?.sessionUsd}`);
  const srSince = buildSessionsReport(costEntries, { since: '2026-08-15' });
  check('--since tnie dni, ale delta liczona od pełnej historii sesji',
    srSince.days.length === 1 && srSince.days[0].sessionUsd === 3.0, JSON.stringify(srSince.days));
  check('per projekt zsumowany', sr.projects[0]?.project === '-opt-projects-demo' && sr.projects[0]?.usd === 8.0,
    JSON.stringify(sr.projects));

  // ── E3: conformance (plan zgodny → OK; braki → DEVIATIONS z poprawną listą) ─
  process.stdout.write('\nE3 conformance\n');
  const plan = parsePlan(fs.readFileSync(path.join(FIX, 'runtime-plan.yml'), 'utf8'), YAML);
  check('plan sparsowany', plan?.verify === 'quality-verifier' && plan?.finalGate === 'final-verifier'
    && plan?.layers.length === 2 && plan?.maxAttempts === 3);

  const st = (label, agentType, outcome, ts) => ({ type: 'step', label, agentType, outcome, ts });
  const goodRun = [
    st('impl:domain', 'domain-impl', 'ok', '2026-08-01T10:00:00Z'),
    st('verify:domain', 'quality-verifier', 'GO', '2026-08-01T10:10:00Z'),
    st('impl:infra', 'infra-impl', 'ok', '2026-08-01T10:20:00Z'),
    st('verify:infra', 'quality-verifier', 'GO', '2026-08-01T10:30:00Z'),
    st('final-gate', 'final-verifier', 'GO', '2026-08-01T10:40:00Z'),
  ];
  const good = checkConformance(goodRun, { escalatedAt: null }, plan);
  check('przebieg zgodny → OK', good.conformance === 'OK', JSON.stringify(good.deviations));

  const badRun = [
    st('impl:domain', 'domain-impl', 'ok', '2026-08-01T10:00:00Z'),
    // brak verify:domain — pominięty cykl weryfikacji warstwy
    st('impl:infra', 'rogue-agent', 'ok', '2026-08-01T10:20:00Z'), // agent spoza slotów
    st('verify:infra', 'quality-verifier', 'GO', '2026-08-01T10:30:00Z'),
    st('final-gate', 'final-verifier', 'GO', '2026-08-01T10:40:00Z'),
  ];
  const bad = checkConformance(badRun, { escalatedAt: null }, plan);
  const badCodes = bad.deviations.map((d) => d.code).sort();
  check('przebieg z brakami → DEVIATIONS(2)', bad.conformance === 'DEVIATIONS(2)', bad.conformance);
  check('lista: AGENT_OUTSIDE_SLOTS + MISSING_VERIFY',
    JSON.stringify(badCodes) === JSON.stringify(['AGENT_OUTSIDE_SLOTS', 'MISSING_VERIFY']),
    JSON.stringify(badCodes));
  check('MISSING_VERIFY wskazuje jednostkę domain',
    bad.deviations.some((d) => d.code === 'MISSING_VERIFY' && d.detail.includes("'domain'")));

  // parser labeli — obie konwencje mapują impl i verify na tę samą jednostkę
  check("unitKey: 'impl:U1:a1' i 'verify:U1:a1' → ta sama jednostka", unitKey('impl:U1:a1') === unitKey('verify:U1:a1'));
  check("unitKey: 'A2-impl-1' i 'A2-verify-existing-3' → 'A2'", unitKey('A2-impl-1') === 'A2' && unitKey('A2-verify-existing-3') === 'A2');
  check("unitKey: 'domain:typecheck' → 'domain' (jednostka-pierwsza)", unitKey('domain:typecheck') === 'domain');
  // rola musi być PEŁNYM segmentem — 'gateway' (⊃gate) / 'runtime' (⊃run) to jednostki, nie role
  check("parseLabel: 'gateway:impl' → unit 'gateway', rola 'impl'",
    JSON.stringify(parseLabel('gateway:impl')) === JSON.stringify({ role: 'impl', unit: 'gateway' }),
    JSON.stringify(parseLabel('gateway:impl')));
  check("parseLabel: 'git-status:U1' → rola 'git-status', unit 'U1'",
    JSON.stringify(parseLabel('git-status:U1')) === JSON.stringify({ role: 'git-status', unit: 'U1' }),
    JSON.stringify(parseLabel('git-status:U1')));

  process.stdout.write(`\n${failed ? `❌ ${failed} FAILED` : '✅ all passed'}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
