#!/usr/bin/env node
/**
 * tests/flow-evals/broadcast/run.js — eval L1 dla logiki broadcastu (ADR 0006), K14
 * (TASK-KAIZEN-001, 2026-08-27). Pokrywa schema.js/manifest.js/cursor.js/claim.js/
 * ulid.js — 757 LOC czystej logiki deterministycznej bez pojedynczego testu przed tym.
 *
 * `cursor`/`claim` robią prawdziwe I/O na dysku — CLAUDE_SWARM_DIR wskazuje tymczasowy
 * katalog (patrz hooks/lib/broadcast/paths.js: "używane przez testy"), sprzątany na końcu.
 *
 * Uruchom: node tests/flow-evals/broadcast/run.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'broadcast-eval-'));
process.env.CLAUDE_SWARM_DIR = tmpRoot;

const REPO = path.resolve(__dirname, '..', '..', '..');
const lib = (name) => require(path.join(REPO, 'hooks', 'lib', 'broadcast', name));
const ulidLib = lib('ulid');
const claimLib = lib('claim');
const cursorLib = lib('cursor');
const manifestLib = lib('manifest');
const schemaLib = lib('schema');

let failed = 0;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`  ❌ ${name} — ${err.message}\n`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label || 'wartość'}: oczekiwano ${e}, jest ${a}`);
}

// ── ulid.js ──────────────────────────────────────────────────────────────
console.log('ulid.js');
test('ulid() generuje 26-znakowy poprawny ULID', () => {
  const id = ulidLib.ulid();
  assert(ulidLib.isUlid(id), `"${id}" nie przechodzi isUlid()`);
  assertEqual(id.length, 26, 'długość ULID');
});

test('isUlid() odrzuca zły format', () => {
  assert(!ulidLib.isUlid('too-short'), 'za krótki string');
  assert(!ulidLib.isUlid(''), 'pusty string');
  assert(!ulidLib.isUlid(null), 'null');
  assert(!ulidLib.isUlid(123), 'liczba');
  assert(!ulidLib.isUlid('ILOU'.repeat(6) + 'AB'), 'znaki wykluczone z Crockford base32 (I,L,O,U)');
});

test('ulidTime() odzyskuje znacznik czasu (roundtrip)', () => {
  const ms = Date.UTC(2026, 7, 27, 12, 0, 0); // 2026-08-27T12:00:00Z, ucięte do całych ms
  const id = ulidLib.ulid(ms);
  assertEqual(ulidLib.ulidTime(id), ms, 'ulidTime roundtrip');
});

test('ulidTime() zwraca null dla niepoprawnego ULID-u', () => {
  assertEqual(ulidLib.ulidTime('nieprawidlowy'), null, 'ulidTime na złym wejściu');
});

test('ULID-y są sortowalne leksykograficznie wg czasu', () => {
  const earlier = ulidLib.ulid(1000);
  const later = ulidLib.ulid(2000);
  assert(earlier < later, `"${earlier}" powinien być leksykograficznie przed "${later}"`);
});

// ── manifest.js (funkcje czyste — bez I/O) ──────────────────────────────
console.log('\nmanifest.js');
test('splitTopic() parsuje "repo/nazwa"', () => {
  assertEqual(manifestLib.splitTopic('juz-ide-api/contracts'), { repo: 'juz-ide-api', name: 'contracts' });
});
test('splitTopic() odrzuca brak "/"', () => {
  assertEqual(manifestLib.splitTopic('bez-slasha'), null);
});
test('splitTopic() odrzuca więcej niż jeden "/"', () => {
  assertEqual(manifestLib.splitTopic('a/b/c'), null);
});
test('splitTopic() odrzuca niedozwolone znaki', () => {
  assertEqual(manifestLib.splitTopic('repo!/topic'), null);
});

test('isStructural() true dla topicu strukturalnego', () => {
  assert(manifestLib.isStructural('iam/contracts') === true, 'contracts powinien być strukturalny');
});
test('isStructural() false dla topicu domenowego', () => {
  assert(manifestLib.isStructural('iam/custom-domain') === false, 'custom-domain nie jest strukturalny');
});

const MANIFEST = { repo: 'iam', instance: 'iam-main', emits: { domain: ['auth-events'] }, subscribes: ['juz-ide-api/contracts'] };

test('subscribesTo() — własny <repo>/questions jest implicit', () => {
  assert(manifestLib.subscribesTo(MANIFEST, 'iam/questions') === true, 'własny questions powinien być implicit');
});
test('subscribesTo() — dopasowanie jawnej subskrypcji', () => {
  assert(manifestLib.subscribesTo(MANIFEST, 'juz-ide-api/contracts') === true);
});
test('subscribesTo() — wildcard "*" łapie każdy topic repo', () => {
  const withWildcard = { ...MANIFEST, subscribes: ['grant-flow/*'] };
  assert(manifestLib.subscribesTo(withWildcard, 'grant-flow/release') === true);
});
test('subscribesTo() — brak subskrypcji zwraca false', () => {
  assert(manifestLib.subscribesTo(MANIFEST, 'unrelated-repo/topic') === false);
});

test('ownTopics() — strukturalne + domenowe z prefiksem repo', () => {
  const topics = manifestLib.ownTopics(MANIFEST);
  assert(topics.includes('iam/contracts'), 'brak topicu strukturalnego z prefiksem');
  assert(topics.includes('iam/auth-events'), 'brak topicu domenowego z prefiksem');
  assertEqual(topics.length, manifestLib.STRUCTURAL_TOPICS.length + 1, 'liczba topiców');
});

test('repoSubscribesTo() — "unknown" gdy repo nie ma wpisu w rejestrze', () => {
  assertEqual(manifestLib.repoSubscribesTo([], 'nieznane-repo', 'x/questions'), 'unknown');
});
test('repoSubscribesTo() — "yes" przez implicit questions', () => {
  const registry = [{ repo: 'mobile', instance: 'm1', subscribes: [] }];
  assertEqual(manifestLib.repoSubscribesTo(registry, 'mobile', 'mobile/questions'), 'yes');
});
test('repoSubscribesTo() — "no" gdy żadna instancja nie subskrybuje', () => {
  const registry = [{ repo: 'mobile', instance: 'm1', subscribes: ['other/topic'] }];
  assertEqual(manifestLib.repoSubscribesTo(registry, 'mobile', 'target/domain'), 'no');
});

// ── schema.js ────────────────────────────────────────────────────────────
console.log('\nschema.js');
test('buildMessage() stosuje wartości domyślne', () => {
  const msg = schemaLib.buildMessage({ topic: 'iam/contracts', title: 'x', body: 'y', owner: 'iam-main' });
  assertEqual(msg.kind, 'discovery', 'domyślny kind');
  assertEqual(msg.class, 'interpretive', 'domyślny class');
  assertEqual(msg.severity, 'info', 'domyślny severity');
  assertEqual(msg.hops, 0, 'domyślny hops');
  assert(ulidLib.isUlid(msg.id), 'wygenerowany id musi być ULID-em');
});

function validMessage(overrides = {}) {
  return schemaLib.buildMessage({
    topic: 'iam/contracts', title: 'tytuł', body: 'treść', owner: 'iam-main',
    instance: 'iam-main', branch: 'develop', ...overrides,
  });
}

test('validate() — poprawna wiadomość przechodzi bez manifestu/rejestru', () => {
  const r = schemaLib.validate(validMessage());
  assertEqual(r.errors, [], `oczekiwano braku błędów, jest: ${r.errors.join('; ')}`);
  assert(r.ok === true);
});

test('validate() — odrzuca zły numer wersji schematu', () => {
  const r = schemaLib.validate({ ...validMessage(), v: 2 });
  assert(!r.ok && r.errors.some((e) => e.includes('`v`')), 'brak błędu o polu v');
});

test('validate() — odrzuca hops >= 1 (bariera kaskady)', () => {
  const r = schemaLib.validate({ ...validMessage(), hops: 1 });
  assert(!r.ok && r.errors.some((e) => e.includes('hops')), 'brak błędu o hops');
});

test('validate() — "answer" bez reply_to jest błędem', () => {
  const r = schemaLib.validate({ ...validMessage({ topic: 'iam/questions' }), kind: 'answer', reply_to: null });
  assert(!r.ok && r.errors.some((e) => e.includes('reply_to')), 'brak błędu o reply_to');
});

test('validate() — "question" na cudzym topicu innym niż questions jest błędem (D1)', () => {
  const r = schemaLib.validate({ ...validMessage({ topic: 'other-repo/contracts' }), kind: 'question' });
  assert(!r.ok, 'question na cudzym /contracts powinno być odrzucone');
});

test('validate() — body > 2 KB jest błędem', () => {
  const r = schemaLib.validate(validMessage({ body: 'x'.repeat(3000) }));
  assert(!r.ok && r.errors.some((e) => e.includes('body')), 'brak błędu o rozmiarze body');
});

test('validate() — title pusty jest błędem', () => {
  const r = schemaLib.validate(validMessage({ title: '' }));
  assert(!r.ok && r.errors.some((e) => e.includes('title')), 'brak błędu o title');
});

test('validate() — "invalidate" klasy interpretive bez --human jest błędem (OQ5)', () => {
  const r = schemaLib.validate({ ...validMessage(), kind: 'invalidate', class: 'interpretive' });
  assert(!r.ok && r.errors.some((e) => e.includes('invalidate')), 'brak błędu OQ5');
});
test('validate() — "invalidate" klasy deterministic jest dozwolone', () => {
  const r = schemaLib.validate({ ...validMessage(), kind: 'invalidate', class: 'deterministic' });
  assert(r.ok, `oczekiwano ok, błędy: ${r.errors.join('; ')}`);
});
test('validate() — "invalidate" interpretive z ctx.human jest dozwolone', () => {
  const r = schemaLib.validate({ ...validMessage(), kind: 'invalidate', class: 'interpretive' }, { human: true });
  assert(r.ok, `oczekiwano ok, błędy: ${r.errors.join('; ')}`);
});

test('validate() — severity critical klasy interpretive bez --human jest błędem (D11)', () => {
  const r = schemaLib.validate(validMessage({ severity: 'critical' }));
  assert(!r.ok && r.errors.some((e) => e.includes('critical')), 'brak błędu D11');
});

test('validate() — topic niezadeklarowany w manifeście jest błędem', () => {
  const manifest = { repo: 'iam', instance: 'iam-main', emits: { domain: [] } };
  const r = schemaLib.validate(validMessage({ topic: 'iam/nieznany-topic' }), { manifest });
  assert(!r.ok, 'topic spoza emits.domain i topiców strukturalnych powinien być odrzucony');
});
test('validate() — topic zadeklarowany w emits.domain przechodzi', () => {
  const manifest = { repo: 'iam', instance: 'iam-main', emits: { domain: ['auth-events'] } };
  const r = schemaLib.validate(validMessage({ topic: 'iam/auth-events' }), { manifest });
  assertEqual(r.errors, [], `oczekiwano braku błędów, jest: ${r.errors.join('; ')}`);
});

test('validate() — owner nie subskrybujący topicu jest błędem (D4)', () => {
  const registry = [{ repo: 'inne-repo', instance: 'x', subscribes: ['coś/innego'] }];
  const r = schemaLib.validate(validMessage({ owner: 'inne-repo' }), { registry });
  assert(!r.ok && r.errors.some((e) => e.includes('D4')), 'brak błędu D4');
});
test('validate() — owner bez wpisu w rejestrze daje warning, nie error', () => {
  const r = schemaLib.validate(validMessage({ owner: 'nieznane-repo' }), { registry: [] });
  assert(r.ok, 'brak wpisu w rejestrze nie powinien być twardym błędem');
  assert(r.warnings.length > 0, 'oczekiwano ostrzeżenia o braku rejestru');
});

// ── claim.js (prawdziwe I/O w tmpRoot) ──────────────────────────────────
console.log('\nclaim.js');
test('tryClaim() — pierwsza próba zdobywa claim', () => {
  const r = claimLib.tryClaim('msg-001', 'instance-a');
  assert(r.acquired === true, 'oczekiwano acquired: true');
  assertEqual(r.holder.instance, 'instance-a');
});
test('tryClaim() — druga próba na ten sam id przegrywa i widzi holdera', () => {
  const r = claimLib.tryClaim('msg-001', 'instance-b');
  assert(r.acquired === false, 'druga instancja nie powinna zdobyć claimu');
  assertEqual(r.holder.instance, 'instance-a', 'holder powinien wskazywać pierwszą instancję');
});
test('read() — zwraca zapisany claim', () => {
  const holder = claimLib.read('msg-001');
  assertEqual(holder.instance, 'instance-a');
});
test('exists() — true dla istniejącego claimu, false dla nieistniejącego', () => {
  assert(claimLib.exists('msg-001') === true);
  assert(claimLib.exists('msg-nieistniejacy') === false);
});
test('listAll() — zawiera zdobyty claim', () => {
  const all = claimLib.listAll();
  assert(all.some((c) => c.messageId === 'msg-001'), 'brak msg-001 na liście claimów');
});

// ── cursor.js (prawdziwe I/O w tmpRoot) ─────────────────────────────────
console.log('\ncursor.js');
test('read() — nieistniejąca instancja zwraca empty()', () => {
  const c = cursorLib.read('brak-takiej-instancji');
  assertEqual(c.last_processed, null);
  assertEqual(c.decisions, {});
});
test('write() + read() — roundtrip', () => {
  cursorLib.write('inst-1', cursorLib.empty('inst-1'));
  const c = cursorLib.read('inst-1');
  assertEqual(c.instance, 'inst-1');
});
test('recordDecision() — odrzuca nieznaną decyzję', () => {
  let threw = false;
  try { cursorLib.recordDecision('inst-1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'nieznana'); }
  catch { threw = true; }
  assert(threw, 'oczekiwano wyjątku dla nieznanej decyzji');
});
test('recordDecision() — przesuwa last_processed dla nowszego id', () => {
  const older = ulidLib.ulid(1000);
  const newer = ulidLib.ulid(2000);
  cursorLib.recordDecision('inst-2', older, 'acked');
  cursorLib.recordDecision('inst-2', newer, 'acked');
  const c = cursorLib.read('inst-2');
  assertEqual(c.last_processed, newer, 'last_processed powinien wskazywać nowszy id');
});
test('recordDecision() — NIE cofa last_processed dla starszego id przetworzonego później', () => {
  const older = ulidLib.ulid(1000);
  const newer = ulidLib.ulid(9000);
  cursorLib.recordDecision('inst-3', newer, 'acked');
  cursorLib.recordDecision('inst-3', older, 'ignored'); // przetworzone później, ale chronologicznie starsze
  const c = cursorLib.read('inst-3');
  assertEqual(c.last_processed, newer, 'last_processed nie powinien się cofnąć');
  assertEqual(c.decisions[older].decision, 'ignored', 'decyzja dla starszego id powinna być zapisana mimo to');
});
test('markSegments() — scala rozmiary segmentów, nie nadpisuje całości', () => {
  cursorLib.markSegments('inst-4', { 'events-2026-08-25.jsonl': 100 });
  cursorLib.markSegments('inst-4', { 'events-2026-08-26.jsonl': 200 });
  const c = cursorLib.read('inst-4');
  assertEqual(c.segment_bytes, { 'events-2026-08-25.jsonl': 100, 'events-2026-08-26.jsonl': 200 });
});
test('listAll() — zawiera wszystkie zapisane kursory', () => {
  const all = cursorLib.listAll();
  const instances = all.map((c) => c.instance).sort();
  assert(instances.includes('inst-1') && instances.includes('inst-2') && instances.includes('inst-4'),
    `brakuje instancji na liście: ${instances.join(', ')}`);
});

// ── sprzątanie + podsumowanie ────────────────────────────────────────────
fs.rmSync(tmpRoot, { recursive: true, force: true });

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed ? 1 : 0);
