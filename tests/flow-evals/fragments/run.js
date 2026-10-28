#!/usr/bin/env node
/**
 * tests/flow-evals/fragments/run.js — eval L1 dla scripts/sync-fragments.mjs (B4) i kernela dowodowego (A1).
 * Uruchom przy każdej zmianie skryptu, fragmentu albo listy agentów VETO: node tests/flow-evals/fragments/run.js
 *
 * DLACZEGO: bramka świeżości, która nigdy nie failuje, wygląda identycznie jak bramka, która działa.
 * Każdy kontrakt jest więc sprawdzany w obu kierunkach: poprawny stan przechodzi, celowo zepsuty
 * (fixture w katalogu tymczasowym, nigdy w produkcyjnych plikach) failuje z komunikatem „co/gdzie”.
 *
 * Kontrakty:
 *   1. nieaktualny blok → --check exit 1; --apply przepisuje; potem --check exit 0; ponowny --apply nic nie zmienia
 *   2. tekst poza blokiem (także CRLF) zostaje bajt w bajt; ręczna edycja bloku jest wykrywana jako dryf
 *   3. błędy walidacji → exit 1 w obu trybach i ŻADEN plik nie jest zapisany (też poprawny sąsiad):
 *      nieznany fragment, niedomknięty marker, END bez START, zagnieżdżenie, duplikat, zniekształcony marker,
 *      marker bez frontmattera / przed nim / we frontmatterze, marker w samym fragmencie
 *   4. marker w bloku ``` (dokumentacja składni) jest ignorowany
 *   5. repo: --check przechodzi, fragment ma < 900 B, a KAŻDY agent z „Yes” w kolumnie VETO w agents/README.md
 *      niesie blok evidence-kernel (nowy weryfikator VETO bez kernela failuje tu, nie po tygodniu u użytkownika)
 *   6. validate-agents.js nie pada na markerach
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'sync-fragments.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-fragments-'));
let seq = 0;

const FRAG = '## Rules\n1. First.\n2. Second.';
const FM = '---\nname: x\ndescription: d\n---\n';
const START = '<!-- fragment:kernel START -->';
const END = '<!-- fragment:kernel END -->';

/** Tworzy fixture-repo: { 'agents/a.md': treść, 'templates/fragments/kernel.md': treść }. */
function fixture(files) {
  const root = path.join(tmp, `fx${seq++}`);
  const all = { 'templates/fragments/kernel.md': FRAG + '\n', ...files };
  for (const [rel, content] of Object.entries(all)) {
    if (content === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const run = (root, mode) => {
  const r = spawnSync('node', [SCRIPT, mode, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const eq = (got, want, what) => (JSON.stringify(got) === JSON.stringify(want)
  ? null : `${what}: ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`);
const has = (out, needle, what) => (out.includes(needle) ? null : `${what}: brak „${needle}” w wyjściu:\n${out}`);

const fresh = `${FM}\nIntro.\n\n${START}\n${FRAG}\n${END}\n\n## Changelog\n`;
const stale = `${FM}\nIntro.\n\n${START}\nstara treść\n${END}\n\n## Changelog\n`;

/** Wspólny szablon testu „zły marker": oba tryby exit 1 + komunikat + poprawny sąsiad nietknięty. */
function rejects(content, needle, extra = {}, where = 'agents/bad.md') {
  const root = fixture({ 'agents/bad.md': content, 'agents/good.md': stale, ...extra });
  for (const mode of ['--check', '--apply']) {
    const r = run(root, mode);
    const err = eq(r.code, 1, `${mode} exit`) || has(r.out, needle, `${mode} komunikat`) || has(r.out, where, `${mode} lokalizacja`);
    if (err) return err;
  }
  return eq(read(root, 'agents/good.md'), stale, 'poprawny sąsiad nie może być zapisany przy błędach')
    || eq(read(root, 'agents/bad.md'), content, 'zły plik nie może być zmieniony');
}

const tests = [
  {
    name: 'stale-block-fails-check-then-apply-fixes-and-is-idempotent',
    run() {
      const root = fixture({ 'agents/a.md': stale });
      const c1 = run(root, '--check');
      const a1 = run(root, '--apply');
      const after = read(root, 'agents/a.md');
      const c2 = run(root, '--check');
      const a2 = run(root, '--apply');
      return eq(c1.code, 1, 'check na nieaktualnym') || has(c1.out, 'agents/a.md', 'check wskazuje plik')
        || has(c1.out, '--apply', 'check mówi jak naprawić')
        || eq(a1.code, 0, 'apply exit') || eq(after, fresh, 'treść po apply')
        || eq(c2.code, 0, 'check po apply') || eq(a2.code, 0, 'drugi apply')
        || eq(read(root, 'agents/a.md'), fresh, 'apply idempotentny');
    },
  },
  {
    name: 'hand-edit-inside-block-is-drift',
    run() {
      const root = fixture({ 'agents/a.md': fresh.replace('2. Second.', '2. Second (ręcznie).') });
      const r = run(root, '--check');
      const fixed = run(root, '--apply');
      return eq(r.code, 1, 'check na ręcznej edycji') || eq(fixed.code, 0, 'apply') || eq(read(root, 'agents/a.md'), fresh, 'przywrócony fragment');
    },
  },
  {
    name: 'text-outside-block-and-crlf-preserved',
    run() {
      const crlf = stale.replace(/\n/g, '\r\n');
      const root = fixture({ 'agents/a.md': crlf });
      const r = run(root, '--apply');
      return eq(r.code, 0, 'apply exit') || eq(read(root, 'agents/a.md'), fresh.replace(/\n/g, '\r\n'), 'CRLF zachowany, reszta bez zmian');
    },
  },
  { name: 'unknown-fragment-is-error', run: () => rejects(fresh.replace(/kernel/g, 'ghost'), 'nieznany fragment "ghost"') },
  { name: 'unclosed-marker-is-error', run: () => rejects(`${FM}\n${START}\n${FRAG}\n\n## Changelog\n`, 'niedomknięty marker') },
  { name: 'end-without-start-is-error', run: () => rejects(`${FM}\nIntro.\n${END}\n`, 'bez wcześniejszego START') },
  {
    name: 'nested-or-mismatched-marker-is-error',
    run: () => rejects(`${FM}\n${START}\n<!-- fragment:other START -->\n${END}\n`, 'brakuje END',
      { 'templates/fragments/other.md': 'Other.\n' }),
  },
  { name: 'duplicate-fragment-in-file-is-error', run: () => rejects(`${fresh}\n${START}\n${END}\n`, 'drugi raz') },
  { name: 'malformed-marker-is-error', run: () => rejects(`${FM}\n<!-- fragment:kernel STAR -->\n${FRAG}\n`, 'zniekształcony marker') },
  { name: 'marker-in-file-without-frontmatter-is-error', run: () => rejects(`Intro.\n${START}\n${END}\n`, 'bez frontmattera') },
  { name: 'marker-before-frontmatter-is-error', run: () => rejects(`${START}\n${END}\n${FM}\nBody.\n`, 'bez frontmattera') },
  {
    name: 'marker-inside-frontmatter-is-error',
    run: () => rejects(`---\nname: x\ndescription: |\n  opis\n${START}\n${END}\n---\n\nBody.\n`, 'wewnątrz frontmattera'),
  },
  {
    name: 'marker-inside-fragment-file-is-error',
    run: () => rejects(fresh, 'rekurencja', { 'templates/fragments/kernel.md': `${FRAG}\n${START}\n` }, 'templates/fragments/kernel.md'),
  },
  {
    name: 'markers-in-code-fence-are-ignored',
    run() {
      const doc = `${FM}\nSkładnia:\n\n\`\`\`\n${START}\nzostaje\n${END}\n\`\`\`\n`;
      const root = fixture({ 'agents/doc.md': doc, 'agents/README.md': `# bez frontmattera\n\n\`\`\`\n${START}\n\`\`\`\n` });
      const r = run(root, '--check');
      return eq(r.code, 0, 'check z markerem w code fence') || eq(read(root, 'agents/doc.md'), doc, 'treść w fence nietknięta');
    },
  },
  {
    name: 'repo-state-is-fresh',
    run() {
      const r = run(REPO, '--check');
      return eq(r.code, 0, `--check na repo (${r.out.trim()})`);
    },
  },
  {
    name: 'tilde-inside-backtick-fence-does-not-hide-a-real-marker',
    run() {
      // Regres z przeglądu: ogrodzenia przełączały stan na każdej linii z ``` lub ~~~, więc `~~~` w środku bloku ```
      // „zamykało" go i prawdziwy marker niżej bywał pomijany (nieaktualny fragment nigdy nie wychodził).
      const content = `${FM}\n\`\`\`md\n~~~\n\`\`\`\n\n${START}\nstara treść\n${END}\n`;
      const r = run(fixture({ 'agents/a.md': content }), '--check');
      return eq(r.code, 1, 'check musi wykryć nieaktualny blok po bloku z ~~~ w środku');
    },
  },
  {
    name: 'longer-outer-fence-keeps-documentation-markers-ignored',
    run() {
      const content = `${FM}\n\`\`\`\`md\n\`\`\`\n${START}\n${END}\n\`\`\`\n\`\`\`\`\n\n## Changelog\n`;
      const root = fixture({ 'agents/a.md': content });
      const r = run(root, '--check');
      return eq(r.code, 0, `marker w przykładzie w 4-backtickowym bloku ma być ignorowany (${r.out.trim()})`)
        || has(r.out, '0 bloków', 'brak bloków do wstrzyknięcia') || eq(read(root, 'agents/a.md'), content, 'plik nietknięty');
    },
  },
  {
    name: 'invalid-root-is-exit-2-not-green',
    run() {
      // Regres z przeglądu: `--root --check` brał `--check` za ścieżkę, a nieistniejący katalog dawał „OK (0 bloków)".
      const a = spawnSync('node', [SCRIPT, '--root', '--check'], { encoding: 'utf8' });
      const b = spawnSync('node', [SCRIPT, '--check', '--root', path.join(tmp, 'nie-ma-takiego-katalogu')], { encoding: 'utf8' });
      return eq([a.status, b.status], [2, 2], 'exit przy złym --root');
    },
  },
  {
    name: 'evidence-kernel-is-compact-and-has-the-five-rules',
    run() {
      const body = fs.readFileSync(path.join(REPO, 'templates', 'fragments', 'evidence-kernel.md'), 'utf8');
      const rules = body.split('\n').filter((l) => /^[1-5]\. /.test(l)).length;
      return eq(Buffer.byteLength(body) < 900, true, `rozmiar fragmentu ${Buffer.byteLength(body)} B (limit 900)`)
        || eq(rules, 5, 'liczba ponumerowanych reguł')
        || eq(/file:line/.test(body) && /UNCONFIRMED/.test(body), true, 'reguła cytatu (file:line / UNCONFIRMED)')
        || eq(/\d{2,}/.test(body.replace(/file:line/g, '')), false, 'fragment bez liczb (pułapka few-shot-as-data)');
    },
  },
  {
    name: 'every-veto-agent-in-readme-carries-the-kernel',
    run() {
      const readme = fs.readFileSync(path.join(REPO, 'agents', 'README.md'), 'utf8');
      const names = readme.split('\n')
        .filter((l) => /^\|\s*\*\*[^|]+\*\*\s*\|.*\|\s*Yes\s*\|\s*$/.test(l))
        .map((l) => l.match(/\*\*([^*]+)\*\*/)[1].split('/').pop());
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.isFile() && e.name.endsWith('.md') ? [path.join(d, e.name)] : []));
      const files = walk(path.join(REPO, 'agents'));
      const missing = [];
      for (const name of names) {
        const hit = files.find((f) => path.basename(f) === `${name}.md`);
        if (!hit) { missing.push(`${name} (brak pliku)`); continue; }
        const src = fs.readFileSync(hit, 'utf8');
        if (!src.includes('<!-- fragment:evidence-kernel START -->') || !src.includes('<!-- fragment:evidence-kernel END -->')) missing.push(name);
      }
      return eq(names.length > 0, true, 'README ma wiersze VETO=Yes') || eq(missing, [], 'agenci VETO bez evidence-kernel');
    },
  },
  {
    name: 'validate-agents-accepts-markers',
    run() {
      const r = spawnSync('node', [path.join(REPO, 'scripts', 'ci', 'validate-agents.js')], { encoding: 'utf8' });
      return eq(r.status, 0, `validate-agents exit (${(r.stdout + r.stderr).trim().split('\n').slice(-3).join(' | ')})`);
    },
  },
];

let failed = 0;
for (const test of tests) {
  let err;
  try { err = test.run(); } catch (e) { err = 'wyjątek: ' + ((e && e.stack) || e); }
  console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
  if (err) failed++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
