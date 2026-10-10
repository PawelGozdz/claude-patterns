// scripts/lib/telemetry-runs.mjs — zdarzenia kroków i zamykanie przebiegów dla procesów bez Workflow
// (ADR 0012, krok 3). Stan otwartych przebiegów i agentów: hooks/lib/telemetry-sessions.js.
//
// Trzy zapisy, wszystkie idempotentne (`id` wyprowadzone z runId + agentId), więc powtórzony
// hook albo drugi `run-end` niczego nie dubluje:
//   finishAgentStep — hook SubagentStop: krok panelu → `step.end` (wynik z transkryptu, nie z deklaracji agenta);
//   closeRun        — `run-end`: pominięte stage'e → `skipped`, agenci bez końca → `unknown`, potem `run.end`;
//   sweepStaleRuns  — `run-start`: osierocone przebiegi (przerwane, padnięta sesja) → `run.end` z `unknown`.
//
// Prywatność: zdarzenie niesie id slotu, typ agenta, model i liczby. Opis agenta, prompt i jego
// odpowiedź zostają w hooku.

import { createRequire } from 'node:module';
import { appendEventsDedup, deterministicId } from './telemetry-events.mjs';
import { estimateCostUsd, loadPrices, readTranscriptUsage } from '../workflow-metrics-lib.mjs';

const require = createRequire(import.meta.url);
const sessions = require('../../hooks/lib/telemetry-sessions.js');

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

function stepFields(run, agent, outcome, cause, model, m) {
  const id = agent.attempt > 1 ? `${agent.slot}-r${agent.attempt}` : agent.slot;
  return compact({
    id: deterministicId(`${run.runId}:${agent.agentId}`),
    kind: 'step.end', process: run.process, project: run.project, runId: run.runId, taskRef: run.taskRef,
    outcome, cause,
    step: compact({ id, group: 'panel', role: agent.slot, agent: agent.agentType, model, attempt: agent.attempt }),
    m: m && Object.keys(m).length ? m : undefined,
  });
}

/**
 * Zamyka krok agenta po SubagentStop. `stop` = { transcriptPath, hasReply }. Zwraca { ok, outcome }
 * albo { ok: false, error }. Czas kroku bierzemy z sygnatur czasowych transkryptu agenta, nie z
 * chwili rejestracji: hook startu bywa uruchomiony PO zatrzymaniu agenta (szybki agent).
 */
export function finishAgentStep(run, agent, stop) {
  const t = readTranscriptUsage(stop.transcriptPath);
  const { outcome, cause } = sessions.classifyStop({ hasReply: stop.hasReply, apiError: t.apiError });
  const u = t.usage;
  const m = compact({
    toolCalls: t.toolCalls,
    durationMs: t.firstTs !== null && t.lastTs !== null ? Math.max(0, t.lastTs - t.firstTs) : undefined,
    tokensIn: u?.inputTokens, tokensOut: u?.outputTokens, cacheRead: u?.cacheReadTokens, cacheWrite: u?.cacheWriteTokens,
    costUsd: u && t.model ? (estimateCostUsd(u, t.model, loadPrices()) ?? undefined) : undefined,
  });
  const res = appendEventsDedup([stepFields(run, agent, outcome, cause, t.model, m)]);
  if (res.error || res.rejected.length) return { ok: false, error: res.error || res.rejected[0].errors.join('; ') };
  sessions.finishAgent(agent.agentId, { outcome });
  return { ok: true, outcome };
}

/**
 * Zamyka przebieg: dla planu bez kroku → `skipped`, dla agenta bez SubagentStop → `unknown`,
 * na końcu `run.end`. Stan kasujemy dopiero po udanym zapisie, żeby nieudany zapis dało się powtórzyć.
 */
export function closeRun(run, { outcome, cause }) {
  const agents = sessions.agentsOfRun(run.runId);
  const events = [];
  for (const a of agents.filter((x) => !x.done)) events.push(stepFields(run, a, 'unknown', undefined, undefined, undefined));
  const seen = new Set(agents.map((a) => a.slot));
  for (const p of run.plan || []) {
    if (seen.has(p.id)) continue;
    events.push(compact({
      id: deterministicId(`${run.runId}:skipped:${p.id}`),
      kind: 'step.end', process: run.process, project: run.project, runId: run.runId, taskRef: run.taskRef,
      outcome: 'skipped', step: compact({ id: p.id, group: p.group, role: p.role }),
    }));
  }
  const started = Date.parse(run.startedAt);
  events.push(compact({
    id: deterministicId(`${run.runId}:end`),
    kind: 'run.end', process: run.process, project: run.project, runId: run.runId, taskRef: run.taskRef,
    outcome, cause,
    m: Number.isFinite(started) ? { durationMs: Math.max(0, Date.now() - started) } : undefined,
  }));
  const res = appendEventsDedup(events);
  const error = res.error || (res.rejected.length ? res.rejected[0].errors.join('; ') : undefined);
  if (!error) sessions.removeRun(run.runId);
  return { written: res.written, skipped: events.filter((e) => e.outcome === 'skipped').length, error };
}

/** Osierocone przebiegi (starsze niż TTL) → `run.end` z `unknown`. Zwraca liczbę zamkniętych. */
export function sweepStaleRuns() {
  let closed = 0;
  for (const run of sessions.staleRuns()) {
    if (!closeRun(run, { outcome: 'unknown' }).error) closed++;
  }
  return closed;
}
