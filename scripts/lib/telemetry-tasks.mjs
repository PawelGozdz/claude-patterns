// scripts/lib/telemetry-tasks.mjs — koszt dowiezienia taska, nie przebiegu (TASK-OBS-012, ADR 0015 D3).
//
// Czysta funkcja: zdarzenia → Map<"projekt|dzień|host", { [taskRef]: rekord }>. Jednostką jest task
// (`taskRef`), bo 46 ze 122 tasków `/orchestrate` w październiku potrzebowało więcej niż jednego przebiegu,
// a rollup znał tylko przebiegi.
//
// Task liczy się do dnia OSTATNIEGO `run.end` (przechodzący przez północ ląduje w jednym dniu), w pliku
// hosta, który go widział. Blok jest LOKALNY: kluczem jest `taskRef`, więc eksport (telemetry-export.mjs)
// bierze z niego wyłącznie rozkłady. To świadomy wyjątek od ADR 0012 §3 (agregat bez `taskRef`) — wynika
// z ADR 0015 D3; rollupy leżą w gicie wewnętrznego repo.
//
//   runs          — przebiegi `orchestrate` (run.start); `analyzeRuns` — przebiegi `analyze`
//   costUsd       — koszt kroków obu procesów łącznie; `stepsWithoutCost` mówi, ile kroków nie miało kosztu
//   reachedGo     — czy bramka końcowa dała kiedykolwiek `go`
//   costToGoUsd   — koszt kroków do pierwszego `go` bramki końcowej włącznie (null, gdy go nie było)
//   spanMs        — od pierwszego run.start do ostatniego run.end (null bez run.end)

import { round6 } from './telemetry-stats.mjs';
import { isFinalGateStep } from './final-gate-blame.mjs';

const PROCESSES = new Set(['orchestrate', 'analyze']);
const cost = (ev) => (ev.m && Number.isFinite(ev.m.costUsd) ? ev.m.costUsd : null);
const dayOf = (ts) => String(ts).slice(0, 10);

function taskRecord(events) {
  const starts = events.filter((e) => e.kind === 'run.start');
  const ends = events.filter((e) => e.kind === 'run.end');
  const steps = events.filter((e) => e.kind === 'step.end');
  const firstGo = steps.filter((e) => e.process === 'orchestrate' && isFinalGateStep(e) && e.outcome === 'go')
    .sort((a, b) => a.ts.localeCompare(b.ts))[0];
  const sum = (list) => list.reduce((s, e) => s + (cost(e) || 0), 0);
  const firstStart = starts.map((e) => e.ts).sort()[0] || events.map((e) => e.ts).sort()[0];
  const lastEnd = ends.map((e) => e.ts).sort().pop() || null;
  return {
    record: {
      runs: new Set(starts.filter((e) => e.process === 'orchestrate').map((e) => e.runId)).size,
      analyzeRuns: new Set(starts.filter((e) => e.process === 'analyze').map((e) => e.runId)).size,
      costUsd: round6(sum(steps)),
      stepsWithoutCost: steps.filter((e) => cost(e) === null).length,
      reachedGo: Boolean(firstGo),
      costToGoUsd: firstGo ? round6(sum(steps.filter((e) => e.ts <= firstGo.ts))) : null,
      spanMs: lastEnd ? Math.max(0, Date.parse(lastEnd) - Date.parse(firstStart)) : null,
    },
    day: dayOf(lastEnd || events.map((e) => e.ts).sort().pop()),
  };
}

export function buildTaskBlocks(events) {
  const groups = new Map();
  for (const e of events) {
    if (!e.taskRef || !PROCESSES.has(e.process) || !['run.start', 'run.end', 'step.end'].includes(e.kind)) continue;
    const k = `${e.project}|${e.host}|${e.taskRef}`;
    if (!groups.has(k)) groups.set(k, { project: e.project, host: e.host, taskRef: e.taskRef, events: [] });
    groups.get(k).events.push(e);
  }
  const blocks = new Map();
  for (const g of groups.values()) {
    const { record, day } = taskRecord(g.events);
    const key = `${g.project}|${day}|${g.host}`;
    if (!blocks.has(key)) blocks.set(key, {});
    blocks.get(key)[g.taskRef] = record;
  }
  return blocks;
}
