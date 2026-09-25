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
