// scripts/lib/telemetry-rollup.mjs — agregaty dzienne zdarzeń telemetrii v1 (ADR 0012, krok 5).
//
// Czysta funkcja: lista zdarzeń → Map<"projekt|dzień|host", agregat>. Bez I/O i bez zegara, więc ten sam
// wejściowy zestaw zawsze daje bajt w bajt ten sam wynik (idempotencja zapisu i `--check` na tym stoją).
//
// Agregat jest per MASZYNA (`host`): surowe zdarzenia leżą poza gitem i nie scalają się między
// maszynami, a percentyle nie dają się sumować — więc plik hosta niesie liczniki (sumowalne) i
// percentyle (liczone lokalnie), a scalanie robi odbiorca.
//
// Prywatność: agregat NIE niesie `taskRef`, `runId`, ścieżek ani id kroków (te zdradzają nazwy
// jednostek z konfiguracji projektu). Kroki grupuje po `process × role`, odstępstwa po sygnaturze.

const MISSING_ROLE = 'none';
const VERDICTS = new Set(['go', 'no_go']);

const round = (x) => Math.round(x * 1e6) / 1e6;
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };
const dayOf = (ev) => String(ev.ts).slice(0, 10);

/**
 * Jednostka weryfikacji = id kroku bez numeru rundy. Runda ma w danych kilka postaci:
 * `…verifier#2` (orchestrate), `verify:core.2`, `verify:schemas:1`, `verify:x:a1` (workflow).
 * `fixes` wskazuje werdykt rundy N, a następny werdykt jednostki to runda N+1 — oba dają ten sam klucz.
 */
export function unitOf(stepId) {
  return String(stepId).replace(/#\d+$/, '').replace(/\.\d+$/, '').replace(/:a?\d+$/, '');
}

/** Nearest-rank. `sorted` rosnąco; pusta lista → null. */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];
}

function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? { n: v.length, p50: percentile(v, 50), p90: percentile(v, 90) } : { n: 0, p50: null, p90: null };
}

function emptyRollup(project, day, host) {
  return { v: 1, project, day, host, events: 0, stepsTotal: 0, processes: {}, runs: {}, deviations: {} };
}

function processBlock(r, process) {
  return (r.processes[process] ||= {
    steps: 0, retried: 0, died: 0, costUsd: 0, costUsdRetried: 0, stepsWithoutCost: 0,
    roles: {}, verification: { units: 0, firstPassGo: 0 }, repairs: { fixSteps: 0, fixed: 0, open: 0 },
  });
}

const roleBlock = (p, role) => (p.roles[role] ||= { n: 0, outcomes: {}, causes: {}, toolCalls: 0, costUsd: 0, _dur: [] });
const runBlock = (r, process) => (r.runs[process] ||= { started: 0, ended: {}, costUsd: 0, _dur: [] });

// Liczniki per wersja silnika (`engine` z run.start) — porównanie „przed/po zmianie orchestratora"
// bez zgadywania po dacie. Blok powstaje leniwie i tylko dla przebiegów, które znają `engine`
// (stare dane i `null` go nie tworzą), więc agregaty historii zostają bajt w bajt takie same.
const engineBlock = (r, engine, process) => {
  r.engines ||= {};
  const e = (r.engines[engine] ||= {});
  return (e[process] ||= { started: 0, ended: {}, steps: 0, died: 0, costUsd: 0, stepsWithoutCost: 0 });
};
const runKey = (ev) => `${ev.host}|${ev.project}|${ev.runId}`;

const isVerdict = (e) => e.kind === 'step.end' && e.step && e.step.role === 'verifier' && VERDICTS.has(e.outcome);

// Pierwszy werdykt jednostki w przebiegu liczy się do dnia, w którym zapadł — nie dnia końca
// przebiegu. Ustalamy go na CAŁEJ historii, żeby przebieg przecinający północ nie policzył
// drugiej rundy jako pierwszej.
function firstVerdicts(verdicts) {
  const first = new Map();
  for (const e of verdicts) {
    const k = `${e.host}|${e.project}|${e.runId}|${unitOf(e.step.id)}`;
    if (!first.has(k)) first.set(k, e);
  }
  return [...first.values()];
}

// Naprawa = krok z `fixes`; naprawiona, gdy kolejny werdykt tej samej jednostki (w tym przebiegu,
// po kroku naprawy) to `go`. Brak kolejnego werdyktu albo `no_go` = otwarta.
function repairOutcome(fix, verdicts) {
  const unit = unitOf(fix.step.fixes);
  const next = verdicts.find((v) => v.host === fix.host && v.project === fix.project && v.runId === fix.runId
    && unitOf(v.step.id) === unit && v.ts > fix.ts);
  return next && next.outcome === 'go' ? 'fixed' : 'open';
}

export function buildRollups(events) {
  const rollups = new Map();
  const get = (ev) => {
    const day = dayOf(ev);
    const k = `${ev.project}|${day}|${ev.host}`;
    if (!rollups.has(k)) rollups.set(k, emptyRollup(ev.project, day, ev.host));
    return rollups.get(k);
  };
  const engineOf = new Map();
  for (const ev of events) if (ev.kind === 'run.start' && ev.engine) engineOf.set(runKey(ev), ev.engine);
  const verdicts = events.filter(isVerdict).sort((a, b) => a.ts.localeCompare(b.ts));

  for (const ev of events) {
    const r = get(ev);
    r.events++;
    const engine = engineOf.get(runKey(ev));
    const eb = engine && ev.kind !== 'deviation' ? engineBlock(r, engine, ev.process) : null;

    if (ev.kind === 'run.start') {
      runBlock(r, ev.process).started++;
      if (eb) eb.started++;
    } else if (ev.kind === 'run.end') {
      const b = runBlock(r, ev.process);
      bump(b.ended, ev.outcome || 'unknown');
      if (eb) bump(eb.ended, ev.outcome || 'unknown');
      if (ev.m && Number.isFinite(ev.m.costUsd)) b.costUsd += ev.m.costUsd;
      if (ev.m && Number.isFinite(ev.m.durationMs)) b._dur.push(ev.m.durationMs);
    } else if (ev.kind === 'deviation') {
      const d = (r.deviations[ev.signature || 'unknown'] ||= { n: 0, trigger: ev.trigger || null, cause: ev.cause || null });
      d.n++;
    } else if (ev.kind === 'step.end' && ev.step) {
      const p = processBlock(r, ev.process);
      const rb = roleBlock(p, ev.step.role || MISSING_ROLE);
      const cost = ev.m && Number.isFinite(ev.m.costUsd) ? ev.m.costUsd : null;
      r.stepsTotal++;
      p.steps++;
      rb.n++;
      bump(rb.outcomes, ev.outcome || 'unknown');
      if (ev.cause) bump(rb.causes, ev.cause);
      if (ev.m && Number.isFinite(ev.m.toolCalls)) rb.toolCalls += ev.m.toolCalls;
      if (ev.m && Number.isFinite(ev.m.durationMs)) rb._dur.push(ev.m.durationMs);
      if (ev.outcome === 'died') p.died++;
      if (cost === null) p.stepsWithoutCost++;
      else { p.costUsd += cost; rb.costUsd += cost; }
      if (eb) {
        eb.steps++;
        if (ev.outcome === 'died') eb.died++;
        if (cost === null) eb.stepsWithoutCost++;
        else eb.costUsd += cost;
      }
      if (ev.step.attempt > 1) { p.retried++; if (cost !== null) p.costUsdRetried += cost; }
      if (ev.step.fixes) {
        p.repairs.fixSteps++;
        p.repairs[repairOutcome(ev, verdicts)]++;
      }
    }
  }

  for (const ev of firstVerdicts(verdicts)) {
    const p = processBlock(get(ev), ev.process);
    p.verification.units++;
    if (ev.outcome === 'go') p.verification.firstPassGo++;
  }

  for (const r of rollups.values()) finalize(r);
  return rollups;
}

function finalize(r) {
  for (const p of Object.values(r.processes)) {
    p.costUsd = round(p.costUsd);
    p.costUsdRetried = round(p.costUsdRetried);
    for (const rb of Object.values(p.roles)) {
      rb.costUsd = round(rb.costUsd);
      rb.durationMs = stats(rb._dur);
      delete rb._dur;
    }
  }
  for (const e of Object.values(r.engines || {})) for (const b of Object.values(e)) b.costUsd = round(b.costUsd);
  for (const b of Object.values(r.runs)) {
    b.costUsd = round(b.costUsd);
    b.durationMs = stats(b._dur);
    delete b._dur;
  }
}

// Klucze posortowane rekurencyjnie: kolejność wstawiania zależy od kolejności zdarzeń w pliku,
// a plik w gicie nie może zmieniać się bez zmiany danych.
export function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]));
  }
  return value;
}

export const GENERATED_NOTE = 'GENERATED by scripts/telemetry-aggregate.mjs — nie edytuj ręcznie; przelicz: node scripts/telemetry-aggregate.mjs';

export function serializeRollup(rollup) {
  return `${JSON.stringify(sortDeep({ _generated: GENERATED_NOTE, ...rollup }), null, 2)}\n`;
}
