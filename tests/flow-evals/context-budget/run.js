#!/usr/bin/env node
/**
 * tests/flow-evals/context-budget/run.js — eval L1 dla scripts/context-bill.mjs (TASK-GSTACK-ADOPT-001, A4).
 *
 * DLACZEGO: 91% rachunku to kontekst, a kontekst stały rośnie po cichu — każdy nowy agent/skill/komenda
 * dokłada swój opis do katalogu każdej sesji. Ratchet ma to łapać przed commitem, ale ratchet, który
 * nigdy nie failuje (albo failuje zawsze), jest gorszy niż brak. Test DWUKIERUNKOWY: stan poprawny
 * przechodzi, a każdy rodzaj naruszenia (nowy element, katalog ponad sufitem, ciało ponad sufitem,
 * suma ponad sufitem) failuje z komunikatem „co/gdzie/jak naprawić".
 *
 * Wszystko w katalogu tymczasowym (--root / --ceilings): prawdziwe agents/skills/commands i prawdziwy
 * ceilings.json nie są dotykane. Prawdziwe repo służy tylko do pomiaru czasu (<1 s) i determinizmu.
 *
 * Kontrakty:
 *   1. pomiar: katalog = bajty name+description (UTF-8, także blokowy skalar YAML), ciało = bajty po frontmatterze;
 *      README.md w agents/ i commands/ nie jest elementem
 *   2. --capture zapisuje baseline; zaraz potem --check przechodzi (stan poprawny)
 *   3. wzrost w marginesie 5% przechodzi; ponad marginesem failuje (osobno katalog i ciało)
 *   4. nowy element bez sufitu failuje; po --capture przechodzi (legalna ścieżka wzrostu)
 *   5. element usunięty z repo = ostrzeżenie (exit 0); --capture sprząta wpis
 *   6. sufit sumaryczny katalogu failuje niezależnie od sufitów per element
 *   7. zepsuty frontmatter, brak/zepsuty ceilings.json, błędne argumenty = jawny błąd, nie cichy sukces
 *   8. determinizm: dwa przebiegi dają bajtowo ten sam wynik; remis w rankingu rozstrzyga ścieżka
 *
 * Uruchom: node tests/flow-evals/context-budget/run.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const BILL = path.join(REPO, 'scripts', 'context-bill.mjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-context-budget-'));
const write = (rel, content) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const CEIL = path.join(root, 'ceilings.json');
const bill = (...args) => spawnSync('node', [BILL, '--root', root, '--ceilings', CEIL, ...args], { encoding: 'utf8' });
const out = (r) => `${r.stdout || ''}${r.stderr || ''}`;
const ceilings = () => JSON.parse(fs.readFileSync(CEIL, 'utf8'));
const saveCeilings = (c) => fs.writeFileSync(CEIL, JSON.stringify(c, null, 2));
const bytes = (s) => Buffer.byteLength(s, 'utf8');

const BODY_1000 = 'x'.repeat(1000);
const agent = (name, desc, body) => `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`;

function resetFixture() {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  // „ą" i „ż" mają po 2 bajty w UTF-8 — pomiar ma być w bajtach, nie w znakach
  write('agents/universal/alpha.md', agent('alpha', 'Opis agenta alfa z polskimi znakami ąż', BODY_1000));
  write('agents/stacks/s1/beta.md', agent('beta', 'Opis beta', 'b'.repeat(500)));
  write('agents/README.md', '# katalog agentów — bez frontmattera, nie jest elementem\n');
  write('skills/cat/gamma/SKILL.md', '---\nname: gamma\ndescription: |\n  Linia pierwsza\n  linia druga\n---\n' + 'g'.repeat(2000));
  write('commands/delta.md', agent('delta', 'Komenda delta', 'd'.repeat(300)));
  write('commands/README.md', '# README komend — pomijany\n');
}

const checks = [];
const expect = (label, cond, detail) => checks.push({ label, ok: Boolean(cond), detail });

// ── 1. pomiar ────────────────────────────────────────────────────────────────
resetFixture();
let r = bill('--json');
let j;
try { j = JSON.parse(r.stdout); } catch { j = null; }
expect('raport --json to poprawny JSON, exit 0', r.status === 0 && j, out(r).slice(0, 300));
const item = (p) => j && j.items.find((i) => i.path === p);
expect('bez README: 4 elementy (2 agenci, skill, komenda)', j && j.items.length === 4 && j.totals.count === 4, j && JSON.stringify(j.items.map((i) => i.path)));
expect('katalog liczony w bajtach UTF-8 (name+description)',
  item('agents/universal/alpha.md')?.catalog === bytes('alpha') + bytes('Opis agenta alfa z polskimi znakami ąż'),
  JSON.stringify(item('agents/universal/alpha.md')));
expect('blokowy skalar YAML w description jest zmierzony', item('skills/cat/gamma/SKILL.md')?.catalog === bytes('gamma') + bytes('Linia pierwsza\nlinia druga'), JSON.stringify(item('skills/cat/gamma/SKILL.md')));
expect('ciało = bajty po frontmatterze', item('agents/universal/alpha.md')?.body === 1000 && item('commands/delta.md')?.body === 300, JSON.stringify(j && j.items.map((i) => [i.path, i.body])));
expect('rodzaje elementów rozpoznane', j && j.per_kind.agent.count === 2 && j.per_kind.skill.count === 1 && j.per_kind.command.count === 1);
expect('raport tekstowy zaznacza przybliżenie bajty/4', /bajty\/4/.test(bill().stdout));

// ── 2. stan poprawny ─────────────────────────────────────────────────────────
r = bill('--capture');
expect('--capture: exit 0 i zapisany plik', r.status === 0 && fs.existsSync(CEIL), out(r));
expect('--check na świeżym baseline przechodzi', bill('--check').status === 0, out(bill('--check')));
const baseline = ceilings();
expect('sufit per element = bieżący stan + 5% w górę',
  baseline.items['agents/universal/alpha.md'].body_bytes === Math.ceil(1000 * 1.05)
  && baseline.items['commands/delta.md'].body_bytes === Math.ceil(300 * 1.05), JSON.stringify(baseline.items['agents/universal/alpha.md']));
expect('sufit sumaryczny katalogu zapisany', typeof baseline.totals.catalog_bytes === 'number' && baseline.totals.catalog_bytes > 0);

// ── 3. margines vs przekroczenie ─────────────────────────────────────────────
write('agents/universal/alpha.md', agent('alpha', 'Opis agenta alfa z polskimi znakami ąż', 'x'.repeat(1040))); // +4% ciała
expect('wzrost ciała w marginesie 5% przechodzi', bill('--check').status === 0, out(bill('--check')));
write('agents/universal/alpha.md', agent('alpha', 'Opis agenta alfa z polskimi znakami ąż', 'x'.repeat(1100))); // +10%
r = bill('--check');
expect('ciało ponad sufitem => exit 1, ścieżka i poprawka w komunikacie',
  r.status === 1 && /CIAŁO ponad sufitem: agents\/universal\/alpha\.md/.test(out(r)) && /--capture/.test(out(r)) && /tym samym commicie/.test(out(r)), out(r));

resetFixture();
bill('--capture');
write('agents/universal/alpha.md', agent('alpha', 'Opis agenta alfa z polskimi znakami ąż' + ' dopisek'.repeat(10), BODY_1000));
r = bill('--check');
expect('katalog ponad sufitem => exit 1, wskazuje plik i koszt w każdej sesji',
  r.status === 1 && /KATALOG ponad sufitem: agents\/universal\/alpha\.md/.test(out(r)) && /KAŻDEJ sesji/.test(out(r)), out(r));
expect('zepsuty element nie psuje diagnozy innych (tylko alpha na liście)', !/beta\.md|delta\.md|gamma/.test(out(r).split('Co zrobić')[0]), out(r));

// ── 4. nowy element ──────────────────────────────────────────────────────────
resetFixture();
r = bill('--capture');
write('skills/cat/nowy/SKILL.md', '---\nname: nowy\ndescription: Nowy skill bez sufitu\n---\nciało\n');
r = bill('--check');
expect('nowy element bez sufitu => exit 1', r.status === 1 && /NOWY element bez sufitu: skills\/cat\/nowy\/SKILL\.md/.test(out(r)), out(r));
expect('komunikat błędu uczy legalnej ścieżki (--capture w tym samym commicie)', /--capture/.test(out(r)) && /tym samym commicie/.test(out(r)), out(r));
expect('--capture po dodaniu elementu legalizuje wzrost', bill('--capture').status === 0 && bill('--check').status === 0, out(bill('--check')));
expect('baseline zawiera nowy element', Boolean(ceilings().items['skills/cat/nowy/SKILL.md']));

// ── 5. element usunięty ──────────────────────────────────────────────────────
fs.rmSync(path.join(root, 'commands/delta.md'));
r = bill('--check');
expect('usunięty element wciąż w fixture => OSTRZEŻENIE, exit 0', r.status === 0 && /usunięty z repo, wciąż w fixture: commands\/delta\.md/.test(out(r)), out(r));
bill('--capture');
expect('--capture sprząta usunięty wpis, brak ostrzeżeń', !ceilings().items['commands/delta.md'] && !/usunięty/.test(out(bill('--check'))), out(bill('--check')));

// ── 6. sufit sumaryczny ──────────────────────────────────────────────────────
const c6 = ceilings();
c6.totals.catalog_bytes = 10; // sufity per element nietknięte
saveCeilings(c6);
r = bill('--check');
expect('suma katalogu ponad sufitem => exit 1 mimo sufitów per element OK',
  r.status === 1 && /SUMA katalogu ponad sufitem/.test(out(r)) && !/KATALOG ponad sufitem|CIAŁO ponad|NOWY/.test(out(r)), out(r));

// ── 7. błędy wejścia ─────────────────────────────────────────────────────────
bill('--capture');
write('agents/universal/zepsuty.md', '---\nname: zepsuty\n---\nbez description\n');
r = bill('--check');
expect('frontmatter bez description => exit 1 z nazwą pliku', r.status === 1 && /agents\/universal\/zepsuty\.md/.test(out(r)), out(r));
const before = fs.readFileSync(CEIL, 'utf8');
r = bill('--capture');
expect('--capture odmawia przy niemierzalnym elemencie i nie rusza baseline', r.status === 1 && fs.readFileSync(CEIL, 'utf8') === before, out(r));
fs.rmSync(path.join(root, 'agents/universal/zepsuty.md'));
write('agents/universal/bez-fm.md', 'sam tekst, brak frontmattera\n');
expect('brak frontmattera => exit 1', bill('--check').status === 1);
fs.rmSync(path.join(root, 'agents/universal/bez-fm.md'));

fs.rmSync(CEIL);
r = bill('--check');
expect('brak ceilings.json => exit 1 z podpowiedzią --capture', r.status === 1 && /brak fixture sufitów/.test(out(r)) && /--capture/.test(out(r)), out(r));
fs.writeFileSync(CEIL, '{ to nie jest json');
r = bill('--check');
expect('zepsuty JSON sufitów => exit 1', r.status === 1 && /nie jest poprawnym JSON/.test(out(r)), out(r));
fs.writeFileSync(CEIL, JSON.stringify({ schema: 1, items: {} }));
expect('sufity bez totals => exit 1 (nie przepuszcza po cichu)', bill('--check').status === 1);
expect('nieznany argument => exit 2', bill('--wat').status === 2);
expect('--check razem z --capture => exit 2', bill('--check', '--capture').status === 2);
expect('--top bez poprawnej liczby => exit 2', bill('--top', '0').status === 2);

// ── 8. determinizm i ranking ─────────────────────────────────────────────────
resetFixture();
bill('--capture');
const cap1 = fs.readFileSync(CEIL, 'utf8');
bill('--capture');
expect('dwa --capture dają bajtowo ten sam plik', cap1 === fs.readFileSync(CEIL, 'utf8'));
const paths = Object.keys(JSON.parse(cap1).items);
expect('klucze fixture posortowane po ścieżce', JSON.stringify(paths) === JSON.stringify([...paths].sort()), JSON.stringify(paths));
expect('dwa raporty --json są identyczne', bill('--json').stdout === bill('--json').stdout);
// remis: dwa agenci o identycznym koszcie — kolejność ma zależeć od ścieżki, nie od systemu plików
write('agents/universal/zz-tie.md', agent('tie', 'Opis tie', 'z'.repeat(777)));
write('agents/universal/aa-tie.md', agent('tie', 'Opis tie', 'z'.repeat(777)));
const tie = JSON.parse(bill('--json', '--top', '2').stdout);
const tops = tie.top_body.map((i) => i.path);
expect('--top N ogranicza ranking', tops.length === 2, JSON.stringify(tops));
const full = JSON.parse(bill('--json', '--top', '50').stdout).top_body.filter((i) => i.body === 777).map((i) => i.path);
expect('remis: aa-tie przed zz-tie', JSON.stringify(full) === JSON.stringify(['agents/universal/aa-tie.md', 'agents/universal/zz-tie.md']), JSON.stringify(full));

// ── 9. prawdziwe repo: szybkość i determinizm ────────────────────────────────
const t0 = Date.now();
const real1 = spawnSync('node', [BILL, '--json'], { encoding: 'utf8' });
const elapsed = Date.now() - t0;
const real2 = spawnSync('node', [BILL, '--json'], { encoding: 'utf8' });
expect('pomiar prawdziwego repo < 1 s', real1.status === 0 && elapsed < 1000, `${elapsed} ms; ${(real1.stderr || '').slice(0, 200)}`);
expect('pomiar prawdziwego repo deterministyczny', real1.stdout === real2.stdout);

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  process.stdout.write(`  ${c.ok ? '✅' : '❌'} ${c.label}${c.ok || !c.detail ? '' : `\n      ${String(c.detail).replace(/\n/g, '\n      ')}`}\n`);
}
fs.rmSync(root, { recursive: true, force: true });
process.stdout.write(`\n${checks.length - failed}/${checks.length} passed\n`);
process.exit(failed ? 1 : 0);
