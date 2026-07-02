#!/usr/bin/env node
/**
 * workflow-watcher.js — TASK-OBS-001 (Filar 0: Performance & Observability)
 *
 * ZEWNĘTRZNY watcher transkryptów workflow. Działa POZA silnikiem Workflow —
 * bo udokumentowana awaria (TASK-AGENT-CONFORMANCE-001 §3: weryfikator milknie
 * bez śladu hooka i bez błędu) jest na poziomie silnika i żaden hook in-process
 * jej nie złapie.
 *
 * Co robi (pętla co --interval sekund):
 *   1. Tail-uje ~/.claude/projects/<slug>/<sesja>/subagents/workflows/wf_<id>/agent-<id>.jsonl
 *      (inkrementalnie, po offsetach — nie czyta plików od zera).
 *   2. Per agent liczy: burn tokenów (input + cache_creation + output),
 *      tokeny-od-ostatniego-POSTĘPU i ciszę (sekundy od ostatniej linii).
 *   3. „Postęp" wg KONTRAKTU ETAPU (D6 z TASK-RAG-002.analysis.md) — NIE globalnie
 *      Write/Edit:  *-implementer → Write/Edit/MultiEdit/NotebookEdit;
 *      *-verifier   → StructuredOutput lub wynik w journal.jsonl;
 *      inne         → dowolne z powyższych lub wynik w journalu.
 *   4. Pisze RUN-STATE.md (wgląd na żywo bez czytania transkryptów).
 *   5. Spinning: burn-od-postępu > --spin-tokens ⇒ status SPINNING (alert);
 *      > 2× próg ⇒ wpis do .claude/run-state/halt.json — egzekwuje go
 *      hooks/productivity-watchdog.js (PreToolUse deny).
 *   6. Kill-switch: plik .claude/run-state/KILL (tworzy człowiek) — watcher
 *      tylko raportuje; egzekwuje hook.
 *
 * Usage:
 *   node scripts/workflow-watcher.js --project /opt/projects/juz-ide-api-1 \
 *     [--interval 5] [--spin-tokens 60000] [--silence-sec 300] [--once]
 *
 * Zero zależności npm. Nie modyfikuje transkryptów. Nie zabija agentów —
 * HALT realizuje hook przez deny kolejnych tool-calli.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- CLI ----------
function parseArgs(argv) {
  const args = { interval: 5, spinTokens: 60000, silenceSec: 300, staleSec: 3600, once: false, project: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = path.resolve(argv[++i]);
    else if (a === '--interval') args.interval = Number(argv[++i]);
    else if (a === '--spin-tokens') args.spinTokens = Number(argv[++i]);
    else if (a === '--silence-sec') args.silenceSec = Number(argv[++i]);
    else if (a === '--stale-sec') args.staleSec = Number(argv[++i]);
    else if (a === '--once') args.once = true;
  }
  if (!args.project) {
    process.stderr.write('Usage: workflow-watcher.js --project <path> [--interval 5] [--spin-tokens 60000] [--silence-sec 300] [--once]\n');
    process.exit(1);
  }
  return args;
}

// slug identyczny z konwencją Claude Code: /opt/projects/x → -opt-projects-x
function slugFor(projectPath) {
  return projectPath.replace(/[\\/.]/g, '-');
}

// ---------- Kontrakty etapu (D6) ----------
const IMPLEMENT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const VERIFY_TOOLS = new Set(['StructuredOutput']);

function contractFor(agentType) {
  const t = agentType || '';
  if (/implementer/i.test(t)) return { role: 'implement', progress: IMPLEMENT_TOOLS, spinMult: 1 };
  if (/verifier/i.test(t)) return { role: 'verify', progress: VERIFY_TOOLS, spinMult: 1 };
  // research/analysis/synteza (architect, *-expert, Explore…): legalnie czytają setki tysięcy
  // tokenów i produkują artefakt DOPIERO NA KOŃCU (D6: „analysis → artefakt końcowy + limit
  // czasu") — próg spinningu ×4, inaczej watchdog strzela do własnych (pierwsza walidacja live
  // 2026-07-02: HALT 4/4 agentów panelu /analyze-ddd po 130-260k, wszystkie pracowały uczciwie).
  return { role: 'research', progress: new Set([...IMPLEMENT_TOOLS, ...VERIFY_TOOLS]), spinMult: 4 };
}

// ---------- Stan per plik transkryptu (offsety + liczniki) ----------
// state[jsonlPath] = { offset, remainder, agentId, agentType, burn, burnAtProgress,
//                      lastTs, lastTool, lastProgressTool, done }
const state = Object.create(null);

function findTranscriptDirs(projectsRoot, slug) {
  const base = path.join(projectsRoot, slug);
  const dirs = [];
  let sessions = [];
  try { sessions = fs.readdirSync(base, { withFileTypes: true }); } catch { return dirs; }
  for (const s of sessions) {
    if (!s.isDirectory()) continue;
    const subRoot = path.join(base, s.name, 'subagents');
    // Zwykłe wywołania Agent() lądują bezpośrednio w subagents/ (bez workflows/) —
    // ciche milknięcie występuje TAKŻE tam (dowód 2026-07-02), więc skanujemy oba poziomy.
    try {
      if (fs.readdirSync(subRoot).some((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))) dirs.push(subRoot);
    } catch { continue; }
    const wfRoot = path.join(subRoot, 'workflows');
    let wfs = [];
    try { wfs = fs.readdirSync(wfRoot, { withFileTypes: true }); } catch { continue; }
    for (const wf of wfs) {
      if (wf.isDirectory()) dirs.push(path.join(wfRoot, wf.name));
    }
  }
  return dirs;
}

function readMetaType(jsonlPath) {
  const metaPath = jsonlPath.replace(/\.jsonl$/, '.meta.json');
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')).agentType || null; } catch { return null; }
}

function readJournalResults(wfDir) {
  const done = new Set();
  try {
    const lines = fs.readFileSync(path.join(wfDir, 'journal.jsonl'), 'utf8').split('\n');
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const e = JSON.parse(l);
        if (e.type === 'result' && e.agentId) done.add(e.agentId);
      } catch { /* linia częściowa — pomiń */ }
    }
  } catch { /* brak journala — ok */ }
  return done;
}

function tokensOf(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.output_tokens || 0);
}

// Inkrementalne dociągnięcie nowych linii z transkryptu.
function ingest(jsonlPath) {
  let st = state[jsonlPath];
  if (!st) {
    st = state[jsonlPath] = {
      offset: 0, remainder: '', agentId: path.basename(jsonlPath, '.jsonl').replace(/^agent-/, ''),
      agentType: readMetaType(jsonlPath), burn: 0, burnAtProgress: 0, turns: 0,
      lastTs: null, lastTool: null, lastProgressTool: null, done: false,
    };
  }
  let size;
  try { size = fs.statSync(jsonlPath).size; } catch { return st; }
  if (size <= st.offset) return st;

  const fd = fs.openSync(jsonlPath, 'r');
  const buf = Buffer.alloc(size - st.offset);
  fs.readSync(fd, buf, 0, buf.length, st.offset);
  fs.closeSync(fd);
  st.offset = size;

  const contract = contractFor(st.agentType);
  const chunk = st.remainder + buf.toString('utf8');
  const lines = chunk.split('\n');
  st.remainder = lines.pop() || ''; // ostatnia linia może być częściowa

  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.timestamp) st.lastTs = e.timestamp;
    if (e.type !== 'assistant' || !e.message) continue;
    st.burn += tokensOf(e.message.usage);
    const content = Array.isArray(e.message.content) ? e.message.content : [];
    let usedToolThisMsg = false;
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      // tury ≈ liczba wiadomości z tool-callem: maxTurns ucina agenta PO CICHU (bez
      // błędu/werdyktu) — licznik pokazuje zbliżanie się do klifu (dowód: śmierć przy równo 30).
      if (!usedToolThisMsg) { st.turns++; usedToolThisMsg = true; }
      st.lastTool = block.name;
      if (contract.progress.has(block.name)) {
        st.burnAtProgress = st.burn;
        st.lastProgressTool = block.name;
      }
    }
    // Poza Workflow werdykt/wynik pada jako CZYSTY TEKST (nie StructuredOutput) i nie ma
    // journal.jsonl — wiadomość tekstowa bez tool_use liczy się jako postęp dla verify/other
    // (dla implement postępem pozostaje wyłącznie Write/Edit). Bez tego skończony weryfikator
    // wygląda jak spinning → fałszywy HALT (zaobserwowane 2026-07-02).
    if (!usedToolThisMsg && contract.role !== 'implement'
        && content.some((b) => b.type === 'text' && (b.text || '').trim())) {
      st.burnAtProgress = st.burn;
      st.lastProgressTool = 'text-final';
    }
  }
  return st;
}

// ---------- Flagi HALT + RUN-STATE ----------
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeHaltFlags(project, spinning) {
  const dir = path.join(project, '.claude', 'run-state');
  ensureDir(dir);
  const file = path.join(dir, 'halt.json');
  let current = { agents: {} };
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* świeży plik */ }
  if (!current.agents) current.agents = {};
  let changed = false;
  for (const s of spinning) {
    if (!current.agents[s.agentId]) {
      current.agents[s.agentId] = { reason: s.reason, ts: new Date().toISOString() };
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(current, null, 2) + '\n');
  return changed;
}

function statusOf(st, doneSet, args, now) {
  if (st.done || doneSet.has(st.agentId)) return 'DONE';
  const sinceProgress = st.burn - st.burnAtProgress;
  const silence = st.lastTs ? (now - Date.parse(st.lastTs)) / 1000 : null;
  // Martwy/historyczny przebieg: raportuj STALE, NIE flaguj do HALT —
  // egzekwowanie ma sens tylko na żywym agencie (dowód awarii i tak zostaje w RUN-STATE).
  if (silence !== null && silence > args.staleSec) return 'STALE';
  // KARENCJA STARTOWA: przed PIERWSZYM zdarzeniem postępu próg ×4 także dla implement/verify —
  // implementer MUSI najpierw wczytać analysis+Rule Cards+patterny (wymusza to check-patterns-read),
  // a cache_creation wlicza się do burn ⇒ legalna faza czytania to często >120k zanim padnie
  // pierwszy Write. Incydent 2026-07-02: watchdog zablokował implementera W TRAKCIE czytania
  // wzorców → git-diff-gate eskalował pusty przebieg. Po pierwszym postępie — normalny próg roli.
  const mult = st.lastProgressTool === null ? 4 : (contractFor(st.agentType).spinMult || 1);
  const spinAt = args.spinTokens * mult;
  if (sinceProgress > 2 * spinAt) return 'HALT';
  if (sinceProgress > spinAt) return 'SPINNING';
  if (silence !== null && silence > args.silenceSec) return 'SILENT';
  return 'OK';
}

function fmtK(n) { return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n); }

function renderRunState(project, groups, args, killOn) {
  const now = new Date().toISOString();
  const out = [];
  out.push('# RUN-STATE — live workflow observability (workflow-watcher.js, TASK-OBS-001)');
  out.push('');
  out.push(`Updated: ${now} · project: ${project}`);
  out.push(`Thresholds: SPINNING > ${fmtK(args.spinTokens)} burn-tokens od postępu (research ×4 = ${fmtK(4 * args.spinTokens)}) · HALT > 2× progu roli · SILENT > ${args.silenceSec}s`);
  out.push(`Kill-switch (.claude/run-state/KILL): ${killOn ? '🔴 AKTYWNY — hook blokuje wszystkie tool-calle subagentów' : 'nieaktywny'}`);
  out.push('');
  out.push('Statusy: OK · SPINNING (tokeny rosną bez postępu wg kontraktu etapu) · HALT (flaga w halt.json — hook blokuje) · SILENT (brak linii w transkrypcie) · STALE (przebieg nieaktywny — tylko raport, bez flag) · DONE');
  out.push('');
  const wfIds = Object.keys(groups).sort();
  if (wfIds.length === 0) out.push('_Brak aktywnych transkryptów workflow._');
  for (const wfId of wfIds) {
    out.push(`## ${wfId}`);
    out.push('');
    out.push('| agent | typ (kontrakt) | status | burn | od postępu | tury | ostatni tool | ostatni postęp | cisza |');
    out.push('|---|---|---|---|---|---|---|---|---|');
    for (const row of groups[wfId]) out.push(row);
    out.push('');
  }
  const target = fs.existsSync(path.join(project, 'project-orchestration'))
    ? path.join(project, 'project-orchestration', 'RUN-STATE.md')
    : path.join(project, 'RUN-STATE.md');
  fs.writeFileSync(target, out.join('\n') + '\n');
  return target;
}

// ---------- Główna pętla ----------
function tick(args, projectsRoot) {
  const now = Date.now();
  const slug = slugFor(args.project);
  const wfDirs = findTranscriptDirs(projectsRoot, slug);
  const groups = {};
  const spinning = [];

  for (const wfDir of wfDirs) {
    let files = [];
    try { files = fs.readdirSync(wfDir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl')); } catch { continue; }
    if (files.length === 0) continue;
    const doneSet = readJournalResults(wfDir);
    const wfId = path.basename(wfDir);
    for (const f of files) {
      const st = ingest(path.join(wfDir, f));
      const status = statusOf(st, doneSet, args, now);
      if (status === 'DONE') st.done = true;
      if (status === 'HALT') {
        spinning.push({
          agentId: st.agentId,
          reason: `SPINNING: ${fmtK(st.burn - st.burnAtProgress)} burn-tokens bez postępu (kontrakt: ${contractFor(st.agentType).role}, agentType: ${st.agentType || '?'})`,
        });
      }
      const silence = st.lastTs ? Math.round((now - Date.parse(st.lastTs)) / 1000) : null;
      const icon = { OK: '🟢', SPINNING: '🟡', HALT: '🔴', SILENT: '⚪', STALE: '⏸', DONE: '✅' }[status];
      if (!groups[wfId]) groups[wfId] = [];
      const turnsCell = st.turns >= 25 && status !== 'DONE' && status !== 'STALE'
        ? `${st.turns} ⚠️klif-maxTurns` : String(st.turns);
      groups[wfId].push(
        `| ${st.agentId.slice(0, 8)} | ${st.agentType || '?'} (${contractFor(st.agentType).role}) | ${icon} ${status} ` +
        `| ${fmtK(st.burn)} | ${fmtK(st.burn - st.burnAtProgress)} | ${turnsCell} | ${st.lastTool || '—'} | ${st.lastProgressTool || '—'} ` +
        `| ${silence === null ? '—' : silence + 's'} |`
      );
    }
  }

  const killOn = fs.existsSync(path.join(args.project, '.claude', 'run-state', 'KILL'));
  const flagged = writeHaltFlags(args.project, spinning);
  const target = renderRunState(args.project, groups, args, killOn);
  if (flagged) {
    process.stderr.write(`[watcher] 🔴 HALT flag(s) written for: ${spinning.map(s => s.agentId.slice(0, 8)).join(', ')} → ${path.join(args.project, '.claude/run-state/halt.json')}\n`);
  }
  return target;
}

function main() {
  const args = parseArgs(process.argv);
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  process.stderr.write(`[watcher] project=${args.project} slug=${slugFor(args.project)} interval=${args.interval}s spin=${fmtK(args.spinTokens)} silence=${args.silenceSec}s\n`);
  const target = tick(args, projectsRoot);
  process.stderr.write(`[watcher] RUN-STATE → ${target}\n`);
  if (args.once) return;
  setInterval(() => {
    try { tick(args, projectsRoot); } catch (e) { process.stderr.write(`[watcher] tick error: ${e.message}\n`); }
  }, args.interval * 1000);
}

main();
