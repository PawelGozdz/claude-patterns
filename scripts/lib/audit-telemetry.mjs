// scripts/lib/audit-telemetry.mjs — zdarzenia v1 z przebiegu audytu floty (TASK-OBS-004, ADR 0012 krok 4).
//
// Jeden przebieg `audit-projects` = run.start + step.end per projekt × kontrola (także OK) + run.end.
// Dzięki temu da się policzyć odsetek zdrowych kontroli dzień po dniu, a nie tylko listę błędów.
//
// Kształt: run.* niesie projekt `claude-patterns` (audyt jest procesem centrali), a step.end — audytowany
// projekt, żeby agregat per projekt/dzień widział jego zdrowie. Nazwa kontroli jedzie w `step.role`
// (agregat grupuje po process × role, więc dostajemy odsetek porażek per kontrola); `step.group` = projekt.
// Id kroków i nazwy projektów zostają lokalnie — agregat i paczka dla serwera ich nie niosą.
//
// Wynik kroku: `failed` (cause config) przy BŁĘDZIE lub OSTRZEŻENIU, `ok` przy samym INFO albo bez znalezisk.
// Uśpiony projekt liczy się wg surowej wagi znaleziska (sprzed zdegradowania do INFO).

import crypto from 'node:crypto';
import { appendEventsDedup } from './telemetry-events.mjs';
import { engineVersion } from './engine-version.mjs';

const CENTRAL = 'claude-patterns';

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/**
 * @param {{ rows: Array<{name:string, checks:Array<{check:string, failed:boolean}>}>,
 *           globals: Array<{check:string, failed:boolean}>, startedAt: number, errors: number }} p
 * @returns {{ runId: string, written: number, rejected: number, error?: string }}
 */
export function emitAuditRun({ rows, globals, startedAt, errors }) {
  const runId = `audit-${stamp()}-${crypto.randomBytes(2).toString('hex')}`;
  const base = { process: 'audit', runId };
  const step = (project, check, failed) => ({
    ...base, kind: 'step.end', project,
    step: { id: `${project}:${check}`, group: project, role: check },
    outcome: failed ? 'failed' : 'ok',
    ...(failed ? { cause: 'config' } : {}),
  });

  const events = [{ ...base, kind: 'run.start', project: CENTRAL, engine: engineVersion() }];
  for (const r of rows) for (const c of r.checks) events.push(step(r.name, c.check, c.failed));
  for (const g of globals) events.push(step(CENTRAL, g.check, g.failed));
  events.push({
    ...base, kind: 'run.end', project: CENTRAL,
    outcome: errors ? 'failed' : 'ok',
    ...(errors ? { cause: 'config' } : {}),
    m: { durationMs: Math.max(0, Date.now() - startedAt) },
  });

  const res = appendEventsDedup(events);
  return { runId, written: res.written, rejected: res.rejected.length, ...(res.error ? { error: res.error } : {}) };
}
