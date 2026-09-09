// scripts/workflow-metrics-lib.mjs — wspólne stałe i helpery metryk workflow (TASK-OBS-002).
// Zero LLM, zero zależności poza node:fs/path/os/crypto. Płaskie JSONL w ~/.claude/metrics/ (D1).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Jedna implementacja liczenia tokenów z transkryptu, dwóch konsumentów (K77):
// ten moduł (ESM) i hooks/subagent-stop-cost-log.js (CJS). Źródło jest CJS,
// bo hook nie może być ESM — stąd createRequire zamiast importu.
const require_ = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const transcriptUsage = require_(path.join(REPO_ROOT, 'hooks', 'lib', 'transcript-usage.js'));

export const METRICS_DIR = path.join(os.homedir(), '.claude', 'metrics');
export const STEPS_FILE = path.join(METRICS_DIR, 'workflow-steps.jsonl');
export const COSTS_FILE = path.join(METRICS_DIR, 'costs.jsonl'); // ECC cost-tracker (tylko odczyt)
export const PRICES_FILE = path.join(METRICS_DIR, 'prices.json');
export const SNAPSHOTS_DIR = path.join(METRICS_DIR, 'runtime-snapshots');
export const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* uszkodzona linia — pomiń */ }
  }
  return out;
}

// Klucz idempotencji (append-only + dedup przy odczycie; ostatnia linia wygrywa).
export function recordKey(r) {
  return r.type === 'run' ? `${r.runId}::run` : `${r.runId}::${r.agentId}`;
}

export function dedupeRecords(records) {
  const byKey = new Map();
  for (const r of records) byKey.set(recordKey(r), r);
  return [...byKey.values()];
}

// Slug katalogu projektu ('-opt-projects-juz-ide-api-1') → realna ścieżka ('/opt/projects/juz-ide-api-1').
// '-' jest niejednoznaczny (separator ścieżki LUB literalny myślnik) — DFS po istniejących katalogach.
export function resolveProjectSlug(slug) {
  const parts = slug.replace(/^-/, '').split('-');
  let found = null;
  let visited = 0; // guard: word-break DFS jest strukturalnie wykładniczy — twardy limit stanów
  const dfs = (idx, segments) => {
    if (found || ++visited > 10000) return;
    if (idx === parts.length) {
      const p = '/' + segments.join('/');
      if (fs.existsSync(p)) found = p;
      return;
    }
    // nowy segment — dotychczasowy prefiks musi istnieć jako katalog
    if (segments.length === 0 || fs.existsSync('/' + segments.join('/'))) {
      dfs(idx + 1, [...segments, parts[idx]]);
    }
    // kontynuacja ostatniego segmentu przez literalny '-'
    if (!found && segments.length > 0) {
      const cont = [...segments];
      cont[cont.length - 1] = `${cont[cont.length - 1]}-${parts[idx]}`;
      dfs(idx + 1, cont);
    }
  };
  dfs(0, []);
  return found;
}

export function sha256short(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

// Suma 4 liczników usage z transkryptu subagenta. Transkrypt to snapshoty streamingu:
// jedno message.id występuje w wielu liniach z rosnącym usage — liczy się OSTATNIA linia per id.
// Implementacja mieszka w hooks/lib/transcript-usage.js (współdzielona z hookiem SubagentStop, K77);
// tu tylko re-eksport, żeby nie było dwóch rozjeżdżających się kopii tej samej pętli.
export const sumTranscriptUsage = transcriptUsage.sumTranscriptUsage;
export const modelFromTranscript = transcriptUsage.modelFromTranscript;
export const readTranscriptUsage = transcriptUsage.readTranscriptUsage;

// Szacunek $ z lokalnego cennika (D4). Stawki per 1M tokenów; null gdy model nieznany
// LUB wpis cennika niekompletny (ręcznie edytowany prices.json nie może zatruć sum NaN-em).
export function estimateCostUsd(usage, model, prices) {
  if (!usage || !model || !prices?.models) return null;
  const m = prices.models[model] || prices.models[model.replace(/-\d{8}$/, '')];
  if (!m) return null;
  for (const field of ['input', 'output', 'cacheWrite5m', 'cacheRead']) {
    if (!Number.isFinite(m[field])) return null;
  }
  const cost =
    (usage.inputTokens || 0) * m.input +
    (usage.outputTokens || 0) * m.output +
    (usage.cacheWriteTokens || 0) * m.cacheWrite5m +
    (usage.cacheReadTokens || 0) * m.cacheRead;
  return +(cost / 1e6).toFixed(6);
}

// prices.json z ~/.claude/metrics/; przy braku — inicjalizacja z szablonu w repo.
export function loadPrices({ defaultPricesPath } = {}) {
  if (fs.existsSync(PRICES_FILE)) {
    try { return JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8')); } catch { /* fallthrough */ }
  }
  if (defaultPricesPath && fs.existsSync(defaultPricesPath)) {
    const prices = JSON.parse(fs.readFileSync(defaultPricesPath, 'utf8'));
    fs.mkdirSync(METRICS_DIR, { recursive: true });
    fs.writeFileSync(PRICES_FILE, JSON.stringify(prices, null, 2) + '\n');
    return prices;
  }
  return null;
}
