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

// Minimalny walidator JSON Schema — tylko konstrukcje użyte w schemacie v1 (type, const,
// enum, pattern, minimum, required, properties, additionalProperties:false, items).
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
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => check(v, schema.items, `${at}[${i}]`, errors));
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const req of schema.required || []) if (!(req in value)) errors.push(`${at}.${req}: brak`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties[k]) check(v, schema.properties[k], `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}.${k}: pole spoza schematu`);
    }
  }
}

export function validateEvent(ev) {
  const errors = [];
  check(ev, SCHEMA, 'event', errors);
  return errors;
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

export function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* uszkodzona linia — pomiń */ }
  }
  return out;
}
