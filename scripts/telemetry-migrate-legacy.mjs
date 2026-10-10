#!/usr/bin/env node
// scripts/telemetry-migrate-legacy.mjs — historia ~/.claude/metrics/workflow-steps.jsonl → zdarzenia v1
// (ADR 0012, krok 2). Dzięki temu dashboard ma trend od pierwszego dnia, a nie od dnia wdrożenia.
//
// Idempotentna: id zdarzeń są wyprowadzane z runId+agentId (deterministicId), a zapis pomija id już
// obecne w telemetry/events/ — można ją puszczać wielokrotnie, także po kolejnych zbiorach collectora.
// Plik źródłowy jest tylko czytany.
//
// Użycie:  node scripts/telemetry-migrate-legacy.mjs [--dry-run]

import { STEPS_FILE, readJsonl, dedupeRecords } from './workflow-metrics-lib.mjs';
import { appendEventsDedup, eventsDir } from './lib/telemetry-events.mjs';
import { legacyRunToEvents, projectFromSlug } from './lib/telemetry-legacy.mjs';
import fs from 'node:fs';
import { findRunCandidates, runResultFields } from './workflow-metrics-collect.mjs';

// Rekordy `run` sprzed 2026-10-10 nie mają `taskRef`/`finalVerdict` (collector czytał losowe
// wf.taskId i nieistniejące result.escalatedAt). Pliki wf_*.json przebiegów wciąż leżą w
// ~/.claude/projects — uzupełniamy z nich, bez zmiany pliku źródłowego (nowy obiekt).
function enrichRun(run, wfPaths) {
  if (!run || ('taskRef' in run && 'finalVerdict' in run)) return run;
  const wfPath = wfPaths.get(run.runId);
  if (!wfPath) return run;
  try {
    return { ...run, ...runResultFields(JSON.parse(fs.readFileSync(wfPath, 'utf8'))) };
  } catch {
    return run; // uszkodzony/w połowie zapisu — zostaje bez uzupełnienia
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const records = dedupeRecords(readJsonl(STEPS_FILE));
  const byRun = new Map();
  for (const r of records) {
    if (!r.runId) continue;
    if (!byRun.has(r.runId)) byRun.set(r.runId, { steps: [], run: null, slug: r.project });
    const g = byRun.get(r.runId);
    if (r.type === 'run') g.run = r; else if (r.type === 'step') g.steps.push(r);
  }

  const wfPaths = new Map(findRunCandidates().map((c) => [c.runId, c.wfPath]));
  const cache = new Map();
  const events = [];
  for (const g of byRun.values()) {
    const run = enrichRun(g.run, wfPaths);
    events.push(...legacyRunToEvents({ steps: g.steps, run, project: projectFromSlug(g.slug, cache) }));
  }

  const res = appendEventsDedup(events, { dryRun });
  console.log(`źródło: ${STEPS_FILE} — ${records.length} rekordów, ${byRun.size} przebiegów`);
  console.log(`${dryRun ? '[dry-run] ' : ''}zdarzenia v1: ${events.length} zbudowanych, ${res.written} zapisanych, `
    + `${res.skipped} już było, ${res.rejected.length} odrzuconych → ${eventsDir()}`);
  for (const r of res.rejected.slice(0, 5)) console.log(`  odrzucone ${r.id}: ${r.errors.join('; ')}`);
  if (res.error) {
    console.error(`✘ zapis przerwany: ${res.error}`);
    process.exit(1);
  }
}

main();
