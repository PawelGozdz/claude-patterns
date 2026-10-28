#!/usr/bin/env node
/**
 * reviewer-stats.mjs — adaptacyjny dobór reviewerów /review-panel (TASK-GSTACK-ADOPT-001, B3).
 *
 * DLACZEGO: panel odpala 5–10 reviewerów na każdy diff, a część z nich w danym projekcie nigdy nic nie
 * znajduje (np. nitpicker przy formatterze w CI). Telemetria v1 (ADR 0012) nie niesie wyniku per reviewer
 * (brak `process: review-panel`, brak liczby findingów, schemat ma additionalProperties:false), a snapshot
 * z `~/.claude/review-panel-snapshots/` zapisuje findingi bez autora i jest nadpisywany per gałąź. Dlatego
 * /review-panel dopisuje własny, minimalny dziennik JSONL — ten skrypt go zapisuje (--record), czyta
 * i z niego liczy decyzję (--select).
 *
 * Dziennik: `~/.claude/review-panel-stats/invocations.jsonl` (nadpisanie: REVIEW_PANEL_STATS_FILE albo --file).
 * Jedna linia = jeden reviewer w jednym przebiegu panelu:
 *   {"v":1,"ts":"…","project":"api-1","branch":"feature/x","reviewer":"nitpicker","outcome":"ran","findings":0}
 *   {"v":1,"ts":"…","project":"api-1","branch":"feature/x","reviewer":"nitpicker","outcome":"skipped"}
 * Bez treści diffu, bez ścieżek plików, bez treści findingów — tylko liczby.
 *
 * Reguła: reviewer, który w ≥10 OSTATNICH z rzędu wywołań (`ran`) nie zgłosił nic, to [GATE_CANDIDATE]
 * i jest pomijany — chyba że jest na liście NEVER_GATE. Pominięty reviewer nie zbiera nowych danych, więc
 * co PROBE_EVERY-ty pominięty przebieg dostaje `PROBE` (jedno wywołanie kontrolne); finding zeruje serię.
 * Statystyka jest per projekt: zero w jednym repo nie wyłącza reviewera w innym.
 *
 * Użycie:
 *   node scripts/reviewer-stats.mjs [--project <nazwa> | --all-projects] [--json] [--file <plik>]
 *   node scripts/reviewer-stats.mjs --select eagle,security,nitpicker [--project <nazwa>] [--json]
 *   node scripts/reviewer-stats.mjs --record --project <nazwa> [--branch <b>] --ran eagle=2,newbie=0 --skipped nitpicker
 *   node scripts/reviewer-stats.mjs --check-config
 * Kody wyjścia: 0 ok · 1 błąd użycia / --check-config nie przeszło · 2 uszkodzony dziennik (jawny błąd, nie ciche zero).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Seria zer (wywołań `ran` bez findingu z rzędu), od której reviewer jest kandydatem do pominięcia. */
export const GATE_AFTER = 10;
/** Co ile pominiętych przebiegów z rzędu kandydat dostaje wywołanie kontrolne. */
export const PROBE_EVERY = 10;
/**
 * Nigdy pomijani: security i compliance (koszt pominięcia > koszt wywołania), pragmatist
 * (podłoga decyzji blokujących panelu — skill włącza go zawsze).
 */
export const NEVER_GATE = Object.freeze(['security', 'compliance', 'pragmatist']);

const NAME_RE = /^[a-z][a-z0-9-]{0,40}$/;
const PROJECT_RE = /^[A-Za-z0-9._-]{1,80}$/;

export class StatsError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}
/** Uszkodzony albo nieczytelny dziennik — exit 2, żeby wołający nie mylił go z błędem użycia. */
export class LogError extends StatsError {
  constructor(message) { super(message, 2); }
}

export function defaultFile() {
  return process.env.REVIEW_PANEL_STATS_FILE
    || path.join(os.homedir(), '.claude', 'review-panel-stats', 'invocations.jsonl');
}

/** `reviewer-security` i `security` to ten sam reviewer. */
export function normalizeName(raw) {
  const name = String(raw ?? '').trim().replace(/^reviewer-/, '');
  if (!NAME_RE.test(name)) throw new StatsError(`nieprawidłowa nazwa reviewera: "${raw}"`);
  return name;
}

/** Parsuje dziennik. Brak pliku = brak danych ([]); uszkodzona linia = StatsError z numerem linii. */
export function readLog(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new LogError(`nie mogę odczytać ${file}: ${e.message}`);
  }
  const records = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${file}:${i + 1}`;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      throw new LogError(`${at}: uszkodzony JSON (${e.message})`);
    }
    if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) throw new LogError(`${at}: wpis nie jest obiektem`);
    if (rec.v !== 1) throw new LogError(`${at}: nieznana wersja wpisu (v=${JSON.stringify(rec.v)})`);
    if (typeof rec.ts !== 'string' || Number.isNaN(Date.parse(rec.ts))) throw new LogError(`${at}: brak poprawnego ts`);
    if (typeof rec.project !== 'string' || !PROJECT_RE.test(rec.project)) throw new LogError(`${at}: brak poprawnego project`);
    if (typeof rec.reviewer !== 'string' || !NAME_RE.test(rec.reviewer)) throw new LogError(`${at}: brak poprawnego reviewer`);
    if (rec.outcome === 'ran') {
      if (!Number.isInteger(rec.findings) || rec.findings < 0) throw new LogError(`${at}: outcome=ran wymaga findings będącego liczbą całkowitą >= 0`);
    } else if (rec.outcome !== 'skipped') {
      throw new LogError(`${at}: outcome musi być "ran" albo "skipped"`);
    }
    records.push(rec);
  });
  return records;
}

/** Statystyka per reviewer z wpisów (kolejność pliku = kolejność zdarzeń). */
export function computeStats(records) {
  const byName = new Map();
  for (const rec of records) {
    let s = byName.get(rec.reviewer);
    if (!s) {
      s = { reviewer: rec.reviewer, invocations: 0, invocationsWithFindings: 0, findings: 0, zeroStreak: 0, skippedSinceRun: 0, skippedTotal: 0 };
      byName.set(rec.reviewer, s);
    }
    if (rec.outcome === 'ran') {
      s.invocations += 1;
      s.findings += rec.findings;
      if (rec.findings > 0) { s.invocationsWithFindings += 1; s.zeroStreak = 0; } else { s.zeroStreak += 1; }
      s.skippedSinceRun = 0;
    } else {
      s.skippedTotal += 1;
      s.skippedSinceRun += 1;
    }
  }
  return [...byName.values()]
    .map((s) => {
      const neverGate = NEVER_GATE.includes(s.reviewer);
      const gateCandidate = !neverGate && s.zeroStreak >= GATE_AFTER;
      const decision = gateCandidate ? (s.skippedSinceRun >= PROBE_EVERY ? 'PROBE' : 'SKIP') : 'RUN';
      return { ...s, neverGate, gateCandidate, decision };
    })
    .sort((a, b) => a.reviewer.localeCompare(b.reviewer));
}

/** Decyzja dla zaplanowanego panelu: reviewer bez danych = zawsze RUN. */
export function selectPanel(planned, stats) {
  const index = new Map(stats.map((s) => [s.reviewer, s]));
  const run = [];
  const probe = [];
  const skip = [];
  for (const name of [...new Set(planned)]) {
    const s = index.get(name);
    if (!s) { run.push({ reviewer: name, reason: 'brak danych' }); continue; }
    if (s.neverGate) { run.push({ reviewer: name, reason: 'NEVER_GATE' }); continue; }
    if (s.decision === 'SKIP') {
      skip.push({ reviewer: name, reason: `${s.zeroStreak} wywołań z rzędu bez findingu (próg ${GATE_AFTER}); kontrolne wywołanie za ${PROBE_EVERY - s.skippedSinceRun} przebieg(ów)` });
    } else if (s.decision === 'PROBE') {
      probe.push({ reviewer: name, reason: `wywołanie kontrolne: ${s.zeroStreak} wywołań bez findingu, ${s.skippedSinceRun} pominięć z rzędu` });
    } else {
      run.push({ reviewer: name, reason: s.invocations < GATE_AFTER ? `za mało danych (${s.invocations}/${GATE_AFTER} wywołań)` : 'ma findingi w ostatnich wywołaniach' });
    }
  }
  return { run: [...run, ...probe], skip, probe };
}

function buildRecordLines({ project, branch, ran, skipped, now }) {
  if (!project || !PROJECT_RE.test(project)) throw new StatsError('--record wymaga --project o poprawnej nazwie');
  if (branch !== undefined && (typeof branch !== 'string' || branch.length > 200 || /[\u0000-\u001f]/.test(branch))) throw new StatsError('nieprawidłowa --branch');
  const entries = [];
  for (const pair of ran) {
    const m = /^([^=]+)=(\d+)$/.exec(pair.trim());
    if (!m) throw new StatsError(`--ran: oczekiwano nazwa=liczba, dostałem "${pair}"`);
    entries.push({ reviewer: normalizeName(m[1]), outcome: 'ran', findings: Number(m[2]) });
  }
  for (const raw of skipped) {
    const reviewer = normalizeName(raw);
    if (NEVER_GATE.includes(reviewer)) throw new StatsError(`reviewer-${reviewer} jest na liście NEVER_GATE — nie wolno go zapisać jako pominiętego`);
    entries.push({ reviewer, outcome: 'skipped' });
  }
  if (entries.length === 0) throw new StatsError('--record: podaj --ran i/lub --skipped');
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.reviewer)) throw new StatsError(`reviewer-${e.reviewer} wymieniony dwa razy w jednym przebiegu`);
    seen.add(e.reviewer);
  }
  const ts = now.toISOString();
  return entries.map((e) => JSON.stringify({ v: 1, ts, project, ...(branch ? { branch } : {}), ...e }));
}

export function recordRun(file, opts) {
  const lines = buildRecordLines({ ...opts, now: opts.now ?? new Date() });
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, lines.join('\n') + '\n');
  } catch (e) {
    throw new StatsError(`nie mogę zapisać do ${file}: ${e.message}`);
  }
  return lines.length;
}

/** Spójność konfiguracji: lista NEVER_GATE, istnienie agentów, podpięcie w skillu i komendzie, parsowanie dziennika. */
export function checkConfig(file, repo = REPO) {
  const problems = [];
  for (const must of ['security', 'compliance', 'pragmatist']) {
    if (!NEVER_GATE.includes(must)) problems.push(`NEVER_GATE nie zawiera obowiązkowego "${must}"`);
  }
  for (const name of NEVER_GATE) {
    if (!fs.existsSync(path.join(repo, 'agents', 'universal', `reviewer-${name}.md`))) problems.push(`NEVER_GATE: brak agents/universal/reviewer-${name}.md`);
  }
  if (!Number.isInteger(GATE_AFTER) || GATE_AFTER < 1) problems.push('GATE_AFTER musi być liczbą całkowitą >= 1');
  if (!Number.isInteger(PROBE_EVERY) || PROBE_EVERY < 1) problems.push('PROBE_EVERY musi być liczbą całkowitą >= 1');
  for (const rel of ['skills/quality/review-panel/SKILL.md', 'commands/review-panel.md']) {
    let text = '';
    try { text = fs.readFileSync(path.join(repo, rel), 'utf8'); } catch { problems.push(`brak pliku ${rel}`); continue; }
    for (const needle of ['reviewer-stats.mjs', '--select', '--record']) {
      if (!text.includes(needle)) problems.push(`${rel} nie wspomina "${needle}" — dobór reviewerów nie jest podpięty`);
    }
  }
  try { readLog(file); } catch (e) { problems.push(e.message); }
  return problems;
}

function detectProject() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (top) return path.basename(top);
  } catch { /* poza repo — bierzemy katalog roboczy */ }
  return path.basename(process.cwd());
}

function parseArgs(argv) {
  const opts = { ran: [], skipped: [] };
  const list = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const need = (i, flag) => {
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new StatsError(`${flag} wymaga wartości`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--all-projects') opts.allProjects = true;
    else if (a === '--record') opts.record = true;
    else if (a === '--check-config') opts.checkConfig = true;
    else if (a === '--project') opts.project = need(i++, a);
    else if (a === '--branch') opts.branch = need(i++, a);
    else if (a === '--file') opts.file = need(i++, a);
    else if (a === '--select') opts.select = list(need(i++, a));
    else if (a === '--ran') opts.ran.push(...list(need(i++, a)));
    else if (a === '--skipped') opts.skipped.push(...list(need(i++, a)));
    else throw new StatsError(`nieznany argument: ${a}`);
  }
  return opts;
}

function renderTable(stats, project) {
  if (stats.length === 0) return `Brak danych o wywołaniach reviewerów (${project}). Każdy reviewer jest uruchamiany.`;
  const rows = stats.map((s) => {
    const tags = [s.gateCandidate ? '[GATE_CANDIDATE]' : '', s.neverGate ? '[NEVER_GATE]' : ''].filter(Boolean).join(' ');
    return `${('reviewer-' + s.reviewer).padEnd(24)} wywołania ${String(s.invocations).padStart(3)}  z findingiem ${String(s.invocationsWithFindings).padStart(3)}  seria zer ${String(s.zeroStreak).padStart(3)}  decyzja ${s.decision.padEnd(5)} ${tags}`.trimEnd();
  });
  return [`Statystyka reviewerów — ${project}`, ...rows].join('\n');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const file = opts.file ?? defaultFile();

  if (opts.checkConfig) {
    const problems = checkConfig(file);
    if (problems.length) {
      console.error(`reviewer-stats --check-config: ${problems.length} problem(ów)\n- ${problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log(`reviewer-stats --check-config: OK (NEVER_GATE: ${NEVER_GATE.join(', ')}; próg ${GATE_AFTER}; kontrola co ${PROBE_EVERY})`);
    return;
  }

  if (opts.record) {
    const n = recordRun(file, { project: opts.project, branch: opts.branch, ran: opts.ran, skipped: opts.skipped });
    console.log(`reviewer-stats: zapisano ${n} wpis(ów) → ${file}`);
    return;
  }

  const project = opts.project ?? detectProject();
  const all = readLog(file);
  const records = opts.allProjects ? all : all.filter((r) => r.project === project);
  const stats = computeStats(records);
  const scope = opts.allProjects ? '(wszystkie projekty)' : project;

  if (opts.select) {
    const planned = opts.select.map(normalizeName);
    if (planned.length === 0) throw new StatsError('--select wymaga listy reviewerów');
    const sel = selectPanel(planned, stats);
    if (opts.json) {
      console.log(JSON.stringify({ project: scope, run: sel.run, skip: sel.skip, probe: sel.probe.map((p) => p.reviewer) }, null, 2));
    } else {
      for (const r of sel.run) console.log(`RUN   reviewer-${r.reviewer} — ${r.reason}`);
      for (const r of sel.skip) console.log(`SKIP  reviewer-${r.reviewer} — ${r.reason}`);
    }
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify({ file, project: scope, gateAfter: GATE_AFTER, probeEvery: PROBE_EVERY, neverGate: NEVER_GATE, reviewers: stats }, null, 2));
  } else {
    console.log(renderTable(stats, scope));
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (e) {
    if (!(e instanceof StatsError)) throw e;
    console.error(`reviewer-stats: ${e.message}`);
    process.exit(e.exitCode);
  }
}
