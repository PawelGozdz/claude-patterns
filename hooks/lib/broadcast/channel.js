/**
 * Kanał — segmenty dzienne JSONL, append-only (ADR 0006, D9).
 *
 * Zapis: jedna linia = jeden `write()` z `O_APPEND`, limit 4 KB walidowany wcześniej
 * (schema.js). Na lokalnym filesystemie zapisy równoległe nie przeplatają się w praktyce.
 * **Założenie jawne: wszystkie instancje na jednym hoście, lokalny FS — NFS wyklucza ten
 * mechanizm.**
 *
 * Odczyt: okno 3 najnowszych segmentów (= TTL 72 h za darmo). Linia uszkodzona albo
 * niepasująca do schematu jest POMIJANA i zliczana do raportu `/broadcast-status` —
 * nigdy nie wywraca czytelnika.
 */

const fs = require('fs');
const path = require('path');

const paths = require('./paths');
const manifestLib = require('./manifest');

/**
 * Dopisuje wiadomość do segmentu bieżącego dnia. Zakłada, że wiadomość przeszła walidację.
 * @returns {{segment: string, bytes: number}}
 */
function append(message) {
  paths.ensureLayout();
  const line = `${JSON.stringify(message)}\n`;
  const bytes = Buffer.byteLength(line, 'utf8');

  if (bytes > paths.MAX_LINE_BYTES) {
    throw new Error(`linia ma ${bytes} B, limit to ${paths.MAX_LINE_BYTES} B`);
  }

  const segment = paths.segmentPath();
  const fd = fs.openSync(segment, 'a');
  try {
    fs.writeSync(fd, line);
  } finally {
    fs.closeSync(fd);
  }

  return { segment, bytes };
}

/**
 * Czyta okno segmentów.
 * @returns {{messages: object[], skipped: number, segments: string[]}}
 *          `messages` posortowane po `id` (ULID = porządek chronologiczny).
 */
function readWindow(options = {}) {
  const segments = paths.windowSegments(options.limit ?? paths.SEGMENT_WINDOW);
  const messages = [];
  let skipped = 0;

  for (const segment of segments) {
    let raw;
    try {
      raw = fs.readFileSync(segment, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        skipped++;
        continue;
      }
      if (!parsed || parsed.v !== 1 || typeof parsed.id !== 'string' || typeof parsed.topic !== 'string') {
        skipped++;
        continue;
      }
      messages.push({ ...parsed, _segment: path.basename(segment) });
    }
  }

  messages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { messages, skipped, segments: segments.map((s) => path.basename(s)) };
}

/**
 * Rozmiary segmentów w oknie — podstawa bramki pustego przebiegu (D7).
 * Jedno `stat` na segment, zero parsowania.
 * @returns {Record<string, number>}
 */
function segmentSizes(limit = paths.SEGMENT_WINDOW) {
  const sizes = {};
  for (const segment of paths.windowSegments(limit)) {
    try {
      sizes[path.basename(segment)] = fs.statSync(segment).size;
    } catch {
      // segment zniknął między listdir a stat — pomijamy
    }
  }
  return sizes;
}

/**
 * Czy od ostatniego zapisu kursora doszły nowe bajty.
 * @returns {{hasNew: boolean, newBytes: number, sizes: Record<string, number>}}
 */
function gate(cursor, limit = paths.SEGMENT_WINDOW) {
  const sizes = segmentSizes(limit);
  const seen = (cursor && cursor.segment_bytes) || {};
  let newBytes = 0;

  for (const [segment, size] of Object.entries(sizes)) {
    const before = Number.isFinite(seen[segment]) ? seen[segment] : 0;
    if (size > before) newBytes += size - before;
  }

  return { hasNew: newBytes > 0, newBytes, sizes };
}

/**
 * Wiadomości widoczne dla instancji: subskrybowany topic + nie moja własna emisja.
 * Filtr „nie widzę swoich" działa po `instance`, NIGDY po `repo` (D3) — dzięki temu
 * instancja widzi wpisy siostrzanych instancji tego samego repo.
 */
function visibleFor(messages, manifest) {
  // Odpowiedzi na MOJE pytania widzę zawsze — bez subskrybowania cudzego `questions`.
  //
  // ADR (D1) zakładał, że pytający zasubskrybuje topic, na który wysłał pytanie. Test
  // pokazał, że to nie działa w praktyce i jest złym pomysłem: subskrypcja cudzego
  // `<repo>/questions` oznacza oglądanie WSZYSTKICH pytań kierowanych do tego repo,
  // nie tylko własnych odpowiedzi. Dopasowanie po `reply_to` jest precyzyjne i nie
  // wymaga poszerzania subskrypcji.
  const myQuestionIds = new Set(
    messages.filter((msg) => msg.kind === 'question' && msg.instance === manifest.instance).map((msg) => msg.id),
  );

  return messages.filter((msg) => {
    if (msg.instance === manifest.instance) return false; // nigdy nie widzę swoich (D3)
    if (msg.kind === 'answer' && msg.reply_to && myQuestionIds.has(msg.reply_to)) return true;
    return manifestLib.subscribesTo(manifest, msg.topic);
  });
}

/**
 * Wiadomości bez decyzji w kursorze — „nieprzeczytane" w rozumieniu D6.
 * Kryterium to brak wpisu w `decisions`, nie `last_processed`: kursor może przeskoczyć
 * do przodu, a wiadomość bez decyzji nadal wymaga reakcji.
 */
function undecided(messages, cursor) {
  const decisions = (cursor && cursor.decisions) || {};
  return messages.filter((msg) => !decisions[msg.id]);
}

module.exports = { append, readWindow, segmentSizes, gate, visibleFor, undecided };
