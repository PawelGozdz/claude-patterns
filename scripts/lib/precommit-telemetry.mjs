// scripts/lib/precommit-telemetry.mjs — zdarzenia v1 z bramek pre-commit (TASK-OBS-010, ADR 0012 aneks).
//
// Jeden commit = run.start + step.end per bramka (także OK) + run.end. Z agregatu da się policzyć
// odsetek porażek per bramka (process × role) i zobaczyć bramki, które nigdy nic nie łapią albo są
// czerwone z cudzej winy.
//
// Nazwa bramki jedzie w `step.role` jako STAŁY identyfikator (`eval-hooks`, `validate-agents`):
// etykiety wyświetlane człowiekowi bywają dynamiczne („zmienione: a.js, b.js"), a ścieżki i nazwy
// plików nie wolno wynosić poza maszynę. Wołający podaje `id` jawnie tam, gdzie etykieta jest
// dynamiczna; w pozostałych przypadkach `gateId(label)` robi slug ze statycznej etykiety.
//
// Zapis jest best-effort: nigdy nie rzuca i nie zmienia wyniku bramek. Dedup wyłączony — id są
// świeże, a skan wszystkich plików zdarzeń rósłby z historią i zjadał limit 100 ms na commit.

import crypto from 'node:crypto';
import { appendEventsDedup } from './telemetry-events.mjs';
import { engineVersion } from './engine-version.mjs';

const CENTRAL = 'claude-patterns';
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FALLBACK_ID = 'unknown-gate';

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const iso = (ms) => new Date(ms).toISOString();

/** Slug ze STATYCZNEJ etykiety bramki: „eval: hooks" → „eval-hooks". */
export function gateId(label) {
  const slug = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return SAFE_ID.test(slug) ? slug : FALLBACK_ID;
}

// Przyczyna porażki z rodziny bramki — lista `cause` jest zamknięta (ADR 0012).
export function causeFor(id) {
  if (id.startsWith('eval-')) return 'test';
  if (id.startsWith('lint-')) return 'lint';
  return 'config';
}

/**
 * @param {{ results: Array<{id:string, ok:boolean, startedAt:number, endedAt:number}>,
 *           startedAt: number, endedAt?: number }} p
 * @returns {{ runId: string, events: object[] }}
 */
export function buildPrecommitEvents({ results, startedAt, endedAt = Date.now() }) {
  const runId = `precommit-${stamp()}-${crypto.randomBytes(2).toString('hex')}`;
  const base = { process: 'pre-commit', runId, project: CENTRAL };

  const steps = results.map((r) => {
    const id = SAFE_ID.test(r.id) ? r.id : FALLBACK_ID;
    return {
      ...base, kind: 'step.end', ts: iso(r.endedAt),
      step: { id, role: id },
      outcome: r.ok ? 'ok' : 'failed',
      ...(r.ok ? {} : { cause: causeFor(id) }),
      m: { durationMs: Math.max(0, Math.round(r.endedAt - r.startedAt)) },
    };
  });
  const firstFailure = steps.find((s) => s.outcome === 'failed');

  return {
    runId,
    events: [
      { ...base, kind: 'run.start', ts: iso(startedAt), engine: engineVersion() },
      ...steps,
      {
        ...base, kind: 'run.end', ts: iso(endedAt),
        outcome: firstFailure ? 'failed' : 'ok',
        ...(firstFailure ? { cause: firstFailure.cause } : {}),
        m: { durationMs: Math.max(0, Math.round(endedAt - startedAt)) },
      },
    ],
  };
}

/** Zapisuje przebieg bramek. Nigdy nie rzuca; błąd wraca w polu `error`. */
export function emitPrecommitRun({ results, startedAt }) {
  try {
    const { runId, events } = buildPrecommitEvents({ results, startedAt });
    const res = appendEventsDedup(events, { dedup: false });
    return { runId, written: res.written, rejected: res.rejected.length, ...(res.error ? { error: res.error } : {}) };
  } catch (e) {
    return { runId: null, written: 0, rejected: 0, error: e && e.message ? e.message : String(e) };
  }
}
