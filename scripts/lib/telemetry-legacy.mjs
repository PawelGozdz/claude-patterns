// scripts/lib/telemetry-legacy.mjs — rekordy workflow-steps.jsonl → zdarzenia v1 (ADR 0012, krok 2).
//
// Jeden konwerter dla dwóch wołających: collectora (nowe przebiegi) i migracji historii
// (`scripts/telemetry-migrate-legacy.mjs`), żeby stare i nowe dane miały identyczną semantykę.
//
// Co odtwarzamy z etykiety, bo w rekordzie tego nie ma (dane z 2026-10-10):
// - `attempt` w starym rekordzie jest bezużyteczny (5068 z 5101 kroków kanonicznych = 1);
//   numer rundy siedzi w etykiecie: `<warstwa>:<jednostka>-<rola>[-<runda>]`, np.
//   `testing:repro-test-diff-gate-2`. Kolejny `-impl` tej samej jednostki = kolejna runda.
// - `fixes`: implementer w rundzie > 1 naprawia to, co zwrócił poprzedni werdykt jednostki
//   (NO_GO albo GO z drobnymi poprawkami) — wskazujemy id tego werdyktu; agregat sam
//   rozstrzyga „naprawione / otwarte" po wyniku kolejnego werdyktu.
// - proces: kanoniczny skrypt ma `workflowName === 'orchestrate'`; wszystko inne to ręcznie
//   pisany skrypt Workflow (`workflow`) — dla zespołu claude-patterns to osobna metryka.

import path from 'node:path';
import { normalizeOutcome, deterministicId } from './telemetry-events.mjs';
import { resolveProjectSlug } from '../workflow-metrics-lib.mjs';

// Slug '-opt-projects-juz-ide-api-1' → 'juz-ide-api-1'. Najpierw prawdziwy katalog (slug jest
// niejednoznaczny), a gdy projekt już nie istnieje na dysku — odcięcie znanego prefiksu.
export function projectFromSlug(slug, cache = new Map()) {
  if (!cache.has(slug)) {
    const dir = resolveProjectSlug(slug);
    cache.set(slug, dir ? path.basename(dir) : String(slug).replace(/^-opt-projects-/, '').replace(/^-+/, ''));
  }
  return cache.get(slug);
}

const CANONICAL = /^([^:]+):(.+?)-(impl|diff-gate|diff-probe|checks|verify-noop|verify|tree-probe)(?:-(\d+))?$/;
const FINAL = /^final-(gate|tree-probe|checks|diff-probe)(?:-(\d+))?$/;

const ROLE_OF = {
  impl: 'implementer', 'diff-gate': 'probe', 'diff-probe': 'probe', checks: 'probe',
  'tree-probe': 'probe', verify: 'verifier', 'verify-noop': 'verifier', gate: 'gate',
};

// Ręczne skrypty Workflow nazywają kroki dowolnie — rola tylko po słowie kluczowym.
const KEYWORD_ROLES = [
  [/final-gate|(^|[-:_])gate($|[-:_\d])/i, 'gate'],
  [/verif|review/i, 'verifier'],
  [/(^|[-:_])fix/i, 'fixer'],
  [/typecheck|git-status|probe|fingerprint|checks?($|[-:_\d])/i, 'probe'],
  [/impl/i, 'implementer'],
];

export function parseStepLabel(label) {
  const s = String(label || '');
  let m = s.match(CANONICAL);
  if (m) return { group: m[1], unit: m[2], role: ROLE_OF[m[3]], round: m[4] ? Number(m[4]) : null, canonical: true };
  m = s.match(FINAL);
  if (m) return { group: 'final', unit: 'final', role: ROLE_OF[m[1]] || 'probe', round: m[2] ? Number(m[2]) : null, canonical: true };
  const hit = KEYWORD_ROLES.find(([re]) => re.test(s));
  const r = s.match(/-(\d+)$/);
  return {
    group: s.includes(':') ? s.split(':')[0] : null,
    unit: s || '(bez etykiety)',
    role: hit ? hit[1] : null,
    round: r ? Number(r[1]) : null,
    canonical: false,
  };
}

const TS_ID = /^(?:orchestrate-(?:ddd-|blocks-)?)?((?:ts|task)-[a-z]+(?:-[a-z]+)*-\d{3})/i;

export function taskRefFromWorkflowName(name) {
  const m = String(name || '').match(TS_ID);
  return m ? m[1].toUpperCase() : null;
}

export function processOf(workflowName) {
  return workflowName === 'orchestrate' ? 'orchestrate' : 'workflow';
}

function iso(x) {
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function int(x) {
  return Number.isFinite(x) ? Math.round(x) : null;
}

function causeOf(outcome, role, label) {
  if (outcome === 'died') return 'silent';
  if (outcome !== 'no_go') return null;
  if (/typecheck/i.test(label)) return 'typecheck';
  return role === 'verifier' || role === 'gate' ? 'verifier' : 'other';
}

const SAFE_REF = /^[A-Za-z0-9._-]{1,80}$/;

// Kanoniczny skrypt zawsze kończy się `completed` (STAGE_NOT_COMMIT) — „czy praca przeszła"
// mówi dopiero werdykt bramki końcowej. Bez tego wszystkie 420 przebiegów wyglądało na udane.
// Kolejność źródeł: eskalacja → status inny niż ok → werdykt z result → ostatni krok bramki.
function runOutcome(run, events) {
  if (run.escalatedAt) return 'halted';
  const status = normalizeOutcome(run.status);
  if (status !== 'ok') return status;
  const verdict = run.finalVerdict ? normalizeOutcome(run.finalVerdict) : null;
  if (verdict === 'no_go') return 'no_go';
  if (verdict) return status;
  const gates = events.filter((e) => e.kind === 'step.end' && e.step.role === 'gate' && (e.outcome === 'go' || e.outcome === 'no_go'));
  return gates.length && gates[gates.length - 1].outcome === 'no_go' ? 'no_go' : status;
}

// steps — rekordy 'step' JEDNEGO przebiegu; run — jego rekord 'run' (może brakować);
// project — nazwa katalogu projektu (nie slug). Zwraca listę pól zdarzeń dla appendEventsDedup.
export function legacyRunToEvents({ steps = [], run = null, project }) {
  const first = run || steps[0];
  if (!first) return [];
  const runId = first.runId;
  const process = processOf(first.workflowName);
  const taskRef = (run && SAFE_REF.test(run.taskRef || '') ? run.taskRef : null)
    || taskRefFromWorkflowName(first.workflowName);
  const base = { process, project, runId, ...(taskRef ? { taskRef } : {}) };

  const ordered = steps
    .map((s, i) => ({ s, i, ts: iso(s.ts) }))
    .filter((x) => x.ts)
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.i - b.i);

  const units = new Map(); // unitKey → { impl: n, lastVerdictId }
  const usedIds = new Map();
  const events = [];

  for (const { s, i, ts } of ordered) {
    const p = parseStepLabel(s.label);
    const unitKey = `${p.group ?? ''}:${p.unit}`;
    const u = units.get(unitKey) || { impl: 0, lastVerdictId: null };
    let attempt; let fixes = null;
    if (p.role === 'implementer') {
      u.impl += 1;
      attempt = u.impl;
      if (u.impl > 1) fixes = u.lastVerdictId;
    } else {
      attempt = p.round ?? (u.impl || (p.canonical ? 1 : null));
    }
    // Część ręcznych skryptów numeruje rundy od zera (`-0`) — schemat wymaga attempt ≥ 1.
    if (attempt !== null && attempt < 1) attempt = attempt + 1;

    let stepId = p.canonical ? `${unitKey}:${p.role}#${attempt ?? 1}` : String(s.label || `step-${i}`);
    const n = usedIds.get(stepId) || 0;
    usedIds.set(stepId, n + 1);
    if (n) stepId = `${stepId}.${n + 1}`;
    if (p.role === 'verifier' || p.role === 'gate') u.lastVerdictId = stepId;
    units.set(unitKey, u);

    const outcome = normalizeOutcome(s.outcome);
    const cause = causeOf(outcome, p.role, String(s.label || ''));
    events.push({
      id: deterministicId(`${runId}::${s.agentId || `${s.label}#${i}`}`),
      ts, kind: 'step.end', ...base,
      step: {
        id: stepId, group: p.group, role: p.role, agent: s.agentType ?? null,
        model: s.model ?? null, attempt: attempt ?? null, fixes,
      },
      outcome,
      ...(cause ? { cause } : {}),
      m: {
        toolCalls: int(s.toolCalls), durationMs: int(s.durationMs),
        tokensIn: int(s.inputTokens), tokensOut: int(s.outputTokens),
        cacheRead: int(s.cacheReadTokens), cacheWrite: int(s.cacheWriteTokens),
        costUsd: Number.isFinite(s.costUsd) ? s.costUsd : null,
      },
    });
  }

  const runTs = run ? iso(run.ts) : null;
  const stepTs = ordered.map((x) => x.ts);
  const startTs = [runTs, stepTs[0]].filter(Boolean).sort()[0];
  if (startTs) events.unshift({ id: deterministicId(`${runId}::start`), ts: startTs, kind: 'run.start', ...base });

  if (run) {
    const endTs = [runTs, stepTs[stepTs.length - 1]].filter(Boolean).sort().pop();
    events.push({
      id: deterministicId(`${runId}::end`),
      ts: endTs, kind: 'run.end', ...base,
      outcome: runOutcome(run, events),
      m: { toolCalls: int(run.totalToolCalls), durationMs: int(run.durationMs), costUsd: Number.isFinite(run.costUsd) ? run.costUsd : null },
    });
  }
  return events;
}
