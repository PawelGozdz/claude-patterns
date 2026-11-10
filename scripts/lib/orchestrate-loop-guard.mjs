// scripts/lib/orchestrate-loop-guard.mjs — wyłącznik pętli NO-GO bramki końcowej (TASK-ORC-GATE-COST-001, E1).
//
// Kryterium: dwa ostatnie runy tego samego `taskRef` (bez rozróżniania wielkości liter) skończyły się NO-GO
// bramki końcowej z TYM SAMYM `ruleSignature` (telemetry-rules.mjs). Odcisk `null` (same `new`, brak raportu
// ustaleń) NIGDY nie zatrzymuje: bez znanych identyfikatorów nie da się stwierdzić, że to to samo ustalenie.
//
// Moduł jest czysty tam, gdzie się da (`assessRepeat` bierze listę zdarzeń); dysk dotykają tylko
// `loadTaskEvents` i `recordRepeat`. `checkLoop` nie rzuca: błąd odczytu to ostrzeżenie, nie blokada
// (metryka nie może zatrzymać startu; zatrzymać może wyłącznie jawna flaga `--block-repeat`).

import fs from 'node:fs';
import path from 'node:path';
import { eventsDir, readEvents, deterministicId, appendEvent, defaultCategory, projectName } from './telemetry-events.mjs';
import { ruleSignature, UNKNOWN_RULE } from './telemetry-rules.mjs';
import { isFinalGateStep } from './final-gate-blame.mjs';

export const TRIGGER_WARN = 'repeat_no_go';
export const TRIGGER_BLOCKED = 'repeat_no_go_blocked';
const SAFE_REF = /^[A-Za-z0-9._-]{1,80}$/;
const sameRef = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();
const byTs = (a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);

// Bramka rozstrzygająca o runie: `final:final:gate#N` albo starsze `final-gate-r2`. `final-fix-*` to bramki
// poprawek po werdykcie i same o NO-GO runu nie rozstrzygają (predykat `isFinalGateStep` je łapie, stąd wykluczenie).
const decidesRun = (e) => isFinalGateStep(e) && !/^final-fix/.test(String(e.step.id));

/**
 * Z listy zdarzeń wybiera dwa ostatnie runy `orchestrate` tego taska i ocenia, czy skończyły się tym samym
 * NO-GO bramki. Zwraca zawsze { repeat, reason, signature, ruleIds, runs } (`runs` od najstarszego).
 */
export function assessRepeat(events, taskId) {
  const mine = events.filter((e) => e && e.process === 'orchestrate' && sameRef(e.taskRef, taskId));
  const starts = new Map();
  for (const e of mine) if (e.kind === 'run.start' && e.runId && !starts.has(e.runId)) starts.set(e.runId, e);
  const last = [...starts.values()].sort(byTs).slice(-2);
  if (last.length < 2) return { repeat: false, reason: 'mniej niż dwa wcześniejsze runy tego taska', signature: null, ruleIds: [], runs: [] };

  const verdicts = last.map((run) => {
    const decisive = mine.filter((e) => e.runId === run.runId && decidesRun(e)).sort(byTs).at(-1) || null;
    const noGo = decisive && decisive.outcome === 'no_go';
    return {
      runId: run.runId, ts: run.ts, project: run.project || null,
      outcome: decisive ? decisive.outcome : null,
      signature: noGo ? ruleSignature(decisive.step.ruleHits) : null,
      ruleIds: noGo && Array.isArray(decisive.step.ruleHits) ? decisive.step.ruleHits.map((h) => h && h.ruleId) : [],
    };
  });
  const runs = verdicts.map(({ runId, ts, project, outcome, signature }) => ({ runId, ts, project, outcome, signature }));
  const none = (reason) => ({ repeat: false, reason, signature: null, ruleIds: [], runs });
  const [a, b] = verdicts;
  if (a.outcome !== 'no_go' || b.outcome !== 'no_go') return none('któryś z dwóch ostatnich runów nie skończył się NO-GO bramki końcowej');
  if (!a.signature || !b.signature) return none('brak odcisku ustaleń (same `new` albo brak raportu): nie da się potwierdzić powtórzenia');
  if (a.signature !== b.signature) return none('dwa ostatnie NO-GO mają różne odciski ustaleń');
  const ruleIds = [...new Set(b.ruleIds.filter((id) => typeof id === 'string' && id !== UNKNOWN_RULE))].sort();
  return { repeat: true, reason: 'ten sam odcisk ustaleń w dwóch ostatnich NO-GO', signature: a.signature, ruleIds, runs };
}

/**
 * Zdarzenia orchestrate tego taska, od najnowszego pliku miesięcznego wstecz, aż pojawią się dwa runy.
 * Wystarcza: runy z nowszych plików są nowsze od wszystkich w starszych, a bramka runu leży w pliku jego
 * startu albo w nowszym (czytanym wcześniej).
 */
export function loadTaskEvents(taskId, dir = eventsDir()) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort().reverse();
  const out = [];
  const runIds = new Set();
  for (const f of files) {
    for (const e of readEvents(path.join(dir, f))) {
      if (e.process !== 'orchestrate' || !sameRef(e.taskRef, taskId)) continue;
      out.push(e);
      if (e.kind === 'run.start' && e.runId) runIds.add(e.runId);
    }
    if (runIds.size >= 2) break;
  }
  return out;
}

const ruleLabel = (a) => (a.ruleIds.length ? a.ruleIds.join(', ') : `odcisk ${a.signature}`);

export function repeatMessage(a, taskId) {
  const [x, y] = a.runs;
  return `dwa ostatnie runy ${taskId} (${x.runId}, ${y.runId}) skończyły się NO-GO bramki z tym samym ustaleniem: ${ruleLabel(a)} `
    + `(odcisk ${a.signature}). Kolejny run bez zmiany wejścia je powtórzy: popraw specyfikację taska, \`analysis.md\` albo podejmij brakującą decyzję.`;
}

/**
 * Zapisuje zdarzenie `deviation` „zablokowałbym" (albo „zablokowałem"). Idempotentne: id wynika z taska i
 * dwóch runów, więc powtórny prepare tej samej pary nie dubluje zdarzenia (sprawdzane w `events`).
 * Zdarzenie niesie odcisk w `signature` (`repeat-no-go.<12 hex>`), ten sam, który liczy `ruleSignature` z
 * `ruleHits` bramki, więc `ruleId` odzyskuje się złączeniem po odcisku; listy reguł schemat deviation nie ma.
 */
export function recordRepeat(a, { taskId, projectDir, blocked, events = [] }) {
  const trigger = blocked ? TRIGGER_BLOCKED : TRIGGER_WARN;
  const id = deterministicId(`loop-guard|${trigger}|${String(taskId).toUpperCase()}|${a.runs.map((r) => r.runId).join('|')}`);
  if (events.some((e) => e.id === id)) return { recorded: false, duplicate: true };
  const fields = {
    id, kind: 'deviation', process: 'orchestrate', project: projectName(projectDir),
    runId: `prepare-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    signature: `repeat-${blocked ? 'blocked' : 'no-go'}.${a.signature}`,
    trigger, cause: defaultCategory(trigger),
  };
  if (SAFE_REF.test(String(taskId))) fields.taskRef = String(taskId);
  const res = appendEvent(fields);
  return res.ok ? { recorded: true } : { recorded: false, error: res.error };
}

/**
 * Wejście dla prepare. `block` = `--block-repeat`, `allow` = `--allow-repeat`.
 * Zwraca { blocked, warnings[], message?, assessment }. Błąd odczytu nigdy nie blokuje.
 */
export function checkLoop({ taskId, projectDir, block = false, allow = false, dir } = {}) {
  try {
    const events = loadTaskEvents(taskId, dir);
    const a = assessRepeat(events, taskId);
    if (!a.repeat) return { blocked: false, warnings: [], assessment: a };
    const blocked = block && !allow;
    const rec = recordRepeat(a, { taskId, projectDir, blocked, events });
    const message = repeatMessage(a, taskId);
    const head = blocked ? 'wyłącznik pętli NO-GO'
      : block ? 'wyłącznik pętli NO-GO pominięty (--allow-repeat)'
        : 'wyłącznik pętli NO-GO, tryb ostrzegawczy (zablokowałbym start; blokada: --block-repeat)';
    const warnings = [`${head}: ${message}${blocked ? '' : ' Wyjście z blokady: --allow-repeat.'}`];
    if (rec.error) warnings.push(`wyłącznik pętli: zdarzenia telemetrii nie zapisano (${rec.error})`);
    return { blocked, warnings, message, assessment: a };
  } catch (e) {
    return { blocked: false, warnings: [`wyłącznik pętli: nie udało się odczytać telemetrii (${e && e.message ? e.message : e}), start bez sprawdzenia`], assessment: null };
  }
}
