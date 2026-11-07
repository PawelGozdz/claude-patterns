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
function project({ format = 'file', registry = true, extraFiles = {}, sink = { canon_edit: ['docs/KANON.md'] } } = {}) {
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
        analyze: { resolve: { max_questions: 12, batch_size: 5 } },
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
test('materializacja: domyślnie questions_format none, limity w analyze.resolve jako liczby', () => {
  const m = materialize({});
  eq(m.code, 0, m.err); eq(m.runtime.params['decision-registry'].questions_format, 'none');
  eq(m.runtime.analyze.resolve.max_questions, 12); eq(m.runtime.analyze.resolve.batch_size, 5);
  eq(m.runtime.budgets.resolve.max_tool_calls, 25);
});
test('materializacja: questions_format: file + resolution_sink trafiają do runtime.yml, a literówka kończy się błędem', () => {
  const ok = materialize({ questions_format: 'file', questions_dir: 'docs/decisions/questions', resolution_sink: { canon_edit: ['docs/KANON.md'] }, resolve_batch_size: 3 });
  eq(ok.code, 0, ok.err); eq(ok.runtime.params['decision-registry'].questions_format, 'file');
  eq(ok.runtime.params['decision-registry'].resolution_sink.canon_edit[0], 'docs/KANON.md'); eq(ok.runtime.analyze.resolve.batch_size, 3);
  const bad = materialize({ questions_format: 'flie' });
  eq(bad.code === 0, false, 'literówka nie może przejść'); has(bad.err, 'poza słownikiem');
});

let failed = 0;
for (const c of cases) {
  try { c.fn(); console.log(`  ✅ ${c.name}`); } catch (e) { failed++; console.log(`  ❌ ${c.name}\n       ${String(e.message).split('\n')[0]}`); }
}
for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
