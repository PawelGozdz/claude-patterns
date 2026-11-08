#!/usr/bin/env node
/**
 * tests/flow-evals/analyze-resolve/run.js — eval L1 dla kroku „rozstrzygnij otwarte pytania" w /analyze (ANL-054..059).
 *
 * Zero LLM. Uruchamia PRAWDZIWE skrypty (`verify-answer-sources.mjs`, `resolve-finalize.mjs`), hook `check-human-voice`
 * i `materialize-runtime.mjs` na tymczasowych projektach, dwukierunkowo (ścieżka dobra i zła każdej reguły):
 *   • cytat: pasuje / nie ma go w linii / plik nie istnieje / linia poza plikiem / poza źródłami / .env / `..`
 *   • format: `ask` jedno pytanie, `rec` jedno zdanie, razem ≤ 2 zdania; „nowy wzorzec" mówione wprost
 *   • decyzja zawsze człowieka: one-way, USER_CHALLENGE, new-pattern i flagi decyzji nigdy nie idą pod „ok wszystkie";
 *     skrypt nie wymyśla odpowiedzi z tekstu, którego nie rozumie
 *   • format `none` i projekt bez bloku: dzisiejszy flow, żadnych zapisów poza artefaktem
 *   • zapis tylko do ścieżek z configu: nowe wpisy tak, edycja starego BDR nie, kanon tylko z `canon_edit`
 *   • close-questions kasuje plik pytania dopiero, gdy istnieje dokument z `rozstrzyga`
 *   • materializacja: `questions_format` poza słownikiem wywala się, domyślnie `none`
 *
 *   • ADR 0017 (ANL-060): auto-przyjęcie tylko dla canon/precedent ze źródłem + two-way + tech; one-way, USER_CHALLENGE, produkt,
 *     new-pattern, słowa-klucze RODO/bezpieczeństwo, flagi decyzji i `auto_accept: false` nigdy; „cofnij N"; `answered_by: auto`
 *     bez uprawnień = exit 2; parser „ok"/„przyjmuję rekomendacje"/„zatwierdzam" z `approve.granted` i `hold`
 *
 *   • ADR 0017, poprawka 2026-11-08: luka przeglądu i pytanie o proces = exit 2; znacznik podstawy w `rec` = exit 2; `instruction`
 *     zgodna z parserem („ok” tylko gdy wszystko bulkEligible); reguły ANL-034/040/051 w komendzie
 *
 * Uruchom: node tests/flow-evals/analyze-resolve/run.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const YAML = require('yaml');

const REPO = path.resolve(__dirname, '..', '..', '..');
const VERIFY = path.join(REPO, 'scripts', 'verify-answer-sources.mjs');
const FINALIZE = path.join(REPO, 'scripts', 'resolve-finalize.mjs');
const HOOK = path.join(REPO, 'hooks', 'check-human-voice.js');
const MATERIALIZE = path.join(REPO, 'scripts', 'materialize-runtime.mjs');

const QUOTE = 'Zbanowany użytkownik nie może publikować treści';
const TASK = 'T-1';
const ARTIFACT = `project-orchestration/analysis/${TASK}.analysis.md`;

const roots = [];
function write(dir, rel, content) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
}
function project({ format = 'file', registry = true, extraFiles = {}, sink = { canon_edit: ['docs/KANON.md'] }, resolve = { max_questions: 12, batch_size: 5, auto_accept: true } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-eval-'));
  roots.push(dir);
  const rt = registry
    ? {
        schema_version: 1,
        params: {
          'decision-registry': {
            adr_dir: 'docs/adr', bdr_dir: 'docs/decisions', open_questions: 'docs/decisions/open-questions.md',
            lookup_order: ['docs/decisions/', 'docs/product/', 'BUSINESS_RULES.yaml', 'src/', 'docs/adr/'],
            questions_format: format, questions_dir: 'docs/decisions/questions', resolution_sink: sink,
          },
        },
        analyze: { resolve },
      }
    : { schema_version: 1, params: {} };
  write(dir, '.claude/config/runtime.yml', YAML.stringify(rt));
  const lines = Array.from({ length: 20 }, (_, i) => `linia ${i + 1}`);
  lines[11] = `Reguła: ${QUOTE}, dopóki ban trwa.`;
  write(dir, 'docs/decisions/BDR-141-x.md', lines.join('\n') + '\n');
  write(dir, 'docs/KANON.md', '# Kanon\n');
  write(dir, 'src/secret.ts', `// ${QUOTE}\n`);
  for (const [p, c] of Object.entries(extraFiles)) write(dir, p, c);
  return dir;
}
const q = (over = {}) => ({
  id: 'Q1', ask: 'Czy zbanowany użytkownik może publikować treści?', rec: 'Rekomendacja: nie (zgodne z BDR-141).', basis: 'precedent',
  evidence: [{ kind: 'precedent', source: 'docs/decisions/BDR-141-x.md:12', quote: QUOTE }], q: 'kontekst techniczny', domain: 'product',
  class: 'TASTE', door_type: 'two-way', options: ['Nie (recommended)', 'Tak'], answer: null, ...over,
});
function artifact(dir, questions, decisions = []) {
  write(dir, ARTIFACT, `---\n${YAML.stringify({ task: TASK, status: 'awaiting-human', open_questions: questions, decisions })}---\n\n# Analiza\n`);
}
const run = (script, args) => {
  const r = spawnSync('node', [script, ...args], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* exit != 0 przed JSON */ }
  return { code: r.status, out: r.stdout, err: r.stderr, json };
};
const verify = (dir, extra = []) => run(VERIFY, [path.join(dir, ARTIFACT), '--project', dir, ...extra]);
const finalize = (dir, ...args) => run(FINALIZE, [...args, '--project', dir, '--task', TASK]);
const problems = (r, id = 'Q1') => (r.json?.questions.find((x) => x.id === id)?.problems ?? []).join(' | ');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg ?? 'eq'}: oczekiwano ${JSON.stringify(b)}, jest ${JSON.stringify(a)}`); };
const has = (s, needle, msg) => { if (!String(s).includes(needle)) throw new Error(`${msg ?? 'brak'}: „${needle}" nie występuje w: ${String(s).slice(0, 300)}`); };

// ── cytat ──────────────────────────────────────────────────────────────────
test('evidence: cytat stoi w podanej linii → czysto, pytanie wolno przyjąć hurtem', () => {
  const dir = project(); artifact(dir, [q()]);
  const r = verify(dir);
  eq(r.code, 0, 'exit'); eq(r.json.questions[0].verified, true); eq(r.json.questions[0].bulkEligible, true);
});
test('evidence: cytatu nie ma w tej linii → exit 2, pytanie nie przechodzi', () => {
  const dir = project(); artifact(dir, [q({ evidence: [{ kind: 'precedent', source: 'docs/decisions/BDR-141-x.md:13', quote: QUOTE }] })]);
  const r = verify(dir);
  eq(r.code, 2, 'exit'); has(problems(r), 'cytatu nie ma w docs/decisions/BDR-141-x.md:13');
});
test('evidence: plik nie istnieje → exit 2', () => {
  const dir = project(); artifact(dir, [q({ evidence: [{ kind: 'canon', source: 'docs/decisions/BDR-999.md:1', quote: QUOTE }] })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'plik nie istnieje');
});
test('evidence: linia poza plikiem → exit 2', () => {
  const dir = project(); artifact(dir, [q({ evidence: [{ kind: 'precedent', source: 'docs/decisions/BDR-141-x.md:99', quote: QUOTE }] })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'poza plikiem');
});
test('evidence: za krótki cytat nic nie dowodzi → exit 2', () => {
  const dir = project(); artifact(dir, [q({ evidence: [{ kind: 'precedent', source: 'docs/decisions/BDR-141-x.md:12', quote: 'nie może' }] })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'krótszy niż');
});
test('evidence: plik poza źródłami projektu, .env i „..” są odrzucone', () => {
  const dir = project({ extraFiles: { 'README.md': `${QUOTE}\n`, '.env': `${QUOTE}\n` } });
  for (const src of ['README.md:1', '.env:1', 'docs/decisions/../../README.md:1']) {
    artifact(dir, [q({ evidence: [{ kind: 'precedent', source: src, quote: QUOTE }] })]);
    const r = verify(dir); eq(r.code, 2, `exit dla ${src}`);
  }
});
test('evidence: źródłem może być kod z lookup_order (src/)', () => {
  const dir = project(); artifact(dir, [q({ evidence: [{ kind: 'canon', source: 'src/secret.ts:1', quote: QUOTE }], basis: 'canon' })]);
  eq(verify(dir).code, 0);
});
test('basis: precedent bez zweryfikowanego źródła → exit 2 (brak źródła to new-pattern albo none)', () => {
  const dir = project(); artifact(dir, [q({ evidence: [] })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'wymaga ≥1 zweryfikowanego evidence');
});

// ── format pytania ─────────────────────────────────────────────────────────
test('format: ask + rec razem ≤ 2 zdania, ask to jedno pytanie → czysto', () => {
  const dir = project(); artifact(dir, [q()]); eq(verify(dir).code, 0);
});
test('format: ask z dwoma zdaniami → exit 2', () => {
  const dir = project(); artifact(dir, [q({ ask: 'Czy zbanowany użytkownik może publikować? Chodzi o nowe treści.' })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'zdań');
});
test('format: rec z drugim zdaniem → razem 3 zdania → exit 2', () => {
  const dir = project(); artifact(dir, [q({ rec: 'Rekomendacja: nie (zgodne z BDR-141). Tak ustalono wcześniej.' })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'limit: 2 łącznie');
});
test('format: rec bez prefiksu „Rekomendacja:”, z nazwą pliku albo z numerem w ask → exit 2', () => {
  for (const over of [{ rec: 'Nie (zgodne z BDR-141).' }, { rec: 'Rekomendacja: nie (zgodne z ban.service.ts).' }, { ask: 'Czy BDR-141 pozwala publikować?' }]) {
    const dir = project(); artifact(dir, [q(over)]); eq(verify(dir).code, 2, JSON.stringify(over));
  }
});
test('format: numer BDR w rec jest dozwolony, w ask nie (hook check-human-voice)', () => {
  const dir = project(); artifact(dir, [q()]);
  const payload = (file) => JSON.stringify({ tool_input: { file_path: file } });
  const ok = spawnSync('node', [HOOK], { input: payload(path.join(dir, ARTIFACT)), encoding: 'utf8' });
  eq(/HUMAN-VOICE/.test(ok.stderr), false, 'rec z BDR-141 nie ostrzega');
  artifact(dir, [q({ ask: 'Czy BDR-141 pozwala zbanowanemu publikować?' })]);
  const bad = spawnSync('node', [HOOK], { input: payload(path.join(dir, ARTIFACT)), encoding: 'utf8' });
  has(bad.stderr, 'numer ADR/BDR');
  artifact(dir, [q({ rec: 'Rekomendacja: nie (zgodne z BDR-141). Tak ustalono. Sprawdź to.' })]);
  const long = spawnSync('node', [HOOK], { input: payload(path.join(dir, ARTIFACT)), encoding: 'utf8' });
  has(long.stderr, 'limit: 2 łącznie');
});
test('format: new-pattern mówi „nowy wzorzec”; bez tego exit 2, z tym czysto, ale nigdy hurtem', () => {
  const dir = project();
  artifact(dir, [q({ basis: 'new-pattern', evidence: [], rec: 'Rekomendacja: nie (oparte o zasadę ostrożności).', question_file: '2026-11-07-ban' })]);
  const bad = verify(dir); eq(bad.code, 2); has(problems(bad), 'nowy wzorzec');
  artifact(dir, [q({ basis: 'new-pattern', evidence: [], rec: 'Rekomendacja: nie (nowy wzorzec, oparty o zasadę ostrożności).', question_file: '2026-11-07-ban' })]);
  const good = verify(dir); eq(good.code, 0); eq(good.json.questions[0].bulkEligible, false);
});
test('format: rec bez jednej opcji „(recommended)” → exit 2', () => {
  const dir = project(); artifact(dir, [q({ options: ['Nie', 'Tak'] })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), '(recommended)');
});

// ── decyzja zawsze człowieka ───────────────────────────────────────────────
test('one-way (brak door_type) i USER_CHALLENGE: rekomendacja jest, ale nigdy hurtem', () => {
  const dir = project();
  artifact(dir, [q({ id: 'Q1', door_type: undefined }), q({ id: 'Q2', class: 'USER_CHALLENGE' }), q({ id: 'Q3' })]);
  const r = verify(dir);
  eq(r.json.questions[0].bulkEligible, false, 'brak door_type = one-way'); eq(r.json.questions[1].bulkEligible, false, 'USER_CHALLENGE'); eq(r.json.questions[2].bulkEligible, true);
  const reply = verify(dir, ['--reply', 'ok wszystkie']).json.reply;
  eq(reply.answers.length, 1, 'tylko jedno pytanie wolno przyjąć hurtem'); eq(reply.answers[0].id, 'Q3');
  eq(reply.hold.length, 2, 'dwa zostają u człowieka'); has(reply.hold.map((h) => h.reason).join(' '), 'one-way');
});
test('decyzja z premise_failed albo card_conflict nigdy hurtem (zamek prepare zostaje)', () => {
  const dir = project();
  artifact(dir, [q({ id: 'Q1', decision: 'D1' }), q({ id: 'Q2', decision: 'D2' })], [
    { id: 'D1', choice: 'x', premise_failed: true }, { id: 'D2', choice: 'y', card_conflict: ['CH5'] }]);
  const r = verify(dir);
  eq(r.json.questions[0].bulkEligible, false); eq(r.json.questions[1].bulkEligible, false);
  eq(verify(dir, ['--reply', 'ok wszystkie']).json.reply.answers.length, 0);
});
test('odpowiedź zbiorcza: „ok poza 3”, „ok 1” (jawne, także one-way), „1: tak”, litera opcji', () => {
  const dir = project();
  // numer = kolejność WYŚWIETLENIA, nie kolejność w artefakcie: one-way (Q2) jest w partii pierwsze → Q2=1, Q1=2, Q3=3
  artifact(dir, [q({ id: 'Q1' }), q({ id: 'Q2', door_type: 'one-way' }), q({ id: 'Q3' })]);
  const ans = (text) => Object.fromEntries(verify(dir, ['--reply', text]).json.reply.answers.map((a) => [a.id, a.answer]));
  eq(JSON.stringify(ans('ok poza 3')), JSON.stringify({ Q1: 'Nie' }), 'poza 3 → Q1; Q2 one-way czeka, Q3 wyłączone');
  eq(JSON.stringify(ans('ok 1')), JSON.stringify({ Q2: 'Nie' }), 'jawne ok na one-way');
  eq(JSON.stringify(ans('1: tak; ok 2')), JSON.stringify({ Q2: 'Tak', Q1: 'Nie' }));
  eq(ans('3: b').Q3, 'Tak', 'litera = opcja B');
});
test('skrypt nie wymyśla odpowiedzi: niezrozumiały tekst i pytanie bez rekomendacji zostają otwarte', () => {
  const dir = project();
  artifact(dir, [q({ id: 'Q1' }), q({ id: 'Q2', rec: undefined, basis: 'none', evidence: [], options: undefined })]);
  const r = verify(dir, ['--reply', 'hmm, zobaczymy jutro']).json.reply;
  eq(r.answers.length, 0); eq(r.unparsed.length, 1); eq(r.hold.length, 2);
  const all = verify(dir, ['--reply', 'ok wszystkie']).json.reply;
  eq(all.answers.map((a) => a.id).join(), 'Q1'); eq(all.hold.map((h) => h.id).join(), 'Q2', 'bez rekomendacji nie ma czego przyjąć hurtem');
  eq(verify(dir, ['--reply', '9: tak']).json.reply.unparsed.length, 1, 'nieistniejący numer pytania');
});
test('partia: najwyżej batch_size, one-way/USER_CHALLENGE pierwsze, w grupie więcej blokowanych SP wcześniej', () => {
  const dir = project();
  const qs = Array.from({ length: 7 }, (_, i) => q({ id: `Q${i + 1}`, blocks_sp: i === 5 ? 8 : i }));
  qs[6].door_type = 'one-way';
  artifact(dir, qs);
  const r = verify(dir);
  eq(r.json.batch.length, 5); eq(r.json.remaining, 2); eq(r.json.batch[0].id, 'Q7', 'one-way pierwsze'); eq(r.json.batch[1].id, 'Q6', 'największe blocks_sp');
});
test('miara jakości: odsetek rekomendacji odrzuconych przez człowieka', () => {
  const dir = project();
  artifact(dir, [q({ id: 'Q1', answer: 'Nie' }), q({ id: 'Q2', answer: 'Nie' }), q({ id: 'Q3', answer: 'Nie' }), q({ id: 'Q4', answer: 'Tak' }), q({ id: 'Q5' })]);
  const s = verify(dir, ['--stats']).json.stats;
  eq(s.rec_total, 4); eq(s.rec_rejected, 1); eq(s.rec_rejected_ratio, 0.25); eq(s.by_basis.precedent.rejected, 1);
});

// ── ADR 0017: auto-przyjęcie, cofnięcie, jedno potwierdzenie ────────────────
// pytanie, które SPEŁNIA warunki auto: canon/precedent ze zweryfikowanym cytatem, two-way, tech, bez słów-kluczy
const aq = (over = {}) => q({ domain: 'tech', question_file: undefined, ...over });
const item = (r, id) => r.json.questions.find((x) => x.id === id);

test('auto: canon/precedent ze źródłem + two-way + tech → autoEligible, w auto.pending, poza partią człowieka', () => {
  const dir = project(); artifact(dir, [aq({ id: 'Q1' }), aq({ id: 'Q2', basis: 'canon', evidence: [{ kind: 'answer', source: 'docs/decisions/BDR-141-x.md:12', quote: QUOTE }], rec: 'Rekomendacja: nie (zgodne z BDR-141).' })]);
  const r = verify(dir);
  eq(r.code, 0); eq(item(r, 'Q1').autoEligible, true); eq(item(r, 'Q2').autoEligible, true);
  eq(r.json.auto.pending.map((p) => p.id).join(), 'Q1,Q2'); eq(r.json.auto.pending[0].answer, 'Nie', 'answer = opcja (recommended) bez znacznika');
  eq(r.json.batch.length, 0, 'człowiek nie dostaje pytań, które przyjęto samo');
});
test('auto: one-way, USER_CHALLENGE, produkt, prawo, new-pattern i basis none NIGDY automatycznie', () => {
  const np = { basis: 'new-pattern', evidence: [], rec: 'Rekomendacja: nie (nowy wzorzec, oparty o ostrożność).' };
  const dir = project();
  artifact(dir, [aq({ id: 'A', door_type: 'one-way' }), aq({ id: 'B', class: 'USER_CHALLENGE' }), aq({ id: 'C', domain: 'product' }), aq({ id: 'D', domain: 'legal', question_file: '2026-11-07-d' }),
    aq({ id: 'E', ...np }), aq({ id: 'F', rec: undefined, basis: 'none', evidence: [], options: undefined }), aq({ id: 'G', door_type: undefined })]);
  const r = verify(dir);
  for (const id of 'ABCDEFG') eq(item(r, id).autoEligible, false, `pytanie ${id}`);
  eq(r.json.auto.pending.length, 0);
  has(item(r, 'A').autoReasons.join(), 'one-way'); has(item(r, 'B').autoReasons.join(), 'USER_CHALLENGE'); has(item(r, 'C').autoReasons.join(), 'domena inna niż tech');
});
test('auto: słowa-klucze retencja/RODO/bezpieczeństwo w pytaniu blokują auto (pytanie idzie do człowieka)', () => {
  const dir = project();
  artifact(dir, [aq({ id: 'Q1', ask: 'Czy przechowywać dane po zamknięciu konta bez ograniczenia retencji?' }), aq({ id: 'Q2', q: 'dotyczy uwierzytelniania' }), aq({ id: 'Q3', rec: 'Rekomendacja: nie (zgodne z BDR-141, RODO).' })]);
  const r = verify(dir);
  for (const id of ['Q1', 'Q2', 'Q3']) { eq(item(r, id).autoEligible, false, id); has(item(r, id).autoReasons.join(), 'retencja/RODO'); }
  eq(r.json.batch.length, 3);
});
test('auto: decyzja z premise_failed/card_conflict i flaga auto_accept: false blokują auto', () => {
  const dir = project();
  artifact(dir, [aq({ id: 'Q1', decision: 'D1' }), aq({ id: 'Q2', decision: 'D2' }), aq({ id: 'Q3' })], [{ id: 'D1', choice: 'x', premise_failed: true }, { id: 'D2', choice: 'y', card_conflict: ['CH5'] }, { id: 'D3', choice: 'z' }]);
  const r = verify(dir);
  eq(item(r, 'Q1').autoEligible, false); eq(item(r, 'Q2').autoEligible, false); eq(item(r, 'Q3').autoEligible, true);
  const off = project({ resolve: { max_questions: 12, batch_size: 5, auto_accept: false } }); artifact(off, [aq({ id: 'Q1' })]);
  const r2 = verify(off);
  eq(r2.json.auto.enabled, false); eq(r2.json.auto.pending.length, 0, 'auto_accept: false = zachowanie sprzed zmiany'); eq(r2.json.batch.length, 1, 'pytanie idzie do człowieka');
  const stale = project({ resolve: { max_questions: 12, batch_size: 5 } }); artifact(stale, [aq({ id: 'Q1' })]);
  eq(verify(stale).json.auto.enabled, false, 'brak klucza w starym runtime.yml = wyłączone');
});
test('auto: answered_by: auto bez uprawnień, z inną odpowiedzią niż (recommended) albo spoza słownika → exit 2', () => {
  const dir = project();
  artifact(dir, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Nie' })]); eq(verify(dir).code, 0, 'uprawnione');
  artifact(dir, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Nie', door_type: 'one-way' })]);
  let r = verify(dir); eq(r.code, 2); has(problems(r), 'answered_by: auto bez uprawnień'); has(problems(r), 'one-way');
  artifact(dir, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Nie', domain: 'product', question_file: undefined })]);
  r = verify(dir); eq(r.code, 2); has(problems(r), 'domena inna niż tech');
  artifact(dir, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Tak' })]);
  r = verify(dir); eq(r.code, 2); has(problems(r), 'answer = opcja (recommended)');
  artifact(dir, [aq({ id: 'Q1', answered_by: 'bot', answer: 'Nie' })]);
  r = verify(dir); eq(r.code, 2); has(problems(r), 'poza słownikiem auto|human');
  const off = project({ resolve: { max_questions: 12, batch_size: 5, auto_accept: false } }); artifact(off, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Nie' })]);
  r = verify(off); eq(r.code, 2); has(problems(r), 'auto_accept wyłączone');
});
test('cofnij: „cofnij 2” → reverted; nieistniejący numer i „cofnij” bez numeru → unparsed; „cofnij wszystkie”', () => {
  const dir = project();
  artifact(dir, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Nie' }), q({ id: 'Q2', answer: 'Nie' }), aq({ id: 'Q3', answered_by: 'auto', answer: 'Nie' }), q({ id: 'Q4', door_type: 'one-way' })]);
  const base = verify(dir);
  eq(base.json.auto.accepted.map((a) => `${a.no}:${a.id}`).join(), '1:Q1,2:Q3', 'numeracja tylko automatycznie przyjętych, w kolejności artefaktu');
  eq(verify(dir, ['--reply', 'cofnij 2']).json.reply.reverted.map((x) => x.id).join(), 'Q3');
  const bad = verify(dir, ['--reply', 'cofnij 7; cofnij']).json.reply; eq(bad.reverted.length, 0); eq(bad.unparsed.length, 2);
  eq(verify(dir, ['--reply', 'cofnij wszystkie']).json.reply.reverted.length, 2);
  eq(verify(dir, ['--reply', 'Cofnij 1, 2.']).json.reply.reverted.length, 2, 'interpunkcja i wielkość liter bez znaczenia');
});
test('cofnięte pytanie (auto_reverted) wraca do partii człowieka i nie jest już autoEligible; „zatwierdzam” nie przejdzie z cofnięciem', () => {
  const dir = project();
  artifact(dir, [aq({ id: 'Q1', answer: null, auto_reverted: true })]);
  const r = verify(dir);
  eq(item(r, 'Q1').autoEligible, false); has(item(r, 'Q1').autoReasons.join(), 'cofnął'); eq(r.json.batch.length, 1); eq(r.json.auto.pending.length, 0);
  artifact(dir, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Nie' })]);
  const rep = verify(dir, ['--reply', 'cofnij 1; zatwierdzam']).json.reply;
  eq(rep.reverted.length, 1); eq(rep.approve.requested, true); eq(rep.approve.granted, false, 'cofnięte wraca do listy — nie zatwierdzamy'); has(JSON.stringify(rep.approve.blockedBy), 'cofnięte');
});
test('resolve_stats: auto_total, auto_reverted; odpowiedzi auto nie liczą się do rec_*', () => {
  const dir = project();
  artifact(dir, [aq({ id: 'Q1', answered_by: 'auto', answer: 'Nie' }), aq({ id: 'Q2', answered_by: 'auto', answer: 'Nie' }), aq({ id: 'Q3', auto_reverted: true, answer: 'Tak' }), q({ id: 'Q4', answer: 'Nie' })]);
  const s = verify(dir, ['--stats']).json.stats;
  eq(s.auto_total, 3); eq(s.auto_reverted, 1); eq(s.auto_reverted_ratio, 0.33); eq(s.rec_total, 2, 'Q3 (odpowiedź człowieka po cofnięciu) i Q4'); eq(s.rec_rejected, 1);
});
test('bulkEligible: new-pattern w tech tak (dwudrzwiowy), w produkcie/prawie, one-way i USER_CHALLENGE nie', () => {
  const np = { basis: 'new-pattern', evidence: [], rec: 'Rekomendacja: nie (nowy wzorzec, oparty o ostrożność).' };
  const dir = project();
  artifact(dir, [q({ id: 'T', domain: 'tech', question_file: undefined, ...np }), q({ id: 'P', domain: 'product', ...np, question_file: 'x' }), q({ id: 'O', domain: 'tech', question_file: undefined, door_type: 'one-way', ...np }),
    q({ id: 'U', domain: 'tech', question_file: undefined, class: 'USER_CHALLENGE', ...np })]);
  const r = verify(dir);
  eq(item(r, 'T').bulkEligible, true, 'new-pattern tech'); eq(item(r, 'P').bulkEligible, false); eq(item(r, 'O').bulkEligible, false); eq(item(r, 'U').bulkEligible, false);
  eq(item(r, 'T').autoEligible, false, 'new-pattern nigdy auto, tylko hurtem');
});
test('parser: „ok”, „przyjmuję rekomendacje”, „Tak, zatwierdzam rekomendacje!”, „biorę rekomendacje” = ok wszystkie', () => {
  const dir = project();
  artifact(dir, [q({ id: 'Q1' }), q({ id: 'Q2' })]);
  for (const text of ['ok', 'OK.', 'ok wszystkie', 'przyjmuję rekomendacje', 'przyjmuje rekomendacje', 'Tak, zatwierdzam rekomendacje!', 'biorę rekomendacje', 'akceptuję wszystkie rekomendacje', 'zgoda']) {
    const rep = verify(dir, ['--reply', text]).json.reply;
    eq(rep.answers.map((a) => a.answer).join(), 'Nie,Nie', `„${text}”`); eq(rep.unparsed.length, 0, `„${text}” unparsed`); eq(rep.approve.granted, true, `„${text}” zatwierdza, gdy nic nie zostaje`);
  }
  for (const text of ['przyjmuję', 'biorę', 'tak', 'hmm ok może']) eq(verify(dir, ['--reply', text]).json.reply.answers.length, 0, `„${text}” to nie zgoda zbiorcza`);
});
test('parser: „ok” przy pytaniu one-way przyjmuje resztę, ale hold z numerem i bez zatwierdzenia; „ok poza 2” nie zatwierdza', () => {
  const dir = project();
  // wyświetlenie: one-way Q2 = 1, Q1 = 2, Q3 = 3
  artifact(dir, [q({ id: 'Q1' }), q({ id: 'Q2', door_type: 'one-way' }), q({ id: 'Q3' })]);
  const rep = verify(dir, ['--reply', 'ok']).json.reply;
  eq(rep.answers.map((a) => a.id).sort().join(), 'Q1,Q3'); eq(rep.hold.map((h) => `${h.no}:${h.id}`).join(), '1:Q2');
  eq(rep.approve.requested, true); eq(rep.approve.granted, false); eq(rep.approve.blockedBy[0].no, 1);
  const poza = verify(dir, ['--reply', 'ok poza 3']).json.reply;
  eq(poza.approve.requested, false, 'z „poza” człowiek chce jeszcze spojrzeć'); eq(poza.approve.granted, false);
  const full = verify(dir, ['--reply', 'ok; 1: tak']).json.reply;
  eq(full.answers.find((a) => a.id === 'Q2').answer, 'Tak'); eq(full.approve.granted, true, 'wszystko odpowiedziane po „ok” + jawna odpowiedź na one-way');
});
test('parser: „zatwierdzam” = przyjęcie bulkEligible + approve; z one-way/USER_CHALLENGE bez odpowiedzi → hold z numerami, bez approve', () => {
  const dir = project();
  artifact(dir, [q({ id: 'Q1' }), q({ id: 'Q2' })]);
  const ok = verify(dir, ['--reply', 'zatwierdzam']).json.reply;
  eq(ok.answers.map((a) => a.answer).join(), 'Nie,Nie'); eq(ok.approve.granted, true); eq(ok.hold.length, 0);
  eq(verify(dir, ['--reply', 'zatwierdzam wszystko']).json.reply.approve.granted, true);
  artifact(dir, [q({ id: 'Q1' }), q({ id: 'Q2', door_type: 'one-way' }), q({ id: 'Q3', class: 'USER_CHALLENGE' })]);
  const hold = verify(dir, ['--reply', 'zatwierdzam']).json.reply;
  eq(hold.answers.map((a) => a.id).join(), 'Q1', 'bulkEligible przyjęte, reszta nie'); eq(hold.approve.granted, false, 'status nie jest zmieniany');
  eq(hold.approve.blockedBy.map((b) => b.no).sort().join(), '1,2', 'numery pytań z hold'); eq(hold.hold.map((h) => h.id).sort().join(), 'Q2,Q3');
  const after = verify(dir, ['--reply', 'zatwierdzam; 1: nie; 2: nie']).json.reply;
  eq(after.approve.granted, true, 'jawne odpowiedzi na one-way odblokowują zatwierdzenie w tej samej wiadomości');
});
test('parser: „zatwierdzam” nie przejdzie z pytaniami poza partią; przy braku otwartych pytań przechodzi', () => {
  const dir = project({ resolve: { max_questions: 12, batch_size: 2, auto_accept: true } });
  artifact(dir, [q({ id: 'Q1' }), q({ id: 'Q2' }), q({ id: 'Q3' })]);
  const rep = verify(dir, ['--reply', 'zatwierdzam']).json.reply;
  eq(rep.approve.granted, false); has(JSON.stringify(rep.approve.blockedBy), 'poza tą partią');
  artifact(dir, [q({ id: 'Q1', answer: 'Nie' })]);
  const none = verify(dir, ['--reply', 'zatwierdzam']).json;
  eq(none.batch.length, 0); eq(none.reply.approve.granted, true, 'wszystko odpowiedziane, człowiek mówi „zatwierdzam” — to wystarcza');
});
test('batch_size: domyślnie 10 (brak klucza w runtime.yml), 12 pytań = partia 10 + remaining 2', () => {
  const dir = project({ resolve: { max_questions: 12 } });
  artifact(dir, Array.from({ length: 12 }, (_, i) => q({ id: `Q${i + 1}` })));
  const r = verify(dir); eq(r.json.batch.length, 10); eq(r.json.remaining, 2); eq(r.json.limits.batchSize, 10);
});

// ── fallback: none / projekt bez bloku ─────────────────────────────────────
test('questions_format: none — pytania weryfikowane jak zawsze, ale poza artefaktem nie wolno zapisać niczego', () => {
  const dir = project({ format: 'none' }); artifact(dir, [q({ domain: undefined })]);
  eq(verify(dir).code, 0, 'domain nie jest wymagane bez utrwalania');
  const bdr = finalize(dir, 'check-write', '--op', 'create', 'docs/decisions/BDR-142-y.md');
  eq(bdr.code, 2, 'BDR zabroniony'); has(bdr.err, 'questions_format: none');
  eq(finalize(dir, 'check-write', '--op', 'edit', 'docs/KANON.md').code, 2);
  eq(finalize(dir, 'check-write', '--op', 'edit', ARTIFACT).code, 0, 'artefakt zawsze wolno');
});
test('projekt bez bloku decision-registry — krok nieaktywny, exit 0, nic nie jest sprawdzane', () => {
  const dir = project({ registry: false }); artifact(dir, [q({ rec: 'bzdura bez prefiksu' })]);
  const r = verify(dir); eq(r.code, 0); eq(r.json.active, false);
  eq(finalize(dir, 'check-write', '--op', 'create', 'docs/decisions/BDR-142-y.md').code, 2);
});
test('questions_format poza słownikiem w runtime.yml → ostrzeżenie i traktowanie jak none', () => {
  const dir = project({ format: 'flie' }); artifact(dir, [q()]);
  const r = verify(dir); eq(r.json.format, 'none'); has(r.json.warnings.join(' '), 'poza słownikiem');
});

// ── zapis tylko do ścieżek z configu ───────────────────────────────────────
test('zakres zapisu (format file): nowy BDR i kanon z canon_edit tak, reszta nie', () => {
  const dir = project({ extraFiles: { 'docs/decisions/BDR-050-old.md': 'stara decyzja\n', 'docs/other.md': 'x\n', '.env': 'A=1\n' } });
  const chk = (op, ...paths) => finalize(dir, 'check-write', '--op', op, ...paths).code;
  eq(chk('create', 'docs/decisions/BDR-142-nowa.md', 'docs/adr/ADR-0200-nowy.md'), 0, 'nowe wpisy');
  eq(chk('edit', 'docs/decisions/BDR-050-old.md'), 2, 'edycja istniejącego BDR');
  eq(chk('delete', 'docs/decisions/BDR-050-old.md'), 2, 'usunięcie istniejącego BDR');
  eq(chk('create', 'docs/decisions/BDR-050-old.md'), 2, 'nadpisanie przez „create”');
  eq(chk('edit', 'docs/KANON.md'), 0, 'kanon z canon_edit');
  eq(chk('edit', 'docs/other.md'), 2, 'inny plik docs');
  eq(chk('edit', 'src/secret.ts'), 2, 'kod');
  eq(chk('edit', '.env'), 2, '.env');
  eq(chk('create', '../poza/projektem.md'), 2, 'ścieżka z ..');
  eq(chk('create', 'docs/decisions/questions/2026-11-07-nowe.md'), 0, 'nowy plik pytania');
  eq(chk('edit', 'docs/decisions/questions/2026-11-07-nowe.md'), 2, 'plik pytania się nie edytuje');
  eq(chk('edit', 'project-orchestration/tasks/T-1.md'), 2, 'zadanie bez question_task_link');
  eq(chk('delete', 'docs/decisions/questions/README.md'), 2, 'README katalogu pytań to nie pytanie');
});
test('glob w canon_edit jest odrzucany, a zadanie wolno edytować tylko z question_task_link', () => {
  const dir = project({ sink: { canon_edit: ['docs/*.md'] } });
  const r = finalize(dir, 'check-write', '--op', 'edit', 'docs/KANON.md');
  eq(r.code, 2, 'glob nie otwiera edycji');
  const rt = path.join(dir, '.claude/config/runtime.yml');
  const doc = YAML.parse(fs.readFileSync(rt, 'utf8'));
  doc.params['decision-registry'].question_task_link = { dir: 'project-orchestration/tasks', field: 'awaits_question' };
  fs.writeFileSync(rt, YAML.stringify(doc));
  eq(finalize(dir, 'check-write', '--op', 'edit', 'project-orchestration/tasks/T-1-opis.md').code, 0);
  eq(finalize(dir, 'check-write', '--op', 'edit', 'project-orchestration/tasks/T-2-inne.md').code, 2, 'tylko zadanie tej analizy');
});
test('question_task_link: true = domyślne project-orchestration/tasks + awaits_question', () => {
  const dir = project();
  const rt = path.join(dir, '.claude/config/runtime.yml');
  const doc = YAML.parse(fs.readFileSync(rt, 'utf8'));
  doc.params['decision-registry'].question_task_link = true;
  fs.writeFileSync(rt, YAML.stringify(doc));
  const r = finalize(dir, 'check-write', '--op', 'edit', 'project-orchestration/tasks/T-1-opis.md');
  eq(r.code, 0); has(r.out, 'awaits_question');
  eq(finalize(dir, 'check-write', '--op', 'edit', 'project-orchestration/tasks/T-2-inne.md').code, 2);
});
test('close-questions: plik pytania znika dopiero, gdy istnieje dokument z „rozstrzyga”', () => {
  const dir = project({ extraFiles: { 'docs/decisions/questions/2026-11-07-ban.md': '---\nid: 2026-11-07-ban\n---\n' } });
  artifact(dir, [q({ question_file: '2026-11-07-ban', answer: 'Nie' })]);
  const kept = finalize(dir, 'close-questions', path.join(dir, ARTIFACT));
  eq(kept.code, 2, 'brak BDR → exit 2'); eq(fs.existsSync(path.join(dir, 'docs/decisions/questions/2026-11-07-ban.md')), true, 'plik pytania zostaje');
  write(dir, 'docs/decisions/BDR-142-ban.md', '---\nid: BDR-142\nrozstrzyga: [2026-11-07-ban]\n---\n# BDR-142\n');
  const dry = finalize(dir, 'close-questions', path.join(dir, ARTIFACT), '--dry-run');
  eq(dry.code, 0); eq(fs.existsSync(path.join(dir, 'docs/decisions/questions/2026-11-07-ban.md')), true, 'dry-run nie kasuje');
  const done = finalize(dir, 'close-questions', path.join(dir, ARTIFACT));
  eq(done.code, 0); eq(done.json.closed[0].resolvedBy, 'docs/decisions/BDR-142-ban.md');
  eq(fs.existsSync(path.join(dir, 'docs/decisions/questions/2026-11-07-ban.md')), false, 'plik pytania usunięty');
  eq(fs.existsSync(path.join(dir, 'docs/decisions/BDR-142-ban.md')), true, 'BDR nietknięty');
});
test('close-questions nie rusza pytania bez odpowiedzi człowieka', () => {
  const dir = project({ extraFiles: { 'docs/decisions/questions/2026-11-07-ban.md': 'x\n', 'docs/decisions/BDR-142-ban.md': '---\nrozstrzyga: [2026-11-07-ban]\n---\n' } });
  artifact(dir, [q({ question_file: '2026-11-07-ban', answer: null })]);
  const r = finalize(dir, 'close-questions', path.join(dir, ARTIFACT));
  eq(r.code, 0); eq(r.json.closed.length, 0); eq(fs.existsSync(path.join(dir, 'docs/decisions/questions/2026-11-07-ban.md')), true);
});
test('produkt/prawo bez źródła w formacie file wymaga pliku pytania, a nigdy zgadniętej wartości', () => {
  const dir = project();
  artifact(dir, [q({ basis: 'new-pattern', evidence: [], rec: 'Rekomendacja: nie (nowy wzorzec, oparty o ostrożność).', question_file: undefined })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'question_file');
  artifact(dir, [q({ basis: 'new-pattern', evidence: [], rec: 'Rekomendacja: nie (nowy wzorzec, oparty o ostrożność).', question_file: '2026-11-07-ban' })]);
  eq(verify(dir).code, 0);
});

// ── ADR 0017, poprawka 2026-11-08 ───────────────────────────────────────────
// 1. luka przeglądu nigdy nie jest pytaniem; 2. linia instrukcji zgodna z parserem; 3. po „ok" agent zmienia tylko artefakt
const procQ = (over = {}) => ({ id: 'Q9', ask: 'Kontrola decyzji nie przeczytała trzech plików, czy powtórzyć przegląd?', q: 'Bramka decision-gate skończyła budżet', answer: null, ...over });
test('luka przeglądu: pytanie procesowe bez decision i rec → exit 2 (nie trafia do człowieka)', () => {
  const dir = project(); artifact(dir, [procQ()]);
  const r = verify(dir); eq(r.code, 2, 'exit'); has(problems(r, 'Q9'), 'luka przeglądu idzie do `## Przebieg`');
});
test('luka przeglądu: pytanie o proces odpada nawet z decision i rec', () => {
  const dir = project();
  artifact(dir, [procQ({ decision: 'D1', rec: 'Rekomendacja: tak (nowy wzorzec, oparty o ostrożność).', basis: 'new-pattern', domain: 'tech', class: 'TASTE', door_type: 'two-way', options: ['Tak (recommended)', 'Nie'] })], [{ id: 'D1', choice: 'x' }]);
  const r = verify(dir); eq(r.code, 2, 'exit'); has(problems(r, 'Q9'), 'proces analizy');
});
test('luka przeglądu: zwykłe pytania o domenę ze słowami „doczytać”, „kontrola decyzji”, „bramka” i „poprawny” nie są pytaniami procesowymi ani wrażliwymi', () => {
  const dir = project();
  const mk = (id, ask) => ({ id, ask, q: 'kontekst', decision: 'D1', basis: 'none', domain: 'tech', class: 'TASTE', door_type: 'two-way', answer: null });
  artifact(dir, [mk('Q1', 'Czy doczytać historię zamówień z archiwum przy otwarciu widoku?'), mk('Q2', 'Czy kontrola decyzji płatności ma być synchroniczna?'),
    mk('Q3', 'Czy przebieg analizy raportu ma być cache-owany?'), mk('Q4', 'Czy bramka płatności nie sprawdzi duplikatów?')], [{ id: 'D1', choice: 'x' }]);
  const r = verify(dir); eq(r.code, 0, r.err);
  for (const id of ['Q1', 'Q2', 'Q3', 'Q4']) eq(problems(r, id), '', id);
});
test('auto: „poprawnego” i „poprawnie” nie są słowem „prawny” (SENSITIVE_RE ma granicę słowa)', () => {
  const dir = project(); artifact(dir, [aq({ id: 'Q1', ask: 'Czy użyć poprawnego formatu daty ISO w API?', rec: 'Rekomendacja: tak (zgodne z BDR-141).', options: ['Tak (recommended)', 'Nie'] })]);
  eq(item(verify(dir), 'Q1').autoEligible, true);
});
test('luka przeglądu: zwykłe pytanie TASTE z decision, bez rec (basis none) nadal przechodzi', () => {
  const dir = project();
  artifact(dir, [{ id: 'Q8', ask: 'Czy nazwać funkcję po polsku?', q: 'brak podstaw do preferencji', decision: 'D1', basis: 'none', domain: 'tech', class: 'TASTE', door_type: 'two-way', answer: null }], [{ id: 'D1', choice: 'x' }]);
  eq(verify(dir).code, 0);
});
test('rec: znacznik podstawy (canon/precedent/basis) → exit 2, „zgodne z BDR” i „nowy wzorzec” przechodzą', () => {
  const dir = project(); artifact(dir, [q({ rec: 'Rekomendacja: nie (zgodne z BDR-141, precedent).' })]);
  const r = verify(dir); eq(r.code, 2); has(problems(r), 'znacznik podstawy');
  artifact(dir, [q({ rec: 'Rekomendacja: nie (canon).' })]); eq(verify(dir).code, 2, 'canon w nawiasie');
  artifact(dir, [q()]); eq(verify(dir).code, 0);
});
test('instruction: wszystko bulkEligible → „ok”, a „ok” naprawdę zatwierdza', () => {
  const dir = project(); artifact(dir, [q(), q({ id: 'Q2' })]);
  const r = verify(dir, ['--reply', 'ok']);
  eq(r.json.instruction, 'ok'); eq(r.json.reply.approve.granted, true, 'ok zatwierdza');
});
test('instruction: zostają one-way → „ok 2,3 · 1: odpowiedź”, a samo „ok” NIE zatwierdza', () => {
  const dir = project(); artifact(dir, [q(), q({ id: 'Q2' }), q({ id: 'Q3', door_type: 'one-way' })]);
  const r = verify(dir);
  eq(r.json.instruction, 'ok 2,3 · 1: odpowiedź'); eq(r.json.batch[0].id, 'Q3', 'one-way pierwszy');
  const bare = verify(dir, ['--reply', 'ok']);
  eq(bare.json.reply.approve.granted, false, 'samo ok nie zatwierdza'); eq(bare.json.reply.hold[0].id, 'Q3');
  const follow = verify(dir, ['--reply', 'ok 2,3; 1: Tak']);
  eq(follow.json.reply.answers.length, 3, 'linia instrukcji daje komplet odpowiedzi'); eq(follow.json.reply.hold.length, 0);
});
test('instruction: wszystkie pytania wymagają odpowiedzi → „1: odpowiedź · 2: odpowiedź”; reszta partii → ogon', () => {
  const dir = project(); artifact(dir, [q({ door_type: 'one-way' }), q({ id: 'Q2', class: 'USER_CHALLENGE' })]);
  eq(verify(dir).json.instruction, '1: odpowiedź · 2: odpowiedź');
  const small = project({ resolve: { max_questions: 12, batch_size: 1, auto_accept: true } }); artifact(small, [q(), q({ id: 'Q2' })]);
  eq(verify(small).json.instruction, 'ok · Zostało 1 pytań, pokażę je po tych');
  const none = project(); artifact(none, []);
  eq(verify(none).json.instruction, null, 'brak pytań = brak linii instrukcji');
});
test('reguły w komendzie: ANL-051 (luka nie jest pytaniem), ANL-034 (po „ok” tylko artefakt), ANL-040 (linia „0”, synteza)', () => {
  const cmd = fs.readFileSync(path.join(REPO, 'commands', 'analyze.md'), 'utf8');
  const row = (id) => cmd.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';
  has(row('ANL-051'), 'NIGDY NIE JEST PYTANIEM'); has(row('ANL-051'), '`## Przebieg`');
  eq(/open_questions` „Bramka/.test(row('ANL-051')), false, 'stare „Bramka X nie sprawdziła” jako pytanie usunięte');
  for (const w of ['WYŁĄCZNIE artefakt analizy', 'package.json', 'lockfile', 'plików zadań', '`status: done`', 'nie commitujesz', 'nie mergujesz', '/orchestrate']) has(row('ANL-034'), w);
  has(row('ANL-040'), 'tylko gdy N>0'); has(row('ANL-040'), 'akapitu syntezy'); has(row('ANL-040'), '`instruction`'); has(row('ANL-040'), 'znaczników podstawy');
  eq(/ok = przyjmij rekomendacje i zatwierdź/.test(cmd), false, 'stała linia „ok = zatwierdź” usunięta z komendy');
  const doc = fs.readFileSync(path.join(REPO, 'docs', 'analyze-resolve.md'), 'utf8');
  eq(/ok = przyjmij rekomendacje i zatwierdź/.test(doc), false, 'i z procedury');
  has(doc, 'Luka przeglądu nie jest pytaniem'); has(doc, 'przy zerze brak linii'); has(doc, 'Po zatwierdzeniu (ANL-034)');
});

// ── ADR 0017, poprawka 2026-11-08 (2): twardy test frontmattera (ANL-061), zakres plików (ANL-062), sekcja Security (ANL-063) ──
// Surowy frontmatter pisany ręcznie: model wpisuje `rag:` jako zdanie, a YAML go nie parsuje (`: ` w wartości) albo ucina (` #`).
function rawArtifact(fm) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-fm-'));
  roots.push(dir);
  write(dir, ARTIFACT, `---\n${fm}\n---\n\n# Analiza\n`);
  return dir; // celowo bez .claude/config/runtime.yml: kontrola ma działać bez analyze.resolve
}
const checkFm = (dir) => run(VERIFY, [path.join(dir, ARTIFACT), '--check-frontmatter']);
const BASE_FM = 'task: T-1\nstatus: awaiting-human\nstack_blocks: [ddd/core]';
test('frontmatter: `rag:` z nieocytowanym „: " w wartości → exit 2, numer linii i podpowiedź o cudzysłowie (bez runtime.yml)', () => {
  const dir = rawArtifact(`${BASE_FM}\nrag: skipped (indeks RAG nie był potrzebny: zakres to 3 znane pliki)`);
  const r = checkFm(dir);
  eq(r.code, 2, 'exit'); eq(r.json.frontmatter.ok, false);
  has(r.err, 'linia 5', 'numer linii w pliku (rag to 4. linia frontmattera, +1 za ---)'); has(r.err, 'rag: skipped'); has(r.err, 'cudzysłów');
});
test('frontmatter: `#` w wartości `rag:` (YAML ucina ją po cichu) → exit 2', () => {
  const dir = rawArtifact(`${BASE_FM}\nrag: skipped (powód #1 brak indeksu)`);
  const r = checkFm(dir);
  eq(r.code, 2, 'exit'); has(r.err, '`#` w wartości rag'); has(r.err, 'cudzysłów');
});
test('frontmatter: `#` w wartości `stack_blocks:` → exit 2; wartość w cudzysłowie albo bloku `>-` przechodzi', () => {
  eq(checkFm(rawArtifact('task: T-1\nstatus: x\nrag: "skipped (ok)"\nstack_blocks: ddd/core # nowy')).code, 2, 'stack_blocks z #');
  const quoted = checkFm(rawArtifact(`${BASE_FM}\nrag: "skipped (indeks RAG nie był potrzebny: zakres to 3 pliki, ANL #4)"`));
  eq(quoted.code, 0, quoted.err); eq(quoted.json.frontmatter.ok, true);
  const block = checkFm(rawArtifact(`${BASE_FM}\nrag: >-\n  skipped (powód: zakres to 3 pliki, #4)`));
  eq(block.code, 0, block.err);
});
test('frontmatter: brak `rag:` (ANL-010) i brak frontmattera → exit 2; lista zapytań przechodzi', () => {
  const noRag = checkFm(rawArtifact(BASE_FM)); eq(noRag.code, 2); has(noRag.err, 'brak pola `rag`'); has(noRag.err, 'ANL-010');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-fm-')); roots.push(dir); write(dir, ARTIFACT, '# bez frontmattera\n');
  eq(checkFm(dir).code, 2, 'brak frontmattera');
  eq(checkFm(rawArtifact(`${BASE_FM}\nrag:\n  - "q1: 3 trafienia"\n  - "q2: 0 trafień"`)).code, 0, 'lista zapytań');
});
test('frontmatter: szablon artefaktu przechodzi kontrolę, a bez flagi stary artefakt bez `rag:` działa jak dotąd (wstecznie zgodnie)', () => {
  const tpl = run(VERIFY, [path.join(REPO, 'templates', 'task-analysis-template.md'), '--check-frontmatter']);
  eq(tpl.code, 0, tpl.err);
  const dir = project(); artifact(dir, [q()]); // fixture bez `rag:` — jak artefakty sprzed ANL-061
  eq(verify(dir).code, 0, 'verify bez --check-frontmatter nie wymaga rag');
  eq(checkFm(dir).code, 2, 'ta sama analiza z flagą: brak rag jest błędem');
});
test('reguły w komendzie: ANL-061 (kontrola frontmattera zawsze), ANL-010 (cudzysłów), ANL-062 (pliki chronione hookiem), ANL-063 (sekcja Security), ANL-017 (zawężenie bramki)', () => {
  const cmd = fs.readFileSync(path.join(REPO, 'commands', 'analyze.md'), 'utf8');
  const row = (id) => cmd.split('\n').find((l) => l.startsWith(`| ${id} |`)) ?? '';
  has(row('ANL-061'), '--check-frontmatter'); has(row('ANL-061'), 'także bez `analyze.resolve`'); has(row('ANL-061'), 'exit 2');
  has(cmd, '2.a frontmatter'); has(row('ANL-010'), 'W CUDZYSŁOWIE'); has(row('ANL-010'), '--check-frontmatter');
  for (const w of ['config-protection', '.eslintrc*', 'eslint.config.*', '.prettierrc*', 'biome.json*', 'ruff.toml', 'Kroki ręczne po przebiegu', 'nie obchodzisz']) has(row('ANL-062'), w);
  eq(/tsconfig/.test(row('ANL-062')), false, 'tsconfig nie jest chroniony hookiem — nie wpisujemy go');
  for (const w of ['Security Pre-Analysis', 'WYŁĄCZNIE tę sekcję', '`status` zadania nietknięte', 'check-security-considerations']) has(row('ANL-063'), w);
  has(cmd, '5. **Sekcja `## 🔒 Security Pre-Analysis`'); has(cmd, 'poza pkt 4 i 5');
  has(row('ANL-017'), '--tags'); has(row('ANL-017'), 'DWA sekwencyjne wywołania'); has(row('ANL-017'), '>15');
});
test('budżet bramki decyzji: decision-gate ma ≥ 25 wywołań (przy 12 haiku kończył „na limicie" w większości analiz)', () => {
  const blk = YAML.parse(fs.readFileSync(path.join(REPO, 'blocks', 'decision-registry.yml'), 'utf8'));
  const n = blk.budgets['decision-gate'].max_tool_calls;
  if (!(n >= 25)) throw new Error(`decision-gate max_tool_calls = ${n}, oczekiwano >= 25`);
  eq(blk.budgets['decision-gate'].on_limit, 'emit-partial');
});

// ── materializacja bloku ───────────────────────────────────────────────────
function materialize(blockParams) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-mat-'));
  roots.push(dir);
  for (const d of ['docs/adr', 'docs/decisions', 'docs/decisions/questions']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  write(dir, '.claude/config/project.yml', YAML.stringify({ project: { name: 'eval-resolve', description: 'fixture', stack_blocks: ['decision-registry'], language: 'typescript',
    block_params: { 'decision-registry': { adr_dir: 'docs/adr', bdr_dir: 'docs/decisions', ...blockParams } } } }));
  const r = spawnSync('node', [MATERIALIZE, dir, REPO], { encoding: 'utf8' });
  const rtPath = path.join(dir, '.claude/config/runtime.yml');
  return { code: r.status, err: `${r.stderr}${r.stdout}`, runtime: fs.existsSync(rtPath) ? YAML.parse(fs.readFileSync(rtPath, 'utf8')) : null };
}
test('materializacja: domyślnie questions_format none, limity w analyze.resolve jako liczby, auto_accept true', () => {
  const m = materialize({});
  eq(m.code, 0, m.err); eq(m.runtime.params['decision-registry'].questions_format, 'none');
  eq(m.runtime.analyze.resolve.max_questions, 12); eq(m.runtime.analyze.resolve.batch_size, 10); eq(m.runtime.analyze.resolve.auto_accept, true, 'auto_accept domyślnie true w bloku');
  eq(m.runtime.budgets.resolve.max_tool_calls, 25);
});
test('materializacja: questions_format: file + resolution_sink trafiają do runtime.yml, a literówka kończy się błędem', () => {
  const ok = materialize({ questions_format: 'file', questions_dir: 'docs/decisions/questions', resolution_sink: { canon_edit: ['docs/KANON.md'] }, resolve_batch_size: 3 });
  eq(ok.code, 0, ok.err); eq(ok.runtime.params['decision-registry'].questions_format, 'file');
  eq(ok.runtime.params['decision-registry'].resolution_sink.canon_edit[0], 'docs/KANON.md'); eq(ok.runtime.analyze.resolve.batch_size, 3);
  const off = materialize({ resolve_auto_accept: false });
  eq(off.code, 0, off.err); eq(off.runtime.analyze.resolve.auto_accept, false, 'auto_accept: false z block_params trafia do runtime.yml');
  const bad = materialize({ questions_format: 'flie' });
  eq(bad.code === 0, false, 'literówka nie może przejść'); has(bad.err, 'poza słownikiem');
});

test('licznik odpowiedzi: `answer: null` i pusty string nie są odpowiedziami, auto liczone osobno (nie wystarcza grep po „answer:")', () => {
  const dir = project(); artifact(dir, [aq({ id: 'Q1', answer: 'Nie', answered_by: 'auto' }), aq({ id: 'Q2', answer: 'Tak' }), aq({ id: 'Q3', answer: null }), aq({ id: 'Q4', answer: '' })]);
  const r = verify(dir);
  eq(r.json.answers.total, 4); eq(r.json.answers.answered, 2); eq(r.json.answers.open, 2); eq(r.json.answers.auto, 1);
});

let failed = 0;
for (const c of cases) {
  try { c.fn(); console.log(`  ✅ ${c.name}`); } catch (e) { failed++; console.log(`  ❌ ${c.name}\n       ${String(e.message).split('\n')[0]}`); }
}
for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
