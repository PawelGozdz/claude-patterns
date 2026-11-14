// scripts/lib/telemetry-gate-fields.mjs — powody werdyktów w rekordach workflow-steps.jsonl (ORC-167).
// Deterministyczne, zero LLM; tylko identyfikatory i krótkie kody (bez treści ustaleń i bez danych z kodu projektów).
// Stare rekordy nie mają tych pól — czytniki traktują brak jak null (zob. telemetry-legacy.mjs).
//
// Źródła (bez zgadywania z tekstu, jeśli jest pole):
//   - identyfikatory reguł: `findings[].ruleId` werdyktu (VERDICT_SCHEMA, TASK-OBS-018), normalizacja jak w kroku;
//   - gałąź maszynowa:      `result.finalGateOverrides` (szablon, noteGateOverride) — kody `gałąź@runda`;
//   - tryb delty:           `result.finalGateDelta` (ustawiane tylko, gdy runda 2 dostała listę plików delty);
//   - zatrzymanie warstwy:  `result.layers[]` (status ESCALATE_AND_HALT + cause).

import { normalizeRuleHits } from './telemetry-rules.mjs';

export const MAX_IDS = 12;
const OVERRIDE_RE = /^[a-z][a-z0-9-]{0,31}@[0-9]{1,2}$/;

/** Unikalne `ruleId` z ustaleń (łącznie z literałem `new` = ustalenie bez znanego identyfikatora); null = brak pola. */
export function ruleIdsOf(findings) {
  const hits = normalizeRuleHits(findings);
  if (!hits) return null;
  return [...new Set(hits.map((h) => h.ruleId))].slice(0, MAX_IDS);
}

/** Pola rekordu `step` dla werdyktu: `ruleIds` (gdy są ustalenia) i `violationCount` (gdy werdykt niósł `violations`). */
export function stepVerdictFields(verdictObj) {
  if (!verdictObj || typeof verdictObj !== 'object') return {};
  const ids = ruleIdsOf(verdictObj.findings);
  const out = {};
  if (ids && ids.length) out.ruleIds = ids;
  if (Array.isArray(verdictObj.violations)) out.violationCount = verdictObj.violations.length;
  return out;
}

const upper = (v) => (typeof v === 'string' ? v.toUpperCase() : null);
const causeOf = (g) => (g && (g.cause === 'code' || g.cause === 'machine') ? g.cause : null);

/**
 * Gdzie skończył się przebieg: `layer` (halt na warstwie, bramka końcowa się nie odbyła), `final-gate` (bramka dała
 * werdykt), `complete` (bez slotu bramki), `no-result` (brak wyniku skryptu). Wyjaśnia `finalVerdict: null`.
 */
export function endedAtOf(r) {
  if (!r || typeof r !== 'object') return 'no-result';
  if (r.finalGate && typeof r.finalGate.verdict === 'string') return 'final-gate';
  if (Array.isArray(r.layers) && r.layers.some((l) => l && l.status === 'ESCALATE_AND_HALT')) return 'layer';
  return 'complete';
}

/** Pola rekordu `run` niosące powód werdyktu bramki końcowej i zatrzymania. `r` = wf.result (może być pusty). */
export function runGateFields(r) {
  const res = r && typeof r === 'object' ? r : {};
  const fg = res.finalGate && typeof res.finalGate === 'object' ? res.finalGate : null;
  const r1 = res.finalGateRound1 && typeof res.finalGateRound1 === 'object' ? res.finalGateRound1 : null;
  const overrides = Array.isArray(res.finalGateOverrides)
    ? res.finalGateOverrides.filter((o) => typeof o === 'string' && OVERRIDE_RE.test(o)).slice(0, 8)
    : [];
  const halted = Array.isArray(res.layers) ? res.layers.find((l) => l && l.status === 'ESCALATE_AND_HALT') : null;
  const haltId = halted && typeof halted.id === 'string' && /^[A-Za-z0-9:_.-]{1,80}$/.test(halted.id) ? halted.id : null;
  return {
    endedAt: endedAtOf(res),
    finalCause: causeOf(fg),
    finalRuleIds: fg ? ruleIdsOf(fg.findings) : null,
    finalOverrides: overrides.length ? overrides : null,
    // Runda 1 bramki (gdy była runda 2): werdykt, przyczyna i reguły sprzed rundy naprawczej.
    round1Verdict: r1 ? upper(r1.verdict) : null,
    round1Cause: causeOf(r1),
    round1RuleIds: r1 ? ruleIdsOf(r1.findings) : null,
    gateDelta: Boolean(res.finalGateDelta),
    haltLayer: haltId,
    haltCause: halted ? causeOf(halted) : null,
  };
}
