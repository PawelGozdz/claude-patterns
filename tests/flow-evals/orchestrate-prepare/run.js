#!/usr/bin/env node
/**
 * tests/flow-evals/orchestrate-prepare/run.js — eval L1 (D7) dla scripts/orchestrate-prepare.mjs.
 *
 * Zero LLM. Każdy przypadek buduje kompletny mini-projekt w katalogu tymczasowym
 * (runtime.yml + artefakt analizy + plik taska + drzewko wzorców), odpala skrypt
 * i sprawdza kod wyjścia oraz kształt JSON-a.
 *
 * Wzorce fixture'ów leżą w `.claude/knowledge/patterns/` mini-projektu, więc eval nie
 * zależy od aktualnej zawartości `patterns/` w claude-patterns — zmiana korpusu wzorców
 * nie może fałszywie zaczerwienić tego evala.
 *
 * Uruchom: node tests/flow-evals/orchestrate-prepare/run.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'orchestrate-prepare.mjs');

// ── budowa mini-projektu ─────────────────────────────────────────────────────────
function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

const RUNTIME_DDD = `schema_version: 1
materialized_at: "2026-09-07T00:00:00.000Z"
source_hash: "deadbeef1234"
stack_blocks: [nestjs, ddd/core]

patterns:
  always:
    - cross-layer/conventions-pattern.md
  triggers:
    - keywords: [aggregate, value object]
      include:
        - domain/fixture-nocard-pattern.md
    - keywords: [postgis, spatial]
      include:
        - infrastructure/geo-spatial-query-pattern.md

analyze:
  exit: PAUSE

orchestrate:
  layers:
    - {id: domain, dirs: [domain/], agent: "domain-application-implementer", role: "Model domenowy.", checks: ["typecheck"]}
    - {id: testing, dirs: [__tests__/], agent: "test-implementer", tests: true, checks: ["typecheck", "test"]}
  inner_loop: {verify: "code-quality-verifier", max_attempts: 3, on_max: ESCALATE_AND_HALT}
  final_gate: {agent: "security-e2e-verifier", on_fail: ESCALATE_AND_HALT}
  exit: STAGE_NOT_COMMIT

knowledge:
  collection: code_fixture

human_voice:
  language: pl
  register: business
  max_sentences: 2
  avoid: [nazwy klas]

budgets:
  verify: {max_tool_calls: 15, on_limit: emit-partial}
`;

// Projekt bez bloku procesowego: brak sekcji `orchestrate:` → jedna warstwa generyczna.
const RUNTIME_FLAT = `schema_version: 1
source_hash: "cafe00001111"
stack_blocks: [node]

patterns:
  always:
    - cross-layer/conventions-pattern.md

analyze:
  exit: CONTINUE
`;

const CARD = '# Karta: konwencje\n\n## Reguły\n- nazwy w camelCase\n';
const FULL_PATTERN = '# Pattern: Aggregate\n\n## What This Is\nAgregat jako granica spójności.\n';
const GEO_PATTERN = '# Pattern: Geo\n\n## What This Is\nZapytania przestrzenne.\n';

function makeProject(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-prep-'));
  if (opts.runtime !== null) write(root, '.claude/config/runtime.yml', opts.runtime ?? RUNTIME_DDD);

  // wzorce: conventions ma kartę, aggregate NIE ma (świadomie — przypadek „pełny wzorzec")
  write(root, '.claude/knowledge/patterns/cross-layer/conventions-pattern.md', '# Pattern: Conventions\n\n## What\nx\n');
  write(root, '.claude/knowledge/patterns/cross-layer/conventions-pattern_summary.md', CARD);
  write(root, '.claude/knowledge/patterns/domain/fixture-nocard-pattern.md', FULL_PATTERN);
  write(root, '.claude/knowledge/patterns/infrastructure/geo-spatial-query-pattern.md', GEO_PATTERN);
  write(root, '.claude/knowledge/patterns/infrastructure/geo-spatial-query-pattern_summary.md', '# Karta: geo\n\n## Reguły\n- ST_DWithin\n');

  if (opts.analysis !== null) write(root, `project-orchestration/analysis/${opts.taskId}.analysis.md`, opts.analysis);
  if (opts.task !== null) write(root, `project-orchestration/tasks/${opts.taskId}-slug.md`, opts.task);
  return root;
}

function analysisFm({ status = 'approved', answer = "'tak'", layersDone = null, patterns = ['domain/fixture-nocard-pattern.md'] }) {
  return `---
task: TS-FIX-001
status: ${status}
${layersDone ? `layers_done: [${layersDone.join(', ')}]\n` : ''}open_questions:
  - id: Q1
    ask: "Czy robimy X?"
    q: "X?"
    answer: ${answer}

decisions:
  - id: D1
    topic: "temat"
    choice: "wybór"
    means: "znaczenie"
    rationale: "uzasadnienie"

patterns:
${patterns.map((p) => `  - ${p}`).join('\n')}
---

# Analiza

## Synteza
Treść analizy.
`;
}

function taskFile(body) {
  return `---
id: TS-FIX-001
title: "Zadanie testowe"
type: implementation
labels: [backend]
---

# Zadanie

${body}
`;
}

function run(root, taskId, extra = []) {
  const r = spawnSync('node', [SCRIPT, taskId, '--project', root, '--json', ...extra], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* wyjście nie-JSON przy błędach — celowo */ }
  return { code: r.status, json, stderr: r.stderr, stdout: r.stdout };
}

// ── przypadki ────────────────────────────────────────────────────────────────────
const CASES = [];

CASES.push({
  name: 'approved-trigger-matched-card-injected',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: analysisFm({}),
    task: taskFile('Dodaj nowy aggregate do modelu domenowego.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const paths = r.json.patterns.map((p) => p.path);
    if (!paths.includes('cross-layer/conventions-pattern.md')) return 'brak wzorca z always';
    if (!paths.includes('domain/fixture-nocard-pattern.md')) return 'trigger "aggregate" nie dopasowany';
    if (paths.includes('infrastructure/geo-spatial-query-pattern.md')) return 'trigger "postgis" dopasowany mimo braku keywordu w tasku';
    const conv = r.json.patterns.find((p) => p.path === 'cross-layer/conventions-pattern.md');
    if (!conv.card) return 'karta conventions nie została wybrana';
    if (!conv.content.includes('camelCase')) return 'treść karty nie została wstrzyknięta';
    const agg = r.json.patterns.find((p) => p.path === 'domain/fixture-nocard-pattern.md');
    if (agg.card) return 'aggregate nie ma karty, a zgłoszony jako karta';
    if (!agg.content.includes('granica spójności')) return 'treść pełnego wzorca nie została wstrzyknięta';
    if (!r.json.warnings.some((w) => w.includes('nie ma karty'))) return 'brak ostrzeżenia o braku karty';
    if (!agg.matchedKeywords.includes('aggregate')) return 'brak śladu, KTÓRY keyword trafił';
    return null;
  },
});

CASES.push({
  name: 'awaiting-human-exit-2',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: analysisFm({ status: 'awaiting-human' }),
    task: taskFile('Cokolwiek.'),
  }),
  check(r) {
    if (r.code !== 2) return `oczekiwano exit 2, było ${r.code}`;
    if (!/status artefaktu = "awaiting-human"/.test(r.stderr)) return 'stderr nie wymienia powodu (status)';
    return null;
  },
});

CASES.push({
  name: 'null-answer-exit-2',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: analysisFm({ answer: 'null' }),
    task: taskFile('Cokolwiek.'),
  }),
  check(r) {
    if (r.code !== 2) return `oczekiwano exit 2, było ${r.code}`;
    if (!/open_questions bez odpowiedzi: Q1/.test(r.stderr)) return 'stderr nie wymienia niezapełnionego pytania';
    return null;
  },
});

// ORC-102: frontmatter z błędem składni YAML (`\`` w ciągu w cudzysłowach) nie może po cichu gubić
// units[]/decisions[]/minor_fixes — start ma stanąć z komunikatem, nie z planem bez jednostek.
CASES.push({
  name: 'broken-frontmatter-yaml-exit-2',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: '---\nstatus: approved\nunits:\n  - { id: docs, layer: domain, dirs: ["a.md"], reason: "kod \\`x\\` w cudzysłowie" }\n---\n\n# Analiza\n',
    task: taskFile('Cokolwiek.'),
  }),
  check(r) {
    if (r.code !== 2) return `oczekiwano exit 2, było ${r.code}`;
    if (!/nie parsuje się jako YAML/.test(r.stderr)) return 'stderr nie mówi, że frontmatter nie parsuje się: ' + r.stderr.slice(0, 200);
    if (!/units\[\]/.test(r.stderr)) return 'stderr nie wymienia pól, które zostałyby pominięte';
    return null;
  },
});

CASES.push({
  name: 'pause-without-analysis-exit-2',
  build: () => makeProject({ taskId: 'TS-FIX-001', analysis: null, task: taskFile('x') }),
  check(r) {
    if (r.code !== 2) return `oczekiwano exit 2, było ${r.code}`;
    if (!/analyze.exit: PAUSE/.test(r.stderr)) return 'stderr nie tłumaczy, że bramkę wnosi PAUSE';
    return null;
  },
});

CASES.push({
  name: 'missing-runtime-exit-3',
  build: () => makeProject({ taskId: 'TS-FIX-001', runtime: null, analysis: analysisFm({}), task: taskFile('x') }),
  check(r) {
    if (r.code !== 3) return `oczekiwano exit 3, było ${r.code}`;
    if (!/ADR 0008/.test(r.stderr)) return 'stderr nie odsyła do kompozycji bloków';
    return null;
  },
});

CASES.push({
  name: 'flat-project-generic-layer',
  build: () => makeProject({
    taskId: 'TS-FIX-001', runtime: RUNTIME_FLAT,
    analysis: null,
    task: taskFile('Płaski serwis bez warstw.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    if (r.json.layers.length !== 1 || r.json.layers[0].id !== 'implementation') return 'brak fallbacku na jedną warstwę generyczną';
    if (r.json.verifiers.layer !== null) return 'verifier warstwy powinien być pusty (brak slotu)';
    if (r.json.exit !== 'STAGE_NOT_COMMIT') return 'domyślne wyjście powinno zostać STAGE_NOT_COMMIT';
    return null;
  },
});

CASES.push({
  name: 'layers-done-marks-skip',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: analysisFm({ layersDone: ['domain'] }),
    task: taskFile('Dodaj aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const domain = r.json.layers.find((l) => l.id === 'domain');
    if (!domain.skip) return 'warstwa z layers_done nie jest oznaczona jako pominięta';
    const testing = r.json.layers.find((l) => l.id === 'testing');
    if (testing.skip) return 'warstwa spoza layers_done oznaczona jako pominięta';
    // checks bramki końcowej = suma checks warstw, które FAKTYCZNIE wejdą
    if (JSON.stringify(r.json.checks.finalGate.sort()) !== JSON.stringify(['test', 'typecheck'])) {
      return `checks.finalGate = ${JSON.stringify(r.json.checks.finalGate)}, oczekiwano sumy z warstw uruchamianych`;
    }
    return null;
  },
});

CASES.push({
  name: 'script-path-and-runtime-hash-present',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: analysisFm({}),
    task: taskFile('Dodaj aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code}`;
    if (!fs.existsSync(r.json.scriptPath)) return `scriptPath wskazuje nieistniejący plik: ${r.json.scriptPath}`;
    if (r.json.runtimeHash.source !== 'deadbeef1234') return 'source_hash nie przepisany z runtime.yml';
    if (!/^[0-9a-f]{12}$/.test(r.json.runtimeHash.file)) return 'brak skrótu treści runtime.yml';
    if (!r.json.knowledge.collection) return 'brak knowledge.collection';
    if (r.json.humanVoice.language !== 'pl') return 'brak human_voice';
    if (!r.json.budgets.verify) return 'brak budżetów';
    return null;
  },
});

// ── TS-MH-005 (marketing-hub): formy, które analiza wyraża, a prepare gubił ──────
const withFm = (extra) => analysisFm({}).split('\n---\n\n# Analiza').join('\n' + extra + '\n---\n\n# Analiza');
const RUNTIME_GATE_CHECKS = RUNTIME_DDD.split(
  'final_gate: {agent: "security-e2e-verifier", on_fail: ESCALATE_AND_HALT}').join(
  'final_gate: {agent: "security-e2e-verifier", on_fail: ESCALATE_AND_HALT, checks: ["test", "lint:check"]}');

CASES.push({
  name: 'final-gate-checks-survive-skipped-testing-layer',
  build: () => makeProject({
    taskId: 'TS-FIX-001', runtime: RUNTIME_GATE_CHECKS,
    analysis: withFm('layers_skip:\n  - { id: testing, reason: "task nie dotyka testów" }'),
    task: taskFile('Dodaj aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const fg = r.json.checks.finalGate;
    if (!fg.includes('test')) return 'final_gate.checks z bloku zgubione przy pominiętej warstwie testing: ' + fg.join(',');
    if (!fg.includes('typecheck')) return 'checks warstw, które weszły, zgubione';
    if (fg[0] !== 'test') return 'final_gate.checks nie idą pierwsze';
    return null;
  },
});

const RUNTIME_CONFORMANCE = RUNTIME_GATE_CHECKS.replace(
  'checks: ["typecheck"]}', 'checks: ["typecheck", "conformance"]}').replace(
  'checks: ["test", "lint:check"]}', 'checks: ["test", "conformance"]}');

CASES.push({
  name: 'conformance-stays-a-bare-id-and-prepare-only-supplies-the-tool-path',
  // ORC-140: komendę składa template (zakres warstwy / SHA / pliki cudze znane dopiero tam), nie prepare
  build: () => makeProject({ taskId: 'TS-FIX-001', runtime: RUNTIME_CONFORMANCE, analysis: withFm(''), task: taskFile('Dodaj aggregate.') }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const dom = r.json.layers.find((l) => l.id === 'domain');
    if (!dom.checks.includes('conformance') || dom.checks.some((c) => /check\.mjs/.test(c))) return 'wpis conformance rozwinięty w prepare: ' + dom.checks.join(' | ');
    if (!r.json.checks.finalGate.includes('conformance')) return 'conformance z final_gate.checks zgubione: ' + r.json.checks.finalGate.join(',');
    const tool = r.json.conformance && r.json.conformance.tool;
    if (!tool || !/\/tools\/conformance\/check\.mjs$/.test(tool) || !require('fs').existsSync(tool)) return 'brak/zła ścieżka narzędzia w out.conformance.tool: ' + tool;
    return null;
  },
});

// ORC-142: pakiet zadań
const unitsYaml = (n, ctxCount) => 'units:\n' + Array.from({ length: n }, (_, i) => `  - { id: u${i}, layer: domain, dirs: [src/contexts/c${i % ctxCount}/domain/${i}/] }`).join('\n');
const bundleCase = (name, extra, task, check) => CASES.push({
  name,
  build: () => makeProject({ taskId: 'TS-FIX-001', analysis: withFm(extra), task: taskFile(task) }),
  check,
});
bundleCase('bundle-two-signals-stop-the-run-exit-2', unitsYaml(21, 5), 'Dodaj aggregate.', (r) => {
  if (r.code !== 2) return `oczekiwano exit 2, było ${r.code} (${r.stderr.trim().slice(0, 160)})`;
  if (!/PAKIET/.test(r.stderr) || !/bundle_ack/.test(r.stderr)) return 'komunikat bez nazwy problemu i wyjścia (bundle_ack): ' + r.stderr;
  return null;
});
bundleCase('bundle-ack-lets-it-through-with-a-warning', unitsYaml(21, 5) + '\nbundle_ack: "jeden PR, wspólna migracja"', 'Dodaj aggregate.', (r) => {
  if (r.code !== 0) return `oczekiwano exit 0 z bundle_ack, było ${r.code} (${r.stderr.trim().slice(0, 160)})`;
  if (!r.json.warnings.some((w) => /bundle_ack/.test(w))) return 'brak ostrzeżenia o zaakceptowanym pakiecie';
  return null;
});
bundleCase('bundle-one-signal-only-warns', unitsYaml(21, 2), 'Dodaj aggregate.', (r) => {
  if (r.code !== 0) return `oczekiwano exit 0, było ${r.code}`;
  if (!r.json.warnings.some((w) => /rozmiar zadania/.test(w) && /dużo jednostek/.test(w))) return 'brak ostrzeżenia o jednym sygnale: ' + JSON.stringify(r.json.warnings);
  return null;
});
bundleCase('bundle-pr-mentions-alone-never-stop', '', 'PR1 schema, PR2 api, PR3 ui, PR4 docs.', (r) => {
  if (r.code !== 0) return `samo „PRn" zatrzymało start: exit ${r.code}`;
  if (!r.json.warnings.some((w) => /kilka PR-ów/.test(w))) return 'brak ostrzeżenia o wielu PR-ach';
  return null;
});
bundleCase('bundle-pr-mentions-plus-one-real-signal-stop', unitsYaml(21, 2), 'PR1 schema, PR2 api, PR3 ui.', (r) => {
  if (r.code !== 2) return `PRn + dużo jednostek powinno zatrzymać, było exit ${r.code}`;
  return null;
});

bundleCase('bundle-ack-with-wrong-type-is-explained-not-ignored', unitsYaml(21, 5) + '\nbundle_ack: true', 'Dodaj aggregate.', (r) => {
  if (r.code !== 2) return `bundle_ack: true nie powinno być zgodą: exit ${r.code}`;
  if (!/musi być napisem z powodem/.test(r.stderr)) return 'komunikat nie tłumaczy, czemu bundle_ack nie zadziałał: ' + r.stderr;
  return null;
});
bundleCase('bundle-non-array-units-fail-in-the-analysis-gate-not-with-a-crash', 'units: "to nie jest lista"', 'Dodaj aggregate.', (r) => {
  if (r.code !== 2) return `units jako napis: exit ${r.code}, oczekiwano 2 z bramki analizy`;
  if (/TypeError|at .*\.mjs:\d+/.test(r.stderr)) return 'nieobsłużony wyjątek zamiast komunikatu: ' + r.stderr.slice(0, 200);
  return null;
});
// ANL-049/050: decyzja sprzeczna z kartą albo z fałszywą przesłanką wymaga sparowanego, zatwierdzonego pytania
const flagged = (decisionExtra, questions, check, name) => CASES.push({
  name,
  build: () => {
    const fm = analysisFm({});
    const withDecision = fm.replace('    rationale: "uzasadnienie"\n', '    rationale: "uzasadnienie"\n' + decisionExtra);
    const withQuestions = withDecision.replace("    answer: 'tak'\n", "    answer: 'tak'\n" + questions);
    return makeProject({ taskId: 'TS-FIX-001', analysis: withQuestions, task: taskFile('Dodaj aggregate.') });
  },
  check,
});
const PAIRED = (answer, opts = '["Zatwierdzam wyjątek od CH5: callback blokady wymaga wyjątku (recommended)", "Zmieniamy podejście: Result.fail w callbacku"]') =>
  `  - id: Q2\n    ask: "Decyzja łamie regułę CH5. Zatwierdzasz wyjątek?"\n    q: "wyjątek od CH5"\n    decision: D1\n    options: ${opts}\n    answer: ${answer}\n`;
flagged('    card_conflict: [CH5]\n', '', (r) => {
  if (r.code !== 2) return `decyzja sprzeczna z kartą bez pytania powinna zatrzymać: exit ${r.code}`;
  if (!/nie ma pytania z `decision: D1`/.test(r.stderr)) return 'komunikat bez wskazania brakującego pytania: ' + r.stderr;
  return null;
}, 'card-conflict-without-paired-question-stops');
flagged('    card_conflict: [CH5]\n', PAIRED('"Zatwierdzam wyjątek od CH5: callback blokady wymaga wyjątku"'), (r) => {
  if (r.code !== 0) return `zatwierdzony wyjątek powinien przejść: exit ${r.code} (${r.stderr.trim().slice(0, 200)})`;
  return null;
}, 'card-conflict-with-approving-answer-passes');
flagged('    card_conflict: [CH5]\n', PAIRED('"Zmieniamy podejście: Result.fail w callbacku"'), (r) => {
  if (r.code !== 2) return `odpowiedź „zmieniamy podejście" przy nadal oznaczonej decyzji powinna zatrzymać: exit ${r.code}`;
  if (!/nie zatwierdza wyjątku/.test(r.stderr) || !/zdejmij flagę/.test(r.stderr)) return 'komunikat bez wskazówki, co zrobić: ' + r.stderr;
  return null;
}, 'card-conflict-answered-change-approach-stops-until-flag-removed');
flagged('    card_conflict: [CH5]\n', PAIRED('"tak"'), (r) => {
  if (r.code !== 2 || !/nie jest żadną z options/.test(r.stderr)) return `odpowiedź spoza options powinna zatrzymać: exit ${r.code} ${r.stderr.slice(0, 160)}`;
  return null;
}, 'answer-outside-options-stops');
flagged('    card_conflict: [CH5]\n', PAIRED('null'), (r) => {
  if (r.code !== 2 || !/open_questions bez odpowiedzi/.test(r.stderr)) return `pytanie bez odpowiedzi powinno zatrzymać istniejącą bramką: exit ${r.code}`;
  return null;
}, 'paired-question-without-answer-stops-via-existing-gate');
flagged('    premise_failed: true\n', PAIRED('"Zatwierdzam wyjątek od CH5: callback blokady wymaga wyjątku"'), (r) => {
  if (r.code !== 0) return `premise_failed z zatwierdzeniem powinno przejść: exit ${r.code}`;
  return null;
}, 'premise-failed-with-approving-answer-passes');
flagged('    premise_failed: true\n', '', (r) => {
  if (r.code !== 2 || !/przesłanka decyzji nie potwierdziła się/.test(r.stderr)) return `premise_failed bez pytania powinno zatrzymać: exit ${r.code}`;
  return null;
}, 'premise-failed-without-paired-question-stops');
flagged('    premises: [{ claim: "handler nie pisze do bazy", evidence: "h.ts:94", holds: true }]\n', '', (r) => {
  if (r.code !== 0) return `przesłanki z holds: true bez flagi nie mogą blokować: exit ${r.code}`;
  return null;
}, 'verified-premises-without-flags-do-not-block');

flagged('    card_conflict: "CH5"\n', '', (r) => {
  if (r.code !== 2 || !/musi być listą ID reguł/.test(r.stderr)) return `card_conflict jako napis powinno zatrzymać: exit ${r.code} ${r.stderr.slice(0, 160)}`;
  return null;
}, 'malformed-card-conflict-is-an-error-not-a-silent-skip');
flagged('    premise_failed: "true"\n', '', (r) => {
  if (r.code !== 2 || !/premise_failed. musi być true\/false/.test(r.stderr)) return `premise_failed jako napis powinno zatrzymać: exit ${r.code}`;
  return null;
}, 'malformed-premise-failed-is-an-error-not-a-silent-skip');
flagged('    card_conflict: []\n', '', (r) => {
  if (r.code !== 0) return `pusta lista card_conflict = brak sprzeczności, nie może blokować: exit ${r.code}`;
  return null;
}, 'empty-card-conflict-list-means-no-conflict');
flagged('    premises: [{ claim: "handler nie pisze do bazy", evidence: "h.ts:94", holds: false }]\n', '', (r) => {
  if (r.code !== 2 || !/przesłanka decyzji nie potwierdziła się/.test(r.stderr)) return `holds: false bez premise_failed powinno oznaczyć decyzję: exit ${r.code}`;
  return null;
}, 'false-premise-flags-the-decision-even-without-premise-failed');
flagged('    card_conflict: [CH5]\n', "  - id: Q2\n    ask: \"Zatwierdzasz?\"\n    q: \"x\"\n    decision: D1\n    answer: \"Zatwierdzam wyjątek od CH5: powód\"\n", (r) => {
  if (r.code !== 2 || !/musi mieć `options`/.test(r.stderr)) return `odpowiedź swobodnym tekstem bez options nie jest zgodą: exit ${r.code}`;
  return null;
}, 'paired-question-without-options-is-not-an-approval-channel');
flagged('    card_conflict: [CH5]\n', PAIRED('"Zatwierdzam wyjątek od CH9: inna reguła"', '["Zatwierdzam wyjątek od CH9: inna reguła (recommended)", "Zmieniamy podejście: Result.fail"]'), (r) => {
  if (r.code !== 2 || !/nie wymienia reguł: CH5/.test(r.stderr)) return `zgoda na inną regułę nie może pokryć CH5: exit ${r.code} ${r.stderr.slice(0, 160)}`;
  return null;
}, 'approval-must-name-the-conflicting-rule');
flagged('    card_conflict: [CH5]\n', PAIRED('"Zatwierdzam wyjątek od CH5: callback blokady wymaga wyjątku"').replace('decision: D1', 'decision: d1'), (r) => {
  if (r.code !== 0) return `dopasowanie pary nie powinno zależeć od wielkości liter: exit ${r.code} ${r.stderr.slice(0, 160)}`;
  return null;
}, 'pairing-is-case-insensitive');

CASES.push({
  name: 'units-expand-into-sub-layers',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('layers_done: ["domain:audience"]\nunits:\n  - { id: audience, layer: domain, dirs: [contexts/audience/] }\n  - { id: campaigns, layer: domain, dirs: [contexts/campaigns/], checks: ["lint:check"], role: "Kampanie" }'),
    task: taskFile('Dodaj aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const ids = r.json.layers.map((l) => l.id);
    if (JSON.stringify(ids) !== JSON.stringify(['domain:audience', 'domain:campaigns', 'testing'])) return 'kolejność/rozwinięcie jednostek: ' + ids.join(',');
    const [a, c] = r.json.layers;
    if (!a.skip) return 'layers_done z id pod-warstwy nie zadziałał';
    if (c.skip) return 'pod-warstwa bez checkpointu pominięta';
    if (c.base !== 'domain') return 'pod-warstwa bez base (karty warstwy bazowej)';
    if (JSON.stringify(c.scope.dirs) !== '["contexts/campaigns/"]') return 'zakres jednostki nie trafił do scope';
    if (JSON.stringify(c.checks) !== '["lint:check"]' || c.role !== 'Kampanie') return 'checks/rola jednostki zignorowane';
    return null;
  },
});

CASES.push({
  name: 'units-invalid-entry-exit-2',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('units:\n  - { id: audience, layer: infra, dirs: [contexts/audience/] }\n  - { id: x, layer: domain }'),
    task: taskFile('Cokolwiek.'),
  }),
  check(r) {
    if (r.code !== 2) return `oczekiwano exit 2, było ${r.code}`;
    if (!/units\[audience\]: `layer` "infra" nie istnieje/.test(r.stderr)) return 'brak powodu: nieznana warstwa';
    if (!/units\[x\]: brak `dirs`/.test(r.stderr)) return 'brak powodu: jednostka bez dirs';
    return null;
  },
});

CASES.push({
  name: 'units-bare-missing-dir-warns',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('units:\n  - { id: docs, layer: domain, dirs: [CLAUDE-LOCAL.md, contexts/nowy-plik.ts] }'),
    task: taskFile('Dodaj aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const hits = r.json.warnings.filter((w) => /dirs/.test(w) && /brak takiego pliku w korzeniu repo/.test(w));
    if (hits.length !== 1) return `oczekiwano 1 ostrzeżenia o nazwie bez katalogu, było ${hits.length}`;
    if (!/units\[docs\].*"CLAUDE-LOCAL\.md".*\.claude\/config\/CLAUDE-LOCAL\.md/.test(hits[0])) return 'ostrzeżenie bez nazwy pliku albo podpowiedzi ścieżki';
    return null;
  },
});

CASES.push({
  name: 'units-env-file-in-dirs-warns',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('units:\n  - { id: wiring, layer: domain, dirs: [apps/api/.env.example, contexts/nowy-plik.ts] }'),
    task: taskFile('Dodaj aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const hits = r.json.warnings.filter((w) => /dirs/.test(w) && /poza zasięgiem agentów/.test(w));
    if (hits.length !== 1) return `oczekiwano 1 ostrzeżenia o pliku .env*, było ${hits.length}`;
    if (!/units\[wiring\].*"apps\/api\/\.env\.example"/.test(hits[0])) return 'ostrzeżenie bez nazwy jednostki albo ścieżki pliku';
    return null;
  },
});

CASES.push({
  name: 'patterns-exclude-drops-false-trigger-hit',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('patterns_exclude: [domain/fixture-nocard-pattern.md, domain/literowka-pattern.md]').split('  - domain/fixture-nocard-pattern.md\n').join(''),
    task: taskFile('Dodaj nowy aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    if (r.json.patterns.some((p) => p.path === 'domain/fixture-nocard-pattern.md')) return 'wzorzec z patterns_exclude nadal w doborze';
    if (!r.json.warnings.some((w) => /patterns_exclude: "domain\/literowka-pattern.md"/.test(w))) return 'brak ostrzeżenia o wpisie, który nic nie wykluczył';
    return null;
  },
});

CASES.push({
  name: 'overrides-merge-and-reject-unknown-key',
  build: () => {
    const root = makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') });
    write(root, 'ok.json', JSON.stringify({ budgets: { implement: { max_turns: 60 } }, layers: { testing: { checks: ['test:l1'] } } }));
    write(root, 'bad.json', JSON.stringify({ budgts: {} }));
    write(root, 'badlayer.json', JSON.stringify({ layers: { nope: { checks: [] } } }));
    return root;
  },
  check(r, root) {
    const ok = run(root, 'TS-FIX-001', ['--overrides', path.join(root, 'ok.json')]);
    if (ok.code !== 0) return 'poprawne nadpisanie odrzucone: ' + ok.stderr.trim();
    if (ok.json.budgets.implement.max_turns !== 60 || !ok.json.budgets.verify) return 'budżety nie scalone głęboko';
    if (JSON.stringify(ok.json.layers.find((l) => l.id === 'testing').checks) !== '["test:l1"]') return 'nadpisanie warstwy po id nie zadziałało';
    const bad = run(root, 'TS-FIX-001', ['--overrides', path.join(root, 'bad.json')]);
    if (bad.code !== 1 || !/nieznany klucz `budgts`/.test(bad.stderr)) return 'literówka w nadpisaniu przeszła: ' + bad.code;
    const bl = run(root, 'TS-FIX-001', ['--overrides', path.join(root, 'badlayer.json')]);
    if (bl.code !== 1 || !/layers.nope/.test(bl.stderr)) return 'nieznana warstwa w nadpisaniu przeszła';
    return null;
  },
});

// ORC-109: `checks.byLayer` to widok pomocniczy wyjścia prepare — sonda go nie czyta, więc nadpisanie
// było ciche i nieskuteczne (aegis-flow TS-019: wznowienie odtworzyło starą czerwoną sondę z cache).
CASES.push({
  name: 'overrides-reject-derived-checks-by-layer',
  build: () => {
    const root = makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') });
    write(root, 'bylayer.json', JSON.stringify({ checks: { byLayer: { testing: ['test:l1'] } } }));
    write(root, 'gate.json', JSON.stringify({ checks: { finalGate: ['test:l1'] } }));
    return root;
  },
  check(r, root) {
    const bad = run(root, 'TS-FIX-001', ['--overrides', path.join(root, 'bylayer.json')]);
    if (bad.code !== 1 || !/layers\.<id>\.checks|layers: \{/.test(bad.stderr)) return 'checks.byLayer przeszło bez ostrzeżenia: ' + bad.code + ' ' + bad.stderr.trim();
    const gate = run(root, 'TS-FIX-001', ['--overrides', path.join(root, 'gate.json')]);
    if (gate.code !== 0) return 'checks.finalGate przestało być przyjmowane: ' + gate.stderr.trim();
    return null;
  },
});

// `$'`, `$&` i `$1` to wzorce zastępcze String.replace — na nich ręczna kopia szablonu gubiła args.
const DOLLAR_CARD = "- echo $'a b' i $& oraz $1";

CASES.push({
  name: 'emit-script-embeds-args-verbatim-and-passes-lint',
  build: () => {
    const root = makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') });
    write(root, '.claude/knowledge/patterns/cross-layer/conventions-pattern_summary.md', '# Karta\n\n## Reguły\n' + DOLLAR_CARD + '\n');
    return root;
  },
  check(r, root) {
    const target = path.join(root, 'out', 'wf.mjs');
    const e = run(root, 'TS-FIX-001', ['--emit-script', target]);
    if (e.code !== 0) return 'emisja nie powiodła się: ' + e.stderr.trim();
    if (e.json.scriptPath !== target || !e.json.argsEmbedded) return 'scriptPath nie wskazuje wyemitowanego pliku';
    const src = fs.readFileSync(target, 'utf8');
    if (src.indexOf('const a = args || {}') !== -1) return 'linia args nie podmieniona';
    if (src.indexOf(JSON.stringify(DOLLAR_CARD).slice(1, -1)) === -1) return 'treść karty zniekształcona przy wbudowaniu ($\' / $& / $1)';
    const lint = spawnSync('node', [path.join(REPO, 'hooks', 'workflow-lint.js'), target], { encoding: 'utf8' });
    if (lint.status !== 0) return 'wyemitowany skrypt nie przechodzi workflow-lint: ' + lint.stdout.slice(-300);
    return null;
  },
});

CASES.push({
  name: 'git-base-and-dirty-at-start-recorded',
  build: () => {
    const root = makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') });
    spawnSync('bash', ['-c', 'git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init && echo x > notes.md'], { cwd: root });
    return root;
  },
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code}`;
    if (!/^[0-9a-f]{40}$/.test(r.json.baseSha || '')) return 'brak baseSha: ' + r.json.baseSha;
    if (JSON.stringify(r.json.dirtyAtStart) !== '["notes.md"]') return 'dirtyAtStart: ' + JSON.stringify(r.json.dirtyAtStart);
    return null;
  },
});

// ORC-130: dużo plików brudnych przed startem (praca samego taska) = ostrzeżenie z obejściem;
// override zeruje listę i ostrzeżenie znika
CASES.push({
  name: 'many-dirty-files-warn-with-override-hint',
  build: () => {
    const root = makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') });
    spawnSync('bash', ['-c', 'git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init && for i in $(seq 1 25); do echo x > work-$i.md; done'], { cwd: root });
    return root;
  },
  check(r, root) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code}`;
    const w = r.json.warnings.find((x) => /plików brudnych przed startem/.test(x));
    if (!w) return 'brak ostrzeżenia o brudnych plikach: ' + JSON.stringify(r.json.warnings);
    if (!/25 plików/.test(w) || !/"dirtyAtStart": \[\]/.test(w)) return 'ostrzeżenie bez liczby lub obejścia: ' + w;
    const ov = path.join(root, 'ov.json');
    fs.writeFileSync(ov, JSON.stringify({ dirtyAtStart: [] }));
    const z = run(root, 'TS-FIX-001', ['--overrides', ov]);
    if (z.code !== 0) return 'override dirtyAtStart nieprzyjęty: ' + z.stderr.trim();
    if (z.json.dirtyAtStart.length !== 0) return 'override nie wyzerował listy';
    if (z.json.warnings.some((x) => /plików brudnych przed startem/.test(x))) return 'ostrzeżenie po wyzerowaniu';
    return null;
  },
});

// ORC-132: kolejny prepare na tym samym HEAD liczy jako cudze tylko pliki brudne przy PIERWSZYM prepare;
// praca dodana po nim (wznowienie po halcie) jest pracą taska. Commit (nowy HEAD) zaczyna liczenie od nowa.
CASES.push({
  name: 'rerun-prepare-keeps-only-first-run-dirty-files-as-foreign',
  build: () => {
    const root = makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') });
    spawnSync('bash', ['-c', 'git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm init && echo x > owner.md'], { cwd: root });
    return root;
  },
  check(r, root) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code}`;
    if (JSON.stringify(r.json.dirtyAtStart) !== '["owner.md"]') return 'pierwszy prepare: ' + JSON.stringify(r.json.dirtyAtStart);
    if (!fs.existsSync(path.join(root, '.claude', 'run-state', 'TS-FIX-001.dirty-baseline.json'))) return 'brak pliku baseline';
    spawnSync('bash', ['-c', 'echo y > task-work.ts'], { cwd: root });
    const again = run(root, 'TS-FIX-001', []);
    if (again.code !== 0) return `drugi prepare: exit ${again.code}`;
    if (JSON.stringify(again.json.dirtyAtStart) !== '["owner.md"]') return 'praca taska policzona jako cudza: ' + JSON.stringify(again.json.dirtyAtStart);
    if (!again.json.warnings.some((w) => /1 z 2 brudnych plików uznano za pracę poprzednich prób/.test(w))) return 'brak ostrzeżenia o wznowieniu: ' + JSON.stringify(again.json.warnings);
    spawnSync('bash', ['-c', 'git add -A && git commit -qm next && echo z > later.md'], { cwd: root });
    const fresh = run(root, 'TS-FIX-001', []);
    if (JSON.stringify(fresh.json.dirtyAtStart) !== '["later.md"]') return 'nowy HEAD nie zaczął liczenia od nowa: ' + JSON.stringify(fresh.json.dirtyAtStart);
    return null;
  },
});

// ORC-113: create_when to regex; opis prozą nie trafia i dostaje ostrzeżenie
CASES.push({
  name: 'create-when-regex-hits-and-prose-warns',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    runtime: RUNTIME_DDD.replace('  inner_loop', [
      '    - {id: site, dirs: [src/pages/], agent: "a", optional: true, create_when: "task zmienia kod strony: komponenty, layouty"}',
      '    - {id: web, dirs: [apps/web/], agent: "a", optional: true, create_when: "komponent|layout"}',
      '  inner_loop',
    ].join('\n')),
    analysis: analysisFm({}),
    task: taskFile('Dodaj komponent strony.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code}`;
    if (r.json.createWhenHits.web !== true) return 'regex komponent|layout nie trafił: ' + JSON.stringify(r.json.createWhenHits);
    if (r.json.createWhenHits.site !== false) return 'opis prozą trafił';
    if (!r.json.warnings.some((w) => /create_when warstwy site: wygląda na opis prozą/.test(w))) return 'brak ostrzeżenia o opisie prozą: ' + JSON.stringify(r.json.warnings);
    if (r.json.warnings.some((w) => /create_when warstwy web/.test(w))) return 'ostrzeżenie dla poprawnego regexu';
    return null;
  },
});

CASES.push({
  name: 'telemetry-plan-and-engine-in-output',
  build: () => makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code}`;
    const plan = r.json.telemetryPlan;
    if (!Array.isArray(plan) || !plan.length) return 'brak telemetryPlan: ' + JSON.stringify(plan);
    const running = r.json.layers.filter((l) => !l.skip && !(l.optional && !r.json.createWhenHits[l.id]));
    for (const l of running) {
      if (!plan.some((p) => p.id === `${l.id}:implementer` && p.group === l.id && p.role === 'implementer')) return `plan bez implementera warstwy ${l.id}`;
    }
    if (plan.some((p) => r.json.layers.some((l) => l.skip && p.group === l.id))) return 'plan zawiera warstwę pominiętą (skip)';
    const gate = plan.filter((p) => p.role === 'gate');
    if (Boolean(r.json.verifiers.finalGate) !== (gate.length === 1)) return 'bramka końcowa w planie niezgodna z verifiers.finalGate';
    if (r.json.engine !== null && !/^[0-9a-f]{7,40}$/.test(r.json.engine)) return 'engine nie jest hashem: ' + r.json.engine;
    return null;
  },
});

// process.exit() zaraz po stdout.write ucinał JSON w potoku na 64 KB (TS-MH-005: ~190 KB args).
CASES.push({
  name: 'large-json-output-not-truncated-in-pipe',
  build: () => {
    const root = makeProject({ taskId: 'TS-FIX-001', analysis: analysisFm({}), task: taskFile('Dodaj aggregate.') });
    write(root, '.claude/knowledge/patterns/cross-layer/conventions-pattern_summary.md', '# Karta\n\n## Reguły\n' + '- reguła numer x\n'.repeat(12000));
    return root;
  },
  check(r) {
    if (r.code !== 0) return 'exit ' + r.code;
    if (!r.json) return 'JSON ucięty w potoku (' + r.stdout.length + ' B)';
    if (r.stdout.length < 150000) return 'fixture za mały, test niczego nie dowodzi: ' + r.stdout.length;
    return null;
  },
});

// ANZ-PATTERN-MISMATCH: karty z tagami spoza przestrzeni uruchamianych warstw nie wchodzą do doboru z always/triggerów
const RUNTIME_API_WEB = RUNTIME_DDD
  .split('    - cross-layer/conventions-pattern.md\n').join('    - cross-layer/conventions-pattern.md\n    - infrastructure/repo-fixture-pattern.md\n    - cross-layer/any-fixture-pattern.md\n')
  .split('    - {id: domain, dirs: [domain/], agent: "domain-application-implementer", role: "Model domenowy.", checks: ["typecheck"]}\n')
  .join('    - {id: domain, dirs: [domain/], agent: "domain-application-implementer", tags: ["api:domain"], role: "Model domenowy.", checks: ["typecheck"]}\n' +
        '    - {id: web, dirs: [apps/web/], agent: "refine-implementer", tags: ["web:ui"], role: "Panel.", checks: ["typecheck"]}\n');
const buildApiWeb = (analysis) => {
  const root = makeProject({ taskId: 'TS-FIX-001', runtime: RUNTIME_API_WEB, analysis, task: taskFile('Dodaj ekran panelu.') });
  const kn = '.claude/knowledge/patterns/';
  write(root, kn + 'infrastructure/repo-fixture-pattern.md', '# Pattern: Repo\n\n## What\nx\n');
  write(root, kn + 'infrastructure/repo-fixture-pattern_summary.md', '# Karta: repo\n\n**Tags**: "api:data-access"\n\n## Reguły\n- x\n');
  write(root, kn + 'cross-layer/any-fixture-pattern.md', '# Pattern: Any\n\n## What\nx\n');
  write(root, kn + 'cross-layer/any-fixture-pattern_summary.md', '# Karta: any\n\n**Tags**: "api:domain", "any:process"\n\n## Reguły\n- x\n');
  return root;
};

CASES.push({
  name: 'pattern-tag-namespace-outside-running-layers-dropped',
  build: () => buildApiWeb(withFm('layers_skip:\n  - { id: domain, reason: "task czysto web" }')),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const paths = r.json.patterns.map((p) => p.path);
    if (paths.includes('infrastructure/repo-fixture-pattern.md')) return 'karta api:* została w doborze task-u czysto web';
    if (!paths.includes('cross-layer/any-fixture-pattern.md')) return 'karta z any:* wypadła';
    if (!paths.includes('cross-layer/conventions-pattern.md')) return 'karta bez tagów wypadła';
    if (!r.json.warnings.some((w) => /wzorce pominięte: tagi poza przestrzeniami/.test(w) && /repo-fixture/.test(w))) return 'brak ostrzeżenia o pominiętych wzorcach';
    return null;
  },
});

CASES.push({
  name: 'pattern-tag-namespace-kept-when-api-layer-runs',
  build: () => buildApiWeb(withFm('')),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    if (!r.json.patterns.some((p) => p.path === 'infrastructure/repo-fixture-pattern.md')) return 'karta api:* wypadła mimo uruchamianej warstwy api';
    if (r.json.warnings.some((w) => /wzorce pominięte: tagi poza/.test(w))) return 'ostrzeżenie o pominięciu bez powodu';
    return null;
  },
});

CASES.push({
  name: 'pattern-tag-namespace-analysis-listed-pattern-survives',
  build: () => {
    const a = withFm('layers_skip:\n  - { id: domain, reason: "task czysto web" }')
      .split('  - domain/fixture-nocard-pattern.md').join('  - domain/fixture-nocard-pattern.md\n  - infrastructure/repo-fixture-pattern.md');
    return buildApiWeb(a);
  },
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    if (!r.json.patterns.some((p) => p.path === 'infrastructure/repo-fixture-pattern.md')) return 'wzorzec wskazany wprost w patterns[] analizy został odrzucony';
    return null;
  },
});

// TASK-ORCH-CARDS-STACK-MISMATCH-001: karty warstwy pominiętej w analizie nie idą do przebiegu (bramka końcowa
// dostaje wszystkie wzorce), karty warstwy zamkniętej wcześniej (layers_done) zostają.
const buildLayerCards = (analysis) => {
  const runtime = RUNTIME_API_WEB.replace('tags: ["web:ui"],', 'tags: ["web:ui"], patterns: ["web/web-layer-fixture-pattern.md"],');
  const root = makeProject({ taskId: 'TS-FIX-001', runtime, analysis, task: taskFile('Dodaj ekran panelu.') });
  const kn = '.claude/knowledge/patterns/';
  write(root, kn + 'web/web-layer-fixture-pattern.md', '# Pattern: Web\n\n## What\nx\n');
  write(root, kn + 'web/web-layer-fixture-pattern_summary.md', '# Karta: web\n\n**Tags**: "web:ui"\n\n## Reguły\n- x\n');
  return root;
};
const WEB_CARD = 'web/web-layer-fixture-pattern.md';

CASES.push({
  name: 'layer-cards-of-layers-skip-layer-not-loaded',
  build: () => buildLayerCards(withFm('layers_skip:\n  - { id: web, reason: "task bez panelu" }')),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    if (r.json.patterns.some((p) => p.path === WEB_CARD)) return 'karta pominiętej warstwy web trafiła do wzorców przebiegu';
    return null;
  },
});

CASES.push({
  name: 'layer-cards-loaded-when-layer-runs',
  build: () => buildLayerCards(withFm('')),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const card = r.json.patterns.find((p) => p.path === WEB_CARD);
    if (!card || card.origin !== 'layer:web') return 'karta uruchamianej warstwy web nie weszła z origin layer:web: ' + JSON.stringify(card && card.origin);
    return null;
  },
});

CASES.push({
  name: 'layer-cards-kept-for-layers-done-in-previous-run',
  build: () => buildLayerCards(withFm('layers_done: [web]')),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    if (!r.json.patterns.some((p) => p.path === WEB_CARD)) return 'karta warstwy z layers_done wypadła — bramka końcowa ocenia też jej pliki';
    return null;
  },
});

// ORC-121: analiza dopisuje checks do bramki końcowej (final_checks)
CASES.push({
  name: 'analysis-final-checks-join-final-gate',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('final_checks: [test:l3, test:gateway, test]'),
    task: taskFile('Dodaj nowy aggregate.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const fg = r.json.checks.finalGate;
    if (!fg.includes('test:l3') || !fg.includes('test:gateway')) return 'final_checks nie trafiły do checks.finalGate: ' + JSON.stringify(fg);
    if (fg.filter((c) => c === 'test').length !== 1) return 'duplikat checks w bramce końcowej: ' + JSON.stringify(fg);
    return null;
  },
});

CASES.push({
  name: 'analysis-final-checks-must-be-list-of-strings',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('final_checks: "test:l3"'),
    task: taskFile('Dodaj nowy aggregate.'),
  }),
  check(r) {
    if (r.code === 0) return 'final_checks jako string przeszło bramkę';
    if (!/final_checks: musi być listą/.test(r.stderr)) return 'brak komunikatu bramki o final_checks: ' + r.stderr.trim();
    return null;
  },
});

// ORC-129: wszystkie warstwy w layers_skip → ostrzeżenie, że silnik nie ma czego wykonać
CASES.push({
  name: 'all-layers-skipped-warns-task-without-code',
  build: () => makeProject({
    taskId: 'TS-FIX-001',
    analysis: withFm('layers_skip:\n  - { id: domain, reason: "task dokumentacyjny" }\n  - { id: testing, reason: "task dokumentacyjny" }'),
    task: taskFile('Uzupełnij dokumentację.'),
  }),
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    if (!(r.json.warnings || []).some((x) => /żadna warstwa nie jest uruchamiana/.test(x))) return 'brak ostrzeżenia o zadaniu bez warstw: ' + JSON.stringify(r.json.warnings);
    return null;
  },
});

// ORC-128: plik kodu wskazany w decyzji, bez właściciela w zakresie warstw → ostrzeżenie; z właścicielem → cisza
CASES.push({
  name: 'decision-file-without-layer-owner-warns',
  build: () => {
    const root = makeProject({
      taskId: 'TS-FIX-001',
      analysis: analysisFm({}).replace('rationale: "uzasadnienie"', 'rationale: "zmiana w src/app/orphan/handler.ts oraz domain/x.ts"'),
      task: taskFile('Dodaj nowy aggregate.'),
    });
    write(root, 'src/app/orphan/handler.ts', 'export {}\n');
    write(root, 'domain/x.ts', 'export {}\n');
    return root;
  },
  check(r) {
    if (r.code !== 0) return `oczekiwano exit 0, było ${r.code} (${r.stderr.trim()})`;
    const w = (r.json.warnings || []).find((x) => /bez właściciela/.test(x));
    if (!w) return 'brak ostrzeżenia o pliku bez właściciela';
    if (!/src\/app\/orphan\/handler\.ts/.test(w)) return 'ostrzeżenie nie wskazuje pliku: ' + w;
    if (/domain\/x\.ts/.test(w)) return 'plik z dirs warstwy zgłoszony jako sierota: ' + w;
    return null;
  },
});

// ── bieg ─────────────────────────────────────────────────────────────────────────
let failed = 0;
for (const c of CASES) {
  let root;
  try {
    root = c.build();
    const err = c.check(run(root, 'TS-FIX-001'), root);
    if (err) { failed++; process.stdout.write(`  ❌ ${c.name} — ${err}\n`); }
    else process.stdout.write(`  ✅ ${c.name}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`  ❌ ${c.name} — wyjątek: ${e.message}\n`);
  } finally {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
}
process.stdout.write(`\n${CASES.length - failed}/${CASES.length} passed\n`);
process.exit(failed ? 1 : 0);
