#!/usr/bin/env node
/**
 * tests/flow-evals/prompt-structure/run.js — eval L1 dla scripts/ci/validate-prompt-structure.mjs (TASK-GSTACK-ADOPT-001, A3).
 *
 * DLACZEGO: test strukturalny promptu, który nigdy nie failuje, wygląda tak samo jak działający. Każda z trzech
 * części (required-steps, pins, archaeology) jest więc sprawdzana w OBU kierunkach: stan poprawny przechodzi,
 * a celowo zepsuty (usunięty krok, zamieniona kolejność, brak tokenu, nowe trafienie #1234, wpis allowlisty
 * bez powodu, martwy wpis baseline) failuje z komunikatem „co/gdzie/jak naprawić".
 *
 * Wszystko na statycznym drzewie fixtures/repo/ (kopiowanym do katalogu tymczasowym przy każdym przypadku)
 * i danych JSON generowanych w locie: produkcyjne pliki promptów i produkcyjne required-steps.json / pins.json /
 * archaeology-*.json nie są dotykane. Prawdziwe repo służy tylko do sprawdzenia, że skrypt kończy się exit 0 i mieści się w 1 s.
 *
 * Kontrakty:
 *   A. required-steps: stan poprawny; brak kroku (nazwa w błędzie); zła kolejność; nagłówek w bloku kodu się nie liczy;
 *      `present` bez kolejności; plik z listy nie istnieje; zły kształt kroku; brak pliku danych
 *   B. pins: stan poprawny; brak tokenu; plik nie istnieje; token-zdanie odrzucony; marker HTML jest tokenem;
 *      mentions: parafraza i wielkość liter nie psują, usunięcie reguły i rozbicie słów na dwa zdania psują
 *   C. archaeology: stan poprawny (kod, URL, ID reguł, Changelog, vendor i README są poza lintem; „incident response" też);
 *      każdy rodzaj trafienia failuje; ratchet: nowy plik, wzrost, spadek („obniż baseline"), martwy wpis baseline;
 *      allowlista: wpis bez powodu, z krótkim powodem, niedopasowany, dla nieistniejącego pliku, poprawny wpis wycisza trafienie;
 *      --capture: odmawia przy zepsutej allowliście, jest deterministyczny, brak baseline = podpowiedź --capture
 *   D. CLI: --only izoluje część, błędne argumenty => exit 2
 *   F. poprawki po przeglądzie: (1) mentions mają jednostki (wiersz tabeli, krok diagramu, zdanie) i limit 600 znaków — usunięcie
 *      prozy kroku 4 z KOPII prawdziwego orchestrate.md czerwieni reguły mimo wiersza ORC-139 w tabeli; (2) --capture nie podnosi
 *      baseline bez --allow-growth; (3) „## Raport” != „## Raportowanie”; (4) nagłówek wcięty o >= 4 spacje to kod; (5) ogrodzenie
 *      zamyka tylko ogrodzenie tego samego znaku, >= długości, bez info-stringu; (6) kolory CSS nie są trafieniem, `issue #123` jest;
 *      (7) słowa kluczowe na granicach słów (Unicode); (8) pin w kontekście kodu z min_count oraz pin `patterns` (schemat w skrypcie)
 *   E. prawdziwe repo: exit 0 (każda część osobno i razem), < 1 s
 *
 * Uruchom: node tests/flow-evals/prompt-structure/run.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'ci', 'validate-prompt-structure.mjs');
const FIXTURE = path.join(__dirname, 'fixtures', 'repo');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-prompt-structure-'));
let seq = 0;

const checks = [];
const expect = (label, cond, detail) => checks.push({ label, ok: Boolean(cond), detail });

// ── narzędzia ────────────────────────────────────────────────────────────────

/** Świeża kopia fixtures/repo + katalog danych. Zwraca { root, data }. */
function fresh() {
  const base = path.join(tmp, `fx${seq++}`);
  const root = path.join(base, 'repo');
  fs.cpSync(FIXTURE, root, { recursive: true });
  fs.mkdirSync(path.join(base, 'data'), { recursive: true });
  return { root, data: path.join(base, 'data') };
}
const put = (fx, rel, content) => {
  const p = path.join(fx.root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const edit = (fx, rel, fn) => put(fx, rel, fn(fs.readFileSync(path.join(fx.root, rel), 'utf8')));
const writeData = (fx, name, obj) => fs.writeFileSync(path.join(fx.data, name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
const run = (fx, ...args) => {
  const r = spawnSync('node', [SCRIPT, '--root', fx.root, '--data-dir', fx.data, ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};

// ── dane poprawne dla fixtures/repo ──────────────────────────────────────────

const STEPS = {
  schema: 1,
  files: [
    {
      file: 'commands/flow.md',
      steps: [
        { id: 'tytuł', heading: '# /flow' },
        { id: 'sekcja Przebieg', heading: '## Przebieg' },
        { id: 'krok 1 start', line: '^1\\.\\s+start' },
        { id: 'krok 2 praca', line: '^2\\.\\s+praca' },
        { id: 'krok 3 koniec', line: '^3\\.\\s+koniec' },
        { id: 'sekcja Zasady', heading: '## Zasady' },
      ],
      present: [{ id: 'marker STATUS_DONE', text: 'STATUS_DONE' }],
    },
    {
      file: 'skills/quality/demo/SKILL.md',
      steps: [{ id: 'faza 1', heading: '## Phase 1' }, { id: 'faza 2', heading: '## Phase 2' }],
    },
  ],
};
const PINS = {
  schema: 1,
  pins: [
    { files: ['commands/flow.md'], tokens: ['ESCALATE_HALT', 'verdict', 'STATUS_DONE'], why: 'pola i markery czytane przez skrypt demo' },
    {
      files: ['agents/verifier.md'],
      tokens: ['verdict', 'violations', 'unverified_scope', '<!-- fragment:evidence-kernel START -->', '<!-- fragment:evidence-kernel END -->'],
      why: 'pola wyjścia weryfikatora i markery fragmentu',
    },
  ],
  mentions: [
    {
      id: 'flow: nie dopisuj done_layers ręcznie',
      file: 'commands/flow.md',
      scope: 'sentence',
      all: [['nigdy', 'nie wolno'], 'done_layers', 'ręcznie'],
      why: 'ręczny zapis warstwy omija weryfikatora',
    },
  ],
};
const ALLOW_EMPTY = { schema: 1, entries: [] };
const FM_FLOW = '---\nname: flow\ndescription: Demo\n---\n';
const OK_REASON = 'Przykład wywołania w opisie użycia, nie data zdarzenia.';

function good() {
  const fx = fresh();
  writeData(fx, 'required-steps.json', STEPS);
  writeData(fx, 'pins.json', PINS);
  writeData(fx, 'archaeology-allowlist.json', ALLOW_EMPTY);
  run(fx, '--capture', '--allow-growth');
  return fx;
}
const has = (r, re) => re.test(r.out);

// ── A. required-steps ────────────────────────────────────────────────────────

let fx = good();
let r = run(fx);
expect('A1 stan poprawny: wszystkie trzy części => exit 0', r.code === 0 && /OK \(required-steps, pins, archaeology\)/.test(r.out), r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('2. praca   → node scripts/run.mjs\n', ''));
r = run(fx, '--only', 'required-steps');
expect('A2 usunięty krok => exit 1, nazwa kroku, plik i poprawka w komunikacie',
  r.code === 1 && has(r, /commands\/flow\.md: brak kroku „krok 2 praca"/) && has(r, /Napraw:/), r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('2. praca   → node scripts/run.mjs\n3. koniec  → STATUS_DONE', '3. koniec  → STATUS_DONE\n2. praca   → node scripts/run.mjs'));
r = run(fx, '--only', 'required-steps');
expect('A3 zamieniona kolejność => exit 1 „zła kolejność" z nazwami obu kroków',
  r.code === 1 && has(r, /zła kolejność — krok „krok 3 koniec" stoi PRZED krokiem „krok 2 praca"/), r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('## Zasady', '```\n## Zasady\n```\n\n## Inne'));
r = run(fx, '--only', 'required-steps');
expect('A4 nagłówek wyłącznie w bloku kodu NIE liczy się jako krok', r.code === 1 && has(r, /brak kroku „sekcja Zasady"/), r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replaceAll('STATUS_DONE', 'GOTOWE'));
r = run(fx, '--only', 'required-steps');
expect('A5 `present` brak elementu => exit 1 z nazwą', r.code === 1 && has(r, /brak wymaganego elementu „marker STATUS_DONE"/), r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('2. praca   → node scripts/run.mjs\n3. koniec  → STATUS_DONE', '3. koniec  → STATUS_DONE\n2. praca   → node scripts/run.mjs'));
const swappedPresent = JSON.parse(JSON.stringify(STEPS));
swappedPresent.files[0].present.push({ id: 'krok 2 praca (bez kolejności)', line: '^2\\.\\s+praca' });
swappedPresent.files[0].steps = swappedPresent.files[0].steps.filter((s) => !/krok [23]/.test(s.id));
writeData(fx, 'required-steps.json', swappedPresent);
expect('A6 elementy `present` nie mają kolejności (zamiana nie failuje)', run(fx, '--only', 'required-steps').code === 0);

fx = good();
const ghost = JSON.parse(JSON.stringify(STEPS));
ghost.files.push({ file: 'commands/nie-ma-takiego.md', steps: [{ id: 'x', heading: '# x' }] });
writeData(fx, 'required-steps.json', ghost);
r = run(fx, '--only', 'required-steps');
expect('A7 plik z listy nie istnieje => exit 1 z nazwą pliku', r.code === 1 && has(r, /commands\/nie-ma-takiego\.md: plik z listy nie istnieje/), r.out);

fx = good();
const bad = JSON.parse(JSON.stringify(STEPS));
bad.files[0].steps[0] = { id: 'dwa rodzaje', heading: '# /flow', text: 'x' };
writeData(fx, 'required-steps.json', bad);
r = run(fx, '--only', 'required-steps');
expect('A8 krok z dwoma rodzajami dopasowania => exit 1', r.code === 1 && has(r, /dokładnie jedno z pól heading \| line \| text/), r.out);
bad.files[0].steps[0] = { id: 'zły regex', line: '(' };
writeData(fx, 'required-steps.json', bad);
expect('A9 zły regex w `line` => exit 1', run(fx, '--only', 'required-steps').code === 1);

fx = good();
fs.rmSync(path.join(fx.data, 'required-steps.json'));
r = run(fx, '--only', 'required-steps');
expect('A10 brak pliku danych => exit 1 (nie cichy sukces)', r.code === 1 && has(r, /brak pliku danych required-steps\.json/), r.out);
writeData(fx, 'required-steps.json', '{ to nie jest json');
expect('A11 zepsuty JSON => exit 1', run(fx, '--only', 'required-steps').code === 1);

// ── B. pins ──────────────────────────────────────────────────────────────────

fx = good();
expect('B1 piny i mentions na stanie poprawnym => exit 0', run(fx, '--only', 'pins').code === 0, run(fx, '--only', 'pins').out);

fx = good();
edit(fx, 'agents/verifier.md', (t) => t.replace('unverified_scope', 'unverified'));
r = run(fx, '--only', 'pins');
expect('B2 brak tokenu pola => exit 1 z nazwą tokenu i pliku', r.code === 1 && has(r, /agents\/verifier\.md: brakuje tokenu „unverified_scope"/) && has(r, /Napraw:/), r.out);

fx = good();
edit(fx, 'agents/verifier.md', (t) => t.replace('<!-- fragment:evidence-kernel END -->', ''));
r = run(fx, '--only', 'pins');
expect('B3 brak markera END fragmentu => exit 1', r.code === 1 && has(r, /brakuje tokenu „<!-- fragment:evidence-kernel END -->"/), r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('ESCALATE_HALT', 'escalate_halt'));
expect('B4 token jest czuły na wielkość liter (marker, nie proza)', run(fx, '--only', 'pins').code === 1);

fx = good();
const ghostPins = JSON.parse(JSON.stringify(PINS));
ghostPins.pins.push({ files: ['agents/nie-ma.md'], tokens: ['x'], why: 'plik, którego nie ma w repo' });
writeData(fx, 'pins.json', ghostPins);
r = run(fx, '--only', 'pins');
expect('B5 plik z listy nie istnieje => exit 1', r.code === 1 && has(r, /agents\/nie-ma\.md: plik z listy nie istnieje/), r.out);

fx = good();
const prose = JSON.parse(JSON.stringify(PINS));
prose.pins.push({ files: ['commands/flow.md'], tokens: ['Obejście bramki jest zabronione.'], why: 'próba przypięcia zdania prozy' });
writeData(fx, 'pins.json', prose);
r = run(fx, '--only', 'pins');
expect('B6 token-zdanie jest odrzucone (nie pinujemy prozy) i wskazuje `mentions`', r.code === 1 && has(r, /wygląda na zdanie prozy/) && has(r, /mentions/), r.out);

fx = good();
const noWhy = JSON.parse(JSON.stringify(PINS));
delete noWhy.pins[0].why;
writeData(fx, 'pins.json', noWhy);
expect('B7 pin bez `why` => exit 1', run(fx, '--only', 'pins').code === 1);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('Nigdy nie dopisuj `done_layers` ręcznie. Obejście bramki jest zabronione.', 'RĘCZNE dopisywanie warstwy do DONE_LAYERS — NIE WOLNO, ręcznie tego nie rób.'));
r = run(fx, '--only', 'pins');
expect('B8 mentions: parafraza z innymi słowami i inną wielkością liter NIE psuje', r.code === 0, r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('Nigdy nie dopisuj `done_layers` ręcznie. Obejście bramki jest zabronione.', 'Obejście bramki jest zabronione.'));
r = run(fx, '--only', 'pins');
expect('B9 mentions: usunięta reguła => exit 1, nazwa reguły i słowa kluczowe w komunikacie',
  r.code === 1 && has(r, /reguła „flow: nie dopisuj done_layers ręcznie" zniknęła/) && has(r, /done_layers/), r.out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('Nigdy nie dopisuj `done_layers` ręcznie.', 'Nigdy nie ruszaj bramki. Pole `done_layers` bywa wpisywane ręcznie.'));
r = run(fx, '--only', 'pins');
expect('B10 mentions scope=sentence: słowa rozbite na dwa zdania => exit 1', r.code === 1 && has(r, /zniknęła/), r.out);
const paragraphScope = JSON.parse(JSON.stringify(PINS));
paragraphScope.mentions[0].scope = 'paragraph';
writeData(fx, 'pins.json', paragraphScope);
expect('B11 ten sam tekst przy scope=paragraph => exit 0', run(fx, '--only', 'pins').code === 0);

fx = good();
const shortMention = JSON.parse(JSON.stringify(PINS));
shortMention.mentions[0].all = ['jedno'];
writeData(fx, 'pins.json', shortMention);
expect('B12 mentions z jednym słowem kluczowym => exit 1 (współwystępowanie wymaga >= 2)', run(fx, '--only', 'pins').code === 1);

// ── C. archaeology ───────────────────────────────────────────────────────────

fx = good();
r = run(fx, '--only', 'archaeology');
expect('C1 fixture bez archeologii (kod, URL, ID reguł, Changelog, vendor, README, „incident response") => exit 0', r.code === 0, r.out);
const bl0 = JSON.parse(fs.readFileSync(path.join(fx.data, 'archaeology-baseline.json'), 'utf8'));
expect('C2 baseline czystego stanu ma 0 trafień i puste `files`', bl0.total === 0 && Object.keys(bl0.files).length === 0, JSON.stringify(bl0));

fx = good();
edit(fx, 'agents/verifier.md', (t) => t.replace('Zwraca', 'Naprawa z #1234. Zwraca'));
r = run(fx, '--only', 'archaeology');
expect('C3 nowe trafienie #1234 w pliku bez wpisu baseline => exit 1 „NOWY plik" z linią i poprawką',
  r.code === 1 && has(r, /NOWY plik z trafieniami: agents\/verifier\.md — 1/) && has(r, /linia \d+: \[numer #NNN\] #1234/) && has(r, /Napraw:/), r.out);

const KINDS = [
  ['PR #N', 'Zmiana z PR #42.'],
  ['issue #N', 'Zgłoszone w issue #7.'],
  ['incydent', 'Naprawa po incydencie na produkcji.'],
  ['incident (narracja)', '(Incident: pad bramki w projekcie X.)'],
  ['post-mortem z …', 'Post-mortem z ostatniego tygodnia.'],
  ['regresja z datą', 'Regresja z 2026-05-06 wróciła.'],
  ['data ISO', 'Zmieniono 2026-07-08 po przeglądzie.'],
];
for (const [kind, text] of KINDS) {
  fx = good();
  edit(fx, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', text));
  r = run(fx, '--only', 'archaeology');
  expect(`C4 rodzaj trafienia „${kind}" jest wykrywany`, r.code === 1 && r.out.includes(`[${kind}]`), r.out);
}

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.',
  'Production incident i incident response to opis domeny. Komenda /incident. Reguła ORC-123, ANL-045, TASK-GSTACK-ADOPT-001. Kolor #001529 i #fff.'));
expect('C5 ID reguł, „incident response", /incident i kolory hex NIE są trafieniem', run(fx, '--only', 'archaeology').code === 0, run(fx, '--only', 'archaeology').out);

fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('## Po changelogu', '## Po changelogu\n\nData spoza historii: 2026-09-09.'));
r = run(fx, '--only', 'archaeology');
expect('C6 data ISO w sekcji PO Changelogu (nagłówek tego samego poziomu zamyka zwolnienie) => exit 1', r.code === 1 && has(r, /\[data ISO\] 2026-09-09/), r.out);

fx = good();
put(fx, 'skills/marketing/vendored/extra.md', 'Dalsze PR #5555.\n');
put(fx, 'skills/legal/UPSTREAM_VERSION', 'v1\n');
put(fx, 'skills/legal/sub/SKILL.md', 'PR #6666\n');
put(fx, 'skills/quality/nested/UPSTREAM_VERSION', 'v1\n');
put(fx, 'skills/quality/nested/SKILL.md', 'PR #7777\n');
expect('C7 drzewa vendorowane (marketing/legal i każdy katalog z UPSTREAM_VERSION) nie są skanowane', run(fx, '--only', 'archaeology').code === 0, run(fx, '--only', 'archaeology').out);

fx = good();
put(fx, 'patterns/demo/demo-pattern_summary.md', '# karta\n- **D1** — z incydentu (2026-01-01).\n');
put(fx, 'templates/fragments/kernel.md', 'Z PR #88.\n');
r = run(fx, '--only', 'archaeology');
expect('C8 karty reguł (_summary.md) i templates/fragments/ SĄ skanowane',
  r.code === 1 && has(r, /NOWY plik z trafieniami: patterns\/demo\/demo-pattern_summary\.md/) && has(r, /NOWY plik z trafieniami: templates\/fragments\/kernel\.md/), r.out);

// ratchet: baseline z dwoma trafieniami
function withTwoHits() {
  const f = good();
  edit(f, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', 'Zmiana z PR #42 oraz issue #7.'));
  const c = run(f, '--capture', '--allow-growth');
  return { f, c };
}
let two = withTwoHits();
expect('C9 --capture zapisuje 2 trafienia per plik', two.c.code === 0 && JSON.parse(fs.readFileSync(path.join(two.f.data, 'archaeology-baseline.json'), 'utf8')).files['commands/flow.md'] === 2, two.c.out);
expect('C10 po --capture stan przechodzi (istniejący dług jest policzony, nie ukryty)', run(two.f, '--only', 'archaeology').code === 0);

edit(two.f, 'commands/flow.md', (t) => t.replace('oraz issue #7.', 'oraz issue #7 i PR #99.'));
r = run(two.f, '--only', 'archaeology');
expect('C11 wzrost 2 -> 3 => exit 1 „WZROST", baseline nie rośnie przez --capture', r.code === 1 && has(r, /WZROST trafień: commands\/flow\.md — 3 > 2/), r.out);

edit(two.f, 'commands/flow.md', (t) => t.replace('oraz issue #7 i PR #99.', 'oraz sprzątnięte.'));
r = run(two.f, '--only', 'archaeology');
expect('C12 spadek 2 -> 1 => exit 1 „SPADEK" z poleceniem obniżenia baseline', r.code === 1 && has(r, /SPADEK trafień: commands\/flow\.md — 1 < 2/) && has(r, /obniż baseline/) && has(r, /--capture/), r.out);
expect('C13 --capture obniża baseline, potem exit 0', run(two.f, '--capture').code === 0 && run(two.f, '--only', 'archaeology').code === 0);

two = withTwoHits();
edit(two.f, 'commands/flow.md', (t) => t.replace('Zmiana z PR #42 oraz issue #7.', 'Czysto.'));
r = run(two.f, '--only', 'archaeology');
expect('C14 plik z baseline bez trafień = martwy wpis baseline => exit 1', r.code === 1 && has(r, /martwy wpis baseline: commands\/flow\.md/) && has(r, /plik nie ma już trafień/), r.out);

two = withTwoHits();
fs.rmSync(path.join(two.f.root, 'commands/flow.md'));
r = run(two.f, '--only', 'archaeology');
expect('C15 plik z baseline usunięty z repo => martwy wpis baseline', r.code === 1 && has(r, /martwy wpis baseline: commands\/flow\.md/) && has(r, /pliku nie ma w skanie/), r.out);

two = withTwoHits();
const cap1 = fs.readFileSync(path.join(two.f.data, 'archaeology-baseline.json'), 'utf8');
run(two.f, '--capture');
expect('C16 dwa --capture dają bajtowo ten sam plik (determinizm)', cap1 === fs.readFileSync(path.join(two.f.data, 'archaeology-baseline.json'), 'utf8'));

fx = good();
fs.rmSync(path.join(fx.data, 'archaeology-baseline.json'));
r = run(fx, '--only', 'archaeology');
expect('C17 brak baseline => exit 1 z podpowiedzią --capture', r.code === 1 && has(r, /brak pliku danych archaeology-baseline\.json/) && has(r, /--capture/), r.out);
writeData(fx, 'archaeology-baseline.json', { schema: 1, files: { 'a.md': -1 } });
expect('C18 baseline o złym kształcie => exit 1', run(fx, '--only', 'archaeology').code === 1);

// allowlista
function withHitAndAllow(entry) {
  const f = good();
  edit(f, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', 'Przykład: /flow --since=2026-04-01 dla odcięcia.'));
  writeData(f, 'archaeology-allowlist.json', { schema: 1, entries: entry ? [entry] : [] });
  return f;
}
fx = withHitAndAllow({ file: 'commands/flow.md', match: '--since=2026-04-01', reason: OK_REASON });
r = run(fx, '--capture', '--allow-growth');
const blAllow = JSON.parse(fs.readFileSync(path.join(fx.data, 'archaeology-baseline.json'), 'utf8'));
expect('C19 poprawny wpis allowlisty wycisza trafienie (nie trafia do baseline) i stan przechodzi',
  r.code === 0 && blAllow.total === 0 && run(fx, '--only', 'archaeology').code === 0, r.out);

fx = withHitAndAllow({ file: 'commands/flow.md', match: '--since=2026-04-01' });
r = run(fx, '--only', 'archaeology');
expect('C20 wpis allowlisty BEZ powodu => exit 1 (reason >= 10 znaków)', r.code === 1 && has(r, /brak powodu/) && has(r, /reason/), r.out);

fx = withHitAndAllow({ file: 'commands/flow.md', match: '--since=2026-04-01', reason: 'krótko' });
expect('C21 wpis allowlisty z za krótkim powodem => exit 1', run(fx, '--only', 'archaeology').code === 1);

fx = withHitAndAllow({ file: 'commands/flow.md', match: 'fraza której nie ma w żadnej linii', reason: OK_REASON });
r = run(fx, '--only', 'archaeology');
expect('C22 wpis allowlisty niedopasowany do niczego => exit 1 „martwy wpis allowlisty"', r.code === 1 && has(r, /martwy wpis — commands\/flow\.md/), r.out);

fx = withHitAndAllow({ file: 'commands/nie-ma.md', match: '--since=2026-04-01', reason: OK_REASON });
r = run(fx, '--only', 'archaeology');
expect('C23 wpis allowlisty dla pliku spoza skanu => exit 1', r.code === 1 && has(r, /wpis dla pliku spoza skanu: commands\/nie-ma\.md/), r.out);

fx = withHitAndAllow({ file: 'commands/flow.md', match: '#', reason: OK_REASON });
expect('C24 `match` krótszy niż 4 znaki => exit 1 (nie wolno wyciszać hurtem)', run(fx, '--only', 'archaeology').code === 1);

fx = withHitAndAllow({ file: 'commands/flow.md', match: '--since=2026-04-01' });
const before = fs.existsSync(path.join(fx.data, 'archaeology-baseline.json')) ? fs.readFileSync(path.join(fx.data, 'archaeology-baseline.json'), 'utf8') : null;
r = run(fx, '--capture');
expect('C25 --capture odmawia przy zepsutej allowliście i nie rusza baseline', r.code === 1 && before === fs.readFileSync(path.join(fx.data, 'archaeology-baseline.json'), 'utf8'), r.out);

fx = withHitAndAllow({ file: 'commands/flow.md', match: '--since=2026-04-01', reason: OK_REASON });
r = run(fx, '--list');
expect('C26 --list wypisuje plik:linia trafień (po allowliście: 0)', r.code === 0 && /razem 0 trafień/.test(r.out), r.out);
fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', 'PR #42.'));
expect('C27 --list pokazuje trafienie w formacie plik:linia', /commands\/flow\.md:\d+: \[PR #N\] PR #42/.test(run(fx, '--list').out));

// ── F. poprawki po przeglądzie ───────────────────────────────────────────────

const mentionData = (file, scope, all) => ({ schema: 1, pins: [], mentions: [{ id: 'reguła testowa', file, scope, all, why: 'reguła testowa evala jednostek' }] });
const pinsOnly = (fx, data) => writeData(fx, 'pins.json', data);

// F1. prawdziwy orchestrate.md: usunięcie prozy kroku 4 (albo 5) musi zaczerwienić reguły mimo wiersza ORC-139 w tabeli
{
  const realPins = JSON.parse(fs.readFileSync(path.join(__dirname, 'pins.json'), 'utf8'));
  const realOrch = fs.readFileSync(path.join(REPO, 'commands', 'orchestrate.md'), 'utf8');
  const orchMentions = realPins.mentions.filter((m) => m.file === 'commands/orchestrate.md');
  const stepRange = (text, from, to) => {
    const ls = text.split('\n');
    const i = ls.findIndex((l) => from.test(l));
    const j = ls.findIndex((l) => to.test(l));
    return { ls, i, j };
  };
  const setup = (text) => {
    const f = good();
    put(f, 'commands/orchestrate.md', text);
    writeData(f, 'pins.json', { schema: 1, pins: [], mentions: orchMentions });
    return f;
  };
  const ids = (re) => orchMentions.filter((m) => re.test(m.id)).map((m) => m.id);
  const step4 = ids(/tree-hash => NIE staguj|exit 2 = GO nieaktualne|wznowienie po nieaktualnym GO/);
  const step5 = ids(/cause=code/);
  expect('F1 ustawienie: prawdziwy orchestrate.md ma wszystkie reguły mentions (4 w kroku 4, 1 w kroku 5)', step4.length === 3 && step5.length === 1, JSON.stringify(orchMentions.map((m) => m.id)));

  fx = setup(realOrch);
  r = run(fx, '--only', 'pins');
  expect('F1a niezmieniony orchestrate.md => reguły mentions zielone', r.code === 0, r.out);

  const s4 = stepRange(realOrch, /^4\. wyjście/, /^5\. zgłoszenie odstępstw/);
  const without4 = [...s4.ls.slice(0, s4.i + 1), ...s4.ls.slice(s4.j)].join('\n');
  fx = setup(without4);
  r = run(fx, '--only', 'pins');
  expect('F1b wiersz ORC-139 został w tabeli (test jest sensowny)', /\| ORC-139 \|/.test(without4) && /orchestrate-tree-hash/.test(without4));
  expect('F1c usunięta proza kroku 4 => KAŻDA z trzech reguł kroku 4 czerwona mimo wiersza ORC-139',
    r.code === 1 && step4.every((id) => r.out.includes(`reguła „${id}" zniknęła`)), r.out);

  const s5 = stepRange(realOrch, /^5\. zgłoszenie odstępstw/, /^6\. zalążek wpisu/);
  const without5 = [...s5.ls.slice(0, s5.i + 1), ...s5.ls.slice(s5.j)].join('\n');
  fx = setup(without5);
  r = run(fx, '--only', 'pins');
  expect('F1d usunięta proza kroku 5 => reguła cause=code czerwona', r.code === 1 && r.out.includes(`reguła „${step5[0]}" zniknęła`), r.out);
}

// F2. jednostki i limit długości
fx = good();
put(fx, 'commands/flow.md', `${FM_FLOW}\n| a | alfa bravo |\n| b | charlie delta |\n`);
pinsOnly(fx, mentionData('commands/flow.md', 'sentence', ['alfa', 'charlie']));
r = run(fx, '--only', 'pins');
expect('F2a słowa w DWÓCH wierszach tabeli nie spełniają reguły (wiersz = osobna jednostka)', r.code === 1 && has(r, /zniknęła/), r.out);
put(fx, 'commands/flow.md', `${FM_FLOW}\n| a | alfa bravo charlie |\n`);
expect('F2b te same słowa w JEDNYM wierszu tabeli => OK', run(fx, '--only', 'pins').code === 0);

put(fx, 'commands/flow.md', `${FM_FLOW}\n\`\`\`\n1. krok alfa\n2. krok charlie\n\`\`\`\n`);
pinsOnly(fx, mentionData('commands/flow.md', 'paragraph', ['alfa', 'charlie']));
r = run(fx, '--only', 'pins');
expect('F2c dwa kroki diagramu w bloku kodu to osobne jednostki, także przy scope=paragraph', r.code === 1 && has(r, /zniknęła/), r.out);

put(fx, 'commands/flow.md', `${FM_FLOW}\n| a | alfa ${'x'.repeat(700)} charlie |\n`);
pinsOnly(fx, mentionData('commands/flow.md', 'sentence', ['alfa', 'charlie']));
r = run(fx, '--only', 'pins');
expect('F2d słowa tylko w jednostce > 600 znaków => błąd konfiguracji z długością i poprawką (nie cicha bezzębność)',
  r.code === 1 && has(r, /błąd konfiguracji/) && has(r, /limit 600/) && has(r, /Napraw:/), r.out);

put(fx, 'commands/flow.md', `${FM_FLOW}\nAlfa stoi w tym zdaniu. Charlie stoi w kolejnym zdaniu.\n`);
expect('F2e scope=sentence: słowa w sąsiednich zdaniach => czerwone', run(fx, '--only', 'pins').code === 1);
pinsOnly(fx, mentionData('commands/flow.md', 'paragraph', ['alfa', 'charlie']));
expect('F2f ten sam tekst przy scope=paragraph => zielony', run(fx, '--only', 'pins').code === 0);

// F3. --capture nie podnosi baseline
{
  const f = good();
  edit(f, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', 'Zmiana z PR #42 oraz issue #7.'));
  expect('F3a pierwszy baseline z trafieniami bez --allow-growth => odmowa (exit 1, lista plików, brak pliku baseline zmienionego)',
    (() => { fs.rmSync(path.join(f.data, 'archaeology-baseline.json')); const x = run(f, '--capture'); return x.code === 1 && /commands\/flow\.md: 0 → 2/.test(x.out) && /uzasadnienia w review/.test(x.out) && !fs.existsSync(path.join(f.data, 'archaeology-baseline.json')); })());
  expect('F3b --capture --allow-growth przyjmuje wzrost', run(f, '--capture', '--allow-growth').code === 0 && run(f, '--only', 'archaeology').code === 0);
  const bl = () => JSON.parse(fs.readFileSync(path.join(f.data, 'archaeology-baseline.json'), 'utf8'));

  edit(f, 'commands/flow.md', (t) => t.replace('oraz issue #7.', 'oraz issue #7 i PR #99.'));
  const before3 = fs.readFileSync(path.join(f.data, 'archaeology-baseline.json'), 'utf8');
  r = run(f, '--capture');
  expect('F3c wzrost w istniejącym pliku (2 → 3) => --capture odmawia i nie rusza baseline', r.code === 1 && /commands\/flow\.md: 2 → 3/.test(r.out) && before3 === fs.readFileSync(path.join(f.data, 'archaeology-baseline.json'), 'utf8'), r.out);

  put(f, 'agents/verifier.md', fs.readFileSync(path.join(f.root, 'agents/verifier.md'), 'utf8') + '\nNaprawa z PR #5.\n');
  r = run(f, '--capture');
  expect('F3d nowy plik z trafieniami => odmowa i obie pozycje na liście', r.code === 1 && /agents\/verifier\.md: 0 → 1/.test(r.out) && /commands\/flow\.md: 2 → 3/.test(r.out), r.out);

  r = run(f, '--capture', '--allow-growth');
  expect('F3e --allow-growth zapisuje wzrost', r.code === 0 && bl().files['commands/flow.md'] === 3 && bl().files['agents/verifier.md'] === 1, r.out);

  edit(f, 'commands/flow.md', (t) => t.replace('oraz issue #7 i PR #99.', 'oraz sprzątnięte.'));
  fs.rmSync(path.join(f.root, 'agents/verifier.md'));
  put(f, 'agents/verifier.md', '---\nname: verifier\ndescription: Demo\n---\n# V\n');
  r = run(f, '--capture');
  expect('F3f spadki i usunięcia są przechwytywane BEZ flagi', r.code === 0 && bl().files['commands/flow.md'] === 1 && bl().files['agents/verifier.md'] === undefined, r.out);
}
expect('F3g --allow-growth bez --capture => exit 2', run(good(), '--allow-growth').code === 2);

// F4. nagłówek: granica nazwy i wcięcie
const RAPORT = { schema: 1, files: [{ file: 'commands/flow.md', steps: [{ id: 'Raport', heading: '## Raport' }] }] };
const headingCase = (body) => { const f = good(); put(f, 'commands/flow.md', `${FM_FLOW}\n${body}\n`); writeData(f, 'required-steps.json', RAPORT); return run(f, '--only', 'required-steps'); };
expect('F4a „## Raport” NIE pasuje do „## Raportowanie” => czerwone', headingCase('## Raportowanie\n\nTreść.').code === 1);
expect('F4b „## Raport” pasuje do końca linii', headingCase('## Raport').code === 0);
expect('F4c „## Raport” pasuje przed spacją, dwukropkiem i nawiasem', headingCase('## Raport: wynik').code === 0 && headingCase('## Raport (krótki)').code === 0);
expect('F4d nagłówek wcięty o 4 spacje to blok kodu => nie liczy się', headingCase('    ## Raport').code === 1);
expect('F4e nagłówek wcięty o 3 spacje jest nagłówkiem', headingCase('   ## Raport').code === 0);
expect('F4f nagłówek wcięty tabulatorem to kod => nie liczy się', headingCase('\t## Raport').code === 1);

// F5. ogrodzenia
expect('F5a nagłówek wewnątrz bloku z 4 backtickami, który zawiera linie ```, nie liczy się; ten po zamknięciu liczy się',
  (() => {
    const f = good();
    put(f, 'commands/flow.md', `${FM_FLOW}\n\`\`\`\`markdown\n\`\`\`bash\nx\n\`\`\`\n## Raport\n\`\`\`\`\n`);
    writeData(f, 'required-steps.json', RAPORT);
    const inside = run(f, '--only', 'required-steps');
    put(f, 'commands/flow.md', `${FM_FLOW}\n\`\`\`\`markdown\n\`\`\`bash\nx\n\`\`\`\n\`\`\`\`\n## Raport\n`);
    const after = run(f, '--only', 'required-steps');
    return inside.code === 1 && after.code === 0;
  })());
expect('F5b ogrodzenie z info-stringem nie zamyka bloku; krótsze ogrodzenie też nie',
  (() => {
    const f = good();
    put(f, 'commands/flow.md', `${FM_FLOW}\n\`\`\`\`\n\`\`\`js\n## Raport\n\`\`\`\n`);
    writeData(f, 'required-steps.json', RAPORT);
    return run(f, '--only', 'required-steps').code === 1;
  })());
fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', '````markdown\n```bash\nx\n```\nZmiana z PR #77 w bloku kodu.\n````\n\nCzysto.'));
run(fx, '--capture', '--allow-growth');
expect('F5c archeologia: tekst po wewnętrznym ``` w bloku z 4 backtickami jest nadal kodem (brak trafienia)', run(fx, '--list').out.includes('razem 0 trafień'), run(fx, '--list').out);
fx = good();
edit(fx, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', '```\nx\n```js\nZmiana z PR #78 po rzekomym zamknięciu.\n```\n\nCzysto.'));
expect('F5d ogrodzenie z info-stringem nie zamyka bloku (a tekst do prawdziwego zamknięcia jest kodem)', run(fx, '--list').out.includes('razem 0 trafień'), run(fx, '--list').out);

// F6. kolory CSS vs numery issue
const hits = (line) => { const f = good(); edit(f, 'commands/flow.md', (t) => t.replace('Zwykła sekcja bez dat i numerów.', line)); return /razem [1-9]\d* trafień/.test(run(f, '--list').out); };
for (const line of ['p { color: #333; }', 'tło: background:#000 reszta', 'to jest <rect fill="#123" />', 'Kolor #123 dla tła', 'h1 {margin:0;border:1px solid #444}', 'stroke #1234']) {
  expect(`F6 kolor nie jest trafieniem: ${line}`, !hits(line), run(good(), '--list').out);
}
for (const line of ['Zobacz issue #123.', 'Naprawa (#123).', 'Zob.: #4321 w trackerze.', 'Fixes #1234', 'Zobacz issue #123 o kolorze tła', 'Kolor tła: #12345 jest numerem zgłoszenia']) {
  expect(`F6 numer issue JEST trafieniem: ${line}`, hits(line));
}

// F7. granice słów
const wordCase = (text, all, scope = 'sentence') => { const f = good(); put(f, 'commands/flow.md', `${FM_FLOW}\n${text}\n`); pinsOnly(f, mentionData('commands/flow.md', scope, all)); return run(f, '--only', 'pins').code === 0; };
expect('F7a „never” nie pasuje do „Whenever”', !wordCase('Whenever the agent runs, it pushes.', ['never', 'push*']));
expect('F7b „commit” nie pasuje do „uncommitted”', !wordCase('Never touch uncommitted work, never push.', ['never', 'commit', 'push']));
expect('F7c przedrostek „commit*” pasuje do „commits”, ale nie do „uncommitted”', wordCase('Never commits, never pushes.', ['never', 'commit*', 'push*']) && !wordCase('Never touch uncommitted work.', ['never', 'commit*']));
expect('F7d diakrytyki: „człowiek” nie pasuje do „człowieka”, „człowiek*” pasuje', !wordCase('Pyta człowieka o zgodę.', ['pyta', 'człowiek']) && wordCase('Pyta człowieka o zgodę.', ['pyta', 'człowiek*']));
expect('F7e diakrytyk na granicy: „ręcznie” w „ręcznie.” pasuje, „cznie” nie', wordCase('Nigdy nie rób tego ręcznie.', ['nigdy', 'ręcznie']) && !wordCase('Nigdy nie rób tego ręcznie.', ['nigdy', 'cznie']));
expect('F7f słowo kluczowe z myślnikiem i podkreśleniem: „one-way”, „layers_done”', wordCase('Decyzja one-way zapisuje layers_done.', ['one-way', 'layers_done']));

// F8. pin w kontekście kodu + pin patterns
const codeCase = (body, extra = {}) => { const f = good(); put(f, 'agents/verifier.md', `${FM_FLOW}\n${body}\n`); pinsOnly(f, { schema: 1, pins: [{ files: ['agents/verifier.md'], tokens: ['unverified_scope'], context: 'code', min_count: 2, why: 'pole luki pokrycia czytane przez skrypt', ...extra }] }); return run(f, '--only', 'pins'); };
expect('F8a token tylko w prozie nie spełnia pinu context=code', codeCase('Raportuj unverified_scope w prozie. Znowu unverified_scope w prozie.').code === 1);
expect('F8b dwa spany `…` spełniają pin', codeCase('Pole `unverified_scope` i `unverified_scope:` w gwardzie.').code === 0);
expect('F8c jeden span to za mało przy min_count=2 (komunikat podaje liczbę)', (() => { const x = codeCase('Pole `unverified_scope` i unverified_scope w prozie.'); return x.code === 1 && /występuje 1×, a wymagane jest 2×/.test(x.out); })());
expect('F8d wiersz tabeli i blok kodu liczą się jako kod', codeCase('| pole | unverified_scope |\n\n```\nunverified_scope: []\n```').code === 0);
expect('F8e context spoza any|code => exit 1', codeCase('`unverified_scope` `unverified_scope`', { context: 'xyz' }).code === 1);
{
  const f = good();
  put(f, 'scripts/schema.mjs', "const S = {\n  required: ['verdict'],\n  verdict: { type: 'string' },\n};\n");
  pinsOnly(f, { schema: 1, pins: [{ files: ['scripts/schema.mjs'], patterns: ["^\\s*required: \\['verdict'\\]", '^\\s*verdict: \\{'], why: 'schemat StructuredOutput czytany przez skrypt' }] });
  expect('F8f pin `patterns` zielony, gdy linie schematu są', run(f, '--only', 'pins').code === 0);
  put(f, 'scripts/schema.mjs', "const S = {\n  verdict: { type: 'string' },\n};\n");
  r = run(f, '--only', 'pins');
  expect('F8g pin `patterns` czerwony po usunięciu linii z `required` (komunikat z regexem)', r.code === 1 && has(r, /brak linii pasującej do \/\^\\s\*required/), r.out);
}

// ── D. CLI ───────────────────────────────────────────────────────────────────

fx = good();
writeData(fx, 'pins.json', '{ zepsute');
expect('D1 --only archaeology nie dotyka zepsutego pins.json (części są niezależne)', run(fx, '--only', 'archaeology').code === 0);
expect('D2 bez --only zepsuty pins.json => exit 1', run(fx).code === 1);
expect('D3 --only z nieznaną częścią => exit 2', run(fx, '--only', 'cokolwiek').code === 2);
expect('D4 nieznany argument => exit 2', run(fx, '--wat').code === 2);
expect('D5 --capture razem z --only pins => exit 2', run(fx, '--capture', '--only', 'pins').code === 2);
expect('D6 --only bez wartości => exit 2', run(fx, '--only').code === 2);

// ── E. prawdziwe repo ────────────────────────────────────────────────────────

const t0 = Date.now();
const real = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
const elapsed = Date.now() - t0;
expect('E1 prawdziwe repo bez flag => exit 0', real.status === 0, `${real.stdout}${real.stderr}`.slice(0, 800));
expect('E2 prawdziwe repo mieści się w 1 s', elapsed < 1000, `${elapsed} ms`);
for (const part of ['required-steps', 'pins', 'archaeology']) {
  const p = spawnSync('node', [SCRIPT, '--only', part], { encoding: 'utf8' });
  expect(`E3 prawdziwe repo --only ${part} => exit 0`, p.status === 0, `${p.stdout}${p.stderr}`.slice(0, 800));
}

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  process.stdout.write(`  ${c.ok ? '✅' : '❌'} ${c.label}${c.ok || !c.detail ? '' : `\n      ${String(c.detail).replace(/\n/g, '\n      ')}`}\n`);
}
fs.rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`\n${checks.length - failed}/${checks.length} passed\n`);
process.exit(failed ? 1 : 0);
