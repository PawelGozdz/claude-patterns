#!/usr/bin/env node
// scripts/workflow-metrics-collect.mjs — collector metryk workflow per-krok (TASK-OBS-002 §1).
// Deterministyczny, zero LLM (D2). Skanuje rekordy przebiegów Workflow ze wszystkich projektów
// (~/.claude/projects/<slug>/<session>/workflows/wf_*.json), łączy je z journalem i transkryptami
// subagentów i emituje po jednej linii per krok + jednej per przebieg do
// ~/.claude/metrics/workflow-steps.jsonl (D1: płaskie JSONL, append-only).
//
// Idempotencja: klucz runId+agentId (kroki) / runId (przebieg). Plik jest append-only, dedup robi
// się przy odczycie (ostatnia linia wygrywa) — patrz recordKey()/dedupeRecords() w lib. Collector
// dodatkowo NIE dopisuje rekordów, których klucz już w pliku jest, więc powtórne uruchomienie
// niczego nie duplikuje.
//
// Outcome (D3, rekonstrukcja regułami):
//   wpis "result" w journalu  → werdykt z treści (result.verdict, np. GO/NO_GO) albo 'ok'
//   "started" bez "result"    → 'silent-death' (agent umarł bez StructuredOutput)
//   cached:true w progress    → 'cached' (resume z cache — bez kosztu)
//   brak journalu             → 'unknown' + partial:true
//
// Koszt (D4): 4 liczniki usage z transkryptu agenta (jedyne wierne źródło — ~91% kosztu to cache
// read/write, memory workflow-cost-is-context-not-work) × stawki z ~/.claude/metrics/prices.json.
// Gdy transkryptu brak: outputTokens = pole `tokens` z workflowProgress + partial:true.
//
// Snapshot runtime.yml (D5): hash + kopia planu do ~/.claude/metrics/runtime-snapshots/<hash>.yml —
// konformancję liczymy względem planu z momentu przebiegu, nie dzisiejszego.
//
// Użycie:  node scripts/workflow-metrics-collect.mjs [--quiet] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {
  METRICS_DIR, STEPS_FILE, SNAPSHOTS_DIR, PROJECTS_DIR,
  readJsonl, recordKey, resolveProjectSlug, sha256short,
  sumTranscriptUsage, estimateCostUsd, loadPrices,
} from './workflow-metrics-lib.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const DEFAULT_PRICES_PATH = path.join(__dirname, 'workflow-metrics-prices.default.json');

// Buduje rekordy dla JEDNEGO przebiegu. Czyste I/O na podanych ścieżkach — testowalne na fixture'ach.
//   wfPath            — plik wf_*.json
//   runDir            — katalog z journal.jsonl + agent-<id>.jsonl (<session>/subagents/workflows/<runId>)
//   fallbackAgentsDir — <session>/subagents (starsze przebiegi trzymały transkrypty płasko)
export function collectRun({ wfPath, wf: wfParsed, runDir, fallbackAgentsDir, prices, project, sessionId, runtimeYmlHash }) {
  let wf = wfParsed;
  if (!wf) {
    // wf_*.json bywa w połowie zapisu albo trwale uszkodzony — jeden zły plik nie może
    // wywalić całej kolekcji (wymóg: przeżyj uszkodzone wejście).
    try { wf = JSON.parse(fs.readFileSync(wfPath, 'utf8')); }
    catch (e) {
      console.error(`[workflow-metrics] pomijam nieczytelny ${wfPath}: ${e.message}`);
      return null;
    }
  }
  const journalPath = runDir ? path.join(runDir, 'journal.jsonl') : null;
  const journal = journalPath && fs.existsSync(journalPath) ? readJsonl(journalPath) : null;

  const startedAgents = new Set();
  const resultByAgent = new Map();
  for (const e of journal || []) {
    if (e.type === 'started' && e.agentId) startedAgents.add(e.agentId);
    if (e.type === 'result' && e.agentId) resultByAgent.set(e.agentId, e.result);
  }

  const logs = Array.isArray(wf.logs) ? wf.logs : [];
  const logReason = (label) => {
    const line = logs.find((l) => typeof l === 'string' && l.startsWith(`${label}:`));
    return line ? line.slice(label.length + 1).trim() : null;
  };

  const agents = (wf.workflowProgress || []).filter((p) => p.type === 'workflow_agent');
  const steps = [];

  for (const a of agents) {
    // agentId pochodzi z treści JSON (nie z readdirSync) — walidacja charsetu zanim trafi do ścieżki
    const safeAgentId = /^[A-Za-z0-9_-]+$/.test(a.agentId ?? '') ? a.agentId : null;
    const transcriptCandidates = safeAgentId ? [
      runDir ? path.join(runDir, `agent-${safeAgentId}.jsonl`) : null,
      fallbackAgentsDir ? path.join(fallbackAgentsDir, `agent-${safeAgentId}.jsonl`) : null,
    ].filter(Boolean) : [];
    const transcriptPath = transcriptCandidates.find((p) => fs.existsSync(p)) || null;
    const usage = a.cached ? null : sumTranscriptUsage(transcriptPath);

    let outcome; let reason = null;
    if (a.cached) {
      outcome = 'cached';
    } else if (resultByAgent.has(a.agentId)) {
      const r = resultByAgent.get(a.agentId);
      outcome = (r && typeof r === 'object' && typeof r.verdict === 'string') ? r.verdict : 'ok';
      if (r && typeof r === 'object' && typeof r.reason === 'string') reason = r.reason;
    } else if (journal && startedAgents.has(a.agentId)) {
      outcome = 'silent-death';
      reason = logReason(a.label);
    } else if (journal) {
      // agent jest w progress, ale journal go nie widział — przerwany przed startem
      outcome = 'not-started';
      reason = logReason(a.label);
    } else {
      outcome = 'unknown';
    }

    const partial = !a.cached && !usage;
    const costUsd = a.cached ? 0 : estimateCostUsd(usage, a.model, prices);

    steps.push({
      type: 'step',
      ts: a.startedAt ? new Date(a.startedAt).toISOString() : wf.timestamp,
      project, sessionId,
      runId: wf.runId,
      taskId: wf.taskId ?? null,
      workflowName: wf.workflowName ?? null,
      agentId: a.agentId,
      phase: a.phaseTitle ?? null,
      label: a.label ?? null,
      agentType: a.agentType ?? null,
      model: a.model ?? null,
      attempt: a.attempt ?? null,
      outputTokens: usage ? usage.outputTokens : (a.cached ? 0 : a.tokens ?? null),
      inputTokens: usage ? usage.inputTokens : null,
      cacheReadTokens: usage ? usage.cacheReadTokens : null,
      cacheWriteTokens: usage ? usage.cacheWriteTokens : null,
      reportedTokens: a.tokens ?? null, // licznik z workflowProgress (inna miara niż outputTokens)
      toolCalls: a.toolCalls ?? null,
      durationMs: a.durationMs ?? null,
      outcome, reason,
      resumedFrom: wf.resumeFromRunId ?? null,
      costUsd,
      runtimeYmlHash: runtimeYmlHash ?? null,
      ...(partial ? { partial: true } : {}),
    });
  }

  const costKnown = steps.filter((s) => Number.isFinite(s.costUsd));
  const run = {
    type: 'run',
    ts: wf.timestamp,
    project, sessionId,
    runId: wf.runId,
    taskId: wf.taskId ?? null,
    workflowName: wf.workflowName ?? null,
    status: wf.status ?? null,
    escalatedAt: wf.result?.escalatedAt ?? null,
    agentCount: wf.agentCount ?? agents.length,
    totalTokens: wf.totalTokens ?? null,
    totalToolCalls: wf.totalToolCalls ?? null,
    durationMs: wf.durationMs ?? null,
    resumedFrom: wf.resumeFromRunId ?? null,
    costUsd: costKnown.length ? +costKnown.reduce((s, x) => s + x.costUsd, 0).toFixed(6) : null,
    costCoverage: agents.length ? +(costKnown.length / agents.length).toFixed(2) : null,
    runtimeYmlHash: runtimeYmlHash ?? null,
  };

  return { steps, run };
}

// Snapshot runtime.yml projektu: zapis kopii pod hashem, zwrot hasha (D5).
export function snapshotRuntimeYml(projectDir, { dryRun = false } = {}) {
  if (!projectDir) return null;
  const p = path.join(projectDir, '.claude', 'config', 'runtime.yml');
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  const hash = sha256short(text);
  if (!dryRun) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    const dest = path.join(SNAPSHOTS_DIR, `${hash}.yml`);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, text);
  }
  return hash;
}

function findRunCandidates() {
  const out = [];
  if (!fs.existsSync(PROJECTS_DIR)) return out;
  for (const slug of fs.readdirSync(PROJECTS_DIR)) {
    const slugDir = path.join(PROJECTS_DIR, slug);
    let sessions;
    try { sessions = fs.readdirSync(slugDir); } catch { continue; }
    for (const session of sessions) {
      const wfDir = path.join(slugDir, session, 'workflows');
      let wfFiles;
      try { wfFiles = fs.readdirSync(wfDir); } catch { continue; } // katalog mógł zniknąć w międzyczasie
      for (const f of wfFiles) {
        if (!/^wf_.*\.json$/.test(f)) continue;
        const runId = f.replace(/\.json$/, '');
        const runDir = path.join(slugDir, session, 'subagents', 'workflows', runId);
        out.push({
          slug, session, runId,
          wfPath: path.join(wfDir, f),
          runDir: fs.existsSync(runDir) ? runDir : null,
          fallbackAgentsDir: path.join(slugDir, session, 'subagents'),
        });
      }
    }
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const quiet = argv.includes('--quiet');
  const dryRun = argv.includes('--dry-run');
  const log = (...a) => { if (!quiet) console.log(...a); };

  const prices = loadPrices({ defaultPricesPath: DEFAULT_PRICES_PATH });
  if (!prices) console.error('[workflow-metrics] brak prices.json i szablonu — koszty będą null');

  // Ten sam runId potrafi leżeć w dwóch sesjach (kopia rekordu) — preferuj tę z journalem.
  const byRunId = new Map();
  for (const c of findRunCandidates()) {
    const prev = byRunId.get(c.runId);
    if (!prev || (!prev.runDir && c.runDir)) byRunId.set(c.runId, c);
  }

  const existingKeys = new Set(readJsonl(STEPS_FILE).map(recordKey));
  const projectDirCache = new Map();
  const lines = [];
  let skippedRunning = 0; let skippedExisting = 0;

  for (const c of byRunId.values()) {
    // Każdy przebieg w osobnym try/catch — jeden uszkodzony plik nie może zabić całej kolekcji.
    try {
      let wf;
      try { wf = JSON.parse(fs.readFileSync(c.wfPath, 'utf8')); } catch { continue; } // w połowie zapisu / uszkodzony
      if (wf.status === 'running') { skippedRunning++; continue; }
      if (existingKeys.has(`${wf.runId}::run`)) { skippedExisting++; continue; }

      if (!projectDirCache.has(c.slug)) projectDirCache.set(c.slug, resolveProjectSlug(c.slug));
      const projectDir = projectDirCache.get(c.slug);
      const runtimeYmlHash = snapshotRuntimeYml(projectDir, { dryRun });

      const collected = collectRun({
        wfPath: c.wfPath, wf, runDir: c.runDir, fallbackAgentsDir: c.fallbackAgentsDir,
        prices, project: c.slug, sessionId: c.session, runtimeYmlHash,
      });
      if (!collected) continue;
      const { steps, run } = collected;
      for (const s of steps) if (!existingKeys.has(recordKey(s))) lines.push(s);
      lines.push(run);
      log(`  + ${run.runId} (${run.workflowName ?? '?'}) — ${steps.length} kroków, status ${run.status}, koszt ~$${run.costUsd ?? '?'}`);
    } catch (e) {
      console.error(`[workflow-metrics] pomijam przebieg ${c.runId} (${c.wfPath}): ${e.message}`);
    }
  }

  if (lines.length && !dryRun) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
    fs.appendFileSync(STEPS_FILE, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  log(`[workflow-metrics] dopisano ${lines.length} rekordów (pominięto: ${skippedExisting} już zebranych, ${skippedRunning} w toku) → ${STEPS_FILE}`);
  return lines.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  main();
}
