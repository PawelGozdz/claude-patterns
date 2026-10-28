// scripts/lib/telemetry-events.mjs — zapis zdarzeń telemetrii v1 (ADR 0012).
//
// Jedno miejsce, przez które każdy proces (orchestrate, analyze, audit, setup) zapisuje
// metryki przebiegu — także udane kroki, bo bez mianownika skrzynka `_inbox` nie powie,
// jaki odsetek pracy to problemy. Listy (kind, process, outcome, cause) NIE są tu
// przepisane: walidator czyta je z `schemas/telemetry-event-v1.schema.json`, więc schemat
// jest jedynym źródłem prawdy dla zapisu i dla przyszłego transportu na serwer.
//
// Zapis jest best-effort: `appendEvent` nigdy nie rzuca — zwraca { ok, error }, a wołający
// wypisuje ostrzeżenie i jedzie dalej. Metryka nie może przerwać pracy, którą mierzy.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'telemetry-event-v1.schema.json');
export const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Centralnie w repo, ale poza gitem (.gitignore: telemetry/events/) — per maszyna.
export function eventsDir() {
  return process.env.CLAUDE_TELEMETRY_DIR || path.join(REPO_ROOT, 'telemetry', 'events');
}

// Agregaty dzienne (telemetry-aggregate.mjs) — w gicie, scalają się z wielu maszyn. Ścieżkę
// nadpisuje CLAUDE_TELEMETRY_ROLLUPS_DIR (testy), tak jak CLAUDE_TELEMETRY_DIR dla zdarzeń.
export function rollupsDir() {
  return process.env.CLAUDE_TELEMETRY_ROLLUPS_DIR || path.join(REPO_ROOT, 'telemetry', 'rollups');
}

export function eventsFileFor(ts) {
  return path.join(eventsDir(), `${String(ts).slice(0, 7)}.jsonl`);
}

export const KINDS = SCHEMA.properties.kind.enum;
export const PROCESSES = SCHEMA.properties.process.enum;
export const OUTCOMES = SCHEMA.properties.outcome.enum;
export const CAUSES = SCHEMA.properties.cause.enum.filter((c) => c !== null);

// Wartości historyczne z workflow-steps.jsonl i werdyktów agentów → zamknięta lista v1.
// Do 2026-10-10 w danych żyły obok siebie `NO-GO` (210×) i `NO_GO` (417×) — liczone osobno
// zaniżały odsetek odrzuceń o jedną trzecią.
const OUTCOME_ALIASES = {
  'no-go': 'no_go', no_go: 'no_go', nogo: 'no_go',
  go: 'go', go_with_conditions: 'go',
  ok: 'ok', completed: 'ok', success: 'ok',
  'silent-death': 'died', silent_death: 'died', died: 'died',
  'not-started': 'skipped', skipped: 'skipped',
  cached: 'cached', fixed: 'fixed', failed: 'failed', error: 'failed',
  halted: 'halted', escalate_and_halt: 'halted', blocked_by_prior: 'halted',
  killed: 'killed', unknown: 'unknown',
};

// Kategoria problemu ze skrzynki `_inbox` = ta sama lista co `cause` zdarzeń, żeby podział
// „jakie błędy" był identyczny w skrzynce i w metrykach (ADR 0012). Domyślna z triggera,
// wołający może podać dokładniejszą (`report-deviation --category`).
const TRIGGER_CATEGORY = {
  setup_drift: 'config', analyze_gate: 'config', workflow_lint: 'config',
  no_go: 'verifier',
  halt: 'other', blocked_by_prior: 'other', agent_note: 'other', analyze_note: 'other',
};

// Reguły `ANZ-*` /analyze mówią o przyczynie dokładniej niż sam trigger (ADR 0015 D5):
// niespójność warstw z taskiem to `plan`, wzorzec z obcego stosu to `pattern_card`.
// Dotyczy tylko triggerów analizy — `--rule` innych procesów (ORC-*, WL*) nic tu nie zmienia.
const ANALYZE_RULE_CATEGORY = [
  { re: /^ANZ-LAYER/i, category: 'plan' },
  { re: /^ANZ-PATTERN/i, category: 'pattern_card' },
];

export function defaultCategory(trigger, ruleRef = null) {
  if (trigger === 'analyze_gate' || trigger === 'analyze_note') {
    const hit = ANALYZE_RULE_CATEGORY.find((r) => r.re.test(String(ruleRef || '')));
    if (hit) return hit.category;
  }
  return TRIGGER_CATEGORY[trigger] || 'other';
}

export function normalizeOutcome(raw) {
  if (raw === null || raw === undefined || raw === '') return 'unknown';
  return OUTCOME_ALIASES[String(raw).trim().toLowerCase()] || 'unknown';
}

// Pseudonim maszyny: stabilny, ale nie zdradza nazwy hosta ani użytkownika na serwerze.
export function hostId() {
  let user = '';
  try { user = os.userInfo().username; } catch { /* brak passwd w kontenerze */ }
  return crypto.createHash('sha256').update(`${os.hostname()}::${user}`).digest('hex').slice(0, 12);
}

// '/opt/projects/aegis-flow' → 'aegis-flow'. Slug z ~/.claude/projects ('-opt-projects-…')
// jest niejednoznaczny ('-' = separator lub myślnik), więc wołający najpierw rozwiązuje go
// przez resolveProjectSlug z workflow-metrics-lib; tu tylko ścieżka albo gotowa nazwa.
export function projectName(p) {
  return path.basename(String(p || '').replace(/\/+$/, '')) || 'unknown';
}

export function buildEvent(fields) {
  return {
    v: 1,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    host: hostId(),
    ...fields,
  };
}

// Minimalny walidator JSON Schema — tylko konstrukcje użyte w schematach repo (type, const,
// enum, pattern, minimum/maximum, min/maxLength, min/maxItems, anyOf, allOf, if/then/else, not,
// required, properties, additionalProperties:false, items) oraz lokalne `x-equalProperties`.
// Bez zależności (ajv nie ma w repo), a pełny walidator to przesada dla jednego schematu.
function typeOk(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => {
    if (t === 'null') return value === null;
    if (t === 'integer') return Number.isInteger(value);
    if (t === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (t === 'array') return Array.isArray(value);
    if (t === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    return typeof value === t;
  });
}

function check(value, schema, at, errors) {
  if (schema.const !== undefined && value !== schema.const) errors.push(`${at}: oczekiwano ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: "${value}" spoza listy ${schema.enum.filter((x) => x !== null).join('|')}`);
  if (schema.type && !typeOk(value, schema.type)) { errors.push(`${at}: zły typ (${typeof value})`); return; }
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: "${value}" nie pasuje do ${schema.pattern}`);
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: < ${schema.minimum}`);
  if (typeof value === 'number' && schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: > ${schema.maximum}`);
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: krótsze niż ${schema.minLength}`);
  if (typeof value === 'string' && schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: dłuższe niż ${schema.maxLength}`);
  if (Array.isArray(value) && schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: mniej niż ${schema.minItems} pozycji`);
  if (Array.isArray(value) && schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: więcej niż ${schema.maxItems} pozycji`);
  if (schema.anyOf && !schema.anyOf.some((alt) => { const e = []; check(value, alt, at, e); return e.length === 0; })) {
    errors.push(`${at}: nie pasuje do żadnego z wariantów`);
    return;
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => check(v, schema.items, `${at}[${i}]`, errors));
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  // `required` działa też bez `properties` — podschematy if/then niosą same wymagania.
  if (isObject && schema.required) for (const req of schema.required) if (!(req in value)) errors.push(`${at}.${req}: brak`);
  if (isObject && schema.properties) {
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties[k]) check(v, schema.properties[k], `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}.${k}: pole spoza schematu`);
    }
  }
  // Rozszerzenie lokalne: `x-equalProperties: [a, b]` — obie właściwości (jeśli są) muszą mieć tę samą wartość.
  if (isObject && Array.isArray(schema['x-equalProperties'])) {
    const [a, b] = schema['x-equalProperties'];
    if (a in value && b in value && value[a] !== value[b]) errors.push(`${at}: ${a} i ${b} muszą być równe ("${value[a]}" ≠ "${value[b]}")`);
  }
  // Warunki: `then`/`else` obowiązują wedle tego, czy `if` przeszło bez błędów.
  for (const sub of schema.allOf || []) check(value, sub, at, errors);
  if (schema.if) {
    const probe = [];
    check(value, schema.if, at, probe);
    const branch = probe.length === 0 ? schema.then : schema.else;
    if (branch) check(value, branch, at, errors);
  }
  if (schema.not) {
    const probe = [];
    check(value, schema.not, at, probe);
    if (probe.length === 0) errors.push(`${at}: wartość zabroniona przez schemat`);
  }
}

export function validateEvent(ev) {
  return validateWith(SCHEMA, ev, 'event');
}

// Ten sam minimalny walidator dla innych schematów repo (np. zalążki wpisów, ADR 0013).
export function validateWith(schema, value, at = 'value') {
  const errors = [];
  check(value, schema, at, errors);
  return errors;
}

// UUID wyprowadzony z klucza — dla zdarzeń odtwarzanych z istniejących danych (collector,
// migracja): ten sam krok zawsze dostaje to samo id, więc powtórny przebieg niczego nie dubluje.
export function deterministicId(key) {
  const h = crypto.createHash('sha256').update(String(key)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function existingEventIds() {
  const ids = new Set();
  const dir = eventsDir();
  if (!fs.existsSync(dir)) return ids;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    for (const ev of readEvents(path.join(dir, f))) if (ev && ev.id) ids.add(ev.id);
  }
  return ids;
}

// Zapis wsadowy z deduplikacją po `id`. Zwraca { written, skipped, rejected[], error? }.
// Nigdy nie rzuca — tak jak appendEvent.
// `dedup: false` pomija skan istniejących zdarzeń (czyta cały katalog): dla wołających, którzy
// zawsze tworzą świeże id (pre-commit, TASK-OBS-010), a płacą za każdą milisekundę.
export function appendEventsDedup(list, { dryRun = false, dedup = true } = {}) {
  const result = { written: 0, skipped: 0, rejected: [] };
  try {
    const seen = dedup ? existingEventIds() : new Set();
    const byFile = new Map();
    for (const fields of list) {
      const ev = buildEvent(fields);
      if (seen.has(ev.id)) { result.skipped++; continue; }
      const errors = validateEvent(ev);
      if (errors.length) { result.rejected.push({ id: ev.id, errors }); continue; }
      seen.add(ev.id);
      const file = eventsFileFor(ev.ts);
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push(JSON.stringify(ev));
      result.written++;
    }
    if (!dryRun) {
      for (const [file, lines] of byFile) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, lines.join('\n') + '\n');
      }
    }
  } catch (e) {
    result.error = e && e.message ? e.message : String(e);
  }
  return result;
}

// Zwraca { ok: true, event } albo { ok: false, error }. Nigdy nie rzuca.
export function appendEvent(fields) {
  try {
    const ev = buildEvent(fields);
    const errors = validateEvent(ev);
    if (errors.length) return { ok: false, error: `zdarzenie odrzucone: ${errors.join('; ')}` };
    const file = eventsFileFor(ev.ts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(ev) + '\n');
    return { ok: true, event: ev };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// ── review-panel (ADR 0012, aneks TASK-GSTACK-ADOPT-001) ─────────────────────────────────────────
//
// Jedno `step.end` na reviewera w przebiegu panelu: step.id = step.role = nazwa reviewera bez prefiksu
// `reviewer-`; `ran` → outcome `ok` + step.findings (liczba), `skipped` → outcome `skipped` bez licznika.
// Bez run.start/run.end (jak process `hook`): panel nie ma planu ani kosztu, a przebieg identyfikuje runId.
export const REVIEWER_NAME_RE = /^[a-z][a-z0-9-]{0,40}$/;
export const REVIEW_PANEL = 'review-panel';

const reviewRunId = () => `rp-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

/**
 * Pola zdarzeń (do appendEventsDedup) dla jednego przebiegu panelu.
 * entries: [{ reviewer, outcome: 'ran'|'skipped', findings?, id? }] — `id` tylko dla migracji (deterministyczne).
 * Rzuca Error przy złym wejściu: to błąd wołającego, nie metryki.
 */
export function buildReviewPanelEvents({ project, entries, runId = reviewRunId(), ts = new Date().toISOString() }) {
  return entries.map((e) => {
    if (!REVIEWER_NAME_RE.test(String(e.reviewer))) throw new Error(`nieprawidłowa nazwa reviewera: "${e.reviewer}"`);
    if (e.outcome === 'ran') {
      if (!Number.isInteger(e.findings) || e.findings < 0) throw new Error(`reviewer ${e.reviewer}: ran wymaga findings >= 0 (liczba całkowita)`);
    } else if (e.outcome !== 'skipped') {
      throw new Error(`reviewer ${e.reviewer}: outcome musi być "ran" albo "skipped"`);
    }
    return {
      ...(e.id ? { id: e.id } : {}),
      ts, kind: 'step.end', process: REVIEW_PANEL, project, runId,
      step: { id: e.reviewer, role: e.reviewer, ...(e.outcome === 'ran' ? { findings: e.findings } : {}) },
      outcome: e.outcome === 'ran' ? 'ok' : 'skipped',
    };
  });
}

/**
 * Zapisuje przebieg panelu. Nigdy nie rzuca (jak reszta emiterów): zwraca { runId, written, rejected, error? }.
 * `dedup: false` domyślnie — id są świeże; migracja podaje deterministyczne id i `dedup: true`.
 */
export function emitReviewPanelRun(input, { dedup = false } = {}) {
  const runId = input.runId || reviewRunId();
  try {
    const fields = buildReviewPanelEvents({ ...input, runId });
    const res = appendEventsDedup(fields, { dedup });
    return { runId, written: res.written, skipped: res.skipped, rejected: res.rejected, ...(res.error ? { error: res.error } : {}) };
  } catch (e) {
    return { runId, written: 0, skipped: 0, rejected: [], error: e && e.message ? e.message : String(e) };
  }
}

export function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* uszkodzona linia — pomiń */ }
  }
  return out;
}
