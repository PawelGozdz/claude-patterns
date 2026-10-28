#!/usr/bin/env node
/**
 * reviewer-stats.mjs — adaptacyjny dobór reviewerów /review-panel (TASK-GSTACK-ADOPT-001, B3).
 *
 * DLACZEGO: panel odpala 5–10 reviewerów na każdy diff, a część z nich w danym projekcie nigdy nic nie
 * znajduje (np. nitpicker przy formatterze w CI). Snapshot z `~/.claude/review-panel-snapshots/` zapisuje
 * findingi bez autora i jest nadpisywany per gałąź, więc wynik per reviewer idzie do telemetrii v1
 * (ADR 0012, aneks „review-panel"): ten skrypt zapisuje go (--record), czyta i z niego liczy decyzję (--select).
 *
 * Dane: zdarzenia `process: review-panel` w `telemetry/events/<RRRR-MM>.jsonl` (nadpisanie katalogu:
 * CLAUDE_TELEMETRY_DIR, jak u pozostałych emiterów). Jedno `step.end` = jeden reviewer w jednym przebiegu panelu:
 *   step.id = step.role = "nitpicker", outcome "ok" + step.findings (wywołany) albo "skipped" (pominięty).
 * Bez treści diffu, ścieżek, gałęzi i treści findingów — tylko liczby.
 *
 * Reguła: reviewer, który w ≥10 OSTATNICH z rzędu wywołań (`ran`) nie zgłosił nic, to [GATE_CANDIDATE]
 * i jest pomijany — chyba że jest na liście NEVER_GATE. Pominięty reviewer nie zbiera nowych danych, więc
 * co PROBE_EVERY-ty pominięty przebieg dostaje `PROBE` (jedno wywołanie kontrolne); finding zeruje serię.
 * Statystyka jest per projekt: zero w jednym repo nie wyłącza reviewera w innym.
 *
 * Uszkodzony wpis = jawny błąd (exit 2), nie ciche zero. Czytnik bierze pod uwagę tylko linie z napisem
 * "review-panel": linia z tym napisem, której nie da się sparsować albo która łamie schemat, zatrzymuje dobór
 * z numerem linii; uszkodzone linie innych procesów nie należą do tej statystyki i są pomijane jak wszędzie w telemetrii.
 *
 * Migracja (jednorazowa): stary dziennik `~/.claude/review-panel-stats/invocations.jsonl` (sprzed telemetrii) jest
 * importowany przy pierwszym wywołaniu (--record/--select/tabela) i przemianowany na `invocations.jsonl.migrated`.
 * Brak pliku = nic. Zły plik zostaje nietknięty (exit 2). Import jest idempotentny (id wyprowadzone z treści linii).
 *
 * Użycie:
 *   node scripts/reviewer-stats.mjs [--project <nazwa> | --all-projects] [--json]
 *   node scripts/reviewer-stats.mjs --select eagle,security,nitpicker [--project <nazwa>] [--json]
 *   node scripts/reviewer-stats.mjs --record --project <nazwa> [--branch <b>] --ran eagle=2,newbie=0 --skipped nitpicker
 *   node scripts/reviewer-stats.mjs --check-config
 * (--branch jest przyjmowane dla zgodności i ignorowane: nazwa gałęzi bywa nazwą zadania, a telemetria jej nie niesie;
 *  --legacy-file <plik> wskazuje stary dziennik do migracji — tylko testy.)
 * Kody wyjścia: 0 ok · 1 błąd użycia / --check-config nie przeszło · 2 uszkodzone dane (jawny błąd, nie ciche zero).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PROCESSES, REVIEW_PANEL, REVIEWER_NAME_RE, appendEventsDedup, buildReviewPanelEvents,
  deterministicId, emitReviewPanelRun, eventsDir, validateEvent,
} from './lib/telemetry-events.mjs';

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

const NAME_RE = REVIEWER_NAME_RE;
// Jak w schemacie telemetrii: „.” i „..” odpadają (nazwa projektu trafia do ścieżki rollupu).
const PROJECT_RE = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,80}$/;

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

/** Stary dziennik sprzed telemetrii — źródło jednorazowej migracji. */
export function defaultLegacyFile() {
  return path.join(os.homedir(), '.claude', 'review-panel-stats', 'invocations.jsonl');
}

/** `reviewer-security` i `security` to ten sam reviewer. */
export function normalizeName(raw) {
  const name = String(raw ?? '').trim().replace(/^reviewer-/, '');
  if (!NAME_RE.test(name)) throw new StatsError(`nieprawidłowa nazwa reviewera: "${raw}"`);
  return name;
}

/**
 * Czyta wywołania reviewerów ze zdarzeń telemetrii (`process: review-panel`) z katalogu `dir`.
 * Brak katalogu = brak danych ([]). Linia z napisem "review-panel", której nie da się sparsować albo która łamie schemat
 * zdarzenia (także niepoprawny `ts`) = LogError z numerem linii. Zdarzenie o tym samym `id` liczy się raz.
 * Kolejność: najpierw wpisy zaimportowane z dawnego dziennika (runId `rpm-…`), posortowane po `ts` — migracja dopisuje je do
 * plików historycznych miesięcy już po nowszych; potem zdarzenia natywne w kolejności zapisu (miesiące rosnąco, w pliku
 * kolejność dopisywania), więc cofnięty zegar nie przestawia historii.
 */
export function readReviews(dir = eventsDir()) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort();
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new LogError(`nie mogę odczytać katalogu telemetrii ${dir}: ${e.message}`);
  }
  const imported = [];
  const native = [];
  const seen = new Set();
  for (const f of files) {
    const file = path.join(dir, f);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      throw new LogError(`nie mogę odczytać ${file}: ${e.message}`);
    }
    text.split('\n').forEach((line, i) => {
      if (!line.includes(REVIEW_PANEL)) return; // szybki filtr: cudzych zdarzeń nie parsujemy
      const at = `${file}:${i + 1}`;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch (e) {
        throw new LogError(`${at}: uszkodzony JSON (${e.message})`);
      }
      if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) throw new LogError(`${at}: wpis nie jest obiektem`);
      if (ev.process !== REVIEW_PANEL) return; // napis w treści innego zdarzenia (np. sygnatura odstępstwa)
      const errors = validateEvent(ev);
      if (errors.length) throw new LogError(`${at}: ${errors.join('; ')}`);
      const t = Date.parse(ev.ts);
      if (Number.isNaN(t)) throw new LogError(`${at}: niepoprawny ts "${ev.ts}"`);
      if (seen.has(ev.id)) return; // duplikat (np. zdublowana migracja) nie zawyża statystyki
      seen.add(ev.id);
      const rec = ev.outcome === 'ok'
        ? { ts: ev.ts, project: ev.project, reviewer: ev.step.id, outcome: 'ran', findings: ev.step.findings }
        : { ts: ev.ts, project: ev.project, reviewer: ev.step.id, outcome: 'skipped' };
      (ev.runId.startsWith('rpm-') ? imported : native).push({ rec, t });
    });
  }
  const byTime = (x, y) => x.t - y.t; // Array.sort jest stabilny
  return [...imported.sort(byTime), ...native].map((x) => x.rec);
}

/** Parsuje stary dziennik (tylko do migracji). Uszkodzona linia = LogError z numerem linii. */
export function readLegacyLog(file) {
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
    records.push({ ...rec, line: i + 1 });
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

function buildRecordEntries({ project, branch, ran, skipped }) {
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
  return entries;
}

/** Zapisuje przebieg panelu jako zdarzenia telemetrii. Zwraca liczbę zapisanych zdarzeń; błąd zapisu = StatsError. */
export function recordRun(opts) {
  const entries = buildRecordEntries(opts);
  const res = emitReviewPanelRun({ project: opts.project, entries, ts: (opts.now ?? new Date()).toISOString() });
  if (res.error) throw new StatsError(`nie mogę zapisać do telemetrii: ${res.error}`);
  if (res.rejected.length) throw new StatsError(`telemetria odrzuciła zdarzenie: ${res.rejected[0].errors.join('; ')}`);
  if (res.written !== entries.length) throw new StatsError(`zapisano ${res.written} z ${entries.length} zdarzeń`);
  return res.written;
}

/** Zdarzenia telemetrii ze starych wpisów: id i runId wyprowadzone z treści, więc powtórny import niczego nie dubluje. */
function legacyToFields(records) {
  const groups = new Map();
  for (const rec of records) {
    const ts = new Date(rec.ts).toISOString();
    const key = `${rec.project}|${ts}|${rec.branch ?? ''}`;
    if (!groups.has(key)) groups.set(key, { project: rec.project, ts, runId: `rpm-${deterministicId(`review-panel-run|${key}`).slice(0, 12)}`, entries: [] });
    groups.get(key).entries.push({
      reviewer: rec.reviewer, outcome: rec.outcome, findings: rec.findings,
      id: deterministicId(`review-panel-legacy|${key}|${rec.reviewer}|${rec.line}`),
    });
  }
  return [...groups.values()].flatMap((g) => buildReviewPanelEvents(g));
}

function archiveName(file) {
  const base = `${file}.migrated`;
  return fs.existsSync(base) ? `${base}.${Date.now()}` : base;
}

/** Importuje `claimed` (stary dziennik, już zajęty przez ten proces) do telemetrii i archiwizuje go. */
function importClaimed(claimed, file) {
  const restore = () => { if (claimed !== file && !fs.existsSync(file)) { try { fs.renameSync(claimed, file); } catch { /* zostaje pod nazwą .migrating */ } } };
  try {
    const records = readLegacyLog(claimed);
    const res = appendEventsDedup(legacyToFields(records), { dedup: true });
    if (res.error) throw new StatsError(`migracja: nie mogę zapisać do telemetrii: ${res.error}`);
    if (res.rejected.length) throw new StatsError(`migracja: telemetria odrzuciła wpis: ${res.rejected[0].errors.join('; ')}`);
    try {
      fs.renameSync(claimed, archiveName(file));
    } catch (e) {
      if (e.code !== 'ENOENT') throw new StatsError(`migracja: nie mogę zarchiwizować ${claimed}: ${e.message}`);
      // ENOENT: ktoś inny dokończył archiwizację — dane są w telemetrii, więc to sukces
    }
    return records.length;
  } catch (e) {
    restore();
    throw e;
  }
}

const LOCK_STALE_MS = 120_000; // blokada starsza niż tyle = proces zginął w trakcie migracji
const LOCK_WAIT_MS = 30_000;   // tyle czeka proces, który zastał świeżą blokadę
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Atomowa blokada migracji: `open(…, 'wx')` tworzy plik tylko wtedy, gdy go nie ma. Zastałą blokadę (mtime starszy niż
 * LOCK_STALE_MS) odzyskujemy; świeżej nie ruszamy — czekamy, aż właściciel skończy. Zwraca funkcję zwalniającą.
 */
function acquireLock(lock) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, `pid:${process.pid}\n`);
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(lock); } catch { /* już usunięta */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw new StatsError(`migracja: nie mogę utworzyć blokady ${lock}: ${e.message}`);
    }
    try {
      if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.unlinkSync(lock); continue; }
    } catch (e) {
      if (e.code === 'ENOENT') continue; // właściciel właśnie zwolnił — próbujemy od nowa
      throw new StatsError(`migracja: nie mogę sprawdzić blokady ${lock}: ${e.message}`);
    }
    if (Date.now() > deadline) throw new StatsError(`migracja trwa w innym procesie (blokada ${lock}); spróbuj ponownie`);
    sleep(50);
  }
}

/**
 * Jednorazowa migracja starego dziennika do telemetrii. Brak pliku = 0, nic nie robi (bez blokady).
 * Całość działa pod blokadą (`<plik>.lock`), więc równoległe procesy nie importują dwa razy: ten, który zastał blokadę,
 * czeka, a po jej zwolnieniu nie ma już czego migrować. Plik jest dodatkowo zajmowany przemianowaniem na `.migrating`;
 * po sukcesie trafia do `.migrated`, po błędzie wraca pod starą nazwę — dane nigdy nie giną. Pozostałość `.migrating`
 * po przerwanym procesie jest dokańczana przy następnym wywołaniu (import jest idempotentny, a czytnik odrzuca duplikaty id).
 */
export function migrateLegacy(file = defaultLegacyFile()) {
  const claimed = `${file}.migrating`;
  if (!fs.existsSync(file) && !fs.existsSync(claimed)) return 0;
  const release = acquireLock(`${file}.lock`);
  try {
    let total = 0;
    if (fs.existsSync(claimed)) total += importClaimed(claimed, file);
    if (fs.existsSync(file)) {
      try {
        fs.renameSync(file, claimed);
      } catch (e) {
        if (e.code === 'ENOENT') return total;
        throw new StatsError(`migracja: nie mogę zająć ${file}: ${e.message}`);
      }
      total += importClaimed(claimed, file);
    }
    return total;
  } finally {
    release();
  }
}

/**
 * Spójność konfiguracji: lista NEVER_GATE, istnienie agentów, podpięcie w skillu i komendzie, proces w schemacie
 * telemetrii, parsowanie zdarzeń review-panel i (jeśli jeszcze czeka) starego dziennika. Tylko odczyt — niczego nie migruje.
 */
export function checkConfig({ repo = REPO, dir = eventsDir(), legacyFile = defaultLegacyFile() } = {}) {
  const problems = [];
  if (!PROCESSES.includes(REVIEW_PANEL)) problems.push(`schemas/telemetry-event-v1.schema.json nie zna process "${REVIEW_PANEL}"`);
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
  try { readReviews(dir); } catch (e) { problems.push(e.message); }
  for (const f of [legacyFile, `${legacyFile}.migrating`]) {
    try { readLegacyLog(f); } catch (e) { problems.push(e.message); }
  }
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
    else if (a === '--legacy-file') opts.legacyFile = need(i++, a);
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
  const legacyFile = opts.legacyFile ?? defaultLegacyFile();

  if (opts.checkConfig) {
    const problems = checkConfig({ legacyFile });
    if (problems.length) {
      console.error(`reviewer-stats --check-config: ${problems.length} problem(ów)\n- ${problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log(`reviewer-stats --check-config: OK (NEVER_GATE: ${NEVER_GATE.join(', ')}; próg ${GATE_AFTER}; kontrola co ${PROBE_EVERY})`);
    return;
  }

  // Stary dziennik trafia do telemetrii zanim cokolwiek zapiszemy albo odczytamy — inaczej statystyka go nie zobaczy.
  const migrated = migrateLegacy(legacyFile);
  if (migrated > 0) console.error(`reviewer-stats: zmigrowano ${migrated} wpis(ów) ze starego dziennika do telemetrii (${legacyFile} → .migrated)`);

  if (opts.record) {
    const n = recordRun({ project: opts.project, branch: opts.branch, ran: opts.ran, skipped: opts.skipped });
    console.log(`reviewer-stats: zapisano ${n} zdarzeń(ia) telemetrii → ${eventsDir()}`);
    return;
  }

  const project = opts.project ?? detectProject();
  const all = readReviews();
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
    console.log(JSON.stringify({ source: eventsDir(), project: scope, gateAfter: GATE_AFTER, probeEvery: PROBE_EVERY, neverGate: NEVER_GATE, reviewers: stats }, null, 2));
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
