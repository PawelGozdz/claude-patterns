/**
 * Kursor instancji (ADR 0006, D6) — ACK żyje POZA kanałem, bo kanał jest append-only.
 *
 * Jeden zapisujący na plik = zero współbieżności. „Nie dotyczy mojego taska" (`ignored`)
 * jest legalnym ACK-iem: zamyka wiadomość dla tej instancji, nie ukrywając jej przed resztą.
 *
 * ACK jest śladem audytowym, NIE gwarancją dostarczenia — nie wyzwala retry i niczego nie blokuje.
 */

const fs = require('fs');

const paths = require('./paths');

/** `applied`/`dismissed` dotyczą `invalidate` (D6, OQ6) — dostępne od fazy 6.5. */
const DECISIONS = ['acked', 'ignored', 'escalated', 'applied', 'dismissed'];

function empty(instance) {
  return {
    instance,
    last_processed: null,
    updated_at: null,
    decisions: {},
    segment_bytes: {},
  };
}

function read(instance) {
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.cursorPath(instance), 'utf8'));
    return {
      ...empty(instance),
      ...parsed,
      decisions: parsed.decisions && typeof parsed.decisions === 'object' ? parsed.decisions : {},
      segment_bytes:
        parsed.segment_bytes && typeof parsed.segment_bytes === 'object' ? parsed.segment_bytes : {},
    };
  } catch {
    // brak pliku albo uszkodzony kursor — zaczynamy od pustego, nigdy nie wywracamy odczytu
    return empty(instance);
  }
}

/** Zapis atomowy: tmp + rename, żeby czytelnik nigdy nie zobaczył połowy pliku. */
function write(instance, cursor) {
  paths.ensureLayout();
  const target = paths.cursorPath(instance);
  const payload = { ...cursor, instance, updated_at: new Date().toISOString() };
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
  return payload;
}

/**
 * Zapisuje decyzję o wiadomości i przesuwa `last_processed`, jeśli id jest nowsze.
 * @param {string} decision jedna z DECISIONS
 * @param {string} note     jedno zdanie uzasadnienia (wymagane dla `dismissed` — OQ6)
 */
function recordDecision(instance, messageId, decision, note = '') {
  if (!DECISIONS.includes(decision)) {
    throw new Error(`nieznana decyzja: ${decision} (dozwolone: ${DECISIONS.join(', ')})`);
  }

  const cursor = read(instance);
  cursor.decisions[messageId] = { decision, note: String(note || ''), ts: new Date().toISOString() };
  if (!cursor.last_processed || messageId > cursor.last_processed) cursor.last_processed = messageId;
  return write(instance, cursor);
}

/** Zapamiętuje rozmiary segmentów — wejście dla bramki pustego przebiegu (D7). */
function markSegments(instance, sizes) {
  const cursor = read(instance);
  cursor.segment_bytes = { ...cursor.segment_bytes, ...sizes };
  return write(instance, cursor);
}

/** Wszystkie kursory — do raportu „wiek kursora per instancja" w `/broadcast-status`. */
function listAll() {
  let files;
  try {
    files = fs.readdirSync(paths.cursorsDir()).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const out = [];
  for (const file of files) {
    const instance = file.replace(/\.json$/, '');
    const cursor = read(instance);
    let mtimeMs = null;
    try {
      mtimeMs = fs.statSync(paths.cursorPath(instance)).mtimeMs;
    } catch {
      // plik zniknął — pomijamy wiek
    }
    out.push({ ...cursor, mtimeMs });
  }
  return out;
}

module.exports = { DECISIONS, empty, read, write, recordDecision, markSegments, listAll };
