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
//   filtry: --since RRRR-MM-DD  --until RRRR-MM-DD  --project <nazwa>  --process <nazwa>
//   wyjście: tekst (domyślnie) | --json | --md <plik>  (`--md -` = markdown na stdout)
//
// Można łączyć --engine i --data-quality w jednym raporcie. `--since` nie dotyczy --engine: okno „przed"
// musi sięgać wstecz od pierwszego dnia silnika.
//
// Kod wyjścia: 0 = raport policzony, 1 = błąd użycia.

import fs from 'node:fs';
import path from 'node:path';
import { readRollups } from './lib/telemetry-rollup-reader.mjs';
import { rollupsDir } from './lib/telemetry-events.mjs';
import { DEFAULT_WINDOW, reportDataQuality, reportEngine, reportView } from './lib/telemetry-report.mjs';
import { renderMarkdown, renderText } from './lib/telemetry-report-format.mjs';

const BY = ['engine', 'process', 'role', 'project', 'week'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function die(msg) {
  process.stderr.write(`✘ telemetry-report: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = { by: null, engine: null, dataQuality: false, since: null, until: null, project: null, process: null, window: DEFAULT_WINDOW, json: false, md: null };
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
    else die(`nieznany przełącznik: ${a}`);
  }
  if (o.by && !BY.includes(o.by)) die(`--by musi być jednym z: ${BY.join(', ')}`);
  for (const k of ['since', 'until']) if (o[k] && !DAY.test(o[k])) die(`--${k} musi mieć postać RRRR-MM-DD`);
  if (!Number.isInteger(o.window) || o.window < 1) die('--window musi być liczbą całkowitą >= 1');
  if (o.json && o.md) die('--json i --md się wykluczają');
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const dir = rollupsDir();
  const rollups = readRollups({ dir, project: o.project || undefined, since: o.engine ? undefined : o.since || undefined, until: o.until || undefined });
  if (!rollups.length) die(`brak rollupów w ${dir}${o.project ? ` dla projektu ${o.project}` : ''} — uruchom node scripts/telemetry-aggregate.mjs`);

  const models = [];
  if (o.engine) models.push(reportEngine(rollups, o.engine, { window: o.window, process: o.process || undefined }));
  if (o.dataQuality) models.push(reportDataQuality(rollups));
  if (o.by || !models.length) models.push(reportView(o.by || 'process', rollups, { process: o.process || undefined }));

  const days = rollups.map((r) => r.day);
  const model = {
    title: models.length === 1 ? models[0].title : 'Raport telemetrii',
    meta: `Rollupy: ${rollups.length} plików, dni ${days[0]} … ${days.at(-1)}${o.project ? `, projekt ${o.project}` : ''}${o.process ? `, proces ${o.process}` : ''}`,
    sections: models.flatMap((m) => m.sections),
  };

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
