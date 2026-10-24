#!/usr/bin/env node
// scripts/telemetry-report.mjs — raport nad agregatami dziennymi (TASK-OBS-014, ADR 0015 D6).
//
// Czyta WYŁĄCZNIE telemetry/rollups/ (CLAUDE_TELEMETRY_ROLLUPS_DIR nadpisuje katalog): zdarzeń ani
// workflow-steps.jsonl nie dotyka. Liczniki sumuje po hostach; percentyli nie używa (są per host).
//
// Użycie:
//   node scripts/telemetry-report.mjs [--by engine|process|role|project|week]   # widok (domyślnie process)
//   node scripts/telemetry-report.mjs --engine <hash> [--window 7]              # okno przed i po silniku
//   node scripts/telemetry-report.mjs --data-quality                            # cztery liczniki jakości danych
//   node scripts/telemetry-report.mjs --claims [--write-status]                 # claimy reguł i skrzynki: werdykt każdego
//   node scripts/telemetry-report.mjs --weekly [--week RRRR-Www] [--dry-run]    # raport tygodniowy → telemetry/reports/
//   filtry: --since RRRR-MM-DD  --until RRRR-MM-DD  --project <nazwa>  --process <nazwa>
//   wyjście: tekst (domyślnie) | --json | --md <plik>  (`--md -` = markdown na stdout)
//
// Można łączyć --engine, --claims i --data-quality w jednym raporcie. `--since` nie dotyczy --engine, --claims
// i --weekly: okno „przed" musi sięgać wstecz od pierwszego dnia silnika.
//
// Claimy (TASK-OBS-017): `claim` w rekordzie skrzynki albo `**Claim:**` we wpisie rule-history. Status rekordu
// zmienia się tylko z `--write-status` (albo w `--weekly` bez `--dry-run`) i tylko gdy werdykt jest zaufany;
// skrypt niczego nie commituje — zmianę statusu commituje człowiek. `--weekly` raportuje domyślnie ostatni
// zakończony tydzień ISO i sam jest osobnym trybem (nie łączy się z pozostałymi). Ukryte, na potrzeby evali:
// --inbox <katalog> --history <plik> --today RRRR-MM-DD; katalog raportów: CLAUDE_TELEMETRY_REPORTS_DIR.
//
// Kod wyjścia: 0 = raport policzony, 1 = błąd użycia.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRollups } from './lib/telemetry-rollup-reader.mjs';
import { rollupsDir } from './lib/telemetry-events.mjs';
import { DEFAULT_WINDOW, reportDataQuality, reportEngine, reportView } from './lib/telemetry-report.mjs';
import { renderMarkdown, renderText } from './lib/telemetry-report-format.mjs';
import { claimVerdict, parseRuleHistory, previousWeek } from './lib/telemetry-claims.mjs';
import { applyStatusChange, collectClaims, statusChangeFor } from './lib/inbox-claims.mjs';
import { INBOX_DIR, INDEX_FILE, buildIndex, readInboxEntries, serializeIndex } from './lib/inbox.mjs';
import { buildWeekly, claimsSection } from './lib/telemetry-weekly.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY_FILE = path.join(REPO_ROOT, 'docs', 'decisions', 'orchestrate-rule-history.md');
const BY = ['engine', 'process', 'role', 'project', 'week'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = /^\d{4}-W\d{2}$/;

function die(msg) {
  process.stderr.write(`✘ telemetry-report: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = {
    by: null, engine: null, dataQuality: false, since: null, until: null, project: null, process: null, window: DEFAULT_WINDOW, json: false, md: null,
    claims: false, weekly: false, week: null, writeStatus: false, dryRun: false, inbox: null, history: null, today: null,
  };
  const value = (i, flag) => {
    if (argv[i + 1] === undefined || (argv[i + 1].startsWith('--') && argv[i + 1] !== '-')) die(`${flag} wymaga wartości`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--data-quality') o.dataQuality = true;
    else if (a === '--by') o.by = value(i++, a);
    else if (a === '--engine') o.engine = value(i++, a);
    else if (a === '--since') o.since = value(i++, a);
    else if (a === '--until') o.until = value(i++, a);
    else if (a === '--project') o.project = value(i++, a);
    else if (a === '--process') o.process = value(i++, a);
    else if (a === '--md') o.md = value(i++, a);
    else if (a === '--window') o.window = Number(value(i++, a));
    else if (a === '--claims') o.claims = true;
    else if (a === '--weekly') o.weekly = true;
    else if (a === '--write-status') o.writeStatus = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--week') o.week = value(i++, a);
    else if (a === '--inbox') o.inbox = value(i++, a);
    else if (a === '--history') o.history = value(i++, a);
    else if (a === '--today') o.today = value(i++, a);
    else die(`nieznany przełącznik: ${a}`);
  }
  if (o.by && !BY.includes(o.by)) die(`--by musi być jednym z: ${BY.join(', ')}`);
  for (const k of ['since', 'until']) if (o[k] && !DAY.test(o[k])) die(`--${k} musi mieć postać RRRR-MM-DD`);
  if (!Number.isInteger(o.window) || o.window < 1) die('--window musi być liczbą całkowitą >= 1');
  if (o.json && o.md) die('--json i --md się wykluczają');
  if (o.week && !WEEK.test(o.week)) die('--week musi mieć postać RRRR-Www (np. 2026-W43)');
  if (o.today && !DAY.test(o.today)) die('--today musi mieć postać RRRR-MM-DD');
  if (o.week && !o.weekly) die('--week dotyczy tylko --weekly');
  if (o.dryRun && !o.weekly) die('--dry-run dotyczy tylko --weekly');
  if (o.weekly && (o.engine || o.by || o.claims || o.dataQuality)) die('--weekly jest osobnym trybem: nie łączy się z --engine, --by, --claims ani --data-quality');
  return o;
}

const readText = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };

// Werdykty wszystkich claimów. `plan` = zmiana statusu, którą uzasadnia werdykt; zapisuje ją dopiero writeStatuses.
function evaluateClaims(rollups, o) {
  const entries = collectClaims({ inboxDir: o.inbox || INBOX_DIR, historyText: readText(o.history || HISTORY_FILE) });
  return entries.map((e) => {
    if (e.errors.length) return { ...e, result: null, plan: null, change: null };
    const result = claimVerdict(rollups, e.claim);
    return { ...e, result, plan: statusChangeFor(e, result), change: null };
  });
}

function writeStatuses(results, o, today) {
  const inboxDir = o.inbox || INBOX_DIR;
  const out = results.map((r) => {
    if (!r.plan) return r;
    const done = applyStatusChange(r, r.plan, today, inboxDir);
    return done.changed ? { ...r, change: done } : r;
  });
  // index.json pochodzi ze skrzynki; pre-commit sprawdza, czy jest aktualny.
  if (out.some((r) => r.change)) fs.writeFileSync(path.join(inboxDir, INDEX_FILE), serializeIndex(buildIndex(readInboxEntries(inboxDir))));
  return out;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const dir = rollupsDir();
  const wide = Boolean(o.engine || o.claims || o.weekly);
  const rollups = readRollups({ dir, project: o.project || undefined, since: wide ? undefined : o.since || undefined, until: o.until || undefined });
  if (!rollups.length) die(`brak rollupów w ${dir}${o.project ? ` dla projektu ${o.project}` : ''} — uruchom node scripts/telemetry-aggregate.mjs`);
  const today = o.today || new Date().toISOString().slice(0, 10);

  const models = [];
  let weekly = null;
  if (o.weekly) {
    const week = o.week || previousWeek(today);
    let results = evaluateClaims(rollups, o);
    if (!o.dryRun) results = writeStatuses(results, o, today);
    const rules = parseRuleHistory(readText(o.history || HISTORY_FILE));
    weekly = { week, model: buildWeekly({ week, rollups, claimResults: results, rules }) };
    models.push(weekly.model);
  } else {
    if (o.engine) models.push(reportEngine(rollups, o.engine, { window: o.window, process: o.process || undefined }));
    if (o.claims) {
      const results = evaluateClaims(rollups, o);
      models.push({ title: 'Claimy reguł', sections: [claimsSection(o.writeStatus ? writeStatuses(results, o, today) : results)] });
    }
    if (o.dataQuality) models.push(reportDataQuality(rollups));
    if (o.by || !models.length) models.push(reportView(o.by || 'process', rollups, { process: o.process || undefined }));
  }

  const days = rollups.map((r) => r.day);
  const model = {
    title: models.length === 1 ? models[0].title : 'Raport telemetrii',
    meta: weekly ? weekly.model.meta : `Rollupy: ${rollups.length} plików, dni ${days[0]} … ${days.at(-1)}${o.project ? `, projekt ${o.project}` : ''}${o.process ? `, proces ${o.process}` : ''}`,
    sections: models.flatMap((m) => m.sections),
  };

  if (weekly && !o.json && !o.md) {
    const md = renderMarkdown(model);
    if (o.dryRun) { process.stdout.write(md); return; }
    const outDir = process.env.CLAUDE_TELEMETRY_REPORTS_DIR || path.join(REPO_ROOT, 'telemetry', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const target = path.join(outDir, `${weekly.week}.md`);
    fs.writeFileSync(target, md);
    process.stdout.write(`telemetry-report: zapisano ${target}\n`);
    return;
  }

  if (o.json) {
    process.stdout.write(`${JSON.stringify({ ...model, models }, null, 2)}\n`);
    return;
  }
  if (o.md) {
    const md = renderMarkdown(model);
    if (o.md === '-') { process.stdout.write(md); return; }
    fs.mkdirSync(path.dirname(path.resolve(o.md)), { recursive: true });
    fs.writeFileSync(o.md, md);
    process.stdout.write(`telemetry-report: zapisano ${o.md}\n`);
    return;
  }
  process.stdout.write(renderText(model));
}

main();
