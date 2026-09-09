#!/usr/bin/env node
// scripts/orchestrate-prepare.mjs — deterministyczny krok PRZED `Workflow` dla /orchestrate.
// (TASK-KAIZEN-002 / K92; audyt 2026-09-07 §E7)
//
// Użycie:
//   node scripts/orchestrate-prepare.mjs <TASK-ID> [--project <dir>] [--json]
//
// ZERO LLM. Skrypt czyta trzy pliki i wypisuje JSON gotowy do podania jako `args`
// narzędzia Workflow. Powód istnienia: `commands/orchestrate.md` §2b′ od dawna wymaga
// wstrzykiwania KART REGUŁ (`*_summary.md`) do promptów implementerów — a nie robił tego
// żaden skrypt, więc koordynator czytał karty ręcznie albo (częściej) wcale. Skrypt
// Workflow nie ma dostępu do filesystemu, więc karty MUSI wczytać ktoś przed nim; tym
// kimś jest ten plik, a nie improwizacja modelu co przebieg.
//
// Wejście (wszystko względem katalogu projektu, domyślnie cwd):
//   1. `.claude/config/runtime.yml` — kompozycja bloków (ADR 0008). Brak = exit 3.
//   2. `project-orchestration/analysis/<TASK-ID>*.analysis.md` — artefakt analizy.
//      Bramka identyczna z hookiem `check-approval-before-impl.js`: `status: approved`
//      ORAZ zero `answer: null`. Niespełniona = exit 2 z listą powodów. Artefakt jest
//      OBOWIĄZKOWY, gdy `analyze.exit: PAUSE` (blok ddd/core); bez PAUSE jest opcjonalny,
//      ale gdy istnieje — bramka i tak obowiązuje (nieapprobowana analiza to sygnał
//      „człowiek jeszcze nie skończył", niezależnie od bloku).
//   3. `project-orchestration/tasks/<TASK-ID>*.md` — plik taska (frontmatter + treść).
//      Brak = ostrzeżenie, nie błąd: część projektów trzyma spec wyłącznie w artefakcie.
//
// ALGORYTM DOBORU WZORCÓW (deterministyczny, bez embeddingów):
//   • `patterns.always` z runtime.yml wchodzi zawsze;
//   • dla każdej grupy `patterns.triggers` sprawdzamy jej `keywords`: keyword trafia,
//     gdy występuje jako PODŁAŃCUCH (case-insensitive) w „sianie" = tytuł + etykiety +
//     treść pliku taska + treść artefaktu analizy. To ta sama, świadomie zgrubna
//     semantyka, którą opisuje `commands/analyze.md` §0.5 — z tą różnicą, że tutaj jest
//     zapisana raz, w kodzie, i wypisuje KTÓRY keyword trafił (`matchedKeywords`),
//     żeby dało się zobaczyć fałszywe trafienie po fragmencie wyrazu;
//   • `patterns[]` z frontmattera artefaktu analizy dochodzi na końcu (człowiek je
//     zatwierdził — mają pierwszeństwo przed domysłem, ale nie zastępują `always`);
//   • wynik jest deduplikowany z zachowaniem kolejności: always → triggers → analiza.
//
// KARTA vs PEŁNY WZORZEC: dla każdej ścieżki `<dir>/<name>-pattern.md` szukamy najpierw
// karty `<dir>/<name>-pattern_summary.md`. Jest karta → `card: true` i jej treść.
// Nie ma → `card: false`, treść PEŁNEGO wzorca i wpis w `warnings[]` („napisz kartę"),
// bo pełny wzorzec w prompcie implementera to 20-36 KB przeliczane w każdej turze.
//
// WYJŚCIE (exit code): 0 = gotowe, 1 = błąd użycia, 2 = bramka analizy, 3 = brak/zły config.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const YAML = require_(join(REPO_ROOT, 'node_modules', 'yaml'));

// Kanoniczny skrypt Workflow (K93). Ścieżka wyliczona z położenia TEGO pliku, więc
// satelita nie musi niczego symlinkować ani znać lokalizacji claude-patterns.
const WORKFLOW_SCRIPT = join(REPO_ROOT, 'scripts', 'workflow', 'orchestrate.template.mjs');

const EXIT = { OK: 0, USAGE: 1, GATE: 2, CONFIG: 3 };

function die(code, msg) {
  process.stderr.write(`✘ orchestrate-prepare: ${msg}\n`);
  process.exit(code);
}

// ── argumenty ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { taskId: null, project: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--project') out.project = argv[++i] ?? '';
    else if (a.startsWith('--project=')) out.project = a.slice('--project='.length);
    else if (a.startsWith('-')) die(EXIT.USAGE, `nieznany przełącznik: ${a}`);
    else if (!out.taskId) out.taskId = a;
    else die(EXIT.USAGE, `nadmiarowy argument: ${a}`);
  }
  if (!out.taskId) die(EXIT.USAGE, 'brak <TASK-ID>.\n  użycie: orchestrate-prepare.mjs <TASK-ID> [--project <dir>] [--json]');
  if (!out.project) die(EXIT.USAGE, '--project bez wartości');
  out.project = resolve(out.project);
  return out;
}

// ── frontmatter ──────────────────────────────────────────────────────────────────
// Zwraca { fm, body, raw }. `fm` = sparsowany YAML albo null, gdy YAML jest zepsuty
// (wtedy wołający schodzi do regexów — artefakty pisane ręcznie bywają niepoprawne,
// a bramka approval nie może się od tego wywrócić).
function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: null, fmRaw: '', body: text };
  let fm = null;
  try { fm = YAML.parse(m[1]); } catch { fm = null; }
  return { fm, fmRaw: m[1], body: m[2] };
}

// ── wyszukiwanie plików po prefiksie TASK-ID ─────────────────────────────────────
// Artefakty nazywają się `<TASK-ID>.analysis.md` ALBO `<TASK-ID>-<slug>.analysis.md`
// (np. TS-ARCH-HANDLER-CONTRACT-001-command-handler-lifecycle...). Dopasowanie po
// prefiksie, a przy kilku trafieniach wygrywa najkrótsza nazwa — to zawsze wariant
// bez slugu, czyli dokładnie ten TASK-ID, a nie zadanie o dłuższym numerze.
function findByPrefix(dir, taskId, suffix) {
  if (!existsSync(dir)) return null;
  const hits = readdirSync(dir)
    .filter((f) => f.endsWith(suffix) && (f === taskId + suffix || f.startsWith(taskId + '-')))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  return hits.length ? join(dir, hits[0]) : null;
}

// ── karty wzorców ────────────────────────────────────────────────────────────────
// Kolejność szukania: katalog wiedzy projektu (tam żyją symlinki + `patterns-local/`
// z wzorcami czysto projektowymi), potem `patterns/` w claude-patterns.
function patternRoots(projectDir) {
  return [
    join(projectDir, '.claude', 'knowledge', 'patterns'),
    join(REPO_ROOT, 'patterns'),
  ];
}

function resolvePatternFile(relPath, projectDir) {
  // Ścieżka absolutna albo względna do korzenia projektu (tak wygląda np.
  // `.claude/knowledge/patterns-local/security-invariants-fastify.md` w iam).
  if (relPath.startsWith('/')) return existsSync(relPath) ? relPath : null;
  if (relPath.startsWith('.')) {
    const p = join(projectDir, relPath);
    return existsSync(p) ? p : null;
  }
  for (const root of patternRoots(projectDir)) {
    const p = join(root, relPath);
    if (existsSync(p)) return p;
  }
  return null;
}

function cardPathFor(relPath) {
  return relPath.replace(/\.md$/, '_summary.md');
}

function readPattern(relPath, projectDir, warnings) {
  const cardRel = cardPathFor(relPath);
  const cardAbs = resolvePatternFile(cardRel, projectDir);
  if (cardAbs) {
    return {
      path: relPath, card: true, source: cardRel,
      bytes: statSync(cardAbs).size,
      content: readFileSync(cardAbs, 'utf8'),
    };
  }
  const fullAbs = resolvePatternFile(relPath, projectDir);
  if (!fullAbs) {
    warnings.push(`wzorzec "${relPath}" nie istnieje w żadnym z katalogów wiedzy — pominięty`);
    return null;
  }
  const bytes = statSync(fullAbs).size;
  warnings.push(
    `wzorzec "${relPath}" nie ma karty (${basename(cardRel)}) — do promptu idzie PEŁNY plik ` +
    `(${bytes} B). Napisz kartę: pełny wzorzec przelicza się w każdej turze implementera.`,
  );
  return { path: relPath, card: false, source: relPath, bytes, content: readFileSync(fullAbs, 'utf8') };
}

// ── dopasowanie keywordów ────────────────────────────────────────────────────────
function buildHaystack(taskDoc, analysisDoc) {
  const parts = [];
  const push = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === 'object') Object.values(v).forEach(push);
    else parts.push(String(v));
  };
  if (taskDoc) { push(taskDoc.fm); parts.push(taskDoc.body); }
  if (analysisDoc) { push(analysisDoc.fm); parts.push(analysisDoc.body); }
  return parts.join('\n').toLowerCase();
}

function matchTriggers(triggers, haystack) {
  const matched = [];
  for (const group of triggers ?? []) {
    const keywords = (group.keywords ?? []).map(String);
    const hits = keywords.filter((k) => k && haystack.includes(k.toLowerCase()));
    if (!hits.length) continue;
    matched.push({ keywords: hits, include: (group.include ?? []).map(String) });
  }
  return matched;
}

// ── warstwy ──────────────────────────────────────────────────────────────────────
// Brak sekcji `orchestrate:` w runtime.yml (projekt bez bloku procesowego) → jedna
// warstwa generyczna, dokładnie jak opisuje orchestrate.md §1. Ten fallback jest tutaj,
// a nie w prozie komendy, bo inaczej każdy przebieg wymyśla go od nowa.
const GENERIC_LAYERS = [{
  id: 'implementation',
  dirs: ['src/'],
  agent: 'general-purpose',
  role: 'Cały kod produkcyjny — projekt nie deklaruje podziału na warstwy.',
}];

function resolveLayers(runtime, layersDone) {
  const orch = runtime.orchestrate ?? {};
  const raw = Array.isArray(orch.layers) && orch.layers.length ? orch.layers : GENERIC_LAYERS;
  const done = new Set((layersDone ?? []).map(String));
  return raw.map((l, i) => ({
    index: i,
    id: String(l.id),
    dirs: (l.dirs ?? []).map(String),
    agent: String(l.agent ?? 'general-purpose'),
    role: l.role ? String(l.role) : null,
    tags: (l.tags ?? []).map(String),
    tests: l.tests === true,
    optional: l.optional === true,
    createWhen: l.create_when ? String(l.create_when) : null,
    // wzorce przypisane wprost do warstwy (layer_contributions z innych bloków)
    layerPatterns: (l.patterns ?? []).map(String),
    checks: (l.checks ?? []).map(String),
    // checkpoint z artefaktu — warstwa z GO poprzedniego przebiegu nie startuje ponownie
    skip: done.has(String(l.id)),
    skipReason: done.has(String(l.id)) ? 'GO z poprzedniego przebiegu (layers_done)' : null,
  }));
}

// ── główny bieg ──────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];

  // 1. runtime.yml
  const runtimePath = join(args.project, '.claude', 'config', 'runtime.yml');
  if (!existsSync(runtimePath)) {
    die(EXIT.CONFIG,
      `brak ${relative(args.project, runtimePath)} — projekt nie ma skomponowanego setupu bloków ` +
      '(ADR 0008). Dodaj `stack_blocks:` do project.yml i odpal setup-project.sh.');
  }
  const runtimeRaw = readFileSync(runtimePath, 'utf8');
  let runtime;
  try { runtime = YAML.parse(runtimeRaw); } catch (e) { die(EXIT.CONFIG, `runtime.yml nie jest poprawnym YAML-em: ${e.message}`); }
  if (String(runtime.schema_version) !== '1') {
    die(EXIT.CONFIG, `runtime.yml ma schema_version=${runtime.schema_version}, oczekiwane 1 — odpal setup-project.sh ponownie.`);
  }

  // 2. artefakt analizy + bramka approval (ta sama, co check-approval-before-impl.js)
  const analysisDir = join(args.project, 'project-orchestration', 'analysis');
  const analysisPath = findByPrefix(analysisDir, args.taskId, '.analysis.md');
  const pauseGate = String(runtime.analyze?.exit ?? '') === 'PAUSE';

  let analysisDoc = null;
  const gateFailures = [];
  if (analysisPath) {
    analysisDoc = splitFrontmatter(readFileSync(analysisPath, 'utf8'));
    const fmRaw = analysisDoc.fmRaw;
    const status = analysisDoc.fm?.status
      ? String(analysisDoc.fm.status)
      : (/^status:\s*([A-Za-z-]+)/m.exec(fmRaw)?.[1] ?? 'unknown');
    if (status !== 'approved') {
      gateFailures.push(`status artefaktu = "${status}", wymagane "approved"`);
    }
    // `answer: null` — YAML gdy się sparsował, inaczej regex (jak w hooku).
    const unanswered = [];
    const oq = analysisDoc.fm?.open_questions;
    if (Array.isArray(oq)) {
      for (const q of oq) if (q && (q.answer === null || q.answer === undefined)) unanswered.push(String(q.id ?? '?'));
    } else if (/answer:\s*null/.test(fmRaw)) {
      unanswered.push('(nieparsowalny frontmatter — wykryte regexem)');
    }
    if (unanswered.length) {
      gateFailures.push(`open_questions bez odpowiedzi: ${unanswered.join(', ')}`);
    }
  } else if (pauseGate) {
    gateFailures.push(
      `brak artefaktu ${relative(args.project, analysisDir)}/${args.taskId}*.analysis.md, ` +
      'a runtime.yml deklaruje analyze.exit: PAUSE (twarda bramka approval)');
  } else {
    warnings.push('brak artefaktu analizy — dozwolone (analyze.exit ≠ PAUSE), ale decisions[]/patterns[] nie wejdą do promptów');
  }

  if (gateFailures.length) {
    process.stderr.write('✘ orchestrate-prepare: bramka analizy NIE przeszła — /orchestrate nie ma prawa startować.\n');
    for (const f of gateFailures) process.stderr.write(`  • ${f}\n`);
    process.stderr.write(`\n  Napraw: uzupełnij odpowiedzi we frontmatter i ustaw status: approved w ${analysisPath ? relative(args.project, analysisPath) : 'artefakcie analizy'}.\n`);
    process.exit(EXIT.GATE);
  }

  // 3. plik taska
  const tasksDir = join(args.project, 'project-orchestration', 'tasks');
  const taskPath = findByPrefix(tasksDir, args.taskId, '.md');
  let taskDoc = null;
  if (taskPath) taskDoc = splitFrontmatter(readFileSync(taskPath, 'utf8'));
  else warnings.push(`brak pliku taska ${args.taskId}*.md w project-orchestration/tasks/ — keywordy dopasowane wyłącznie z artefaktu analizy`);

  // 4. wzorce: always → triggers (po keywordach) → patterns[] z artefaktu
  const haystack = buildHaystack(taskDoc, analysisDoc);
  const always = (runtime.patterns?.always ?? []).map(String);
  const triggerHits = matchTriggers(runtime.patterns?.triggers, haystack);

  const selection = new Map(); // relPath → {origin, matchedKeywords}
  for (const p of always) if (!selection.has(p)) selection.set(p, { origin: 'always', matchedKeywords: [] });
  for (const hit of triggerHits) {
    for (const p of hit.include) {
      if (selection.has(p)) {
        const cur = selection.get(p);
        cur.matchedKeywords = [...new Set([...cur.matchedKeywords, ...hit.keywords])];
      } else {
        selection.set(p, { origin: 'trigger', matchedKeywords: [...hit.keywords] });
      }
    }
  }
  for (const p of (analysisDoc?.fm?.patterns ?? []).map(String)) {
    if (!selection.has(p)) selection.set(p, { origin: 'analysis', matchedKeywords: [] });
  }

  const patterns = [];
  for (const [relPath, meta] of selection) {
    const loaded = readPattern(relPath, args.project, warnings);
    if (loaded) patterns.push({ ...loaded, origin: meta.origin, matchedKeywords: meta.matchedKeywords });
  }

  // 5. warstwy + wzorce warstwowe (te dochodzą PONAD wybór globalny)
  const layersDone = analysisDoc?.fm?.layers_done ?? [];
  const layers = resolveLayers(runtime, layersDone);
  for (const layer of layers) {
    for (const relPath of layer.layerPatterns) {
      if (patterns.some((p) => p.path === relPath)) continue;
      const loaded = readPattern(relPath, args.project, warnings);
      if (loaded) patterns.push({ ...loaded, origin: `layer:${layer.id}`, matchedKeywords: [] });
    }
  }

  // 6. checks — per warstwa + suma dla bramki końcowej (tylko z warstw, które wejdą)
  const running = layers.filter((l) => !l.skip);
  const finalChecks = [...new Set(running.flatMap((l) => l.checks))];
  const checks = {
    byLayer: Object.fromEntries(layers.map((l) => [l.id, l.checks])),
    finalGate: finalChecks,
  };

  const orch = runtime.orchestrate ?? {};
  const innerLoop = orch.inner_loop ?? {};
  const finalGate = orch.final_gate ?? {};

  const out = {
    task: {
      id: args.taskId,
      project: args.project,
      taskFile: taskPath ? relative(args.project, taskPath) : null,
      analysisFile: analysisPath ? relative(args.project, analysisPath) : null,
      title: taskDoc?.fm?.title ? String(taskDoc.fm.title) : null,
      type: taskDoc?.fm?.type ? String(taskDoc.fm.type) : null,
      decisions: analysisDoc?.fm?.decisions ?? [],
      layersDone: layersDone.map(String),
    },
    layers,
    patterns,
    checks,
    budgets: runtime.budgets ?? {},
    knowledge: runtime.knowledge ?? {},
    humanVoice: runtime.human_voice ?? {
      language: 'pl', register: 'business', max_sentences: 2,
      avoid: ['nazwy klas i funkcji', 'ścieżki plików', 'numery ADR/BDR'],
    },
    verifiers: {
      // slot pętli wewnętrznej — verifier warstwy
      layer: innerLoop.verify ? String(innerLoop.verify) : null,
      maxAttempts: Number(innerLoop.max_attempts ?? 3),
      onMax: String(innerLoop.on_max ?? 'ESCALATE_AND_HALT'),
      // slot bramki końcowej — VETO na całości zmiany
      finalGate: finalGate.agent ? String(finalGate.agent) : null,
      onFail: String(finalGate.on_fail ?? 'ESCALATE_AND_HALT'),
    },
    exit: String(orch.exit ?? 'STAGE_NOT_COMMIT'),
    env: runtime.env ?? {},
    stackBlocks: (runtime.stack_blocks ?? []).map(String),
    scriptPath: WORKFLOW_SCRIPT,
    preparedAt: new Date().toISOString(),
    // Tożsamość kompozycji: `source_hash` z nagłówka runtime.yml (hash bloków wejściowych)
    // + skrót treści samego pliku. Pierwszy mówi „z czego to złożono", drugi „czy plik
    // od tego czasu tknięto ręcznie" — w raporcie przebiegu potrzebne są oba.
    runtimeHash: {
      source: runtime.source_hash ? String(runtime.source_hash) : null,
      file: createHash('sha256').update(runtimeRaw).digest('hex').slice(0, 12),
      materializedAt: runtime.materialized_at ? String(runtime.materialized_at) : null,
    },
    warnings,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    const w = (s) => process.stdout.write(s + '\n');
    w(`✔ ${out.task.id} — gotowe do Workflow`);
    w(`  projekt      ${out.task.project}`);
    w(`  analiza      ${out.task.analysisFile ?? '(brak, dozwolone)'}`);
    w(`  task         ${out.task.taskFile ?? '(brak)'}`);
    w(`  warstwy      ${layers.map((l) => l.id + (l.skip ? ' (pominięta)' : '')).join(' → ')}`);
    w(`  verify       ${out.verifiers.layer ?? '(brak slotu)'} · final_gate ${out.verifiers.finalGate ?? '(brak slotu)'}`);
    w(`  wzorce       ${patterns.length} (${patterns.filter((p) => p.card).length} kart, ${patterns.filter((p) => !p.card).length} pełnych)`);
    for (const p of patterns) {
      w(`    ${p.card ? 'karta' : 'PEŁNY'}  ${p.path}  [${p.origin}${p.matchedKeywords.length ? ' ← ' + p.matchedKeywords.join(', ') : ''}]`);
    }
    w(`  checks       final_gate: ${finalChecks.join(', ') || '(brak)'}`);
    w(`  kolekcja RAG ${out.knowledge.collection ?? '(brak)'}`);
    w(`  skrypt       ${out.scriptPath}`);
    if (warnings.length) {
      w('  ostrzeżenia:');
      for (const x of warnings) w(`    ⚠ ${x}`);
    }
    w('');
    w('  Pełny JSON pod `args`: dopisz --json');
  }
  process.exit(EXIT.OK);
}

main();
