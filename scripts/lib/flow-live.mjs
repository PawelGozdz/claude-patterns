// scripts/lib/flow-live.mjs — widok przebiegu Workflow „na żywo" dla flow-top (TASK-OBS-008).
//
// Czyste funkcje: wf_*.json + journal.jsonl → model widoku → tekst. I/O (szukanie przebiegu, odczyt
// plików, zegar) robi wołający, więc to samo testuje się na fixture'ach.
//
// Liczymy tym samym kodem co agregaty: kroki z `workflowProgress` idą przez `legacyRunToEvents`
// (id kroku, runda, `fixes`), a udział napraw i podział naprawione/otwarte przez `buildRollups`.
// Dzięki temu „dziś 18% napraw" i „średnia 30 dni 26%" mierzą to samo.
//
// Plan: przebieg w toku nie ma jeszcze `result`, ale `wf.script` niesie argumenty skryptu, a w nich
// `telemetryPlan` (orchestrate-prepare, TASK-OBS-006) — wycinamy go z literału.

import fs from 'node:fs';
import path from 'node:path';
import { legacyRunToEvents } from './telemetry-legacy.mjs';
import { buildRollups } from './telemetry-rollup.mjs';
import { rollupsDir } from './telemetry-events.mjs';

const PLAN_KEY = '"telemetryPlan":';

// Pierwsza tablica JSON po kluczu, z uwzględnieniem napisów (nawiasy w stringach nie liczą się).
function sliceJsonArray(text, from) {
  const start = text.indexOf('[', from);
  if (start < 0) return null;
  let depth = 0; let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function extractPlan(wf) {
  const fromResult = wf && wf.result && Array.isArray(wf.result.telemetryPlan) ? wf.result.telemetryPlan : null;
  let raw = fromResult;
  if (!raw && wf && typeof wf.script === 'string') {
    const at = wf.script.indexOf(PLAN_KEY);
    const json = at >= 0 ? sliceJsonArray(wf.script, at + PLAN_KEY.length) : null;
    try { raw = json ? JSON.parse(json) : null; } catch { raw = null; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x.id === 'string' && x.id).map((x) => x.id);
}

// Task z argumentów skryptu (`"task": { "id": "TS-…"`), gdy przebieg jeszcze nie zwrócił wyniku.
export function extractTaskRef(wf) {
  if (wf && wf.result && typeof wf.result.taskId === 'string') return wf.result.taskId;
  const m = typeof wf?.script === 'string' ? wf.script.match(/"task":\s*\{[^{}]*?"id":\s*"([^"]+)"/) : null;
  return m ? m[1] : null;
}

const VERDICT_IN_PREVIEW = /"verdict"\s*:\s*"([A-Za-z_]+)"/;

// Werdykt zakończonego agenta: journal (result.verdict) → podgląd wyniku z wf → 'ok'.
function outcomeOf(agent, resultByAgent) {
  const r = resultByAgent.get(agent.agentId);
  if (r && typeof r === 'object' && typeof r.verdict === 'string') return r.verdict;
  const m = typeof agent.resultPreview === 'string' ? agent.resultPreview.match(VERDICT_IN_PREVIEW) : null;
  return m ? m[1] : 'ok';
}

const isoOf = (ms, fallback) => new Date(Number.isFinite(ms) ? ms : fallback).toISOString();

// Id kroku z agregatów → id z planu: bramka końcowa to `final:gate`, reszta bez numeru rundy.
export function planIdOf(stepId) {
  return String(stepId).replace(/#\d+(\.\d+)?$/, '').replace(/^final:final:/, 'final:');
}

const isFinal = (stepId) => planIdOf(stepId).startsWith('final:');
const isCanonicalId = (stepId) => /#\d+(\.\d+)?$/.test(String(stepId));
const unitOfId = (stepId) => planIdOf(stepId).split(':').slice(0, -1).join(':');

// Wiersz, do którego należy krok. Kroki dokładkowe (`<jednostka>-final-fix`, `-doc-fixes`, sondy po
// naprawie) dostają własną „jednostkę" z konwertera, więc dopasowujemy je do jednostki z planu po
// prefiksie etykiety — inaczej wiersze mnożą się ponad plan. Bez planu zostaje to, co podał konwerter.
function rowKeyOf(step, planUnits) {
  if (isFinal(step.id) || /^final-/.test(String(step.id))) return 'final';
  const raw = isCanonicalId(step.id) ? unitOfId(step.id) : String(step.id);
  if (planUnits.includes(raw)) return raw;
  const hit = planUnits.filter((k) => raw.startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
  if (hit) return hit;
  return planUnits.length ? null : (isCanonicalId(step.id) ? raw : null);
}

/**
 * wf, journal: rekordy z plików; costOf(agent) → USD|null (opcjonalne); now: ms.
 * Zwraca model widoku bez żadnego formatowania.
 */
export function buildLiveView({ wf, journal = [], project, now, costOf = () => null }) {
  const resultByAgent = new Map();
  for (const e of journal) if (e.type === 'result' && e.agentId) resultByAgent.set(e.agentId, e.result);

  const agents = (wf.workflowProgress || []).filter((p) => p.type === 'workflow_agent');
  const running = agents.filter((a) => a.state === 'running' || (a.state !== 'done' && !a.cached && wf.status === 'running'));
  const ended = agents.filter((a) => !running.includes(a));
  const startMs = Number.isFinite(wf.startTime) ? wf.startTime : Date.parse(wf.timestamp);

  const stepOf = (a, outcome) => ({
    type: 'step', ts: isoOf(a.startedAt, startMs), runId: wf.runId, workflowName: wf.workflowName,
    agentId: a.agentId, label: a.label, agentType: a.agentType, model: a.model,
    outcome, toolCalls: a.toolCalls, durationMs: a.durationMs, costUsd: a.cached ? 0 : costOf(a),
  });
  const steps = ended.map((a) => stepOf(a, a.cached ? 'cached' : outcomeOf(a, resultByAgent)));
  const events = legacyRunToEvents({ steps, run: null, project }).filter((e) => e.kind === 'step.end');

  const plan = extractPlan(wf);
  const doneIds = new Set(events.filter((e) => ['implementer', 'verifier', 'gate'].includes(e.step.role))
    .map((e) => planIdOf(e.step.id)));
  const planDone = plan.filter((id) => doneIds.has(id)).length;

  const planUnits = [...new Set(plan.filter((id) => !isFinal(id)).map(unitOfId))];
  const units = new Map();
  const unit = (key) => {
    if (!units.has(key)) units.set(key, { key, verdicts: [], steps: 0, state: 'pending', current: null });
    return units.get(key);
  };
  for (const id of plan) unit(isFinal(id) ? 'final' : unitOfId(id));
  for (const e of events) {
    const key = rowKeyOf(e.step, planUnits);
    if (!key) continue;
    const u = unit(key);
    u.steps++;
    if (e.step.role === 'verifier' || e.step.role === 'gate') u.verdicts.push(e.outcome);
  }

  // Agent w toku: ten sam konwerter daje mu id kroku, a stąd jednostkę (zdarzenie run.start pomijamy).
  const runningSteps = running.map((a) => {
    const ev = legacyRunToEvents({ steps: [stepOf(a, 'ok')], run: null, project }).find((e) => e.kind === 'step.end');
    const key = (ev && rowKeyOf(ev.step, planUnits)) || a.label;
    return {
      key, label: a.label, agentType: a.agentType || null, toolCalls: a.toolCalls ?? 0,
      elapsedMs: Number.isFinite(a.startedAt) ? Math.max(0, now - a.startedAt) : null, lastTool: a.lastToolName || null,
    };
  });
  for (const r of runningSteps) { const u = unit(r.key); u.state = 'running'; u.current = r; }

  const rows = [...units.values()].filter((u) => u.key !== 'final' || u.steps || u.state === 'running' || plan.some(isFinal));
  for (const u of rows) {
    const last = u.verdicts[u.verdicts.length - 1];
    u.noGo = u.verdicts.filter((v) => v === 'no_go').length;
    u.rounds = u.verdicts.length;
    if (u.state !== 'running') u.state = last === 'go' ? 'done' : (u.steps ? 'blocked' : 'pending');
    u.repair = u.noGo === 0 ? null : (last === 'go' ? 'fixed' : 'open');
  }

  const roll = [...buildRollups(events).values()][0];
  const proc = roll && roll.processes && Object.values(roll.processes)[0];
  const costKnown = events.filter((e) => e.m && Number.isFinite(e.m.costUsd));
  const causes = {};
  for (const e of events) if (e.cause) causes[e.cause] = (causes[e.cause] || 0) + 1;

  return {
    runId: wf.runId, project, process: wf.workflowName || null, taskRef: extractTaskRef(wf),
    status: wf.status || null,
    elapsedMs: wf.status === 'running' ? Math.max(0, now - startMs) : (wf.durationMs ?? null),
    costUsd: costKnown.length ? +costKnown.reduce((s, e) => s + e.m.costUsd, 0).toFixed(4) : null,
    plan: { total: plan.length, done: planDone, extra: Math.max(0, doneIds.size - planDone) },
    units: rows, running: runningSteps, steps: events.length,
    repairs: proc ? { fixSteps: proc.repairs.fixSteps, fixed: proc.repairs.fixed, open: proc.repairs.open } : { fixSteps: 0, fixed: 0, open: 0 },
    causes,
  };
}

/** Średnie z rollupów projektu z ostatnich `days` dni (wszystkie hosty). Brak historii → steps: 0. */
export function loadBaseline({ project, processName = 'orchestrate', days = 30, now, dir = rollupsDir() }) {
  const out = { steps: 0, fixSteps: 0, runs: 0, causes: {}, days };
  const pdir = path.join(dir, project);
  let files = [];
  try { files = fs.readdirSync(pdir).filter((f) => f.endsWith('.json')); } catch { return out; }
  const since = new Date(now - days * 86400000).toISOString().slice(0, 10);
  for (const f of files) {
    if (f.slice(0, 10) < since) continue;
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8')); } catch { continue; }
    const p = r.processes && r.processes[processName];
    if (!p) continue;
    out.steps += p.steps || 0;
    out.fixSteps += (p.repairs && p.repairs.fixSteps) || 0;
    out.runs += (r.runs && r.runs[processName] && r.runs[processName].started) || 0;
    for (const role of Object.values(p.roles || {})) {
      for (const [c, n] of Object.entries(role.causes || {})) out.causes[c] = (out.causes[c] || 0) + n;
    }
  }
  return out;
}

const fmtMs = (ms) => {
  if (!Number.isFinite(ms)) return '?';
  const s = Math.round(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const topCauses = (c) => Object.entries(c)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
  .map(([k, n]) => `${k} ×${n}`).join(', ') || 'brak';

export function renderLive(view, baseline) {
  const L = [];
  const live = view.status === 'running';
  const cost = view.costUsd === null ? 'koszt ?' : `~$${view.costUsd.toFixed(2)}`;
  L.push(`${view.project}  ·  ${view.process || '?'}${view.taskRef ? `  ·  ${view.taskRef}` : ''}  ·  ${live ? 'w toku' : (view.status || '?')}  ·  ${fmtMs(view.elapsedMs)}  ·  ${cost}`);
  const { total, done, extra } = view.plan;
  if (total) {
    const w = 20; const filled = Math.min(w, Math.round((done / total) * w));
    L.push(`plan  [${'█'.repeat(filled)}${'░'.repeat(w - filled)}] ${done}/${total} kroków planu${extra ? `  (+${extra} poza planem)` : ''}`);
  } else {
    L.push(`plan  brak telemetryPlan w przebiegu — ${view.steps} kroków zakończonych`);
  }
  L.push('');
  const mark = { done: '✓', running: '▶', blocked: '✗', pending: '·' };
  for (const u of view.units) {
    const parts = [];
    if (u.rounds) parts.push(`${u.rounds} ${u.rounds === 1 ? 'runda' : 'rundy'}`);
    if (u.noGo) parts.push(`NO-GO ×${u.noGo} → ${u.repair === 'fixed' ? 'naprawione' : 'otwarte'}`);
    if (u.current) parts.push(`${u.current.agentType || u.current.label}  ${u.current.toolCalls} narz.  ${fmtMs(u.current.elapsedMs)}`);
    L.push(`  ${mark[u.state]} ${u.key.padEnd(34)} ${parts.join('  ·  ')}`.trimEnd());
  }
  L.push('');
  const r = view.repairs;
  L.push(`naprawy: ${r.fixSteps} z ${view.steps} kroków (${pct(r.fixSteps, view.steps)})  ·  naprawione ${r.fixed}, otwarte ${r.open}`);
  L.push(baseline && baseline.steps
    ? `średnia ${baseline.days} dni: ${pct(baseline.fixSteps, baseline.steps)} (${baseline.steps} kroków, ${baseline.runs} przebiegów)`
    : 'średnia: brak historii agregatów dla tego projektu');
  L.push(`przyczyny: teraz ${topCauses(view.causes)}${baseline && baseline.steps ? `  ·  historia ${topCauses(baseline.causes)}` : ''}`);
  return L.join('\n');
}
