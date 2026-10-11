#!/usr/bin/env node
// scripts/telemetry-emit.mjs — CLI do zapisu zdarzeń telemetrii v1 (ADR 0012).
//
// Dla procesów, które nie są skryptem Workflow i nie mają collectora (dziś: /analyze, setup),
// oraz dla każdego przyszłego procesu. Ten sam format co collector orchestrate, więc
// agregacja i dashboard nie odróżniają źródeł.
//
// Użycie:
//   node scripts/telemetry-emit.mjs run-start --process analyze --project <ścieżka|nazwa>
//        [--run-id <id>] [--task <TS-ID>] [--plan "id:group:role,id:group:role"]
//        → wypisuje runId na stdout (generuje, gdy nie podano)
//   node scripts/telemetry-emit.mjs step --process analyze --project <p> --run-id <id>
//        --step-id <id> --outcome <ok|go|no_go|…> [--group g] [--role r] [--agent a]
//        [--model m] [--attempt n] [--fixes <step-id>] [--cause c]
//        [--tool-calls n] [--duration-ms n] [--cost-usd x]
//   node scripts/telemetry-emit.mjs run-end --process analyze --project <p> --run-id <id>
//        --outcome <ok|halted|failed|…> [--cause c] [--duration-ms n]
//
// Exit: 0 = zapisano ALBO zapis się nie udał z powodu I/O (ostrzeżenie na stderr — metryka
// nie może przerwać mierzonej pracy); 1 = błąd użycia albo zdarzenie niezgodne ze schematem
// (to błąd wołającego, który ma być widoczny w evalach, a nie ginąć po cichu).

import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { appendEvent, validateEvent, buildEvent, normalizeOutcome, projectName } from './lib/telemetry-events.mjs';
import { closeRun, sweepStaleRuns } from './lib/telemetry-runs.mjs';
import { engineVersion } from './lib/engine-version.mjs';

const sessions = createRequire(import.meta.url)('../hooks/lib/telemetry-sessions.js');

const COMMANDS = { 'run-start': 'run.start', step: 'step.end', 'run-end': 'run.end' };
const FLAGS = new Set(['process', 'project', 'run-id', 'task', 'plan', 'step-id', 'group', 'role',
  'agent', 'model', 'attempt', 'fixes', 'outcome', 'cause', 'tool-calls', 'duration-ms', 'cost-usd']);

function die(msg) {
  process.stderr.write(`✘ telemetry-emit: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS[cmd]) die(`pierwszy argument: ${Object.keys(COMMANDS).join(' | ')}`);
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--') || !FLAGS.has(a.slice(2))) die(`nieznany przełącznik: ${a}`);
    opts[a.slice(2)] = rest[++i] ?? '';
  }
  return { cmd, opts };
}

const int = (v) => (v === undefined || v === '' ? undefined : Number.parseInt(v, 10));
const num = (v) => (v === undefined || v === '' ? undefined : Number(v));

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function parsePlan(s) {
  return String(s).split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [id, group, role] = x.split(':');
    const item = { id };
    if (group) item.group = group;
    if (role) item.role = role;
    return item;
  });
}

// Pola nieobecne w argumentach NIE trafiają do zdarzenia (zamiast null), żeby rekord był krótki.
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function buildFields(cmd, o) {
  if (!o.process) die('brak --process');
  if (!o.project) die('brak --project');
  const runId = o['run-id'] || (cmd === 'run-start' ? `${o.process}-${stamp()}-${crypto.randomBytes(2).toString('hex')}` : null);
  if (!runId) die('brak --run-id');
  const base = { kind: COMMANDS[cmd], process: o.process, project: projectName(o.project), runId };
  if (o.task) base.taskRef = o.task;

  if (cmd === 'run-start') return compact({ ...base, engine: engineVersion(), plan: o.plan ? parsePlan(o.plan) : undefined });

  if (!o.outcome) die('brak --outcome');
  const outcome = normalizeOutcome(o.outcome);
  if (outcome === 'unknown' && o.outcome.toLowerCase() !== 'unknown') die(`--outcome "${o.outcome}" nieznany`);
  const m = compact({ toolCalls: int(o['tool-calls']), durationMs: int(o['duration-ms']), costUsd: num(o['cost-usd']) });
  const fields = compact({ ...base, outcome, cause: o.cause, m: Object.keys(m).length ? m : undefined });

  if (cmd === 'step') {
    if (!o['step-id']) die('brak --step-id');
    fields.step = compact({
      id: o['step-id'], group: o.group, role: o.role, agent: o.agent, model: o.model,
      attempt: int(o.attempt), fixes: o.fixes,
    });
  }
  return fields;
}

const warn = (msg) => process.stderr.write(`⚠ telemetry-emit: ${msg} — praca idzie dalej\n`);

// Stan przebiegu (hooks/lib/telemetry-sessions.js) powstaje tylko, gdy --project jest ŚCIEŻKĄ:
// hooki dopasowują agentów do przebiegu po `cwd`, a sama nazwa projektu tego nie umożliwia.
function openRunState(fields, project) {
  if (!project.includes('/')) return;
  try {
    sessions.startRun({
      runId: fields.runId, process: fields.process, project: fields.project,
      projectPath: path.resolve(project), taskRef: fields.taskRef, plan: fields.plan,
    });
  } catch (e) {
    warn(`stan przebiegu nie zapisany (${e.message}); kroki agentów nie zostaną przypięte`);
  }
}

function sweepOrphans() {
  try {
    const closed = sweepStaleRuns();
    if (closed) process.stderr.write(`telemetry-emit: zamknięto ${closed} osieroconych przebiegów (outcome unknown)\n`);
  } catch (e) {
    warn(`sprzątanie osieroconych przebiegów nieudane (${e.message})`);
  }
}

function main() {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  const fields = buildFields(cmd, opts);
  const errors = validateEvent(buildEvent(fields));
  if (errors.length) die(`zdarzenie niezgodne ze schematem v1: ${errors.join('; ')}`);

  // run-end z otwartym stanem: closeRun dopisuje `skipped`/`unknown` dla kroków bez końca i sam
  // zapisuje run.end. Po udanym zamknięciu stan znika, więc kolejny run-end idzie starym torem
  // (zwykłe run.end) — wołający nie powinien kończyć tego samego przebiegu dwa razy.
  const run = cmd === 'run-end' ? sessions.readRun(fields.runId) : null;
  if (run) {
    const r = closeRun(run, { outcome: fields.outcome, cause: fields.cause });
    if (r.error) warn(`zamknięcie przebiegu nieudane (${r.error})`);
    process.exit(0);
  }

  if (cmd === 'run-start') sweepOrphans();
  const res = appendEvent(fields);
  if (!res.ok) warn(`zapis nieudany (${res.error})`);
  if (cmd === 'run-start') {
    if (res.ok) openRunState(fields, opts.project);
    process.stdout.write(`${fields.runId}\n`);
  }
  process.exit(0);
}

main();
