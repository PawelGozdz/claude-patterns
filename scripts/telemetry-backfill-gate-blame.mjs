#!/usr/bin/env node
// scripts/telemetry-backfill-gate-blame.mjs — dopisuje `step.blamed` / `step.unblamed` do pierwszego kroku
// bramki końcowej w ZAPISANYCH już zdarzeniach (TASK-OBS-012, ADR 0012 aneks).
//
// Po co: kolektor dopisuje te pola od teraz, ale 246 kanonicznych przebiegów z września i października
// ma już zdarzenia bez nich, a naruszenia bramki leżą tylko w surowych wynikach `wf_*.json`
// (~/.claude/projects/*/*/workflows). Bez uzupełnienia odsetek fałszywych GO zaczynałby się od dnia wdrożenia.
//
// Zdarzenia leżą poza gitem (per maszyna) i są dopisywane raz, więc to JEDYNE miejsce, które je przepisuje.
// Idempotentne: zdarzenie z tymi samymi polami zostaje nietknięte; plik jest zamieniany atomowo
// (zapis obok + rename) i tylko gdy coś się zmieniło. Przebieg bez wyniku `wf_*.json` nie jest ruszany.
//
// Użycie:  node scripts/telemetry-backfill-gate-blame.mjs [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { eventsDir, validateEvent } from './lib/telemetry-events.mjs';
import { blameFromResult, firstFinalGates } from './lib/final-gate-blame.mjs';
import { findRunCandidates } from './workflow-metrics-collect.mjs';

const parse = (line) => { try { return JSON.parse(line); } catch { return null; } };

function readFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().map((name) => {
    const file = path.join(dir, name);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    return { file, lines, events: lines.map((l) => (l ? parse(l) : null)) };
  });
}

/**
 * blameByRun: Map<runId, { units: [], unblamed: n }>. Zwraca { patched, unchanged, rejected[], runs }.
 * `dir` i `dryRun` jawnie, żeby eval mógł wskazać katalog tymczasowy.
 */
export function backfillBlame({ blameByRun, dir = eventsDir(), dryRun = false }) {
  const files = readFiles(dir);
  const all = files.flatMap((f) => f.events.filter(Boolean));
  const gates = firstFinalGates(all.filter((e) => e.process === 'orchestrate' && blameByRun.has(e.runId)));
  const target = new Map([...gates.values()].map((g) => [g.id, blameByRun.get(g.runId)]));
  const result = { runs: gates.size, patched: 0, unchanged: 0, rejected: [] };

  for (const f of files) patchFile(f.file, target, result, dryRun);
  return result;
}

// Hooki dopisują do bieżącego pliku miesiąca, więc zamiana pliku nie może zgubić dopisku z okna między
// odczytem a rename: rozmiar sprawdzamy tuż przed zamianą i przy zmianie czytamy plik od nowa.
const ATTEMPTS = 5;

function patchFile(file, target, result, dryRun) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const text = fs.readFileSync(file, 'utf8');
    const stat = { patched: 0, unchanged: 0, rejected: [] };
    const lines = text.split('\n').map((line) => {
      const ev = line ? parse(line) : null;
      if (!ev || !target.has(ev.id)) return line;
      const blame = target.get(ev.id);
      if (JSON.stringify(ev.step.blamed) === JSON.stringify(blame.units) && ev.step.unblamed === blame.unblamed) {
        stat.unchanged++;
        return line;
      }
      const next = { ...ev, step: { ...ev.step, blamed: blame.units, unblamed: blame.unblamed } };
      const errors = validateEvent(next);
      if (errors.length) { stat.rejected.push({ id: ev.id, errors }); return line; }
      stat.patched++;
      return JSON.stringify(next);
    });
    if (!stat.patched || dryRun) return merge(result, stat);
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, lines.join('\n'));
    if (fs.statSync(file).size === Buffer.byteLength(text)) {
      fs.renameSync(tmp, file);
      return merge(result, stat);
    }
    fs.rmSync(tmp, { force: true });
  }
  throw new Error(`${file}: plik zmienia się równolegle (${ATTEMPTS} prób) — spróbuj ponownie`);
}

function merge(result, stat) {
  result.patched += stat.patched;
  result.unchanged += stat.unchanged;
  result.rejected.push(...stat.rejected);
}

function blameMapFromWorkflows() {
  const blameByRun = new Map();
  for (const c of findRunCandidates()) {
    if (blameByRun.has(c.runId)) continue;
    let wf;
    try { wf = JSON.parse(fs.readFileSync(c.wfPath, 'utf8')); } catch { continue; }
    const blame = wf.status === 'running' ? null : blameFromResult(wf.result);
    if (blame) blameByRun.set(wf.runId || c.runId, blame);
  }
  return blameByRun;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const blameByRun = blameMapFromWorkflows();
  const res = backfillBlame({ blameByRun, dryRun });
  console.log(`${dryRun ? '[dry-run] ' : ''}przebiegi z przypisaniem: ${blameByRun.size}, z bramką w zdarzeniach: ${res.runs}; `
    + `uzupełnione ${res.patched}, bez zmian ${res.unchanged}, odrzucone ${res.rejected.length} → ${eventsDir()}`);
  for (const r of res.rejected.slice(0, 5)) console.log(`  odrzucone ${r.id}: ${r.errors.join('; ')}`);
  if (res.rejected.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) main();
