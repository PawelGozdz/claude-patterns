#!/usr/bin/env node
// scripts/flow-top.mjs — przebieg Workflow „na żywo" w terminalu (TASK-OBS-008).
//
//   node scripts/flow-top.mjs [projekt]            # przebieg w toku (odświeża się, dopóki trwa); gdy nic nie trwa — ostatni
//   node scripts/flow-top.mjs [projekt] --once     # jedna klatka i koniec
//   node scripts/flow-top.mjs [projekt] --run wf_… # konkretny przebieg
//   node scripts/flow-top.mjs … --json             # model widoku (jedna klatka), bez formatowania
//   --interval <s> (domyślnie 2)   --days <n> (okno średniej, domyślnie 30)   --no-cost (bez czytania transkryptów)
//
// Źródła: ~/.claude/projects/<slug>/<sesja>/workflows/wf_*.json (postęp agentów, plan w skrypcie) i
// …/subagents/workflows/<runId>/journal.jsonl (werdykty); średnia z telemetry/rollups/. Read-only.
// Projekt = fragment nazwy (`grant-flow`) albo pełna nazwa; pominięty → wszystkie projekty.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { findRunCandidates } from './workflow-metrics-collect.mjs';
import { projectFromSlug } from './lib/telemetry-legacy.mjs';
import {
  readJsonl, sumTranscriptUsage, estimateCostUsd, loadPrices,
} from './workflow-metrics-lib.mjs';
import { buildLiveView, loadBaseline, renderLive } from './lib/flow-live.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const VALUE_FLAGS = ['--interval', '--days', '--run'];
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(argv[i - 1]));
const filter = positional[0] || null;

const readWf = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };

// Kandydaci posortowani od najświeższego; JSON-a (setki KB) czytamy tylko dla kilku pierwszych.
function pickRun() {
  const names = new Map();
  let cands = findRunCandidates().map((c) => ({ ...c, project: projectFromSlug(c.slug, names) }));
  const wanted = opt('run', null);
  if (wanted) cands = cands.filter((c) => c.runId === wanted);
  else if (filter) cands = cands.filter((c) => c.project === filter || c.project.includes(filter));
  cands.sort((a, b) => mtime(b.wfPath) - mtime(a.wfPath));
  const recent = cands.slice(0, 8).map((c) => ({ c, wf: readWf(c.wfPath) })).filter((x) => x.wf);
  return recent.find((x) => x.wf.status === 'running') || recent[0] || null;
}

const prices = flag('no-cost') ? null : loadPrices({ defaultPricesPath: path.join(HERE, 'workflow-metrics-prices.default.json') });
// Transkrypt agenta w toku rośnie, skończonego nie czytamy drugi raz: klucz = ścieżka + rozmiar.
const usageCache = new Map();

function costFn(c) {
  if (!prices) return () => null;
  return (a) => {
    if (!/^[A-Za-z0-9_-]+$/.test(a.agentId || '')) return null;
    const file = [c.runDir, c.fallbackAgentsDir].filter(Boolean)
      .map((d) => path.join(d, `agent-${a.agentId}.jsonl`)).find((f) => fs.existsSync(f));
    if (!file) return null;
    const key = `${file}:${fs.statSync(file).size}`;
    if (!usageCache.has(key)) usageCache.set(key, estimateCostUsd(sumTranscriptUsage(file), a.model, prices));
    return usageCache.get(key);
  };
}

function frame() {
  const picked = pickRun();
  if (!picked) return { text: `flow-top: brak przebiegów Workflow${filter ? ` dla „${filter}"` : ''}.`, running: false };
  const { c, wf } = picked;
  const journal = c.runDir ? readJsonl(path.join(c.runDir, 'journal.jsonl')) : [];
  const now = Date.now();
  const view = buildLiveView({ wf, journal, project: c.project, now, costOf: costFn(c) });
  if (flag('json')) return { text: JSON.stringify(view, null, 2), running: false };
  const baseline = loadBaseline({ project: c.project, processName: 'orchestrate', days: Number(opt('days', 30)), now });
  const note = wf.status === 'running' ? '' : '\n\n(brak przebiegu w toku — pokazuję ostatni)';
  return { text: renderLive(view, baseline) + note, running: wf.status === 'running' };
}

const once = flag('once') || flag('json') || !process.stdout.isTTY;
const first = frame();
if (once || !first.running) {
  process.stdout.write(`${first.text}\n`);
  process.exit(0);
}

const interval = Math.max(1, Number(opt('interval', 2))) * 1000;
const draw = (text) => process.stdout.write(`\x1b[2J\x1b[H${text}\n\n(Ctrl-C kończy)\n`);
draw(first.text);
const timer = setInterval(() => {
  const f = frame();
  draw(f.text);
  if (!f.running) { clearInterval(timer); process.stdout.write('przebieg zakończony.\n'); }
}, interval);
