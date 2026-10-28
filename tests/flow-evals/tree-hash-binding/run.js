#!/usr/bin/env node
/**
 * tests/flow-evals/tree-hash-binding/run.js — eval L1 dla ORC-139 (werdykt związany z hashem drzewa).
 *
 * Zero LLM. Dwie warstwy dowodu:
 *   1. PRAWDZIWE repo git w katalogu tymczasowym: polecenie hasha z CORE (`treeHashCmd`) i CLI
 *      `scripts/orchestrate-tree-hash.mjs` — stabilność, wrażliwość na zmianę, wykluczenia, brak
 *      skutków ubocznych w prawdziwym indeksie.
 *   2. Kanoniczny skrypt Workflow wykonany z atrapą `agent()` (te same funkcje i pętla, które biegną
 *      w przebiegu): GO z nieaktualnym hashem jest odrzucane, sonda hasha bez wyniku to ostrzeżenie.
 *
 * Test dwukierunkowy: ten sam scenariusz na szablonie ze ZEPSUTĄ regułą (usunięte sprawdzenie
 * `stale`) musi dać odwrotny wynik — inaczej eval niczego nie pilnuje.
 *
 * Uruchom: node tests/flow-evals/tree-hash-binding/run.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const CORE = path.join(REPO, 'scripts', 'workflow', 'orchestrate-core.mjs');
const TEMPLATE = path.join(REPO, 'scripts', 'workflow', 'orchestrate.template.mjs');
const CLI = path.join(REPO, 'scripts', 'orchestrate-tree-hash.mjs');

const H = (c) => c.repeat(40); // poprawny kształt hasha obiektu gita
const [HA, HB, HC] = [H('a'), H('b'), H('c')];

// ── pomocnicy: prawdziwe repo ───────────────────────────────────────────────────
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const ENGINE_DIRS = ['.claude/run-state', '.claude/work', 'telemetry/events', 'telemetry/rollups', 'docs/tasks/_inbox'];
/**
 * `ignoreEngine` (domyślnie true) = realistyczny satelita: katalogi artefaktów silnika ISTNIEJĄ na dysku
 * i są w .gitignore. Dokładnie ten układ wywalał `git add -- . ':(exclude)…'` (exit 1 → hash zawsze pusty).
 */
function makeRepo(opts) {
  const ignoreEngine = !opts || opts.ignoreEngine !== false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-hash-eval-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'eval@example.invalid');
  git(dir, 'config', 'user.name', 'eval');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n' + (ignoreEngine ? ENGINE_DIRS.map((d) => d + '/\n').join('') : ''));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  if (ignoreEngine) for (const d of ENGINE_DIRS) write(dir, d + '/seed.txt', 'artefakt silnika\n');
  return dir;
}
function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}
function hashOf(core, dir, extra) {
  const cmd = core.treeHashCmd(core.treeHashExcludes({ treeHashExclude: extra || [] }));
  const raw = execFileSync('bash', ['-c', cmd], { cwd: dir, encoding: 'utf8' });
  const h = core.parseTreeHash(raw);
  if (!h) throw new Error('polecenie hasha nie zwróciło hasha: ' + JSON.stringify(raw));
  return h;
}
function cli(dir, ...args) {
  const r = spawnSync('node', [CLI, '--project', dir, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

// ── harness: kanoniczny skrypt Workflow z atrapą agent() ───────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const ARGS = {
  task: { id: 'TS-FIX-001', title: 't', taskFile: 'tasks/TS-FIX-001.md', analysisFile: 'analysis/TS-FIX-001.analysis.md', decisions: [], layersDone: [], minorFixes: [] },
  layers: [{ id: 'domain', dirs: ['src/domain/'], agent: 'impl-x', checks: [], skip: false, tests: false, optional: false, layerPatterns: [] }],
  patterns: [],
  checks: { byLayer: {}, finalGate: [] },
  budgets: {},
  knowledge: {},
  humanVoice: { language: 'pl' },
  verifiers: { layer: 'verifier-x', maxAttempts: 3, onMax: 'ESCALATE_AND_HALT', finalGate: 'gate-x', onFail: 'ESCALATE_AND_HALT' },
  exit: 'STAGE_NOT_COMMIT',
  autoFixMinor: false,
  baseSha: null,
  dirtyAtStart: [],
};

/**
 * Uruchamia szablon. `hashes`: label → hash | null (null = sonda bez wyniku), brak klucza = null.
 * Zwraca { report, calls } — `calls` to etykiety wszystkich wywołań agenta w kolejności.
 */
async function runEngine(source, hashes, argsPatch) {
  const body = source.replace('export const meta', 'const meta');
  const fn = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', 'pipeline', body);
  const calls = [];
  const prompts = [];
  const agent = async (prompt, opts) => {
    const label = (opts && opts.label) || '';
    calls.push(label);
    prompts.push({ label, prompt });
    if (/-tree-(pre|post)-\d+$/.test(label) || /^final-tree-(pre|post|seal)/.test(label)) {
      return label in hashes && hashes[label] !== null ? { tree_hash: hashes[label] } : null;
    }
    if (/-impl$/.test(label)) return { changed_files: ['src/domain/a.ts'], summary: 'ok' };
    if (/-diff-gate-\d+$/.test(label) || label === 'final-tree-probe') return { files: ['src/domain/a.ts'], dirty: false, commits: 0 };
    if (/-checks-\d+$/.test(label)) return { typecheck: 'pass', tests: 'skipped', lint: 'pass', newTestBlocks: 0, tail: '' };
    if (/-verify$/.test(label)) return { verdict: 'GO' };
    if (/^final-gate/.test(label)) return { verdict: 'GO' };
    return null;
  };
  const report = await fn(Object.assign({}, ARGS, argsPatch || {}), agent, () => {}, () => {}, async () => [], async () => []);
  return { report, calls, prompts };
}

const warnText = (r) => (r.warnings || []).join('\n');

// Klucze wszystkich sond hasha w przebiegu jednowarstwowym — „spokojny" przebieg = jeden hash wszędzie.
function steady(h) {
  return {
    'domain-tree-pre-1': h, 'domain-tree-post-1': h,
    'final-tree-pre': h, 'final-tree-post': h, 'final-tree-seal': h,
  };
}

const CASES = (core, src) => {
  // Zepsuta reguła: sprawdzenie `stale` w pętli warstwy i w bramce końcowej wyłączone.
  const broken = src.split("bound.state === 'stale'").join('false').split("gateBound.state === 'stale'").join('false');

  return [
    // ── (1) hash stabilny przy braku zmian ─────────────────────────────────────────
    {
      name: '1-hash-stable-without-changes-and-independent-of-mtime-and-staging',
      run() {
        const dir = makeRepo();
        try {
          const h1 = hashOf(core, dir);
          const h2 = hashOf(core, dir);
          if (h1 !== h2) return 'dwa odczyty bez zmian dały różne hashe';
          // timestamp: ta sama treść, nowy mtime
          const old = new Date(Date.now() - 86400000 * 30);
          fs.utimesSync(path.join(dir, 'src', 'a.ts'), old, old);
          if (hashOf(core, dir) !== h1) return 'zmiana mtime zmieniła hash';
          // staging nie zmienia treści drzewa roboczego
          write(dir, 'src/b.ts', 'export const b = 2\n');
          const dirty = hashOf(core, dir);
          if (dirty === h1) return 'nowy plik nieśledzony nie zmienił hasha';
          git(dir, 'add', 'src/b.ts');
          if (hashOf(core, dir) !== dirty) return 'staged vs nieśledzony dają różne hashe tej samej treści';
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },
    {
      name: '1b-hash-does-not-touch-real-index-or-history',
      run() {
        const dir = makeRepo();
        try {
          write(dir, 'src/new.ts', 'x\n');
          const idxBefore = fs.readFileSync(path.join(dir, '.git', 'index'));
          const statusBefore = git(dir, 'status', '--porcelain');
          const headBefore = git(dir, 'rev-parse', 'HEAD');
          const tmpBefore = new Set(fs.readdirSync(os.tmpdir()));
          hashOf(core, dir);
          if (!idxBefore.equals(fs.readFileSync(path.join(dir, '.git', 'index')))) return 'prawdziwy indeks zmieniony';
          if (git(dir, 'status', '--porcelain') !== statusBefore) return 'git status zmieniony po haszowaniu';
          if (git(dir, 'rev-parse', 'HEAD') !== headBefore) return 'HEAD zmieniony';
          const leftovers = fs.readdirSync(os.tmpdir()).filter((f) => !tmpBefore.has(f) && !f.startsWith('tree-hash-eval-'));
          if (leftovers.length) return 'tymczasowy indeks nie został usunięty: ' + leftovers.join(',');
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },

    {
      name: '1c-hash-works-when-excluded-dirs-exist-and-are-gitignored',
      run() {
        const dir = makeRepo(); // katalogi artefaktów silnika istnieją i są w .gitignore
        try {
          for (const d of ENGINE_DIRS) if (!fs.existsSync(path.join(dir, d, 'seed.txt'))) return 'fixture bez katalogu ' + d;
          const h = hashOf(core, dir, ['analysis/x.md']); // rzuca, gdy polecenie padło albo hash ma zły kształt
          const viaCli = cli(dir, '--exclude', 'analysis/x.md');
          if (viaCli.code !== 0 || viaCli.out !== h) return 'CLI i CORE liczą różne hashe: ' + JSON.stringify(viaCli) + ' vs ' + h;
          write(dir, 'src/a.ts', 'export const a = 42\n');
          if (hashOf(core, dir, ['analysis/x.md']) === h) return 'zmiana pliku kodu nie zmieniła hasha';
          fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1\n');
          if (hashOf(core, dir, ['analysis/x.md']) !== h) return 'przywrócenie treści nie wróciło do tego samego hasha';
          for (const d of ENGINE_DIRS) write(dir, d + '/nowy.txt', 'zmiana w wykluczonej ścieżce');
          if (hashOf(core, dir, ['analysis/x.md']) !== h) return 'zmiana w wykluczonej, ignorowanej ścieżce zmieniła hash';
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },
    {
      name: '1d-cli-runs-from-path-with-space-and-through-symlink',
      run() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-hash-cli-'));
        const dir = makeRepo();
        try {
          const spaced = path.join(root, 'ścieżka ze spacją', 'scripts');
          fs.mkdirSync(path.join(spaced, 'workflow'), { recursive: true });
          for (const f of ['orchestrate-tree-hash.mjs', 'workflow/orchestrate-core.mjs', 'workflow/orchestrate.template.mjs']) {
            fs.copyFileSync(path.join(REPO, 'scripts', f), path.join(spaced, f));
          }
          const link = path.join(root, 'link-do-cli.mjs');
          fs.symlinkSync(CLI, link);
          const run = (script, ...args) => {
            const r = spawnSync('node', [script, '--project', dir, ...args], { encoding: 'utf8' });
            return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
          };
          const direct = run(CLI);
          if (direct.code !== 0 || !/^[0-9a-f]{40}$/.test(direct.out)) return 'bezpośrednie wywołanie: ' + JSON.stringify(direct);
          for (const [name, script] of [['spacja', path.join(spaced, 'orchestrate-tree-hash.mjs')], ['symlink', link]]) {
            const r = run(script);
            if (r.out !== direct.out || r.code !== 0) return name + ' daje inny wynik niż bezpośrednie wywołanie (cichy exit 0 bez wyjścia?): ' + JSON.stringify(r);
            write(dir, 'src/zmiana.ts', name);
            const stale = run(script, '--check', direct.out);
            fs.rmSync(path.join(dir, 'src', 'zmiana.ts'));
            if (stale.code !== 2) return name + ': --check po zmianie kodu powinien dać exit 2, jest ' + stale.code + ' ' + JSON.stringify(stale);
          }
          return null;
        } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },

    // ── (2) zmiana pliku po weryfikacji → GO odrzucone ─────────────────────────────
    {
      name: '2a-file-change-after-verification-marks-verdict-stale',
      run() {
        const dir = makeRepo();
        try {
          const verified = hashOf(core, dir);
          write(dir, 'src/a.ts', 'export const a = 999 // zmiana po weryfikacji\n');
          const now = hashOf(core, dir);
          const b = core.treeBinding(verified, now);
          if (b.state !== 'stale') return 'zmiana pliku po weryfikacji nie dała stanu stale: ' + JSON.stringify(b);
          if (!/nieaktualn/.test(b.reason)) return 'powód stale nie mówi, że werdykt jest nieaktualny';
          if (core.treeBinding(verified, verified).state !== 'fresh') return 'ten sam hash nie dał fresh';
          // zmiana wyłącznie przez usunięcie pliku też jest zmianą
          git(dir, 'checkout', '--', 'src/a.ts');
          fs.rmSync(path.join(dir, 'src', 'a.ts'));
          if (core.treeBinding(verified, hashOf(core, dir)).state !== 'stale') return 'usunięcie pliku po weryfikacji nie unieważniło werdyktu';
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },
    {
      name: '2b-cli-check-exits-2-when-code-changed-after-verification',
      run() {
        const dir = makeRepo();
        try {
          const verified = cli(dir).out;
          if (!/^[0-9a-f]{40}$/.test(verified)) return 'CLI nie wypisał hasha: ' + verified;
          const same = cli(dir, '--check', verified);
          if (same.code !== 0 || !/ZGODNE/.test(same.out)) return 'bez zmian --check powinien dać 0: ' + JSON.stringify(same);
          write(dir, 'src/a.ts', 'export const a = 2\n');
          const stale = cli(dir, '--check', verified);
          if (stale.code !== 2) return 'zmiana kodu po weryfikacji powinna dać exit 2, jest ' + stale.code;
          if (!/NIEAKTUALNE/.test(stale.err)) return 'brak komunikatu NIEAKTUALNE: ' + stale.err;
          const bad = cli(dir, '--check', 'nie-hash');
          if (bad.code !== 1) return 'napis niebędący hashem powinien dać exit 1, jest ' + bad.code;
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },
    {
      name: '2c-engine-rejects-go-when-tree-changed-during-verifier-and-reverifies-without-implementer',
      async run() {
        const hashes = Object.assign(steady(HB), { 'domain-tree-pre-1': HA, 'domain-tree-post-1': HB, 'domain-tree-pre-2': HB, 'domain-tree-post-2': HB });
        const { report, calls } = await runEngine(src, hashes);
        const layer = report.layers[0];
        if (layer.status !== 'GO') return 'warstwa po ponownej weryfikacji powinna dostać GO: ' + JSON.stringify(layer);
        if (layer.attempts !== 2) return 'GO miało zapaść w próbie 2, attempts=' + layer.attempts;
        if (layer.treeHash !== HB) return 'GO nie niesie hasha drzewa, dla którego zapadło: ' + layer.treeHash;
        if (calls.filter((l) => l === 'domain-impl').length !== 1) return 'ponowna weryfikacja nie może wołać implementera ponownie';
        if (!/GO z próby 1 odrzucone/.test(warnText(report))) return 'brak ostrzeżenia o odrzuconym GO: ' + warnText(report);
        // dwukierunkowo: na szablonie bez sprawdzenia stale pierwsze GO przeszłoby
        const bad = await runEngine(broken, hashes);
        if (bad.report.layers[0].attempts !== 1) return 'zepsuta reguła powinna przepuścić nieaktualne GO w próbie 1 (eval nic nie pilnuje)';
        return null;
      },
    },
    {
      name: '2d-engine-halts-machine-when-every-attempt-goes-stale',
      async run() {
        const hashes = steady(HB);
        for (const n of [1, 2, 3]) { hashes['domain-tree-pre-' + n] = HA; hashes['domain-tree-post-' + n] = HB; }
        const { report, prompts } = await runEngine(src, hashes);
        const layer = report.layers[0];
        if (layer.status !== 'ESCALATE_AND_HALT') return 'wyczerpane próby powinny zatrzymać przebieg: ' + JSON.stringify(layer);
        if (layer.cause !== 'machine') return 'przyczyna to awaria maszyny, nie kod: cause=' + layer.cause;
        if (!/ORC-139/.test(layer.reason) || !/nieaktualn/.test(layer.reason)) return 'powód nie mówi o nieaktualnym GO: ' + layer.reason;
        if (report.finalGate) return 'po haltcie warstwy bramka końcowa nie powinna ruszyć';
        const vp = prompts.filter((x) => x.label === 'domain-verify').map((x) => x.prompt);
        if (vp.length !== 3) return 'oczekiwano 3 wywołań weryfikatora, jest ' + vp.length;
        if (new Set(vp).size !== 3) return 'prompty ponownej weryfikacji po stale nie różnią się — cache (etykieta+prompt, ORC-077) zwróciłby stare GO';
        if (!/NIEAKTUALNA/.test(vp[1]) || !/PRÓBY 1/.test(vp[1]) || !/PRÓBY 2/.test(vp[2])) return 'dopisek po stale bez numeru poprzedniej próby';
        if (/NIEAKTUALNA/.test(vp[0])) return 'pierwszy prompt weryfikatora nie może mieć dopisku';
        const bad = await runEngine(broken, hashes);
        if (bad.report.layers[0].status !== 'GO') return 'zepsuta reguła powinna uznać nieaktualne GO (eval nic nie pilnuje)';
        return null;
      },
    },
    {
      name: '2e-final-gate-go-on-changed-tree-is-regated-once-with-fresh-label',
      async run() {
        const hashes = Object.assign(steady(HB), { 'final-tree-pre': HA, 'final-tree-post': HB, 'final-tree-pre-restale': HB, 'final-tree-post-restale': HB });
        const { report, calls } = await runEngine(src, hashes);
        if (!report.finalGate || report.finalGate.verdict !== 'GO') return 'po powtórzonej ocenie bramka powinna dać GO: ' + JSON.stringify(report.finalGate);
        if (report.finalGate.treeHash !== HB) return 'GO bramki nie niesie hasha oceny powtórzonej: ' + report.finalGate.treeHash;
        if (!calls.includes('final-gate-restale')) return 'powtórka bramki nie poszła pod nową etykietą (cache silnika zwróciłby stary wynik)';
        if (!/bramka końcowa: GO odrzucone/.test(warnText(report))) return 'brak ostrzeżenia o odrzuconym GO bramki';
        return null;
      },
    },
    {
      name: '2f-final-gate-persistently-stale-is-no-go-machine',
      async run() {
        const hashes = Object.assign(steady(HB), { 'final-tree-pre': HA, 'final-tree-post': HB, 'final-tree-pre-restale': HB, 'final-tree-post-restale': HC });
        const { report } = await runEngine(src, hashes);
        const fg = report.finalGate;
        if (!fg || fg.verdict !== 'NO_GO' || fg.cause !== 'machine') return 'bramka ze stale także po powtórce powinna dać NO_GO machine: ' + JSON.stringify(fg);
        if (!/ORC-139/.test((fg.violations || [])[0] || '') || !/nieaktualn/.test(fg.violations[0])) return 'powód nie mówi o nieaktualnym GO: ' + JSON.stringify(fg.violations);
        if (fg.treeHash) return 'NO_GO z braku wiarygodnego werdyktu nie może nieść hasha';
        if (report.stageForReview) return 'uporczywe stale bramki nie może ustawiać stageForReview — pliki trafiłyby do git add mimo NO_GO: ' + JSON.stringify(report.stageForReview);
        if (report.staged) return 'przebieg zatrzymany nie może mieć listy staged';
        const bad = await runEngine(broken, hashes);
        if (!bad.report.finalGate || bad.report.finalGate.verdict !== 'GO') return 'zepsuta reguła powinna uznać nieaktualne GO bramki (eval nic nie pilnuje)';
        return null;
      },
    },
    {
      name: '2g-staged-tree-differing-from-seal-is-reported-not-silent',
      async run() {
        const hashes = Object.assign(steady(HB), { 'final-tree-seal': HC });
        const { report } = await runEngine(src, hashes);
        if (!report.treeHash || report.treeHash.verified !== HB || report.treeHash.sealed !== HC) return 'raport bez pieczęci: ' + JSON.stringify(report.treeHash);
        if (report.treeHash.postGateChanges !== true) return 'zmiana po werdykcie bramki nie oznaczona';
        if (!/po werdykcie bramki końcowej drzewo zmieniła runda naprawcza/.test(warnText(report))) return 'brak ostrzeżenia o zmianie po werdykcie';
        const calm = await runEngine(src, steady(HB));
        if (calm.report.treeHash.postGateChanges !== false || calm.report.treeHash.sealed !== HB) return 'spokojny przebieg oznaczony jako zmieniony';
        if (/ORC-139/.test(warnText(calm.report))) return 'spokojny przebieg nie powinien mieć ostrzeżeń ORC-139: ' + warnText(calm.report);
        return null;
      },
    },

    // ── (3) zmiana tylko w ścieżce wykluczonej → GO ważne ──────────────────────────
    {
      name: '3a-change-only-in-excluded-paths-keeps-verdict-fresh',
      run() {
        for (const ignoreEngine of [true, false]) {
          const err = this.check(ignoreEngine);
          if (err) return (ignoreEngine ? '[katalogi silnika w .gitignore] ' : '[katalogi silnika poza .gitignore] ') + err;
        }
        return null;
      },
      check(ignoreEngine) {
        const dir = makeRepo({ ignoreEngine });
        try {
          const verified = hashOf(core, dir, ['analysis/TS-FIX-001.analysis.md']);
          write(dir, '.claude/run-state/orchestrating.json', '{"task_id":"X"}');
          write(dir, '.claude/run-state/TS-FIX-001.report.md', '# raport');
          write(dir, '.claude/work/SESSION_STATE.md', 'stan');
          write(dir, 'telemetry/events/e.jsonl', '{}');
          write(dir, 'docs/tasks/_inbox/DEV-x.md', 'odstępstwo');
          write(dir, 'analysis/TS-FIX-001.analysis.md', 'layers_done: [domain]');
          write(dir, 'node_modules/pkg/index.js', 'ignorowany');
          const b = core.treeBinding(verified, hashOf(core, dir, ['analysis/TS-FIX-001.analysis.md']));
          if (b.state !== 'fresh') return 'zmiany w artefaktach silnika i plikach ignorowanych unieważniły werdykt: ' + JSON.stringify(b);
          // i odwrotnie: ta sama zmiana bez wykluczenia pliku analizy JEST widoczna
          if (hashOf(core, dir) === hashOf(core, dir, ['analysis/TS-FIX-001.analysis.md'])) return 'plik analizy nie jest wykluczany tylko na życzenie — wykluczenie nic nie robi';
          // wykluczenie nie może maskować kodu: zmiana pliku źródłowego obok nadal unieważnia
          write(dir, 'src/a.ts', 'export const a = 3\n');
          if (core.treeBinding(verified, hashOf(core, dir, ['analysis/TS-FIX-001.analysis.md'])).state !== 'stale') return 'wykluczenia zamaskowały zmianę kodu';
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },
    {
      name: '3b-cli-check-ignores-excluded-paths-and-honours-extra-exclude',
      run() {
        const dir = makeRepo();
        try {
          const verified = cli(dir, '--exclude', 'analysis/x.analysis.md').out;
          write(dir, '.claude/run-state/o.json', '{}');
          write(dir, 'analysis/x.analysis.md', 'layers_done: [a]');
          const ok = cli(dir, '--check', verified, '--exclude', 'analysis/x.analysis.md');
          if (ok.code !== 0 || !/ZGODNE/.test(ok.out)) return 'zmiana tylko w wykluczonych ścieżkach powinna być zgodna: ' + JSON.stringify(ok);
          const noExclude = cli(dir, '--check', verified);
          if (noExclude.code !== 2) return 'bez --exclude plik analizy jest kodem i zmiana powinna dać 2, jest ' + noExclude.code;
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },
    {
      name: '3c-exclude-list-takes-analysis-and-task-files-and-drops-unsafe-paths',
      run() {
        const ex = core.treeHashExcludes({ task: { analysisFile: 'a/x.analysis.md', taskFile: 'tasks/x.md' }, treeHashExclude: ["evil'; rm -rf ~", '../outside', '/abs/path', 'ok/dir/'] });
        for (const want of ['.claude/run-state', '.claude/work', 'a/x.analysis.md', 'tasks/x.md', 'ok/dir']) if (!ex.includes(want)) return 'brak wykluczenia ' + want + ': ' + ex.join(',');
        for (const bad of ["evil'; rm -rf ~", '../outside', '/abs/path']) if (ex.includes(bad)) return 'niebezpieczna ścieżka przeszła do polecenia: ' + bad;
        if (/[;`$]\s*rm /.test(core.treeHashCmd(ex).replace(/rm -f "\$_i" "\$_i\.lock"/, ''))) return 'polecenie hasha zawiera wstrzyknięte polecenie';
        return null;
      },
    },

    // ── (4) artefakt bez pola hash → ostrzeżenie, nie błąd ─────────────────────────
    {
      name: '4a-artifact-without-hash-field-warns-and-does-not-fail',
      run() {
        for (const missing of [undefined, null, '']) {
          const b = core.treeBinding(missing, HA);
          if (b.state !== 'missing' || !b.warning) return 'brak pola ' + JSON.stringify(missing) + ' powinien dać missing z ostrzeżeniem: ' + JSON.stringify(b);
        }
        const dir = makeRepo();
        try {
          for (const absent of [['--check', ''], ['--check', '-']]) {
            const r = cli(dir, ...absent);
            if (r.code !== 0) return 'brak hasha w artefakcie nie może kończyć się błędem: ' + JSON.stringify(r);
            if (!/OSTRZEŻENIE/.test(r.err)) return 'brak ostrzeżenia na stderr: ' + JSON.stringify(r);
          }
          return null;
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      },
    },
    {
      name: '4b-engine-probe-without-result-is-warning-not-halt',
      async run() {
        const { report } = await runEngine(src, {}); // żadna sonda hasha nie zwraca wyniku
        const layer = report.layers[0];
        if (layer.status !== 'GO') return 'brak hasha nie może blokować warstwy: ' + JSON.stringify(layer);
        if (layer.treeHash) return 'warstwa bez potwierdzonego hasha nie może go nieść';
        if (!report.finalGate || report.finalGate.verdict !== 'GO') return 'brak hasha nie może blokować bramki końcowej';
        if (!/werdykt bez hasha drzewa/.test(warnText(report))) return 'brak ostrzeżenia o werdykcie bez hasha: ' + warnText(report);
        const th = report.treeHash;
        if (!th || th.enabled !== true || th.bound !== 0 || th.unbound !== 2) return 'zbiorczy wskaźnik: oczekiwano bound=0 unbound=2, jest ' + JSON.stringify(th);
        if (!/werdykty bez hasha drzewa: 2 z 2/.test(report.statusLine)) return 'statusLine nie mówi o werdyktach bez hasha: ' + report.statusLine;
        const ok = await runEngine(src, steady(HB));
        if (ok.report.treeHash.bound !== 2 || ok.report.treeHash.unbound !== 0) return 'spokojny przebieg: bound/unbound ' + JSON.stringify(ok.report.treeHash);
        if (/hasha drzewa/.test(ok.report.statusLine)) return 'spokojny przebieg nie powinien mieć wzmianki o hashu w statusLine: ' + ok.report.statusLine;
        return null;
      },
    },
    {
      name: '4c-model-cannot-forge-hash-shape-and-switch-off-skips-probes',
      async run() {
        if (core.parseTreeHash('abc123') !== null || core.parseTreeHash('zz'.repeat(20)) !== null || core.parseTreeHash(undefined) !== null) return 'parseTreeHash przepuszcza śmieci';
        if (core.parseTreeHash(' ' + HA.toUpperCase() + '\n') !== HA) return 'parseTreeHash nie normalizuje białych znaków i wielkości liter';
        if (core.treeBinding('nie-hash', HA).state !== 'unknown') return 'zapisany śmieć powinien dać unknown';
        const { report, calls } = await runEngine(src, steady(HB), { treeBinding: false });
        if (calls.some((l) => /tree-(pre|post|seal)/.test(l))) return 'treeBinding:false nadal woła sondy hasha';
        if (!report.treeHash || report.treeHash.enabled !== false) return 'treeBinding:false musi zostawić ślad w raporcie (treeHash.enabled=false): ' + JSON.stringify(report.treeHash);
        if (!/niezwiązane z hashem drzewa/.test(report.statusLine)) return 'statusLine nie mówi, że wiązanie jest wyłączone: ' + report.statusLine;
        if (report.layers[0].status !== 'GO') return 'wyłączone wiązanie zmieniło wynik warstwy';
        return null;
      },
    },
    {
      name: '4d-malformed-hash-from-probe-leaves-trace-in-ask-errors',
      async run() {
        const hashes = Object.assign(steady(HB), { 'domain-tree-pre-1': 'to-nie-jest-hash', 'final-tree-seal': '' });
        const { report } = await runEngine(src, hashes);
        const errs = (report.askErrors || []).filter((e) => /tree_hash odrzucony/.test(e.message));
        if (errs.length !== 2) return 'oczekiwano 2 wpisów askErrors (zły kształt + puste), jest ' + errs.length + ': ' + JSON.stringify(report.askErrors);
        if (!errs.some((e) => e.label === 'domain-tree-pre-1')) return 'wpis nie wskazuje etykiety sondy';
        if (report.layers[0].status !== 'GO') return 'zły kształt hasha nie może blokować warstwy (fail-open z ostrzeżeniem)';
        if (report.treeHash.unbound < 1) return 'werdykt bez poprawnego hasha nie został policzony jako unbound: ' + JSON.stringify(report.treeHash);
        return null;
      },
    },
    {
      name: '5-template-keeps-the-hash-rule-wired-and-passes-workflow-lint',
      run() {
        for (const needle of ['treeBinding(treePre, treePost)', "label: 'final-gate-restale'", "'final-tree-seal'", 'TREE_HASH_SCHEMA']) {
          if (!src.includes(needle)) return 'szablon nie zawiera ' + needle;
        }
        const lint = spawnSync('node', [path.join(REPO, 'hooks', 'workflow-lint.js'), TEMPLATE], { encoding: 'utf8' });
        if (lint.status !== 0 || /\[WL\d+\]/.test(lint.stdout)) return 'workflow-lint: ' + (lint.stdout + lint.stderr).trim();
        return null;
      },
    },
  ];
};

(async () => {
  const core = (await import('file://' + CORE)).default;
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const cases = CASES(core, src);
  let failed = 0;
  for (const t of cases) {
    let err;
    try { err = await t.run(); } catch (e) { err = 'wyjątek: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); }
    if (err) { failed++; process.stdout.write(`  ❌ ${t.name} — ${err}\n`); }
    else process.stdout.write(`  ✅ ${t.name}\n`);
  }
  process.stdout.write(`\n${cases.length - failed}/${cases.length} passed\n`);
  process.exit(failed ? 1 : 0);
})();
