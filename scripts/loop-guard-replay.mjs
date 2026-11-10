#!/usr/bin/env node
// scripts/loop-guard-replay.mjs — pomiar wyłącznika pętli NO-GO na historii zdarzeń (TASK-ORC-GATE-COST-001, E1).
//
// Odtwarza decyzję `assessRepeat` przy starcie każdego runu (od trzeciego runu taska) i liczy:
//   - ile startów zostałoby zatrzymanych („zablokowałbym"),
//   - w ilu z nich następny run dał ten sam NO-GO z tym samym odciskiem (zatrzymanie słuszne), a w ilu inny
//     wynik (zatrzymanie fałszywe). Blokadę włączamy dopiero przy 0 fałszywych na próbie ≥ 20.
// Pokrycie: ile NO-GO bramki końcowej niesie odcisk; bez niego kryterium nie ma na czym działać.
//
// Użycie: node scripts/loop-guard-replay.mjs [--dir <katalog zdarzeń>] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { eventsDir, readEvents } from './lib/telemetry-events.mjs';
import { assessRepeat } from './lib/orchestrate-loop-guard.mjs';
import { isFinalGateStep } from './lib/final-gate-blame.mjs';
import { ruleSignature } from './lib/telemetry-rules.mjs';

const MIN_SAMPLE = 20;
const args = process.argv.slice(2);
const dirAt = args.indexOf('--dir');
const dir = dirAt >= 0 ? args[dirAt + 1] : eventsDir();
if (!dir || !fs.existsSync(dir)) { process.stderr.write(`✘ loop-guard-replay: brak katalogu zdarzeń: ${dir}\n`); process.exit(1); }

const events = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort()
  .flatMap((f) => readEvents(path.join(dir, f))).filter((e) => e.process === 'orchestrate' && e.taskRef);

const byTask = new Map();
for (const e of events) {
  const k = e.taskRef.toUpperCase();
  if (!byTask.has(k)) byTask.set(k, []);
  byTask.get(k).push(e);
}

const res = { tasks: byTask.size, evaluated: 0, wouldBlock: 0, rightStops: 0, falseStops: 0, details: [] };
for (const [task, list] of byTask) {
  const starts = new Map(list.filter((e) => e.kind === 'run.start').map((e) => [e.runId, e]));
  const runs = [...starts.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  const of = (ids) => list.filter((e) => ids.has(e.runId));
  for (let i = 2; i < runs.length; i++) {
    res.evaluated++;
    const prior = assessRepeat(of(new Set(runs.slice(0, i).map((r) => r.runId))), task);
    if (!prior.repeat) continue;
    res.wouldBlock++;
    const next = assessRepeat(of(new Set([runs[i - 1].runId, runs[i].runId])), task).runs[1];
    const same = Boolean(next) && next.outcome === 'no_go' && next.signature === prior.signature;
    if (same) res.rightStops++; else res.falseStops++;
    res.details.push({ task, runId: runs[i].runId, ruleIds: prior.ruleIds, nextOutcome: next ? next.outcome : null, same });
  }
}

const noGoGates = events.filter((e) => isFinalGateStep(e) && e.outcome === 'no_go');
res.coverage = {
  finalGateNoGo: noGoGates.length,
  withRuleHits: noGoGates.filter((e) => Array.isArray(e.step.ruleHits)).length,
  withSignature: noGoGates.filter((e) => ruleSignature(e.step.ruleHits)).length,
};

if (args.includes('--json')) { process.stdout.write(JSON.stringify(res, null, 2) + '\n'); process.exit(0); }
const c = res.coverage;
const out = (s) => process.stdout.write(s + '\n');
out(`taski ${res.tasks} · starty ocenione (≥3. run taska) ${res.evaluated}`);
out(`NO-GO bramki końcowej: ${c.finalGateNoGo}, z ruleHits ${c.withRuleHits}, z odciskiem ${c.withSignature}`);
out(`zablokowałbym: ${res.wouldBlock} (słusznie: ${res.rightStops}, fałszywie: ${res.falseStops})`);
for (const d of res.details) out(`  ${d.task} ${d.runId}: ${d.ruleIds.join(', ')} → następny run ${d.nextOutcome ?? 'brak'}${d.same ? ' (to samo)' : ' (INNY WYNIK)'}`);
if (res.wouldBlock < MIN_SAMPLE) out(`\n  Próba za mała na decyzję o blokadzie: ${res.wouldBlock} zatrzymań, potrzeba ≥ ${MIN_SAMPLE} i 0 fałszywych.`);
