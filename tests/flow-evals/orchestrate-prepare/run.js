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

// ── bieg ─────────────────────────────────────────────────────────────────────────
let failed = 0;
for (const c of CASES) {
  let root;
  try {
    root = c.build();
    const err = c.check(run(root, 'TS-FIX-001'));
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
