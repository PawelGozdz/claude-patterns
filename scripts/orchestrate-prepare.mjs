#!/usr/bin/env node
// scripts/orchestrate-prepare.mjs — deterministyczny krok PRZED `Workflow` dla /orchestrate.
// (TASK-KAIZEN-002 / K92; audyt 2026-09-07 §E7)
//
// Użycie:
//   node scripts/orchestrate-prepare.mjs <TASK-ID> [--project <dir>] [--json]
//        [--overrides <plik.json>] [--emit-script <ścieżka.mjs>]
//
//   --overrides    nadpisania wyjścia z pliku (zamiast ręcznej edycji kopii szablonu):
//                  obiekty scalane głęboko, tablice zastępowane; `layers` jako mapa
//                  { "<id>": { …pola… } }. Nieznany klucz = exit 1 (literówka nie może
//                  przejść po cichu). `{"dirtyAtStart": []}` (ORC-130) = drzewo niesie pracę
//                  tego taska, nie cudzą.
//   --emit-script  zapisuje gotowy skrypt Workflow z WBUDOWANYMI args (przy ~150 KB args
//                  ręczne przekazanie odpada), przepuszcza go przez workflow-lint i podaje
//                  jego ścieżkę w `scriptPath`. Błąd lintu = exit 4, plik nie powstaje.
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
// WYJŚCIE (exit code): 0 = gotowe, 1 = błąd użycia, 2 = bramka analizy, 3 = brak/zły config,
// 4 = wyemitowany skrypt nie przeszedł workflow-lint.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { engineVersion } from './lib/engine-version.mjs';
import { buildCanon } from './lib/canon-inject.mjs';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const YAML = require_(join(REPO_ROOT, 'node_modules', 'yaml'));

// Kanoniczny skrypt Workflow (K93). Ścieżka wyliczona z położenia TEGO pliku, więc
// satelita nie musi niczego symlinkować ani znać lokalizacji claude-patterns.
const WORKFLOW_SCRIPT = join(REPO_ROOT, 'scripts', 'workflow', 'orchestrate.template.mjs');

const EXIT = { OK: 0, USAGE: 1, GATE: 2, CONFIG: 3, LINT: 4 };

function die(code, msg) {
  process.stderr.write(`✘ orchestrate-prepare: ${msg}\n`);
  process.exit(code);
}

// ── argumenty ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { taskId: null, project: process.cwd(), json: false, overrides: null, emitScript: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--project') out.project = argv[++i] ?? '';
    else if (a.startsWith('--project=')) out.project = a.slice('--project='.length);
    else if (a === '--overrides') out.overrides = argv[++i] ?? '';
    else if (a === '--emit-script') out.emitScript = argv[++i] ?? '';
    else if (a.startsWith('-')) die(EXIT.USAGE, `nieznany przełącznik: ${a}`);
    else if (!out.taskId) out.taskId = a;
    else die(EXIT.USAGE, `nadmiarowy argument: ${a}`);
  }
  if (!out.taskId) die(EXIT.USAGE, 'brak <TASK-ID>.\n  użycie: orchestrate-prepare.mjs <TASK-ID> [--project <dir>] [--json] [--overrides <plik.json>] [--emit-script <ścieżka.mjs>]');
  if (!out.project) die(EXIT.USAGE, '--project bez wartości');
  if (out.overrides === '') die(EXIT.USAGE, '--overrides bez ścieżki pliku');
  if (out.emitScript === '') die(EXIT.USAGE, '--emit-script bez ścieżki pliku');
  out.project = resolve(out.project);
  if (out.overrides) out.overrides = resolve(out.overrides);
  if (out.emitScript) out.emitScript = resolve(out.emitScript);
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
  let fmError = null;
  // ORC-102: błąd składni NIE może zamieniać się w ciche `fm = null` — wtedy `units[]`, `decisions[]`,
  // `layers_scope`, `minor_fixes` i reszta pól znikają z planu, a bramka (status z regexu) przechodzi
  // (ai-gateway TS-AIG-084: `\`` w ciągu w cudzysłowach, 10 jednostek zgubionych, w tym `docs`).
  try { fm = YAML.parse(m[1]); } catch (e) { fm = null; fmError = String(e.message ?? e).split('\n')[0]; }
  return { fm, fmRaw: m[1], fmError, body: m[2] };
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

// ANZ-PATTERN-MISMATCH (marketing-hub TS-MH-026): task czysto webowy dostawał 7 kart API z półki `always`
// i trafień keywordów (schema/endpoint/uprawnien), a analiza odrzucała je ręcznie w patterns_exclude.
// Przestrzeń nazw tagu to człon przed pierwszym „:" (`api:data-access` → api). Karta, której tagi
// należą wyłącznie do przestrzeni, jakich nie ma żadna uruchamiana warstwa, nie wchodzi do doboru.
function tagNamespaces(content) {
  const m = /^\*\*Tags\*\*:\s*(.+)$/m.exec(String(content));
  if (!m) return null;
  const ns = [...m[1].matchAll(/"([^":]+):[^"]*"/g)].map((x) => x[1]);
  return ns.length ? new Set(ns) : null;
}

// ORC-128: ścieżki plików KODU (nie dokumentów) wymienione w `choice`/`rationale` decyzji, które istnieją
// w repo. Pliki .md/.yml/.json i katalogi docs/ oraz project-orchestration/ pomijamy: to artefakty
// procesu i dokumentacja (obsługuje je `minor_fixes`, ORC-101), nie zakres warstw kodu.
function decisionCodeFiles(decisions, projectDir) {
  if (!Array.isArray(decisions)) return [];
  const re = /(?:^|[\s`'"(\[,])((?:[\w@.-]+\/)+[\w.-]+\.(?:tsx?|mts|cts|jsx?|mjs|cjs|py|dart|sql|go|rs))(?![\w/])/g;
  const out = new Set();
  for (const d of decisions) {
    const text = `${d?.choice ?? ''} ${d?.rationale ?? ''}`;
    let m;
    while ((m = re.exec(text)) !== null) {
      const p = m[1].replace(/^\.\//, '');
      if (/^(docs|project-orchestration)\//.test(p)) continue;
      if (existsSync(join(projectDir, p))) out.add(p);
    }
  }
  return [...out];
}

function patternOutsideLayerNamespaces(content, runningNs) {
  if (!runningNs.size) return false;
  const ns = tagNamespaces(content);
  if (!ns || ns.has('any')) return false;
  return ![...ns].some((n) => runningNs.has(n));
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

function resolveLayers(runtime, layersDone, layersSkip, layersScope, units) {
  const orch = runtime.orchestrate ?? {};
  const raw = Array.isArray(orch.layers) && orch.layers.length ? orch.layers : GENERIC_LAYERS;
  const done = new Set((layersDone ?? []).map(String));
  // layers_skip z artefaktu: warstwa, której task NIE dotyka (z powodem z analizy). Inna klasa
  // niż layers_done (checkpoint wznowienia) — tam praca była, tu jej nie ma i nie będzie.
  const skipped = new Map((layersSkip ?? []).filter((s) => s && typeof s === 'object')
    .map((s) => [String(s.id), String(s.reason ?? '')]));
  const skipOf = (id) => done.has(id) ? 'GO z poprzedniego przebiegu (layers_done)'
    : skipped.has(id) ? `pominięta w analizie (layers_skip): ${skipped.get(id)}` : null;
  // layers_scope z artefaktu: warstwa WCHODZI, ale implementer i sonda widzą tylko wskazane
  // ścieżki. Trzecia klasa obok skip/done — „dotknięta częściowo" nie da się wyrazić przez
  // skip bez zgubienia pracy (juz-ide-api-2, 2026-09-18: application skip=true, a w jednym
  // z ośmiu kontekstów siedziała naprawa żywego wycieku; ANL-037).
  const scoped = new Map((layersScope ?? []).filter((s) => s && typeof s === 'object')
    .map((s) => [String(s.id), {
      dirs: (Array.isArray(s.dirs) ? s.dirs : [s.dirs]).filter(Boolean).map(String),
      reason: String(s.reason ?? ''),
    }]));
  const base = raw.map((l, i) => ({
    index: i,
    id: String(l.id),
    dirs: (l.dirs ?? []).map(String),
    agent: String(l.agent ?? 'general-purpose'),
    role: l.role ? String(l.role) : null,
    tags: (l.tags ?? []).map(String),
    tests: l.tests === true,
    optional: l.optional === true,
    createWhen: l.create_when ? String(l.create_when) : null,
    // weryfikator PER WARSTWA (monorepo api+web: inny VETO dla apps/web niż dla domeny);
    // brak = inner_loop.verify, jak dotąd.
    verify: l.verify ? String(l.verify) : null,
    // wzorce przypisane wprost do warstwy (layer_contributions z innych bloków)
    layerPatterns: (l.patterns ?? []).map(String),
    checks: (l.checks ?? []).map(String),
    // checkpoint z artefaktu — warstwa z GO poprzedniego przebiegu nie startuje ponownie
    skip: skipOf(String(l.id)) !== null,
    skipReason: skipOf(String(l.id)),
    // zawężenie z analizy (layers_scope) — szablon czyta `scope.dirs` ZAMIAST `dirs`
    scope: scoped.get(String(l.id)) ?? null,
  }));
  return expandUnits(base, units, done);
}

// units[] z artefaktu → pod-warstwy. Analiza marketing-hub TS-MH-005 zaplanowała 4 przebiegi
// infrastruktury, a prepare (pole nieczytane) zbudował jeden — człowiek zauważył to dopiero
// w wyjściu. Warstwa z jednostkami zostaje zastąpiona, w miejscu i kolejności z artefaktu,
// pod-warstwami `<warstwa>:<unit>`: zakres = `dirs` jednostki (jak layers_scope), karty
// warstwy bazowej (`base`), checks/rola jednostki albo warstwy. `layers_done` przyjmuje id
// pod-warstwy (checkpoint per jednostka) i id warstwy bazowej (wszystkie jej jednostki).
// Poprawność wpisów sprawdza bramka w main() — tu wejście jest już zwalidowane.
function expandUnits(layers, units, done) {
  const list = (Array.isArray(units) ? units : []).filter((u) => u && typeof u === 'object');
  if (!list.length) return layers;
  const out = [];
  for (const layer of layers) {
    const mine = list.filter((u) => String(u.layer) === layer.id);
    if (!mine.length) { out.push(layer); continue; }
    for (const u of mine) {
      const id = `${layer.id}:${String(u.id)}`;
      const isDone = done.has(id) || done.has(layer.id);
      const dirs = (Array.isArray(u.dirs) ? u.dirs : [u.dirs]).filter(Boolean).map(String);
      out.push({
        ...layer,
        id,
        base: layer.id,
        role: u.role ? String(u.role) : layer.role,
        checks: Array.isArray(u.checks) ? u.checks.map(String) : layer.checks,
        skip: isDone,
        skipReason: isDone ? 'GO z poprzedniego przebiegu (layers_done)' : null,
        scope: { dirs, reason: String(u.reason ?? u.title ?? `jednostka ${u.id}`) },
      });
    }
  }
  return out.map((l, i) => ({ ...l, index: i }));
}

// Dwie ścieżki, jedna reguła: nadpisanie, którego wyjście nie zna, to literówka — exit 1.
// Obiekty scalane głęboko, tablice i skalary zastępowane. `layers` to mapa po id warstwy.
// `budgets`, `env` i `createWhenHits` są otwarte (klucze definiuje projekt).
const OPEN_OVERRIDE_KEYS = new Set(['budgets', 'env', 'createWhenHits']);
function applyOverrides(out, overrides, path = '') {
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(overrides)) die(EXIT.USAGE, `--overrides${path ? ' ' + path : ''}: oczekiwany obiekt JSON`);
  const result = { ...out };
  for (const [k, v] of Object.entries(overrides)) {
    const here = path ? `${path}.${k}` : k;
    if (!path && k === 'layers') {
      if (!isObj(v)) die(EXIT.USAGE, '--overrides layers: oczekiwana mapa { "<id warstwy>": { …pola… } }');
      const ids = new Set(out.layers.map((l) => l.id));
      for (const id of Object.keys(v)) if (!ids.has(id)) die(EXIT.USAGE, `--overrides layers.${id}: nie ma takiej warstwy (są: ${[...ids].join(', ')})`);
      result.layers = out.layers.map((l) => (v[l.id] ? applyOverrides(l, v[l.id], `layers.${l.id}`) : l));
      continue;
    }
    // ORC-109: `checks.byLayer` to widok pomocniczy wyjścia — skrypt i sonda czytają `layers[].checks`,
    // więc to nadpisanie byłoby ciche i nieskuteczne (aegis-flow TS-019: wznowienie z cache).
    if (here === 'checks.byLayer') die(EXIT.USAGE, '--overrides checks.byLayer: widok pomocniczy, sonda go nie czyta — użyj `layers: { "<id warstwy>": { "checks": [...] } }`');
    const open = OPEN_OVERRIDE_KEYS.has(path.split('.')[0] || k);
    if (!(k in out) && !open) die(EXIT.USAGE, `--overrides: nieznany klucz \`${here}\` — wyjście prepare go nie ma (literówka?)`);
    result[k] = isObj(v) && isObj(out[k]) ? applyOverrides(out[k], v, here) : v;
  }
  return result;
}

// Stan repo przy starcie przebiegu: baza porównania dla bramki końcowej (lista plików z
// drzewa, nie z raportów warstw) i pliki brudne już przed startem (bramka ma wiedzieć, że
// nie są pracą tego taska). Brak gita = null + ostrzeżenie; szablon wraca wtedy do HEAD.
// ORC-092: `maxTurns` z frontmattera agenta WYGRYWA z budżetem przekazanym przez skrypt (iam
// TS-SSO-056: security-e2e-verifier z maxTurns: 20 kończył bez StructuredOutput przy budżecie 42,
// a `--overrides` go nie podnosił; ta sama „cicha" bramka końcowa w grant-flow i juz-ide-api-1).
// Ostrzegamy PRZED startem, gdy limit agenta jest mniejszy niż to, co skrypt mu obiecuje
// (verify/final-gate do 50, implementer 40 — albo jawny budget z runtime.yml).
function agentTurnCapWarnings(projectDir, out) {
  const budget = (slot, fallback) => {
    const b = out.budgets?.[slot] ?? {};
    const n = b.max_tool_calls ?? b.max_turns;
    return typeof n === 'number' && n > 0 ? n : fallback;
  };
  const need = new Map();
  const add = (spec, turns, role) => {
    for (const name of String(spec ?? '').split('|').map((s) => s.trim()).filter(Boolean)) {
      if (name.includes(':')) continue; // agenci z pluginów (ecc:*) nie mają lokalnego pliku
      const key = `${name}/${role}`;
      if (!need.has(key)) need.set(key, { name, turns, role });
    }
  };
  add(out.verifiers?.layer, budget('verify', 50), 'verify');
  add(out.verifiers?.finalGate, budget('final-gate', 50), 'final-gate');
  for (const l of out.layers ?? []) {
    add(l.verify, budget('verify', 50), 'verify');
    add(l.agent, budget('implement', 40), 'implement');
  }
  const found = [];
  for (const { name, turns, role } of need.values()) {
    const file = join(projectDir, '.claude', 'agents', `${name}.md`);
    if (!existsSync(file)) continue;
    const head = readFileSync(file, 'utf8').split('\n').slice(0, 40).join('\n');
    const m = head.match(/^maxTurns:\s*(\d+)/m);
    if (m && Number(m[1]) < turns) {
      found.push(`agent "${name}" (rola ${role}) ma maxTurns: ${m[1]} w definicji — wygrywa z budżetem skryptu (do ${turns}); przy większym zakresie kończy BEZ werdyktu. Podnieś maxTurns w .claude/agents/${name}.md do ≥ ${turns}.`);
    }
  }
  return found;
}

// ORC-132: pliki brudne przy KOLEJNYM prepare na tym samym HEAD to w większości praca poprzednich prób
// tego taska (halt → wznowienie), a nie cudza. Pierwszy prepare zapisuje listę w `.claude/run-state/`,
// kolejne (ten sam baseSha, do 7 dni) liczą jako cudze tylko pliki, które były brudne już wtedy.
// Zmiana HEAD (commit) albo usunięcie pliku zaczyna liczenie od nowa. Awaria zapisu nie blokuje startu.
const BASELINE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
function dirtyBaseline(projectDir, taskId, baseSha, dirty, warnings) {
  const rel = join('.claude', 'run-state', `${String(taskId).replace(/[^\w.-]/g, '_')}.dirty-baseline.json`);
  const file = join(projectDir, rel);
  let prev = null;
  try { prev = JSON.parse(readFileSync(file, 'utf8')); } catch { /* brak pliku = pierwszy prepare */ }
  const age = prev ? Date.now() - Date.parse(prev.at) : Infinity;
  if (prev && prev.baseSha === baseSha && Array.isArray(prev.dirty) && age >= 0 && age < BASELINE_MAX_AGE_MS) {
    const was = new Set(prev.dirty.map(String));
    const foreign = dirty.filter((f) => was.has(f));
    if (foreign.length < dirty.length) {
      warnings.push(`wznowienie na tym samym HEAD: ${dirty.length - foreign.length} z ${dirty.length} brudnych plików uznano za pracę poprzednich prób tego taska (baseline z ${prev.at}); do cudzych zostaje ${foreign.length}. Liczenie od nowa: usuń ${rel} (ORC-132)`);
    }
    return foreign;
  }
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ baseSha, dirty, at: new Date().toISOString() }) + '\n');
  } catch (e) {
    warnings.push(`nie zapisano ${rel}: ${e.message} — kolejny prepare policzy brudne pliki od nowa (ORC-132)`);
  }
  return dirty;
}

function gitState(projectDir, warnings, taskId) {
  const git = (...a) => spawnSync('git', ['-C', projectDir, ...a], { encoding: 'utf8' });
  const head = git('rev-parse', 'HEAD');
  if (head.status !== 0) {
    warnings.push('katalog projektu nie jest repozytorium git z commitem — baseSha/dirtyAtStart puste, bramka końcowa porówna z HEAD');
    return { baseSha: null, dirtyAtStart: [] };
  }
  const st = git('status', '--porcelain', '-uall');
  const dirty = st.status === 0
    ? st.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '')).filter((f) => !/(^|\/)\.claude\/run-state\//.test(f))
    : [];
  const baseSha = head.stdout.trim();
  return { baseSha, dirtyAtStart: dirtyBaseline(projectDir, taskId, baseSha, dirty, warnings) };
}

// Skrypt z wbudowanymi args. Podstawienie przez split/join, NIE String.replace ze stringiem
// zastępczym: `$'`, `$&` i `$1` w treści kart (a karty mają przykłady z shellem i regexami)
// są w replace wzorcami — marketing-hub zgubił na tym fragment args w ręcznej kopii.
const ARGS_LINE = 'const a = args || {}';
// Plan przebiegu do `run.start` (ADR 0012): warstwy, które SKRYPT faktycznie uruchomi (ta sama
// reguła co w szablonie: bez skip i bez warstwy opcjonalnej, której create_when nie trafił)
// × role pętli wewnętrznej + bramka końcowa. Liczone po overrides, więc zgodne z tym, co pójdzie do skryptu.
function buildTelemetryPlan(out) {
  const plan = [];
  for (const l of out.layers) {
    if (l.skip) continue;
    if (l.optional && !out.createWhenHits[l.id]) continue;
    plan.push({ id: `${l.id}:implementer`, group: String(l.id), role: 'implementer' });
    if (out.verifiers.layer) plan.push({ id: `${l.id}:verifier`, group: String(l.id), role: 'verifier' });
  }
  if (out.verifiers.finalGate) plan.push({ id: 'final:gate', group: 'final', role: 'gate' });
  return plan;
}

function emitScript(out, target) {
  const src = readFileSync(WORKFLOW_SCRIPT, 'utf8');
  const hits = src.split(ARGS_LINE).length - 1;
  if (hits !== 1) die(EXIT.CONFIG, `szablon ${WORKFLOW_SCRIPT}: oczekiwana dokładnie jedna linia "${ARGS_LINE}", jest ${hits}`);
  const json = JSON.stringify(out, null, 1).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const emitted = src.split(ARGS_LINE).join(`const a = ${json}`);
  const { lint } = require_(join(REPO_ROOT, 'hooks', 'workflow-lint.js'));
  const findings = lint(emitted);
  const errors = findings.filter((x) => x.level === 'ERROR');
  if (errors.length) {
    process.stderr.write('✘ orchestrate-prepare: wyemitowany skrypt NIE przeszedł workflow-lint — plik nie powstał.\n');
    for (const e of errors) process.stderr.write(`  • [${e.id}] ${e.msg.slice(0, 300)}\n`);
    process.exit(EXIT.LINT);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, emitted);
  return findings.filter((x) => x.level !== 'ERROR').map((x) => `workflow-lint [${x.id}] w wyemitowanym skrypcie: ${x.msg.slice(0, 200)}`);
}

// Powód pominięcia warstwy, który mówi „częściowo" — to zawężenie zapisane w złym polu.
// Lista celowo wąska: „tylko"/„nie dotyczy" same w sobie są w legalnych powodach
// („zmiany tylko w infrastrukturze", „task nie dotyczy domeny"), więc nie łapiemy ich gołych.
const PARTIAL_SKIP_MARKERS = [
  /\bwyj[aą]t(ek|kiem)\b/i,              // „wyjątek: …", „z wyjątkiem …"
  /\bopr[oó]cz\b/i,
  /\bzaw[eę][zż]on/i,                    // „zawężony zakres"
  /\bcz[eę][sś]ciow/i,                   // „częściowo"
  /\b\d+\s+z\s+\d+\b/i,                  // „7 z 8 kontekstów"
  /pomini[eę]t\w*\s+tylko\b/i,           // „pominięta TYLKO dla …"
  /\btylko\s+dla\b/i,
  /\bnie\s+jest\s+(ju[zż]\s+)?ca[lł]kowicie\b/i,
  /\b(except|partial(ly)?|only\s+for)\b/i,
];
function partialSkipMarker(reason) {
  const hit = PARTIAL_SKIP_MARKERS.find((re) => re.test(reason));
  return hit ? String(reason.match(hit)[0]) : null;
}
const PATH_LIKE = /(^|[\s(])(src|apps|packages|lib|libs|test|tests)\/[\w.\-\/]+/;

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
    if (analysisDoc.fmError) {
      gateFailures.push(`frontmatter artefaktu nie parsuje się jako YAML (${analysisDoc.fmError}) — units[], decisions[], ` +
        'layers_scope, minor_fixes i pozostałe pola zostałyby POMINIĘTE bez ostrzeżenia. Typowo: `\\`` albo inny znak ' +
        'ucieczki w ciągu w cudzysłowach — użyj apostrofów albo bloku `|`/`>`')
    }
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
    // decisions[] — prompty czytają `choice`. Artefakt z polem `decision`/`answer`/`option`
    // przechodził bramkę, a D1–D7 docierały do implementerów PUSTE (juz-ide-api-2, 2026-09-14):
    // zatwierdzona decyzja, której nikt nie stosuje, jest gorsza niż brak decyzji.
    const decisions = analysisDoc.fm?.decisions;
    if (Array.isArray(decisions)) {
      const ALIASES = ['decision', 'answer', 'option', 'chosen', 'wybor', 'wybór'];
      for (const d of decisions) {
        if (!d || typeof d !== 'object') continue;
        const id = String(d.id ?? '?');
        if (typeof d.choice === 'string' && d.choice.trim()) continue;
        const alias = ALIASES.find((k) => typeof d[k] === 'string' && d[k].trim());
        gateFailures.push(alias
          ? `decisions[${id}]: pole \`${alias}\` zamiast \`choice\` — prompty czytają WYŁĄCZNIE \`choice\`, zmień nazwę pola`
          : `decisions[${id}]: brak \`choice\` (albo puste) — decyzja bez treści nie trafi do żadnego agenta`);
      }
    }
    // layers_skip[] — warstwy, których task nie dotyka; każda musi istnieć w runtime.yml i mieć powód.
    const known = new Set((runtime.orchestrate?.layers ?? GENERIC_LAYERS).map((l) => String(l.id)));
    const knownList = [...known].join(', ');
    // `dirs` to ścieżki od korzenia repo. Sama nazwa pliku bez katalogu, której nie ma w korzeniu,
    // to pomyłka (ai-gateway TS-AIG-102: `CLAUDE-LOCAL.md` leży w `.claude/config/`), a zakres
    // z nietrafioną ścieżką nie obejmuje pliku bez żadnego śladu. Nowe pliki w istniejących
    // katalogach są normalne, więc ostrzegamy tylko w tym jednym, pewnym przypadku.
    const warnBareMissingDirs = (tag, dirs) => {
      for (const d of dirs) {
        if (typeof d !== 'string') continue;
        const p = d.trim();
        if (!p || p.includes('/') || existsSync(join(args.project, p))) continue;
        warnings.push(`${tag}: \`dirs\` zawiera "${p}" — brak takiego pliku w korzeniu repo; podaj ścieżkę od korzenia (np. .claude/config/${p})`);
      }
    };
    const skips = analysisDoc.fm?.layers_skip;
    const skipIds = new Set();
    if (skips !== undefined && !Array.isArray(skips)) {
      gateFailures.push('layers_skip: musi być listą { id, reason }');
    } else if (Array.isArray(skips)) {
      for (const s of skips) {
        const id = s && typeof s === 'object' ? String(s.id ?? '') : String(s ?? '');
        skipIds.add(id);
        if (!known.has(id)) gateFailures.push(`layers_skip: warstwa "${id}" nie istnieje w runtime.yml (są: ${knownList})`);
        if (!s || typeof s !== 'object' || typeof s.reason !== 'string' || !s.reason.trim()) {
          gateFailures.push(`layers_skip[${id}]: brak \`reason\` — pominięcie warstwy bez uzasadnienia to to samo, co niewykonana praca`);
          continue;
        }
        // Skip jest binarny: `skip: true` w szablonie = implementer tej warstwy NIE startuje.
        // Powód mówiący „częściowo" znaczy, że część pracy właśnie zniknęła bez śladu
        // (juz-ide-api-2, 2026-09-18: fix żywego wycieku w jednym z ośmiu kontekstów).
        const marker = partialSkipMarker(s.reason);
        if (marker) {
          gateFailures.push(
            `layers_skip[${id}]: powód mówi „częściowo" („${marker}"), a skip jest całkowity — implementer ` +
            `warstwy ${id} w ogóle nie wystartuje i ta część pracy zniknie. Przenieś wpis do ` +
            `\`layers_scope: [{ id: ${id}, dirs: [<ścieżki, które task dotyka>], reason }]\` (warstwa wchodzi, zakres zawężony).`);
        } else if (PATH_LIKE.test(s.reason)) {
          warnings.push(`layers_skip[${id}]: powód wymienia ścieżkę w kodzie — upewnij się, że to NIE jest miejsce do zmiany (wtedy: layers_scope)`);
        }
      }
    }
    // layers_scope[] — warstwy dotknięte CZĘŚCIOWO: wchodzą, ale z zakresem zawężonym do `dirs`.
    const scopes = analysisDoc.fm?.layers_scope;
    if (scopes !== undefined && !Array.isArray(scopes)) {
      gateFailures.push('layers_scope: musi być listą { id, dirs: [...], reason }');
    } else if (Array.isArray(scopes)) {
      for (const s of scopes) {
        const id = s && typeof s === 'object' ? String(s.id ?? '') : String(s ?? '');
        if (!known.has(id)) gateFailures.push(`layers_scope: warstwa "${id}" nie istnieje w runtime.yml (są: ${knownList})`);
        if (skipIds.has(id)) gateFailures.push(`layers_scope[${id}]: warstwa jest jednocześnie w layers_skip — wybierz jedno (skip = nie wchodzi, scope = wchodzi zawężona)`);
        const dirs = s && typeof s === 'object' ? (Array.isArray(s.dirs) ? s.dirs : (s.dirs ? [s.dirs] : [])) : [];
        if (!dirs.length || dirs.some((d) => typeof d !== 'string' || !d.trim()))
          gateFailures.push(`layers_scope[${id}]: brak \`dirs\` — zawężenie bez ścieżek to pełna warstwa, użyj wtedy zwykłego wpisu w runtime.yml`);
        if (!s || typeof s !== 'object' || typeof s.reason !== 'string' || !s.reason.trim())
          gateFailures.push(`layers_scope[${id}]: brak \`reason\` — zawężenie bez uzasadnienia wygląda jak przeoczony zakres`);
        warnBareMissingDirs(`layers_scope[${id}]`, dirs);
      }
    }
    // units[] — podział warstwy na jednostki (pod-warstwy). Pole istniało w szablonie analizy,
    // a prepare go nie czytał: plan 4 przebiegów infrastruktury dawał jeden (TS-MH-005).
    // Każdy błąd wpisu zatrzymuje start — ciche pominięcie jednostki to zgubiona praca.
    const units = analysisDoc.fm?.units;
    const scopeIds = new Set((Array.isArray(scopes) ? scopes : []).map((x) => String(x?.id ?? '')));
    if (units !== undefined && units !== null && !Array.isArray(units)) {
      gateFailures.push('units: musi być listą { id, layer, dirs: [...], role?, checks?, reason?, repair? }');
    } else if (Array.isArray(units)) {
      const seen = new Set();
      for (const u of units) {
        if (!u || typeof u !== 'object') { gateFailures.push(`units: wpis "${String(u)}" nie jest obiektem { id, layer, dirs }`); continue; }
        const id = String(u.id ?? '').trim();
        const layer = String(u.layer ?? '').trim();
        const tag = `units[${id || '?'}]`;
        if (!id) gateFailures.push(`${tag}: brak \`id\``);
        else if (/[:\s]/.test(id)) gateFailures.push(`${tag}: id bez dwukropka i spacji (staje się częścią id pod-warstwy <warstwa>:<id>)`);
        if (seen.has(`${layer}:${id}`)) gateFailures.push(`${tag}: zdublowane id w warstwie ${layer}`);
        seen.add(`${layer}:${id}`);
        if (!known.has(layer)) gateFailures.push(`${tag}: \`layer\` "${layer}" nie istnieje w runtime.yml (są: ${knownList})`);
        if (skipIds.has(layer)) gateFailures.push(`${tag}: warstwa ${layer} jest w layers_skip — jednostki pominiętej warstwy nie wystartują`);
        if (scopeIds.has(layer)) gateFailures.push(`${tag}: warstwa ${layer} jest w layers_scope — zakres podaj w dirs jednostek, nie w obu miejscach`);
        const dirs = Array.isArray(u.dirs) ? u.dirs : (u.dirs ? [u.dirs] : []);
        if (!dirs.length || dirs.some((d) => typeof d !== 'string' || !d.trim()))
          gateFailures.push(`${tag}: brak \`dirs\` — jednostka bez ścieżek to cała warstwa, wtedy nie dziel jej na jednostki`);
        warnBareMissingDirs(tag, dirs);
        if (u.checks !== undefined && !Array.isArray(u.checks)) gateFailures.push(`${tag}: \`checks\` musi być listą nazw skryptów`);
        if (u.repair !== undefined && typeof u.repair !== 'boolean') gateFailures.push(`${tag}: \`repair\` musi być true/false`);
      }
    }
    const excl = analysisDoc.fm?.patterns_exclude;
    if (excl !== undefined && excl !== null && !Array.isArray(excl)) gateFailures.push('patterns_exclude: musi być listą ścieżek wzorców');
    const fc = analysisDoc.fm?.final_checks;
    if (fc !== undefined && fc !== null && (!Array.isArray(fc) || fc.some((c) => typeof c !== 'string' || !c.trim()))) gateFailures.push('final_checks: musi być listą niepustych nazw skryptów albo komend dosłownych');
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

  // patterns_exclude[] — fałszywe trafienia keywordów odrzucone w analizie (TS-MH-005: TCC na
  // „confirm", wzorce web na „dashboard"). Wcześniej analiza mogła je tylko opisać w komentarzu.
  const exclude = new Set((analysisDoc?.fm?.patterns_exclude ?? []).map(String));
  const excludedHit = new Set();
  const excluded = (p) => { if (exclude.has(p)) { excludedHit.add(p); return true; } return false; };

  const patterns = [];
  for (const [relPath, meta] of selection) {
    if (excluded(relPath)) continue;
    const loaded = readPattern(relPath, args.project, warnings);
    if (loaded) patterns.push({ ...loaded, origin: meta.origin, matchedKeywords: meta.matchedKeywords });
  }

  // 5. warstwy + wzorce warstwowe (te dochodzą PONAD wybór globalny)
  const layersDone = analysisDoc?.fm?.layers_done ?? [];
  const layers = resolveLayers(runtime, layersDone, analysisDoc?.fm?.layers_skip ?? [], analysisDoc?.fm?.layers_scope ?? [], analysisDoc?.fm?.units ?? []);
  // create_when warstw opcjonalnych — do 2026-09-15 NIKT tego nie liczył: szablon czytał
  // `a.createWhenHits || {}`, więc każda warstwa `optional: true` była zawsze pomijana
  // (api-surface w library-layers nigdy nie weszła). Ten sam haystack co dla triggerów wzorców.
  const createWhenHits = {};
  for (const layer of layers) {
    if (!layer.optional || !layer.createWhen) continue;
    // ORC-113: `create_when` to REGEX po haystacku (wartości frontmattera + treść taska i analizy), nie opis.
    // Zdanie po polsku nie trafia nigdy, a warstwa opcjonalna znika bez śladu (juz-ide-blog BLOG-GUIDES-001).
    if (layer.createWhen.trim().split(/\s+/).length >= 3 && !/[|\\]/.test(layer.createWhen)) {
      warnings.push(`create_when warstwy ${layer.id}: wygląda na opis prozą, a jest regexem (alternatywy przez "|") — warstwa prawdopodobnie nigdy nie wejdzie; obejście: --overrides createWhenHits`);
    }
    try { createWhenHits[layer.id] = new RegExp(layer.createWhen, 'i').test(haystack); }
    catch (e) { warnings.push(`create_when warstwy ${layer.id}: niepoprawny regex (${e.message}) — warstwa pominięta`); createWhenHits[layer.id] = false; }
  }
  for (const layer of layers) {
    // Karty warstwy, której przebieg nie uruchomi, nie mają kogo prowadzić, a bramka końcowa dostaje
    // WSZYSTKIE wzorce przebiegu (grant-flow TS-UI-007, marketing-hub TS-MH-019: karty API/refine-spa
    // przy zadaniu tylko-web albo bez web). `layers_done` zostaje: bramka końcowa ocenia całość zmiany,
    // także warstwy domkniętej w poprzednim przebiegu.
    if (String(layer.skipReason ?? '').startsWith('pominięta w analizie')) continue;
    if (layer.optional && layer.createWhen && !createWhenHits[layer.id]) continue;
    for (const relPath of layer.layerPatterns) {
      if (patterns.some((p) => p.path === relPath)) continue;
      if (excluded(relPath)) continue;
      const loaded = readPattern(relPath, args.project, warnings);
      if (loaded) patterns.push({ ...loaded, origin: `layer:${layer.id}`, matchedKeywords: [] });
    }
  }

  // Dobór z `always` i triggerów (nie z analizy ani z warstwy) odpada, gdy tagi karty leżą w przestrzeniach
  // spoza uruchamianych warstw (task czysto web: karty `api:*` z półki nestjs). Karta bez tagów albo z `any:*` zostaje.
  const runningNs = new Set(layers
    .filter((l) => !l.skip && (!l.optional || createWhenHits[l.id]))
    .flatMap((l) => l.tags.map((t) => t.split(':')[0])));
  const analysisListed = new Set((analysisDoc?.fm?.patterns ?? []).map(String));
  const outOfNs = patterns.filter((p) => (p.origin === 'always' || p.origin === 'trigger') && !analysisListed.has(p.path) && patternOutsideLayerNamespaces(p.content, runningNs));
  if (outOfNs.length) {
    const drop = new Set(outOfNs.map((p) => p.path));
    for (let i = patterns.length - 1; i >= 0; i--) if (drop.has(patterns[i].path)) patterns.splice(i, 1);
    warnings.push(`wzorce pominięte: tagi poza przestrzeniami uruchamianych warstw (${[...runningNs].join(', ')}): ${[...drop].join(', ')} — jeśli któryś jest potrzebny, dopisz go do patterns[] analizy`);
  }

  for (const p of exclude) {
    if (!excludedHit.has(p)) warnings.push(`patterns_exclude: "${p}" nie był w doborze — literówka albo wzorzec już nie trafia`);
  }

  // 6. checks — per warstwa + bramka końcowa. `final_gate.checks` z bloku wchodzi ZAWSZE:
  // suma samych warstw gubiła testy regresji dokładnie wtedy, gdy analiza pominęła warstwę
  // testing (ORC-022, TS-MH-005), a w projektach na ddd/layers bez checks bramka nie
  // uruchamiała niczego.
  const running = layers.filter((l) => !l.skip);
  const gateOwn = (runtime.orchestrate?.final_gate?.checks ?? []).map(String);
  // ORC-121: analiza dopisuje do bramki końcowej checks wynikające z uzasadnień decyzji (marketing-hub TS-MH-022:
  // D3 wymagało test:l3 i skryptów taska po zmianie vitest-e2e.config.ts, a lista z bloków ich nie miała).
  const analysisFinal = (Array.isArray(analysisDoc?.fm?.final_checks) ? analysisDoc.fm.final_checks : []).map((c) => String(c).trim()).filter(Boolean);
  const finalChecks = [...new Set([...gateOwn, ...running.flatMap((l) => l.checks), ...analysisFinal])];
  if (!finalChecks.length && runtime.orchestrate?.final_gate?.agent) {
    warnings.push('bramka końcowa bez żadnych checks (ani final_gate.checks, ani checks warstw) — oceni zmianę wyłącznie czytając kod. Dodaj final_gate.checks w bloku.');
  }
  // ORC-129: żadna warstwa nie jest uruchamiana (wszystkie w layers_skip albo bez trafienia create_when) —
  // task bez kodu (np. wyłącznie docs/ i project-orchestration/); silnik zostałby z samą bramką końcową
  // (aegis-flow TS-001: 6 z 6 warstw w layers_skip).
  if (!running.length) {
    warnings.push('żadna warstwa nie jest uruchamiana (wszystkie w layers_skip lub poza create_when) — task bez zmian w kodzie; /orchestrate nie ma czego wykonać. Wykonaj zadanie ręcznie (dokumenty) albo zamknij bez silnika; jeśli to pomyłka w layers_skip, popraw analizę (ORC-129)');
  }
  // ORC-128: pliki kodu wskazane w decyzjach analizy, które istnieją w repo, a nie leżą w zakresie żadnej
  // uruchamianej warstwy/jednostki — wychodziły dopiero z bramki końcowej, kosztem 2 przebiegów
  // (juz-ide-api-1 TS-SEC-D0-FOLLOWUPS-001: validate-session/handler.ts, security.config.ts, stała Retry-After).
  if (!running.some((l) => !(l.dirs ?? []).length && !(l.scope?.dirs ?? []).length)) {
    const owned = (p) => running.some((l) => [...(l.dirs ?? []), ...(l.scope?.dirs ?? [])]
      .some((d) => { const s = String(d).replace(/\/+$/, ''); return s && p.includes(s); }));
    const orphans = decisionCodeFiles(analysisDoc?.fm?.decisions, args.project).filter((p) => !owned(p));
    if (orphans.length) {
      warnings.push(`decyzje wskazują pliki bez właściciela w zakresie uruchamianych warstw/jednostek: ${orphans.join(', ')} — dopisz je do \`dirs\` właściwej jednostki albo świadomie pomiń (inaczej wyjdą dopiero z bramki końcowej, ORC-128)`);
    }
  }
  const checks = {
    byLayer: Object.fromEntries(layers.map((l) => [l.id, l.checks])),
    finalGate: finalChecks,
  };

  const orch = runtime.orchestrate ?? {};
  const innerLoop = orch.inner_loop ?? {};
  const finalGate = orch.final_gate ?? {};

  const git = gitState(args.project, warnings, args.taskId);

  let out = {
    task: {
      id: args.taskId,
      project: args.project,
      taskFile: taskPath ? relative(args.project, taskPath) : null,
      analysisFile: analysisPath ? relative(args.project, analysisPath) : null,
      title: taskDoc?.fm?.title ? String(taskDoc.fm.title) : null,
      type: taskDoc?.fm?.type ? String(taskDoc.fm.type) : null,
      decisions: analysisDoc?.fm?.decisions ?? [],
      // ORC-091: drobne rzeczy znalezione w analizie (nie blokujące, łatwe) — implementer
      // warstwy robi te z jej zakresu przy okazji, zamiast czekać na ręczne zlecenie.
      minorFixes: Array.isArray(analysisDoc?.fm?.minor_fixes) ? analysisDoc.fm.minor_fixes.map(String) : [],
      // ORC-097: task wrażliwy na bezpieczeństwo = analiza ma threat_model (link do TM); wtedy
      // bramka końcowa dostaje model sesji zamiast domyślnego Sonneta.
      securitySensitive: (() => {
        const tm = analysisDoc?.fm?.threat_model;
        return Boolean(tm) && !/^(null|none|n\/a|brak|-)$/i.test(String(tm).trim());
      })(),
      layersDone: layersDone.map(String),
    },
    // Blok governance: inwarianty (`canon_inject`) + dokumenty z `strategy_ref`/`canon_ref` taska,
    // rozwiązane do ścieżek i treści. `active: false` bez bloku w kompozycji — bramka nic nie dostaje.
    canon: buildCanon({ projectDir: args.project, runtime, taskFm: taskDoc?.fm, analysisFm: analysisDoc?.fm, warnings }),
    // ORC-091: false (przez --overrides) wyłącza automatyczne naprawianie drobnych ustaleń.
    autoFixMinor: true,
    // ORC-097: model bramki końcowej — auto (Sonnet; model sesji dla tasków z threat_model) |
    // inherit | sonnet | opus | haiku; z runtime.yml `final_gate.model`.
    finalGateModel: finalGate.model ? String(finalGate.model) : 'auto',
    baseSha: git.baseSha,
    dirtyAtStart: git.dirtyAtStart,
    layers,
    patterns,
    checks,
    createWhenHits,
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
  warnings.push(...agentTurnCapWarnings(args.project, out));

  if (args.overrides) {
    let ov;
    try { ov = JSON.parse(readFileSync(args.overrides, 'utf8')); } catch (e) { die(EXIT.USAGE, `--overrides: nie da się wczytać ${args.overrides}: ${e.message}`); }
    out = applyOverrides(out, ov);
    out.overridesFile = args.overrides;
  }
  // ORC-130: ORC-124 chroni pliki brudne przed startem jako cudzą pracę. Gdy drzewo niesie pracę
  // SAMEGO taska (wznowienie po layers_done, warstwy zrobione ręcznie), ta ochrona wyłącza z
  // oceny i ze stage'u cały task (juz-ide-api-2 TS-GEO-HOME-POINT-001: 209 plików). Prepare nie
  // zgadnie, czyja to praca — mówi, co się stanie i jak to wyzerować, zanim skrypt wystartuje.
  const dirtyN = out.dirtyAtStart?.length ?? 0;
  const resumed = (out.task?.layersDone?.length ?? 0) > 0;
  if (dirtyN >= 20 || (resumed && dirtyN > 0)) {
    out.warnings.push(`${dirtyN} plików brudnych przed startem${resumed ? ' przy wznowieniu (layers_done: ' + out.task.layersDone.join(', ') + ')' : ''} — silnik uzna je za CUDZĄ pracę (ORC-090/124): weryfikatorzy ich nie ocenią, stage ich nie obejmie. Jeśli to praca tego taska: --overrides {"dirtyAtStart": []}`);
  }
  out.telemetryPlan = buildTelemetryPlan(out);
  out.engine = engineVersion();
  if (args.emitScript) {
    out.scriptPath = args.emitScript;
    out.argsEmbedded = true;
    const lintWarns = emitScript(out, args.emitScript);
    out.warnings.push(...lintWarns);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    const w = (s) => process.stdout.write(s + '\n');
    w(`✔ ${out.task.id} — gotowe do Workflow`);
    w(`  projekt      ${out.task.project}`);
    w(`  analiza      ${out.task.analysisFile ?? '(brak, dozwolone)'}`);
    w(`  task         ${out.task.taskFile ?? '(brak)'}`);
    w(`  warstwy      ${out.layers.map((l) => l.id + (l.skip ? ' (pominięta)' : l.scope ? ` (zawężona: ${l.scope.dirs.join(', ')})` : '')).join(' → ')}`);
    w(`  verify       ${out.verifiers.layer ?? '(brak slotu)'} · final_gate ${out.verifiers.finalGate ?? '(brak slotu)'}`);
    w(`  wzorce       ${out.patterns.length} (${out.patterns.filter((p) => p.card).length} kart, ${out.patterns.filter((p) => !p.card).length} pełnych)`);
    for (const p of out.patterns) {
      w(`    ${p.card ? 'karta' : 'PEŁNY'}  ${p.path}  [${p.origin}${p.matchedKeywords.length ? ' ← ' + p.matchedKeywords.join(', ') : ''}]`);
    }
    w(`  checks       final_gate: ${out.checks.finalGate.join(', ') || '(brak)'}`);
    w(`  baza         ${out.baseSha ?? '(brak gita)'}${out.dirtyAtStart.length ? ` · brudne przed startem: ${out.dirtyAtStart.length}` : ''}`);
    w(`  kolekcja RAG ${out.knowledge.collection ?? '(brak)'}`);
    w(`  skrypt       ${out.scriptPath}${out.argsEmbedded ? ' (args wbudowane — Workflow({scriptPath}) bez args)' : ''}`);
    if (out.warnings.length) {
      w('  ostrzeżenia:');
      for (const x of out.warnings) w(`    ⚠ ${x}`);
    }
    w('');
    w('  Pełny JSON pod `args`: dopisz --json');
  }
  // NIE process.exit(): przy stdout w potoku exit() ucina niezapisany bufor — `--json | …`
  // urywał się na 64 KB, a args realnego przebiegu mają ~190 KB (TS-MH-005, 2026-09-24).
  process.exitCode = EXIT.OK;
}

main();
