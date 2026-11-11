#!/usr/bin/env node
/**
 * tests/flow-evals/orchestrate-flow/run.js — eval L1: CAŁY skrypt Workflow `orchestrate.template.mjs` z atrapą agenta.
 *
 * Zero LLM, zero sieci. Pozostałe evale (`orchestrate-script`) testują czyste funkcje wycięte z szablonu; tu
 * wykonujemy szablon od początku do końca jako funkcję async z wstrzykniętymi `agent`, `log`, `args`, `phase`
 * (tak jak robi to Workflow), więc sprawdzamy też miejsca wywołań, których test funkcji nie dotyka: rundę
 * naprawczą po bramce końcowej, rundę 2 i opcje eksperymentalne `gateDelta` (E2) i `gateDiff` (E3).
 * Prawdziwy przebieg kosztuje kilka-kilkanaście dolarów, a błąd w rundzie 2 marnuje go w całości.
 *
 * Atrapa odpowiada wg kształtu schematu (nie wg etykiety, poza bramką końcową): implementer zmienia jeden plik,
 * sonda i weryfikator warstwy dają zielone, bramka końcowa rundy 1 daje NO_GO z jednym ustaleniem, runda 2 daje GO.
 *
 * Uruchom: node tests/flow-evals/orchestrate-flow/run.js
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const TEMPLATE = fs.readFileSync(path.join(REPO, 'scripts', 'workflow', 'orchestrate.template.mjs'), 'utf8')
  .replace(/^export const meta/m, 'const meta');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const ARGS = {
  task: { id: 'TS-FIX-001', title: 'Zadanie testowe', taskFile: 't.md', analysisFile: 'a.md', decisions: [], layersDone: [] },
  layers: [
    { id: 'infrastructure', dirs: ['src/infrastructure/'], agent: 'infra-impl', role: 'Styk ze światem.', checks: ['typecheck'], skip: false, tests: false, optional: false, layerPatterns: [] },
  ],
  patterns: [],
  checks: { byLayer: {}, finalGate: [] },
  budgets: { verify: { max_tool_calls: 12, on_limit: 'emit-partial' } },
  knowledge: { collection: 'x' },
  humanVoice: { language: 'pl' },
  verifiers: { layer: 'cqv', maxAttempts: 2, onMax: 'ESCALATE_AND_HALT', finalGate: 'sec-gate', onFail: 'ESCALATE_AND_HALT' },
  exit: 'STAGE_NOT_COMMIT',
  baseSha: 'abc1234',
  treeBinding: false,
  dirtyAtStart: [],
};

// round1: 'NO_GO' (domyślnie) albo 'GO'. Zwraca { report, calls, unknown }.
async function runFlow(extra = {}, { round1 = 'NO_GO' } = {}) {
  const calls = [];
  const unknown = [];
  let fingerprints = 0;
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    calls.push({ label, prompt });
    const props = (opts.schema && opts.schema.properties) || {};
    if ('changed_files' in props) return { changed_files: ['src/infrastructure/a.ts'], summary: 'ok' };
    if ('verdict' in props) {
      if (label === 'final-gate' && round1 === 'NO_GO') {
        return { verdict: 'NO_GO', violations: ['src/infrastructure/a.ts:3 — a1 — popraw'], findings: [{ ruleId: 'a1', line: 3, file: 'src/infrastructure/a.ts' }], rationale: 'r' };
      }
      return { verdict: 'GO', violations: [], rationale: 'r' };
    }
    if ('typecheck' in props) return { typecheck: 'pass', tests: 'pass', lint: 'pass' };
    if ('fingerprint' in props) return { fingerprint: 'fp' + fingerprints++ };
    if ('files' in props) return { files: ['src/infrastructure/a.ts'], commits: 0 };
    if ('removed' in props) return { removed: [] };
    unknown.push(label + ' ' + JSON.stringify(Object.keys(props)));
    return {};
  };
  const fn = new AsyncFunction('agent', 'log', 'args', 'phase', TEMPLATE);
  const report = await fn(agent, () => {}, Object.assign({}, ARGS, extra), () => {});
  return { report, calls, unknown };
}

const promptOf = (r, label) => { const c = r.calls.find((x) => x.label === label); return c ? c.prompt : null; };

const CASES = [
  {
    name: 'base-flow-reaches-round-2-and-ends-go-with-full-review',
    async run() {
      const r = await runFlow();
      if (r.unknown.length) return `atrapa nie zna schematu kroku: ${r.unknown.join('; ')}`;
      if (!r.report.finalGate || r.report.finalGate.verdict !== 'GO') return `werdykt końcowy: ${JSON.stringify(r.report.finalGate)}`;
      const g2 = promptOf(r, 'final-gate-r2');
      if (!g2) return 'brak rundy 2 bramki po NO_GO z naprawialnym ustaleniem';
      if (!/Zweryfikuj poprawki i całość/.test(g2) || /TRYB DELTY/.test(g2)) return 'domyślna runda 2 nie czyta całości';
      if (/TRYB DIFFU/.test(promptOf(r, 'final-gate'))) return 'domyślna runda 1 ma tryb diffu';
      if ('finalGateDelta' in r.report || 'finalGateDiff' in r.report) return 'ślad opcji w raporcie bez włączonej opcji';
      const fix = r.report.finalFix;
      if (!fix || JSON.stringify(fix.changedFiles) !== JSON.stringify(['src/infrastructure/a.ts'])) return `finalFix.changedFiles: ${JSON.stringify(fix)}`;
      return null;
    },
  },
  {
    name: 'gate-delta-round-2-gets-changed-files-and-round-1-rule-ids',
    async run() {
      const r = await runFlow({ gateDelta: true });
      if (r.unknown.length) return `atrapa nie zna schematu kroku: ${r.unknown.join('; ')}`;
      const g2 = promptOf(r, 'final-gate-r2');
      if (!g2) return 'brak rundy 2';
      if (!/TRYB DELTY/.test(g2) || /Zweryfikuj poprawki i całość/.test(g2)) return 'runda 2 nie jest w trybie delty';
      if (!/- src\/infrastructure\/a\.ts/.test(g2)) return 'delta bez pliku zmienionego przez naprawę';
      if (!/reguły z rundy 1: a1/.test(g2)) return 'delta bez ruleId z findings rundy 1';
      if (!/NIE wpisuj ich do `unverified_scope`/.test(g2)) return 'delta nie chroni przed wymuszonym NO_GO z luk';
      if (JSON.stringify(r.report.finalGateDelta) !== JSON.stringify({ files: 1, ruleIds: ['a1'] })) return `report.finalGateDelta: ${JSON.stringify(r.report.finalGateDelta)}`;
      if (r.report.finalGate.verdict !== 'GO') return 'przepływ z deltą nie kończy się GO';
      return null;
    },
  },
  {
    name: 'first-gate-prompt-is-identical-with-and-without-gate-delta',
    async run() {
      const a = promptOf(await runFlow(), 'final-gate');
      const b = promptOf(await runFlow({ gateDelta: true }), 'final-gate');
      return a && a === b ? null : 'gateDelta zmienił prompt PIERWSZEJ bramki (kryterium: pierwszy przebieg bez zmian)';
    },
  },
  {
    name: 'gate-diff-round-1-gets-diff-block-with-run-base',
    async run() {
      const r = await runFlow({ gateDiff: true });
      if (r.unknown.length) return `atrapa nie zna schematu kroku: ${r.unknown.join('; ')}`;
      const g1 = promptOf(r, 'final-gate');
      if (!/TRYB DIFFU/.test(g1) || !/`git diff -U25 abc1234`/.test(g1)) return 'runda 1 bez bloku diffu z bazą przebiegu';
      if (r.report.finalGateDiff !== true) return `report.finalGateDiff: ${r.report.finalGateDiff}`;
      if (/TRYB DELTY/.test(promptOf(r, 'final-gate-r2'))) return 'gateDiff włączył deltę rundy 2 (opcje mają być niezależne)';
      return r.report.finalGate.verdict === 'GO' ? null : 'przepływ z trybem diffu nie kończy się GO';
    },
  },
  {
    name: 'both-options-are-independent-and-compose',
    async run() {
      const r = await runFlow({ gateDelta: true, gateDiff: true });
      if (!/TRYB DIFFU/.test(promptOf(r, 'final-gate')) || !/TRYB DELTY/.test(promptOf(r, 'final-gate-r2'))) return 'obie opcje razem nie działają';
      return r.report.finalGate.verdict === 'GO' ? null : 'werdykt końcowy nie GO';
    },
  },
  {
    name: 'gate-delta-without-repair-does-not-leave-a-trace',
    async run() {
      const r = await runFlow({ gateDelta: true }, { round1: 'GO' });
      if (promptOf(r, 'final-gate-r2')) return 'runda 2 po GO w rundzie 1';
      if ('finalGateDelta' in r.report) return 'ślad delty bez rundy 2';
      return r.report.finalGate.verdict === 'GO' ? null : 'werdykt końcowy nie GO';
    },
  },
];

(async () => {
  let failed = 0;
  for (const c of CASES) {
    let err;
    try { err = await c.run(); } catch (e) { err = 'wyjątek: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); }
    if (err) { failed++; process.stdout.write(`  ❌ ${c.name} — ${err}\n`); } else process.stdout.write(`  ✅ ${c.name}\n`);
  }
  process.stdout.write(`\n${CASES.length - failed}/${CASES.length} passed\n`);
  process.exit(failed ? 1 : 0);
})();
