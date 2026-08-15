#!/usr/bin/env node
// scripts/workflow-metrics-report.mjs — raport z ~/.claude/metrics/workflow-steps.jsonl (TASK-OBS-002 §3).
// Deterministyczny, zero LLM (D2). Czyta rekordy collectora (workflow-metrics-collect.mjs),
// deduplikuje (ostatnia linia per klucz wygrywa) i drukuje tabele do terminala albo --json.
//
// Użycie:
//   node scripts/workflow-metrics-report.mjs                      # przegląd: per label
//   node scripts/workflow-metrics-report.mjs --by task|model|agentType|day|project|label
//   node scripts/workflow-metrics-report.mjs --since 2026-08-01
//   node scripts/workflow-metrics-report.mjs --regression         # główny use-case: delta per label
//   node scripts/workflow-metrics-report.mjs --top 10             # najdroższe kroki
//   node scripts/workflow-metrics-report.mjs --json               # wyjście maszynowe (pod dashboard)
//   node scripts/workflow-metrics-report.mjs --calibrate          # rozjazd % vs Admin API (/cost-report)
//   node scripts/workflow-metrics-report.mjs --sessions           # poziom SESYJNY (ECC costs.jsonl)
//                                                                 #  obok kosztu workflow — pełny dzienny obraz
//
// Sukces kroku = agent ODDAŁ wynik (ok/GO/NO_GO/cached). NO_GO to porażka weryfikowanego kodu,
// nie kroku — verifier zrobił swoje. Porażka kroku = silent-death / not-started / unknown.

import path from 'node:path';
import url from 'node:url';
import { STEPS_FILE, COSTS_FILE, readJsonl, dedupeRecords } from './workflow-metrics-lib.mjs';

const FAILED_OUTCOMES = new Set(['silent-death', 'not-started', 'unknown']);
export const isStepCompleted = (s) => !FAILED_OUTCOMES.has(s.outcome);

export function loadRecords({ since = null, file = STEPS_FILE } = {}) {
  let records = dedupeRecords(readJsonl(file));
  if (since) {
    const cutoff = new Date(since).getTime();
    records = records.filter((r) => r.ts && new Date(r.ts).getTime() >= cutoff);
  }
  return {
    steps: records.filter((r) => r.type === 'step'),
    runs: records.filter((r) => r.type === 'run'),
  };
}

const GROUPERS = {
  label: (s) => s.label ?? '(bez labela)',
  // workflowName najpierw: taskId z rekordu wf to LOSOWE id harnessa (unikalne per wywołanie),
  // logiczny task niesie workflowName — wspólny dla ponownych i wznowionych przebiegów.
  task: (s) => s.workflowName ?? s.taskId ?? '(bez taska)',
  model: (s) => s.model ?? '(bez modelu)',
  agentType: (s) => s.agentType ?? '(bez typu)',
  day: (s) => (s.ts ?? '').slice(0, 10) || '(bez daty)',
  project: (s) => s.project ?? '(bez projektu)',
};

export function groupSteps(steps, by) {
  const grouper = GROUPERS[by];
  if (!grouper) throw new Error(`Nieznane --by ${by}; dozwolone: ${Object.keys(GROUPERS).join('|')}`);
  const groups = new Map();
  for (const s of steps) {
    const key = grouper(s);
    if (!groups.has(key)) {
      groups.set(key, { key, steps: 0, completed: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, costKnown: 0, durationMs: 0 });
    }
    const g = groups.get(key);
    g.steps++;
    if (isStepCompleted(s)) g.completed++;
    g.outputTokens += s.outputTokens ?? 0;
    g.cacheReadTokens += s.cacheReadTokens ?? 0;
    g.durationMs += s.durationMs ?? 0;
    if (Number.isFinite(s.costUsd)) { g.costUsd += s.costUsd; g.costKnown++; }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, costUsd: +g.costUsd.toFixed(4), successRate: +(g.completed / g.steps).toFixed(2) }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

// Tryb regresji (główny use-case: „czy diff-sonda pomogła?"). Ten sam label w obrębie tego samego
// taska w KOLEJNYCH runach — delta kosztu i zmiana outcome między sąsiednimi runami.
// Progi (E2): |delta| < noisePct → cisza (szum); delta > alarmPct albo utrata wyniku → REGRESSION;
// spadek > noisePct albo odzyskany wynik → IMPROVEMENT; inne zmiany > noisePct → NOTE.
export function buildRegressionReport(steps, runs, { alarmPct = 50, noisePct = 20 } = {}) {
  const runOrder = new Map(); // runId → ts (chronologia runów)
  for (const r of runs) runOrder.set(r.runId, r.ts ?? '');
  const byGroup = new Map(); // task::label → Map(runId → aggregat)
  for (const s of steps) {
    const task = s.workflowName ?? s.taskId ?? '(bez taska)'; // jw.: workflowName = logiczny task
    const key = `${task}::${s.label ?? '(bez labela)'}`;
    if (!byGroup.has(key)) byGroup.set(key, new Map());
    const perRun = byGroup.get(key);
    if (!perRun.has(s.runId)) {
      perRun.set(s.runId, { runId: s.runId, ts: runOrder.get(s.runId) ?? s.ts ?? '', costUsd: 0, costKnown: false, outputTokens: 0, durationMs: 0, outcomes: [] });
    }
    const agg = perRun.get(s.runId);
    if (Number.isFinite(s.costUsd)) { agg.costUsd += s.costUsd; agg.costKnown = true; }
    agg.outputTokens += s.outputTokens ?? 0;
    agg.durationMs += s.durationMs ?? 0;
    agg.outcomes.push(s.outcome);
  }

  const rows = [];
  for (const [key, perRun] of byGroup) {
    const seq = [...perRun.values()].sort((a, b) => a.ts.localeCompare(b.ts));
    for (let i = 1; i < seq.length; i++) {
      const prev = seq[i - 1]; const cur = seq[i];
      const completedPrev = prev.outcomes.some((o) => !FAILED_OUTCOMES.has(o));
      const completedCur = cur.outcomes.some((o) => !FAILED_OUTCOMES.has(o));
      const deltaPct = (prev.costKnown && cur.costKnown && prev.costUsd > 0)
        ? +(((cur.costUsd - prev.costUsd) / prev.costUsd) * 100).toFixed(1)
        : null;
      let flag = 'OK';
      if ((completedPrev && !completedCur) || (deltaPct !== null && deltaPct > alarmPct)) flag = 'REGRESSION';
      else if (!completedPrev && completedCur) flag = 'IMPROVEMENT';
      else if (deltaPct !== null && deltaPct < -noisePct) flag = 'IMPROVEMENT';
      else if (deltaPct !== null && Math.abs(deltaPct) > noisePct) flag = 'NOTE';
      if (flag === 'OK') continue; // szum poniżej noisePct — nie alarmuj
      rows.push({
        key,
        fromRunId: prev.runId, toRunId: cur.runId,
        fromCostUsd: prev.costKnown ? +prev.costUsd.toFixed(4) : null,
        toCostUsd: cur.costKnown ? +cur.costUsd.toFixed(4) : null,
        deltaPct,
        fromOutcomes: prev.outcomes, toOutcomes: cur.outcomes,
        completedFrom: completedPrev, completedTo: completedCur,
        flag,
      });
    }
  }
  return rows.sort((a, b) => (a.flag === 'REGRESSION' ? 0 : 1) - (b.flag === 'REGRESSION' ? 0 : 1));
}

// ── poziom SESYJNY z ECC costs.jsonl (--sessions) ────────────────────────────
// Wpisy cost-trackera ECC są KUMULATYWNE per sesja (rosnący estimated_cost_usd) — naiwna suma
// wszystkich linii liczy tę samą sesję wielokrotnie (np. $3133 zamiast $502 za dzień).
// Poprawnie: per sesja bierzemy OSTATNI wpis każdego dnia i liczymy deltę względem ostatniego
// wpisu z poprzedniego dnia tej sesji — sesje przechodzące przez północ rozliczają się per dzień.
export function buildSessionsReport(costEntries, { since = null, steps = [] } = {}) {
  const sinceDay = since ? String(since).slice(0, 10) : null;
  const bySession = new Map();
  for (const r of costEntries) {
    if (!r?.session_id || typeof r.timestamp !== 'string') continue;
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
    bySession.get(r.session_id).push(r);
  }

  const perDay = new Map();    // day → {sessions:Set, usd, byModel:Map}
  const perProject = new Map(); // slug → {sessions:Set, usd}
  for (const [sessionId, entries] of bySession) {
    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const lastByDay = new Map();
    for (const e of entries) lastByDay.set(e.timestamp.slice(0, 10), e);
    let prevCost = 0;
    for (const [day, e] of [...lastByDay.entries()].sort()) {
      const cum = Number.isFinite(e.estimated_cost_usd) ? e.estimated_cost_usd : prevCost;
      const delta = Math.max(0, cum - prevCost); // clamp: restart licznika nie może dać ujemnej delty
      prevCost = cum;
      if (sinceDay && day < sinceDay) continue; // delta sprzed okna odpada, ale prevCost już przesunięty
      if (!perDay.has(day)) perDay.set(day, { day, sessions: new Set(), usd: 0, byModel: new Map() });
      const d = perDay.get(day);
      d.sessions.add(sessionId);
      d.usd += delta;
      const model = e.model ?? '(bez modelu)';
      d.byModel.set(model, (d.byModel.get(model) ?? 0) + delta);
      const slug = /\/projects\/([^/]+)\//.exec(e.transcript_path ?? '')?.[1] ?? '(bez projektu)';
      if (!perProject.has(slug)) perProject.set(slug, { project: slug, sessions: new Set(), usd: 0 });
      perProject.get(slug).sessions.add(sessionId);
      perProject.get(slug).usd += delta;
    }
  }

  // koszt workflow per dzień (z rekordów kroków) — do kolumny obok
  const wfByDay = new Map();
  for (const s of steps) {
    const day = (s.ts ?? '').slice(0, 10);
    if (!day || (sinceDay && day < sinceDay)) continue;
    if (Number.isFinite(s.costUsd)) wfByDay.set(day, (wfByDay.get(day) ?? 0) + s.costUsd);
  }

  const days = [...perDay.values()]
    .map((d) => ({
      day: d.day,
      sessions: d.sessions.size,
      sessionUsd: +d.usd.toFixed(2),
      workflowUsd: +(wfByDay.get(d.day) ?? 0).toFixed(2),
      workflowSharePct: d.usd > 0 ? Math.round(((wfByDay.get(d.day) ?? 0) / d.usd) * 100) : null,
      byModel: Object.fromEntries([...d.byModel.entries()].map(([m, v]) => [m, +v.toFixed(2)])),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
  const projects = [...perProject.values()]
    .map((p) => ({ project: p.project, sessions: p.sessions.size, usd: +p.usd.toFixed(2) }))
    .sort((a, b) => b.usd - a.usd);
  return { days, projects };
}

export function topSteps(steps, n = 10) {
  return [...steps]
    .filter((s) => Number.isFinite(s.costUsd))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, n);
}

// ── kalibracja vs Admin API (D4: dwie kolumny — szacunek i rozjazd, nie zastąpienie) ──
// Best-effort: endpoint z commands/cost-report.md; parser tolerancyjny (sumuje numeryczne pola
// *cost* w odpowiedzi). Przy zmianie schematu API poprawić TUTAJ, nie w collectorze.
async function calibrate({ since }) {
  const key = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!key) return { skipped: 'brak ANTHROPIC_ADMIN_API_KEY' };
  const start = since ?? new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const u = `https://api.anthropic.com/v1/organizations/usage_report/claude_code?starting_at=${start}T00:00:00Z&ending_at=${end}T00:00:00Z&bucket_width=1d`;
  try {
    const res = await fetch(u, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
    if (!res.ok) return { skipped: `Admin API HTTP ${res.status}` };
    const body = await res.json();
    let total = 0;
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (/cost/i.test(k) && typeof v === 'number') total += v;
          else walk(v);
        }
      }
    };
    walk(body);
    return { actualUsd: +total.toFixed(2), start, end };
  } catch (e) {
    return { skipped: `Admin API: ${e.message}` };
  }
}

// ── prezentacja ──
function table(rows, cols) {
  if (!rows.length) return '  (brak danych)';
  const widths = cols.map((c) => Math.max(c.h.length, ...rows.map((r) => String(c.f(r) ?? '').length)));
  const line = (cells) => '  ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  return [line(cols.map((c) => c.h)), line(widths.map((w) => '─'.repeat(w))), ...rows.map((r) => line(cols.map((c) => c.f(r))))].join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const by = get('--by') ?? 'label';
  const since = get('--since');
  const top = get('--top');
  const json = argv.includes('--json');
  const regression = argv.includes('--regression');
  const doCalibrate = argv.includes('--calibrate');
  const sessions = argv.includes('--sessions');
  const file = get('--file') ?? STEPS_FILE;

  const { steps, runs } = loadRecords({ since, file });
  const out = {};

  if (sessions) {
    out.sessions = buildSessionsReport(readJsonl(get('--costs-file') ?? COSTS_FILE), { since, steps });
  } else if (regression) {
    out.regression = buildRegressionReport(steps, runs);
  } else if (top) {
    out.top = topSteps(steps, parseInt(top, 10) || 10);
  } else {
    out.groups = groupSteps(steps, by);
    out.successByAgentType = groupSteps(steps, 'agentType').map(({ key, steps: n, successRate }) => ({ key, steps: n, successRate }));
    out.successByModel = groupSteps(steps, 'model').map(({ key, steps: n, successRate }) => ({ key, steps: n, successRate }));
  }

  const estimateTotal = +steps.reduce((s, x) => s + (Number.isFinite(x.costUsd) ? x.costUsd : 0), 0).toFixed(2);
  out.estimateTotalUsd = estimateTotal;
  if (doCalibrate) {
    const cal = await calibrate({ since });
    out.calibration = cal.skipped
      ? cal
      : { ...cal, estimateUsd: estimateTotal, driftPct: cal.actualUsd ? +(((estimateTotal - cal.actualUsd) / cal.actualUsd) * 100).toFixed(1) : null };
  }

  if (json) { console.log(JSON.stringify(out, null, 2)); return out; }

  if (out.sessions) {
    console.log(`\n🧾 Koszty per dzień — poziom SESYJNY (ECC costs.jsonl, delta wpisów kumulatywnych) vs workflow${since ? `, od ${since}` : ''}\n`);
    console.log(table(out.sessions.days, [
      { h: 'day', f: (d) => d.day },
      { h: 'sesje', f: (d) => d.sessions },
      { h: '$ sesyjny', f: (d) => d.sessionUsd },
      { h: '$ workflow', f: (d) => d.workflowUsd },
      { h: 'workflow%', f: (d) => d.workflowSharePct === null ? '—' : `${d.workflowSharePct}%` },
      { h: 'per model', f: (d) => Object.entries(d.byModel).map(([m, v]) => `${m.replace(/^claude-/, '')} $${v}`).join(', ') },
    ]));
    console.log('\n📁 Per projekt (w oknie)\n');
    console.log(table(out.sessions.projects, [
      { h: 'projekt', f: (p) => p.project },
      { h: 'sesje', f: (p) => p.sessions },
      { h: '$ sesyjny', f: (p) => p.usd },
    ]));
    console.log('\nUwaga: obie kolumny $ to szacunki lokalne; prawda rozliczeniowa = /cost-report (Admin API).');
    return out;
  }
  if (out.regression) {
    console.log(`\n🔁 Regresje per task::label (${steps.length} kroków, ${runs.length} runów)\n`);
    console.log(table(out.regression, [
      { h: 'FLAG', f: (r) => r.flag },
      { h: 'task::label', f: (r) => r.key },
      { h: '$ prev', f: (r) => r.fromCostUsd ?? '?' },
      { h: '$ next', f: (r) => r.toCostUsd ?? '?' },
      { h: 'Δ%', f: (r) => r.deltaPct ?? '—' },
      { h: 'outcome', f: (r) => `${r.fromOutcomes.join(',')} → ${r.toOutcomes.join(',')}` },
    ]));
  }
  if (out.top) {
    console.log('\n💸 Najdroższe kroki\n');
    console.log(table(out.top, [
      { h: '$', f: (s) => s.costUsd },
      { h: 'label', f: (s) => s.label },
      { h: 'task', f: (s) => s.workflowName ?? s.taskId },
      { h: 'agentType', f: (s) => s.agentType },
      { h: 'model', f: (s) => s.model },
      { h: 'outcome', f: (s) => s.outcome },
      { h: 'out-tok', f: (s) => s.outputTokens },
      { h: 'cache-read', f: (s) => s.cacheReadTokens },
      { h: 's', f: (s) => s.durationMs ? Math.round(s.durationMs / 1000) : null },
    ]));
  }
  if (out.groups) {
    console.log(`\n📊 Kroki per ${by} (${steps.length} kroków, ${runs.length} runów${since ? `, od ${since}` : ''})\n`);
    console.log(table(out.groups, [
      { h: by, f: (g) => g.key },
      { h: 'kroki', f: (g) => g.steps },
      { h: 'success', f: (g) => `${Math.round(g.successRate * 100)}%` },
      { h: '$ (szac.)', f: (g) => g.costUsd },
      { h: 'out-tok', f: (g) => g.outputTokens },
      { h: 'cache-read', f: (g) => g.cacheReadTokens },
      { h: 'min', f: (g) => Math.round(g.durationMs / 60000) },
    ]));
    console.log('\n✅ Success-rate per agentType\n');
    console.log(table(out.successByAgentType, [
      { h: 'agentType', f: (g) => g.key },
      { h: 'kroki', f: (g) => g.steps },
      { h: 'success', f: (g) => `${Math.round(g.successRate * 100)}%` },
    ]));
  }
  console.log(`\nΣ szacunek lokalny: $${estimateTotal}`);
  if (out.calibration) {
    if (out.calibration.skipped) console.log(`Kalibracja: pominięta (${out.calibration.skipped})`);
    else console.log(`Kalibracja: Admin API $${out.calibration.actualUsd} (${out.calibration.start}→${out.calibration.end}), rozjazd ${out.calibration.driftPct}%`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  main();
}
