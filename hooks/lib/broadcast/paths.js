/**
 * Broadcast — layout stanu runtime (ADR 0006, D9).
 *
 * Cały stan żyje POZA repozytoriami, w jednym katalogu:
 *
 *   /opt/projects/.claude-swarm/
 *     events-YYYY-MM-DD.jsonl     segmenty dzienne kanału (append-only)
 *     cursors/<instance>.json     kursor per instancja (D6) — pisze tylko ta instancja
 *     claims/<message-id>         atomowy claim wykonawcy (D4) — open(O_EXCL)
 *     inbox/<instance>.md         inbox dla implementera (D8, faza 6.4)
 *     manifests/<instance>.json   rejestr manifestów — do walidacji `owner` i raportu drift
 *     state/                      stan pomocniczy hooków (dedupe przypomnień)
 *
 * Rollback całości = `rm -rf` tego katalogu.
 *
 * CLAUDE_SWARM_DIR nadpisuje korzeń (używane przez testy i przy pracy poza /opt/projects).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = '/opt/projects/.claude-swarm';

/** Ile segmentów dziennych czytamy / trzymamy. 3 = TTL 72 h (D9). */
const SEGMENT_WINDOW = 3;

/** Twardy limit pojedynczej linii JSONL — konserwatywny margines na atomowy append (D9). */
const MAX_LINE_BYTES = 4096;

/** Limit pola `body` walidowany na zapisie (mitygacja prompt injection, sekcja Ryzyka). */
const MAX_BODY_BYTES = 2048;

function root() {
  return process.env.CLAUDE_SWARM_DIR || DEFAULT_ROOT;
}

function subdir(name) {
  return path.join(root(), name);
}

function cursorsDir() {
  return subdir('cursors');
}
function claimsDir() {
  return subdir('claims');
}
function inboxDir() {
  return subdir('inbox');
}
function manifestsDir() {
  return subdir('manifests');
}
function stateDir() {
  return subdir('state');
}

function cursorPath(instance) {
  return path.join(cursorsDir(), `${safeName(instance)}.json`);
}
function claimPath(messageId) {
  return path.join(claimsDir(), safeName(messageId));
}
function inboxPath(instance) {
  return path.join(inboxDir(), `${safeName(instance)}.md`);
}
function registryPath(instance) {
  return path.join(manifestsDir(), `${safeName(instance)}.json`);
}
function statePath(name) {
  return path.join(stateDir(), `${safeName(name)}.json`);
}

/**
 * Wyłącznik stand-by (sekcja Ryzyka: „stand-by nie do zatrzymania").
 *
 * `.claude/run-state/KILL` blokuje wyłącznie subagentów — rozpoznaje ich po `agent_id`.
 * Stand-by z D7 to pętla `/loop` na MAIN agencie, więc `KILL` go nie dotyczy i potrzebuje
 * własnego wyłącznika. Obecność tego pliku = każda pętla kończy się przy najbliższym ticku.
 */
function stopPath() {
  return path.join(root(), 'STOP');
}

/** Nazwa segmentu dla podanej daty (domyślnie dziś, czas lokalny — jak nazwa pliku w ADR). */
function segmentName(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `events-${y}-${m}-${d}.jsonl`;
}

function segmentPath(date = new Date()) {
  return path.join(root(), segmentName(date));
}

/**
 * Segmenty obecne na dysku, posortowane rosnąco po nazwie (= chronologicznie).
 */
function listSegments() {
  try {
    return fs
      .readdirSync(root())
      .filter((f) => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort()
      .map((f) => path.join(root(), f));
  } catch {
    return [];
  }
}

/** Okno czytania: SEGMENT_WINDOW najnowszych segmentów (D9 — TTL za darmo). */
function windowSegments(limit = SEGMENT_WINDOW) {
  const all = listSegments();
  return all.slice(Math.max(0, all.length - limit));
}

/**
 * Kasuje segmenty spoza okna. `rm` pliku jest atomowe — bez kompakcji-przez-rewrite (D9).
 * @returns {string[]} usunięte ścieżki
 */
function pruneSegments(limit = SEGMENT_WINDOW) {
  const all = listSegments();
  const stale = all.slice(0, Math.max(0, all.length - limit));
  const removed = [];
  for (const p of stale) {
    try {
      fs.unlinkSync(p);
      removed.push(p);
    } catch {
      // plik zniknął w międzyczasie albo brak uprawnień — nieistotne
    }
  }
  return removed;
}

/** Zakłada katalog stanu runtime. Idempotentne. */
function ensureLayout() {
  for (const dir of [root(), cursorsDir(), claimsDir(), inboxDir(), manifestsDir(), stateDir()]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return root();
}

function layoutExists() {
  return fs.existsSync(root());
}

/** Nazwy plików pochodzą z manifestu i id wiadomości — nie ufamy im na ślepo. */
function safeName(value) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
}

module.exports = {
  DEFAULT_ROOT,
  SEGMENT_WINDOW,
  MAX_LINE_BYTES,
  MAX_BODY_BYTES,
  root,
  cursorsDir,
  claimsDir,
  inboxDir,
  manifestsDir,
  stateDir,
  cursorPath,
  claimPath,
  inboxPath,
  registryPath,
  statePath,
  stopPath,
  segmentName,
  segmentPath,
  listSegments,
  windowSegments,
  pruneSegments,
  ensureLayout,
  layoutExists,
  safeName,
};
