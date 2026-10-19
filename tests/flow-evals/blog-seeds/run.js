#!/usr/bin/env node
/**
 * tests/flow-evals/blog-seeds/run.js — eval L1 dla zalążków wpisów blogowych (ADR 0013).
 *
 * DLACZEGO: emitter pisze do repo blogów w tle, bez pytania człowieka. Jedyne, co stoi między
 * artefaktem przebiegu a plikiem w blogu, to ten skrypt — więc jego bramki (identyfikatory,
 * deny-lista, fail-closed, nienaruszalność odpowiedzi autora) muszą być pilnowane testem.
 *
 * Wszystko w katalogach tymczasowych, z syntetyczną deny-listą: prawdziwe blogi, klucz HMAC
 * i telemetria nie są dotykane (BLOG_SEEDS_HOME, CLAUDE_TELEMETRY_DIR).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const EMIT = path.join(REPO, 'scripts', 'blog-seed-emit.mjs');
const VALIDATE = path.join(REPO, 'scripts', 'blog-seed-validate.mjs');
const TODAY = '2026-10-14';
const tmpRoots = [];

const DENY = `version: "test-1"
repo_names: [tajny-projekt]
regex:
  commit_hash: '\\b[0-9a-f]{7,40}\\b'
  task_id: '\\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\\d{2,}\\b'
absolute_bans: ["zakazany temat"]
topic_bans: ["schemat bazy"]
`;

function makeEnv({ section, blogs = ['product', 'personal'], blogMode = null, noDeny = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-blog-seeds-'));
  tmpRoots.push(root);
  const proj = path.join(root, 'moj-projekt');
  fs.mkdirSync(path.join(proj, '.claude', 'config'), { recursive: true });
  const targets = blogs.map((b) => `{id: ${b}, path: ../blog-${b}}`).join(', ');
  const sec = section === undefined
    ? `blog_seeds:\n  enabled: true\n  public_alias: "narzędzie wewnętrzne"\n  targets: [${targets}]\n`
    : section;
  fs.writeFileSync(path.join(proj, '.claude', 'config', 'project.yml'), `project:\n  name: moj-projekt\n${sec}`);
  for (const b of blogs) {
    const dir = path.join(root, `blog-${b}`);
    fs.mkdirSync(path.join(dir, 'stage', 'inbox'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'stage', 'dry-run'), { recursive: true });
    const mode = blogMode ? `mode: ${blogMode}\n` : '';
    fs.writeFileSync(path.join(dir, 'blog-seed.config.yml'),
      `blog_id: ${b}\nrole: ${b}\npost_guide: docs/POST-GUIDE.md\ndeny_list_file: stage/deny-list.yml\n${mode}thresholds: {seed: 16, candidate: 24}\nrate_limit: {new_seeds_per_week: 3}\n`);
    if (!noDeny.includes(b)) fs.writeFileSync(path.join(dir, 'stage', 'deny-list.yml'), DENY);
  }
  const env = { ...process.env, BLOG_SEEDS_HOME: path.join(root, 'home'), CLAUDE_TELEMETRY_DIR: path.join(root, 'tel') };
  const blogDir = (b) => path.join(root, `blog-${b}`);
  const seeds = (b, mode = 'dry-run') => {
    const base = path.join(blogDir(b), 'stage', mode === 'live' ? 'inbox' : 'dry-run');
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base).flatMap((d) => {
      const dd = path.join(base, d);
      return fs.statSync(dd).isDirectory() ? fs.readdirSync(dd).filter((f) => f.endsWith('.seed.md')).map((f) => path.join(dd, f)) : [];
    });
  };
  const emit = (payload, extra = []) => {
    const file = path.join(root, `payload-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, typeof payload === 'string' ? payload : JSON.stringify(payload));
    const r = spawnSync(process.execPath, [EMIT, '--project', proj, '--payload', file, '--today', TODAY, '--run-id', 'eval:1', ...extra], { encoding: 'utf8', env });
    let out = null;
    try { out = JSON.parse(r.stdout); } catch { /* brak JSON */ }
    return { code: r.status, out, stderr: r.stderr };
  };
  const events = () => {
    const dir = path.join(root, 'tel');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  };
  return { root, proj, env, blogDir, seeds, emit, events };
}

function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  return out;
}

function payload(over = {}) {
  return deepMerge({
    schema: 'blog-seed-payload-v1',
    source: { kind: 'analyze', trigger: 'decision', ref: 'TS-042#decyzja-1', area: 'obsługa kolejki zadań' },
    topic: 'Dlaczego zrezygnowaliśmy z ponawiania w tle',
    routing: { blog: 'product', confidence: 'high', test_answer: 'nie, dotyczy produktu', reason: 'opis działania funkcji' },
    suggested: { format: 'decision', pillar: 'decisions' },
    content: {
      facts: ['W TS-042 usunięto ponawianie z pliku worker/retry.py (commit 9f3c2ab1).', 'Repo tajny-projekt dostało nową flagę.'],
      decision: { choice: 'jawny błąd zamiast ponawiania', alternatives: [{ option: 'ponawianie z opóźnieniem', why_rejected: 'maskowało awarie' }] },
      evidence: [{ claim: 'decyzja zapisana w analizie', type: 'decision', origin: 'measured' }],
      unknowns: ['czy użytkownicy zauważą więcej błędów'],
      questions: ['Co przesądziło o rezygnacji?'],
    },
  }, over);
}

const read = (f) => fs.readFileSync(f, 'utf8');
const LIVE_PRODUCT = 'blog_seeds:\n  enabled: true\n  mode: live\n  public_alias: "x"\n  targets: [{id: product, path: ../blog-product}]\n';

const tests = [
  {
    name: 'emitted-seed-has-no-identifiers-and-valid-format',
    run() {
      const e = makeEnv();
      const r = e.emit(payload());
      if (r.code !== 0 || !r.out || r.out.results[0].outcome !== 'emitted') return `zły wynik: ${JSON.stringify(r)}`;
      const files = e.seeds('product');
      if (files.length !== 1) return `oczekiwano 1 pliku, jest ${files.length}`;
      if (!files[0].includes(`/dry-run/${TODAY}/`)) return `zły katalog: ${files[0]}`;
      const txt = read(files[0]);
      for (const leak of ['TS-042', 'worker/retry.py', '9f3c2ab1', 'tajny-projekt', 'moj-projekt']) {
        if (txt.includes(leak)) return `wyciek "${leak}" w pliku`;
      }
      if (!txt.includes('narzędzie wewnętrzne')) return 'brak public_alias';
      if (!/- \[FAKT\] /.test(txt) || !txt.includes('## Czego nie wiem')) return 'brak etykiet lub sekcji luk';
      const v = spawnSync(process.execPath, [VALIDATE, files[0], '--blog', e.blogDir('product')], { encoding: 'utf8', env: e.env });
      return v.status === 0 ? null : `walidator: ${v.stdout}`;
    },
  },
  {
    name: 'telemetry-event-carries-codes-only',
    run() {
      const e = makeEnv();
      e.emit(payload());
      const ev = e.events().find((x) => x.kind === 'seed');
      if (!ev) return 'brak zdarzenia seed';
      if (ev.process !== 'blog-seed' || ev.seed.event !== 'emitted' || ev.seed.blog !== 'product') return `złe pola: ${JSON.stringify(ev)}`;
      const raw = JSON.stringify(ev);
      for (const leak of ['ponawiania', 'TS-042', 'opis działania']) if (raw.includes(leak)) return `wolny tekst w telemetrii: ${leak}`;
      return null;
    },
  },
  {
    name: 'deny-list-ban-writes-nothing-even-in-dry-run',
    run() {
      const e = makeEnv();
      const r = e.emit(payload({ content: { facts: ['Dotyczy to obszaru: zakazany temat.'] } }));
      if (r.out.results[0].reason !== 'security') return `oczekiwano security, jest ${JSON.stringify(r.out)}`;
      const r2 = e.emit(payload({ source: { ref: 'X-2' }, content: { unknowns: ['jak zmieni się Schemat Bazy'] } }));
      if (r2.out.results[0].reason !== 'security') return 'topic_ban (inna wielkość liter) nie zatrzymał zalążka';
      return e.seeds('product').length === 0 ? null : 'powstał plik mimo zakazu';
    },
  },
  {
    name: 'blog-without-deny-list-or-stage-gets-nothing',
    run() {
      const e = makeEnv({ noDeny: ['product'] });
      const r = e.emit(payload());
      if (r.out.results[0].reason !== 'config') return `bez deny-listy: ${JSON.stringify(r.out)}`;
      if (e.seeds('product').length) return 'zapis mimo braku deny-listy';
      const e2 = makeEnv({ blogs: ['product'] });
      fs.rmSync(path.join(e2.blogDir('product'), 'stage'), { recursive: true });
      const r2 = e2.emit(payload());
      if (r2.out.results[0].reason !== 'config') return 'brak stage/ nie dał config';
      return fs.existsSync(path.join(e2.blogDir('product'), 'stage')) ? 'emitter sam utworzył stage/' : null;
    },
  },
  {
    name: 'same-source-updates-and-keeps-author-answers',
    run() {
      const e = makeEnv();
      e.emit(payload());
      const [file] = e.seeds('product');
      fs.writeFileSync(file, read(file).replace('answer: null', 'answer: "bo ponawianie ukrywało awarię"'));
      const r = e.emit(payload({ content: { facts: ['Nowy fakt po kolejnej analizie.'] } }));
      if (r.out.results[0].outcome !== 'updated') return `oczekiwano updated: ${JSON.stringify(r.out)}`;
      const files = e.seeds('product');
      if (files.length !== 1) return `duplikat: ${files.length} plików`;
      const txt = read(files[0]);
      if (!txt.includes('Nowy fakt po kolejnej analizie')) return 'treść generatora nie zaktualizowana';
      return txt.includes('bo ponawianie ukrywało awarię') ? null : 'odpowiedź autora nadpisana';
    },
  },
  {
    name: 'picked-seed-is-never-modified',
    run() {
      const e = makeEnv();
      e.emit(payload());
      const [file] = e.seeds('product');
      const picked = read(file).replace('status: new', 'status: picked');
      fs.writeFileSync(file, picked);
      const r = e.emit(payload({ content: { facts: ['Zmiana po wybraniu.'] } }));
      if (r.out.results[0].reason !== 'duplicate') return `oczekiwano duplicate: ${JSON.stringify(r.out)}`;
      return read(file) === picked ? null : 'plik picked zmodyfikowany';
    },
  },
  {
    name: 'low-confidence-live-no-file-dry-run-file-with-reason',
    run() {
      const live = makeEnv({ section: LIVE_PRODUCT, blogs: ['product'] });
      const r = live.emit(payload({ routing: { confidence: 'low' } }));
      if (r.out.results[0].reason !== 'routing' || live.seeds('product', 'live').length) return `live low: ${JSON.stringify(r.out)}`;
      const dry = makeEnv();
      const r2 = dry.emit(payload({ routing: { confidence: 'low' } }));
      const files = dry.seeds('product');
      if (r2.out.results[0].reason !== 'routing' || files.length !== 1) return 'dry-run low bez pliku';
      return /suppressed:\n\s+reason: routing/.test(read(files[0])) ? null : 'brak suppressed.reason w pliku';
    },
  },
  {
    name: 'medium-confidence-writes-two-linked-siblings',
    run() {
      const e = makeEnv();
      const r = e.emit(payload({ routing: { confidence: 'medium', alt_angle: 'co z tego wynika dla kogoś, kto buduje własny produkt' } }));
      const [a, b] = r.out.results;
      if (!a || !b || a.outcome !== 'emitted' || b.outcome !== 'emitted') return `wyniki: ${JSON.stringify(r.out)}`;
      const pa = read(e.seeds('product')[0]);
      const pb = read(e.seeds('personal')[0]);
      if (!pa.includes(`sibling_seed: ${b.seedId}`)) return 'pierwszy zalążek bez sibling';
      if (!pb.includes(`sibling_seed: ${a.seedId}`)) return 'drugi zalążek bez sibling';
      return pb.includes('angle: co z tego wynika') ? null : 'drugi zalążek bez własnego kąta';
    },
  },
  {
    name: 'weekly-rate-limit-in-live',
    run() {
      const e = makeEnv({ section: LIVE_PRODUCT, blogs: ['product'] });
      const outs = [1, 2, 3, 4].map((i) => e.emit(payload({ source: { ref: `R-${i}0` }, topic: `Temat numer ${i}` })).out.results[0]);
      if (outs.slice(0, 3).some((o) => o.outcome !== 'emitted')) return `pierwsze trzy: ${JSON.stringify(outs)}`;
      if (outs[3].reason !== 'rate') return `czwarty: ${JSON.stringify(outs[3])}`;
      return e.seeds('product', 'live').length === 3 ? null : 'zła liczba plików';
    },
  },
  {
    name: 'blog-can-force-dry-run',
    run() {
      const e = makeEnv({ section: LIVE_PRODUCT, blogs: ['product'], blogMode: 'dry-run' });
      const r = e.emit(payload());
      return r.out.results[0].mode === 'dry-run' && e.seeds('product').length === 1 ? null : `tryb: ${JSON.stringify(r.out)}`;
    },
  },
  {
    name: 'third-parties-without-consent-writes-nothing',
    run() {
      const e = makeEnv();
      const r = e.emit(payload({ consent: { third_parties: true } }));
      if (r.out.results[0].reason !== 'consent' || e.seeds('product').length) return `bez zgody: ${JSON.stringify(r.out)}`;
      const r2 = e.emit(payload({ consent: { third_parties: true, obtained: true } }));
      return r2.out.results[0].outcome === 'emitted' ? null : 'ze zgodą nie zapisano';
    },
  },
  {
    name: 'disabled-embargo-and-missing-section-skip-silently',
    run() {
      for (const [section, reason] of [
        ['', 'disabled'],
        ['blog_seeds:\n  enabled: false\n', 'disabled'],
        ['blog_seeds:\n  enabled: true\n  embargo_until: "2099-01-01"\n  public_alias: "x"\n  targets: [{id: product, path: ../blog-product}]\n', 'embargo'],
      ]) {
        const e = makeEnv({ section });
        const r = e.emit(payload());
        if (r.code !== 0 || !r.out || r.out.skipped !== reason) return `${reason}: ${JSON.stringify(r)}`;
        if (e.seeds('product').length) return `${reason}: powstał plik`;
      }
      const e = makeEnv({ section: '' });
      const c = spawnSync(process.execPath, [EMIT, '--project', e.proj, '--check'], { encoding: 'utf8', env: e.env });
      return JSON.parse(c.stdout).enabled === false ? null : '--check nie zgłosił wyłączenia';
    },
  },
  {
    name: 'invalid-payload-exit-1-no-file',
    run() {
      const e = makeEnv();
      if (e.emit('{"schema":"blog-seed-payload-v1","topic":"x"}').code !== 1) return 'niepełny payload nie dał kodu 1';
      if (e.emit('nie-json').code !== 1) return 'nie-JSON nie dał kodu 1';
      const r3 = e.emit(payload({ routing: { blog: 'firmowy' } }));
      return r3.code === 1 && e.seeds('product').length === 0 ? null : 'blog spoza enum przeszedł';
    },
  },
  {
    name: 'missing-evidence-is-a-gate-not-a-schema-error',
    run() {
      const e = makeEnv();
      const r = e.emit(payload({ content: { evidence: [] } }));
      if (r.code !== 0 || r.out.results[0].reason !== 'evidence') return JSON.stringify(r);
      return /evidence: fail/.test(read(e.seeds('product')[0])) ? null : 'brak gates.evidence: fail';
    },
  },
  {
    name: 'validator-rejects-broken-seed',
    run() {
      const e = makeEnv();
      e.emit(payload());
      const [file] = e.seeds('product');
      const broken = read(file).replace('## Czego nie wiem', '## Coś innego').replace('status: new', 'status: drafted');
      const bad = path.join(path.dirname(file), 'zly.seed.md');
      fs.writeFileSync(bad, `${broken}\nW TS-099 zmieniono plik.\n`);
      const v = spawnSync(process.execPath, [VALIDATE, bad, '--blog', e.blogDir('product')], { encoding: 'utf8', env: e.env });
      if (v.status !== 1) return 'walidator przepuścił uszkodzony plik';
      for (const want of ['brak sekcji', 'bez odpowiedzi', 'wyciek: task_id']) if (!v.stdout.includes(want)) return `brak błędu "${want}": ${v.stdout}`;
      return null;
    },
  },
  {
    name: 'blog-seeds-section-never-reaches-claude-md',
    run() {
      // Generator czyta tylko znane klucze (yml_get/yml_list). Sekcja blog_seeds: w CLAUDE.md
      // byłaby przeciekiem do kontekstu KAŻDEJ sesji — pilnujemy, że generator jej nie zna.
      const src = read(path.join(REPO, 'scripts', 'generate-claude-md.sh'));
      if (/blog_seeds/.test(src)) return 'generate-claude-md.sh odwołuje się do blog_seeds';
      const keys = [...src.matchAll(/yml_(?:get|list)\s+"([a-z_.]+)/g)].map((m) => m[1]);
      const bad = keys.filter((k) => k.startsWith('blog'));
      if (bad.length) return `generator czyta: ${bad.join(', ')}`;
      return /cat\s+"?\$PROJECT_YML/.test(src) ? 'generator wkleja project.yml w całości' : null;
    },
  },
  {
    name: 'rollup-counts-seed-funnel',
    async run() {
      const e = makeEnv();
      e.emit(payload());
      e.emit(payload({ source: { ref: 'Z-11' }, content: { facts: ['zakazany temat'] } }));
      const { buildRollups } = await import(path.join(REPO, 'scripts', 'lib', 'telemetry-rollup.mjs'));
      const rolls = buildRollups(e.events());
      const list = Array.isArray(rolls) ? rolls : rolls instanceof Map ? [...rolls.values()] : Object.values(rolls);
      const r = list.find((x) => x.seeds);
      if (!r) return 'brak bloku seeds w agregacie';
      const p = r.seeds.product || {};
      return p.emitted === 1 && p['suppressed:security'] === 1 ? null : `lejek: ${JSON.stringify(r.seeds)}`;
    },
  },
  {
    name: 'check-and-no-topic-leave-trace-only-with-run-id',
    async run() {
      // „Cisza" w lejku musi dać się odróżnić od pominięcia kroku: --check i --no-topic z --run-id
      // zostawiają zdarzenie, ręczne --check bez --run-id — nie.
      const call = (e, extra) => spawnSync(process.execPath, [EMIT, '--project', e.proj, '--today', TODAY, ...extra], { encoding: 'utf8', env: e.env });
      const e = makeEnv();
      call(e, ['--check']);
      if (e.events().length) return '--check bez --run-id zapisał zdarzenie';
      call(e, ['--check', '--run-id', 'eval:2']);
      const nt = call(e, ['--no-topic', '--run-id', 'eval:2']);
      if (nt.status !== 0 || JSON.parse(nt.stdout).skipped !== 'no_topic') return `--no-topic: ${nt.status} ${nt.stdout}${nt.stderr}`;
      if (e.seeds('product').length) return '--no-topic utworzył plik';
      const got = e.events().map((x) => `${x.seed.event}:${x.seed.reason ?? null}`).join(',');
      if (got !== 'checked:null,skipped:no_topic') return `zdarzenia: ${got}`;
      if (call(e, ['--no-topic']).status !== 1) return '--no-topic bez --run-id nie dał kodu 1';

      const off = makeEnv({ section: '' });
      call(off, ['--check', '--run-id', 'eval:3']);
      const ev = off.events()[0];
      if (!ev || ev.seed.event !== 'skipped' || ev.seed.reason !== 'disabled') return `wyłączony projekt: ${JSON.stringify(ev)}`;

      const { buildRollups } = await import(path.join(REPO, 'scripts', 'lib', 'telemetry-rollup.mjs'));
      const rolls = buildRollups(e.events());
      const list = Array.isArray(rolls) ? rolls : rolls instanceof Map ? [...rolls.values()] : Object.values(rolls);
      const u = (list.find((x) => x.seeds) || {}).seeds?.unknown || {};
      return u.checked === 1 && u['skipped:no_topic'] === 1 ? null : `lejek: ${JSON.stringify(u)}`;
    },
  },
];

(async () => {
  let failed = 0;
  for (const test of tests) {
    let err;
    try { err = await test.run(); } catch (e) { err = 'wyjątek: ' + (e && e.stack || e); }
    console.log(`  ${err ? '❌' : '✅'} ${test.name}${err ? ' — ' + err : ''}`);
    if (err) failed++;
  }
  for (const r of tmpRoots) fs.rmSync(r, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
