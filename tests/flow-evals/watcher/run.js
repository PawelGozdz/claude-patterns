#!/usr/bin/env node
/**
 * tests/flow-evals/watcher/run.js — eval L1 dla scripts/workflow-watcher.js (D7).
 *
 * Syntetyczne transkrypty JSONL → oczekiwany status w RUN-STATE.md + flagi halt.json.
 * Każdy z przypadków R1-R3 koduje REALNĄ regresję złapaną incydentem 2026-07-02
 * (research ×4, karencja startowa, text-final) — zmiana progów/kontraktów musi
 * przejść przez te fixtures zamiast przez produkcję.
 *
 * Uruchom przy KAŻDEJ zmianie watchera: node tests/flow-evals/watcher/run.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const WATCHER = path.join(REPO, 'scripts', 'workflow-watcher.js');

const nowIso = (agoSec = 0) => new Date(Date.now() - agoSec * 1000).toISOString();
const slugFor = (p) => p.replace(/[\\/.]/g, '-');

// Linia transkryptu: asystent z burn `tokens` (cache_creation) + opcjonalny tool_use / text-only.
function line(agentId, tokens, toolName, agoSec, textOnly = false) {
  const content = [];
  if (toolName) content.push({ type: 'tool_use', id: 't1', name: toolName, input: {} });
  if (textOnly) content.push({ type: 'text', text: 'final verdict: GO — synthetic' });
  return JSON.stringify({
    type: 'assistant', agentId, timestamp: nowIso(agoSec),
    message: { role: 'assistant', usage: { input_tokens: 0, cache_creation_input_tokens: tokens, output_tokens: 100 }, content },
  });
}

// CASES — [id, agentType, linie(fn), expectStatus, expectFlag]
const CASES = [
  { // R1 (regresja: research ×4) — architect legalnie czyta 200k bez artefaktu → OK, nie HALT
    id: 'ares1oky01research1x', type: 'architect', expect: 'OK', flag: false,
    lines: (a) => [line(a, 100000, 'Read', 20), line(a, 100000, 'Grep', 10)],
  },
  { // research NAPRAWDĘ w pętli: >480k bez postępu → HALT + flaga
    id: 'ares2hlt02haltxxxx1', type: 'architect', expect: 'HALT', flag: true,
    lines: (a) => [1, 2, 3, 4, 5].map((i) => line(a, 110000, 'Read', 30 - i)),
  },
  { // R2 (regresja: karencja startowa) — implementer w fazie czytania 200k PRZED pierwszym Write → OK
    id: 'aimplread01graceok1x', type: 'domain-application-implementer', expect: 'OK', flag: false,
    lines: (a) => [line(a, 100000, 'Read', 20), line(a, 100000, 'Read', 10)],
  },
  { // implementer PO pierwszym Write pali 300k bez kolejnego postępu → HALT (normalny próg 120k)
    id: 'aimplspin01halt1xxxx', type: 'domain-application-implementer', expect: 'HALT', flag: true,
    lines: (a) => [line(a, 50000, 'Write', 40), line(a, 150000, 'Read', 20), line(a, 150000, 'Grep', 5)],
  },
  { // R3 (regresja: text-final) — verifier kończy werdyktem TEKSTOWYM (bez StructuredOutput) → OK, nie HALT
    id: 'averiftext01okxxxxx1', type: 'code-quality-verifier', expect: 'OK', flag: false,
    lines: (a) => [line(a, 120000, 'Read', 30), line(a, 120000, 'Bash', 20), line(a, 5000, null, 10, true)],
  },
  { // wynik w journal.jsonl → DONE niezależnie od burn
    id: 'ajournaldone01xxxxx1', type: 'code-quality-verifier', expect: 'DONE', flag: false, journalDone: true,
    lines: (a) => [line(a, 200000, 'Read', 15)],
  },
  { // martwy/historyczny przebieg (cisza > stale-sec) → STALE, bez flagi mimo ogromnego burn
    id: 'astale01noflagxxxxx1', type: 'domain-application-implementer', expect: 'STALE', flag: false,
    lines: (a) => [line(a, 60000, 'Write', 7500), line(a, 400000, 'Read', 7300)],
  },
];

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-eval-'));
  const project = path.join(tmp, 'proj');
  const projectsRoot = path.join(tmp, 'projects-root');
  const wfDir = path.join(projectsRoot, slugFor(project), 'sess-1', 'subagents', 'workflows', 'wf_test');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(wfDir, { recursive: true });

  const journal = [];
  for (const c of CASES) {
    fs.writeFileSync(path.join(wfDir, `agent-${c.id}.jsonl`), c.lines(c.id).join('\n') + '\n');
    fs.writeFileSync(path.join(wfDir, `agent-${c.id}.meta.json`), JSON.stringify({ agentType: c.type, spawnDepth: 1 }));
    if (c.journalDone) journal.push(JSON.stringify({ type: 'result', key: 'k', agentId: c.id, result: 'ok' }));
  }
  if (journal.length) fs.writeFileSync(path.join(wfDir, 'journal.jsonl'), journal.join('\n') + '\n');

  const res = spawnSync('node', [WATCHER, '--project', project, '--projects-root', projectsRoot, '--once'], { encoding: 'utf8' });
  if (res.status !== 0) {
    process.stdout.write(`❌ watcher exit=${res.status}\n${res.stderr}\n`);
    process.exit(1);
  }
  const runState = fs.readFileSync(path.join(project, 'RUN-STATE.md'), 'utf8');
  let flags = { agents: {} };
  try { flags = JSON.parse(fs.readFileSync(path.join(project, '.claude', 'run-state', 'halt.json'), 'utf8')); } catch { /* brak = zero flag */ }

  let failed = 0;
  for (const c of CASES) {
    const row = runState.split('\n').find((l) => l.includes(`| ${c.id.slice(0, 8)} |`)) || '';
    const statusOk = row.includes(` ${c.expect} `);
    const flagged = Boolean(flags.agents && flags.agents[c.id]);
    const flagOk = flagged === c.flag;
    if (statusOk && flagOk) {
      process.stdout.write(`  ✅ ${c.id.slice(0, 12)} (${c.type.slice(0, 24)}) → ${c.expect}${c.flag ? ' +flag' : ''}\n`);
    } else {
      failed++;
      process.stdout.write(`  ❌ ${c.id.slice(0, 12)} — expected ${c.expect}${c.flag ? '+flag' : ''}, row: ${row.trim() || '(BRAK WIERSZA)'} flagged=${flagged}\n`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.stdout.write(`\n${CASES.length - failed}/${CASES.length} passed\n`);
  process.exit(failed ? 1 : 0);
}

main();
