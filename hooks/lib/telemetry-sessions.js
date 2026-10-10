/**
 * telemetry-sessions.js — stan otwartych przebiegów i agentów dla procesów bez Workflow (ADR 0012).
 *
 * Dziś żyje z tego /analyze: komenda otwiera przebieg (`telemetry-emit run-start`), hook
 * PostToolUse(Agent) przypisuje startujących agentów panelu do przebiegu, a hook SubagentStop
 * zamyka ich krok zdarzeniem `step.end`. Plik stanu jest potrzebny, bo start i koniec agenta to
 * dwa osobne hooki w dwóch procesach.
 *
 * Układ (poza gitem, per maszyna):
 *   telemetry/sessions/runs/<runId>.json       — otwarty przebieg (zapisuje run-start)
 *   telemetry/sessions/agents/<agentId>.json   — jeden plik NA AGENTA
 *
 * Jeden plik na agenta, a nie wspólny plik sesji: panel odpala agentów równolegle, więc kilka
 * hooków PostToolUse naraz czytałoby i nadpisywało ten sam JSON i część mapowań by przepadła.
 * Tu każdy hook zapisuje wyłącznie swój plik (flaga `wx`), nic nie nadpisuje cudzego.
 *
 * Stan może osieroteć (przerwany przebieg, padnięta sesja, kompakcja kontekstu — `run-end` się
 * nie wykona), dlatego przebieg starszy niż RUN_TTL_MS jest ignorowany przez hooki, a
 * `telemetry-emit run-start` zamyka takie przebiegi zdarzeniem `run.end` (outcome `unknown`).
 *
 * CJS, bo konsumują go hooki (CJS) i, przez createRequire, skrypty ESM — jak transcript-usage.js.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

function runTtlMs() {
  const n = Number(process.env.CLAUDE_TELEMETRY_RUN_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

// Przy CLAUDE_TELEMETRY_DIR (testy) stan ląduje obok zdarzeń w katalogu tymczasowym, nigdy w repo.
function sessionsDir() {
  if (process.env.CLAUDE_TELEMETRY_DIR) return path.join(process.env.CLAUDE_TELEMETRY_DIR, 'sessions');
  const root = path.resolve(path.dirname(fs.realpathSync(__filename)), '..', '..');
  return path.join(root, 'telemetry', 'sessions');
}

// Identyfikatory trafiają do nazw plików — tylko bezpieczne znaki (brak ../ i separatorów).
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const SLOT = /^\[slot:([A-Za-z0-9][A-Za-z0-9._-]{0,63})\]/;
const AGENT_TYPE = /^[A-Za-z0-9:_.-]{1,64}$/;

const runFile = (runId) => path.join(sessionsDir(), 'runs', `${runId}.json`);
const agentFile = (agentId) => path.join(sessionsDir(), 'agents', `${agentId}.json`);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, obj, flag = 'w') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj), { flag });
}

function isFresh(run, now = Date.now()) {
  const t = Date.parse(run && run.startedAt);
  return Number.isFinite(t) && now - t < runTtlMs();
}

/** Marker slotu na początku opisu agenta: "[slot:security] …" → "security". Reszta opisu to tekst z promptu i nie wychodzi poza hook. */
function parseSlot(description) {
  const m = SLOT.exec(String(description || '').trim());
  return m ? m[1] : null;
}

function safeAgentType(t) {
  return typeof t === 'string' && AGENT_TYPE.test(t) ? t : null;
}

function startRun(run) {
  if (!SAFE_ID.test(String(run.runId))) throw new Error(`runId "${run.runId}" ma niedozwolone znaki`);
  writeJson(runFile(run.runId), { ...run, startedAt: run.startedAt || new Date().toISOString() });
}

function readRun(runId) {
  return SAFE_ID.test(String(runId)) ? readJson(runFile(runId)) : null;
}

function listRuns() {
  const dir = path.join(sessionsDir(), 'runs');
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f))).filter(Boolean);
}

/** Najnowszy świeży przebieg, którego projekt zawiera `cwd`. Brak stanu = null (szybka ścieżka). */
function findOpenRun(cwd, now = Date.now()) {
  const here = String(cwd || '');
  const hits = listRuns().filter((r) => isFresh(r, now) && r.projectPath
    && (here === r.projectPath || here.startsWith(r.projectPath + path.sep)));
  hits.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return hits[0] || null;
}

function staleRuns(now = Date.now()) {
  return listRuns().filter((r) => !isFresh(r, now));
}

function agentsOfRun(runId) {
  const dir = path.join(sessionsDir(), 'agents');
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f)))
    .filter((a) => a && a.runId === runId);
}

/** Rejestruje agenta panelu. Zwraca rekord albo null, gdy agent był już zarejestrowany. */
function registerAgent({ agentId, runId, slot, agentType, sessionId, startedAt }) {
  if (!SAFE_ID.test(String(agentId))) return null;
  const attempt = agentsOfRun(runId).filter((a) => a.slot === slot).length + 1;
  const rec = {
    agentId, runId, slot, attempt, done: false,
    agentType: safeAgentType(agentType), sessionId: sessionId || null,
    startedAt: startedAt || new Date().toISOString(),
  };
  try {
    writeJson(agentFile(agentId), rec, 'wx');
  } catch (e) {
    if (e && e.code === 'EEXIST') return null;
    throw e;
  }
  return rec;
}

function readAgent(agentId) {
  return SAFE_ID.test(String(agentId)) ? readJson(agentFile(agentId)) : null;
}

/** Oznacza agenta jako zakończonego. Każdy agent ma jednego pisarza, więc zwykły zapis wystarcza. */
function finishAgent(agentId, patch = {}) {
  const rec = readAgent(agentId);
  if (!rec) return null;
  const next = { ...rec, ...patch, done: true };
  writeJson(agentFile(agentId), next);
  return next;
}

/**
 * „Oczekujące zatrzymanie": SubagentStop potrafi przyjść PRZED PostToolUse(Agent) tego samego
 * agenta (zmierzone na żywym przebiegu: szybki agent kończy się, zanim hook startu zdąży go
 * zarejestrować). Hook stop, który nie zna agenta, a widzi otwarty przebieg, zapisuje tu to, co
 * wystarcza do zamknięcia kroku — ścieżkę transkryptu i flagę „odpowiedź niepusta" (treści
 * odpowiedzi nie przechowujemy). Hook startu po rejestracji sprawdza ten plik i domyka krok.
 * Każda strona po własnym zapisie zagląda do drugiej, więc żadna kolejność nie gubi zdarzenia.
 */
const stopFile = (agentId) => path.join(sessionsDir(), 'stops', `${agentId}.json`);

function recordPendingStop({ agentId, runId, transcriptPath, hasReply }) {
  if (!SAFE_ID.test(String(agentId))) return false;
  try {
    writeJson(stopFile(agentId), { agentId, runId, transcriptPath: transcriptPath || null, hasReply: Boolean(hasReply), stoppedAt: new Date().toISOString() }, 'wx');
  } catch (e) {
    if (!(e && e.code === 'EEXIST')) throw e;
  }
  return true;
}

function readPendingStop(agentId) {
  return SAFE_ID.test(String(agentId)) ? readJson(stopFile(agentId)) : null;
}

function removePendingStop(agentId) {
  try { fs.unlinkSync(stopFile(agentId)); } catch { /* już usunięty */ }
}

function pendingStopsOfRun(runId) {
  const dir = path.join(sessionsDir(), 'stops');
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f))).filter((s) => s && s.runId === runId);
}

function removeRun(runId) {
  for (const a of agentsOfRun(runId)) { try { fs.unlinkSync(agentFile(a.agentId)); } catch { /* już usunięty */ } }
  for (const s of pendingStopsOfRun(runId)) removePendingStop(s.agentId);
  try { fs.unlinkSync(runFile(runId)); } catch { /* już usunięty */ }
}

/**
 * Wynik zakończenia agenta. „Niepusta odpowiedź = ok" nie wystarcza: agent, który padł na błędzie
 * API albo limicie, też zwraca tekst. Kolejność: błąd API → pusta odpowiedź → reszta.
 * `killed` (TaskStop) nie jest tu wykrywany — payload SubagentStop nie niesie takiego znacznika.
 */
function classifyStop({ hasReply, apiError }) {
  if (apiError) return { outcome: 'failed', cause: 'infra' };
  if (!hasReply) return { outcome: 'died', cause: 'silent' };
  return { outcome: 'ok' };
}

/**
 * Domyka krok agenta zdarzeniem `step.end` — wołają to OBA hooki (stop, gdy agent jest już
 * zarejestrowany; start, gdy zatrzymanie czekało). Moduł zdarzeń to ESM, więc ładujemy go dopiero
 * tutaj: ścieżki bez pracy (brak przebiegu, brak agenta) nie płacą za jego załadowanie.
 * Idempotentne: `id` zdarzenia wynika z runId + agentId, a gotowy agent (`done`) jest pomijany.
 */
async function completeStep(run, agent, stop) {
  if (!run || !agent || agent.done) return { ok: true, skipped: true };
  const libDir = path.dirname(fs.realpathSync(__filename));
  const runsLib = path.resolve(libDir, '..', '..', 'scripts', 'lib', 'telemetry-runs.mjs');
  const { finishAgentStep } = await import(require('url').pathToFileURL(runsLib).href);
  const res = finishAgentStep(run, agent, stop);
  if (res.ok) removePendingStop(agent.agentId);
  return res;
}

module.exports = {
  completeStep,
  runTtlMs, sessionsDir, isFresh, parseSlot, safeAgentType,
  startRun, readRun, listRuns, findOpenRun, staleRuns,
  agentsOfRun, registerAgent, readAgent, finishAgent, removeRun, classifyStop,
  recordPendingStop, readPendingStop, removePendingStop,
};
