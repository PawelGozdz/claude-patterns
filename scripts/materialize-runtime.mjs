#!/usr/bin/env node
// Materializacja bloków → .claude/config/runtime.yml (ADR 0008 D3, TASK-BLOCKS-001 F2).
// Wołane z setup-project.sh (sekcja 5a) albo ręcznie:
//   node scripts/materialize-runtime.mjs <project_dir> [patterns_repo]
//
// Sklejanie dzieje się RAZ, tutaj — silniki /analyze i /orchestrate czytają
// wyłącznie wynikowy runtime.yml. Reguły: unia always (dedup), konkatenacja
// triggers, panel w kolejności bloków, exit PAUSE jeśli ktokolwiek deklaruje,
// orchestrate z dokładnie jednego bloku osi architektury, env później-wygrywa
// (z ostrzeżeniem), budżety min-merge (OQ3; project.yml nadpisuje), ostrzeżenie
// >8 always (OQ4), twardy błąd przy wiszącej ścieżce wzorca i przy braku
// wymaganego parametru bloku.
//
// 2026-08-11: parsowanie przeszło z regexów na prawdziwy YAML (paczka `yaml`).
// Powód: subset-parser cicho gubił każdą sekcję, której nie znał — blok mógł
// zadeklarować cokolwiek poza znaną listą kluczy i zniknęłoby to bez śladu.
// Teraz nieznany klucz najwyższego poziomu daje ostrzeżenie z nazwą bloku,
// a wejście wolno formatować dowolnie poprawnym YAML-em.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

let YAML;
try {
  YAML = (await import('yaml')).default;
} catch {
  console.error('  BŁĄD: brak paczki "yaml" — odpal `npm ci` w claude-patterns i spróbuj ponownie.');
  process.exit(1);
}

// `--check` liczy hash i porównuje go z tym w runtime.yml, NIC nie zapisując. Powód:
// `source_hash` obejmuje treść bloków, aliasy, parametry i taksonomię, więc edycja
// dowolnego z nich unieważnia runtime.yml każdego projektu — a bez trybu sprawdzania
// nie da się tego wykryć inaczej niż nadpisując dziesięć cudzych repozytoriów.
// Audyt z 2026-08-12 zastał wszystkie 10 kompozycji nieaktualnych, w tym dwie
// instancje bez bloków `decision-registry`/`governance`, czyli bez blokującego
// stage'a `decision-gate` w panelu `/analyze`. Exit 1 przy rozjeździe — nadaje się do CI.
const CHECK = process.argv.includes('--check');
const [projectDir, repoArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!projectDir) { console.error('użycie: materialize-runtime.mjs <project_dir> [patterns_repo] [--check]'); process.exit(1); }
const REPO = repoArg ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const warn = (m) => console.error(`  UWAGA: ${m}`);
const fail = (m) => { console.error(`  BŁĄD: ${m}`); process.exit(1); };

// Klucze najwyższego poziomu, które materializacja rozumie. Wszystko poza tą listą
// jest zgłaszane — cichy klucz to najgorszy rodzaj literówki, bo setup świeci zielono.
const BLOCK_KEYS = new Set([
  'name', 'axis', 'requires', 'requires_ecc', 'params',
  'patterns', 'overlay', 'env', 'analyze', 'orchestrate', 'budgets', 'ralphinho',
  'layer_contributions', 'extends',
  // Konsumowany przez INNY generator — scripts/generate-pattern-routing.mjs buduje z niego
  // hooks/lib/pattern-routing.generated.js. Do runtime.yml nie trafia i trafić nie ma po co:
  // czytają go hooki (check-delegation, check-patterns-read), nie silniki komend. Stoi tutaj
  // wyłącznie po to, żeby materializacja nie zgłaszała go jako literówki — 5 bloków
  // deklaruje tę sekcję, więc ostrzeżenie padało przy każdym setupie i uczyło
  // ignorowania ostrzeżeń, co jest droższe niż sam nieznany klucz.
  'pattern_routing',
]);
// Zarezerwowane na kolejne kroki planu — deklaracja przechodzi, ale mówimy wprost,
// że nic jeszcze nie robi (lepsze niż milcząca ignorancja).
const RESERVED_KEYS = new Set(['tags']);

// Domyślny rejestr języka dla tekstu kierowanego do człowieka. Nadpisywalny w
// project.yml (`project.human_voice`) — projekt prowadzony po angielsku ustawia
// `language: en`, zespół chcący pełnej techniczności `register: technical`.
//
// Po co to w ogóle istnieje: analiza opisuje problem językiem, którym go znalazła —
// nazwami klas, ścieżkami, numerami ADR. Dla agenta to jest zaleta (namiar bez
// szukania), dla człowieka zatwierdzającego analizę to bariera: żeby odpowiedzieć
// „tak/nie" musiał najpierw poprosić o tłumaczenie. `human_voice` rozdziela te dwa
// odbiory, zamiast kazać jednemu tekstowi obsłużyć oba.
const HUMAN_VOICE_DEFAULT = {
  language: 'pl',
  register: 'business',
  max_sentences: 2,
  // Czego NIE wstawiać do tekstu dla człowieka. Te rzeczy zostają w polach
  // technicznych (`q:`, `rationale:`), gdzie są potrzebne.
  avoid: ['nazwy klas i funkcji', 'ścieżki plików', 'numery ADR/BDR', 'żargon warstw i wzorców'],
};
const BLOCK_KEYS_EXTRA = 'extends';

// Zmienne środowiskowe o wartości listowej (CSV) — scalane sumą, nie nadpisywane.
// Konwencja nazw zamiast zgadywania z treści: `_HOOKS`, `_LIST`, `_PATHS`, `_DISABLED`.
const LIST_ENV = [/_HOOKS$/, /_LIST$/, /_PATHS$/, /_DISABLED$/, /^ECC_DISABLED_/];

// ── globy dla parametrów ścieżkowych ──────────────────────────────────────
// Własna implementacja zamiast zależności: `*` (płasko), `**` (rekurencyjnie),
// wykluczenia `!wzorzec`. Wynik posortowany, żeby runtime.yml był deterministyczny.
function globToRegExp(pattern) {
  // Bez markera-znaku w środku (poprzednia wersja używała bajtu, który robił z tego
  // pliku „binary data" dla grep/diff): segmenty składamy jawnie.
  const esc = (seg) => seg
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  const parts = pattern.split('/');
  let rx = '';
  parts.forEach((seg, i) => {
    const last = i === parts.length - 1;
    if (seg === '**') rx += last ? '.*' : '(?:[^/]+/)*';   // ** na końcu łapie też pliki głębiej
    else rx += esc(seg) + (last ? '' : '/');
  });
  return new RegExp(`^${rx}$`);
}

function walkFiles(root, dir = '', acc = []) {
  const abs = join(root, dir);
  let entries;
  try { entries = readdirSync(abs); } catch { return acc; }   // brak uprawnień / zniknął katalog
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const relPath = dir ? posix.join(dir, entry) : entry;
    let isDir;
    try { isDir = statSync(join(root, relPath)).isDirectory(); } catch { continue; }
    if (isDir) walkFiles(root, relPath, acc);
    else acc.push(relPath);
  }
  return acc;
}

const scanCache = new Map();
function filesUnder(prefix) {
  if (!scanCache.has(prefix)) scanCache.set(prefix, walkFiles(projectDir, prefix).map((f) => f));
  return scanCache.get(prefix);
}
const globBase = (pattern) => {
  const parts = pattern.split('/');
  const stop = parts.findIndex((p) => /[*?]/.test(p));
  return (stop <= 0 ? '' : parts.slice(0, stop).join('/'));
};

function resolvePathList(patterns, { param, block }) {
  const includes = [], excludes = [];
  for (const p of patterns) (String(p).startsWith('!') ? excludes : includes).push(String(p).replace(/^!/, ''));
  const excludeRx = excludes.map(globToRegExp);
  const out = [];
  for (const inc of includes) {
    if (!/[*?]/.test(inc)) {                       // zwykła ścieżka — musi istnieć
      // Kotwica sekcji (`plik.md#5`) jest częścią wartości, ale nie istnieje na dysku —
      // kanon zwykle wskazuje paragraf, nie cały dokument.
      const [filePart] = inc.split('#');
      if (!existsSync(join(projectDir, filePart)))
        fail(`parametr "${param}" bloku "${block}": plik nie istnieje — ${filePart}`);
      if (!excludeRx.some((rx) => rx.test(filePart))) out.push(inc);
      continue;
    }
    const rx = globToRegExp(inc);
    const base = globBase(inc);
    const hits = filesUnder(base)   // walkFiles zwraca ścieżki względem projektu, z prefiksem
      .filter((f) => rx.test(f) && !excludeRx.some((ex) => ex.test(f)));
    // Pusty glob to prawie zawsze literówka albo przeniesiony katalog. Cicha pustka
    // znaczyłaby „kanon jest pusty" — czyli stage bez wsadu i analiza bez kotwicy.
    if (!hits.length)
      fail(`parametr "${param}" bloku "${block}": wzorzec "${inc}" nie trafił w żaden plik projektu`);
    out.push(...hits);
  }
  return [...new Set(out)].sort();
}

// ── podstawianie ${param} w treści bloku ──────────────────────────────────
// Działa na węzłach dokumentu (nie na zrzucie do JS), żeby panel i orchestrate
// mogły później trafić do wyniku razem ze swoimi komentarzami.
function substituteParams(doc, values, blockName) {
  YAML.visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value !== 'string' || !node.value.includes('${')) return;
      const whole = node.value.match(/^\$\{([\w.-]+)\}$/);
      if (whole) {
        if (!(whole[1] in values)) fail(`blok "${blockName}": nieznany parametr \${${whole[1]}}`);
        return doc.createNode(values[whole[1]]);      // lista podstawia się jako lista
      }
      node.value = node.value.replace(/\$\{([\w.-]+)\}/g, (_m, name) => {
        if (!(name in values)) fail(`blok "${blockName}": nieznany parametr \${${name}}`);
        const v = values[name];
        return Array.isArray(v) ? v.join(', ') : String(v ?? '');
      });
    },
  });
}

// ── wejście: project.yml ───────────────────────────────────────────────────
const projectYml = join(projectDir, '.claude/config/project.yml');
if (!existsSync(projectYml)) fail(`brak ${projectYml}`);
let proj;
try { proj = YAML.parse(readFileSync(projectYml, 'utf8')) ?? {}; }
catch (e) { fail(`project.yml nie jest poprawnym YAML-em: ${e.message}`); }

const declared = proj.project?.stack_blocks;
if (!Array.isArray(declared) || !declared.length)
  fail('project.yml nie deklaruje project.stack_blocks (niepusta lista)');
const blockParams = proj.project?.block_params ?? {};

// ── aliasy + rozwinięcie ───────────────────────────────────────────────────
const aliasPath = join(REPO, 'blocks/_aliases.yml');
const aliasSrc = existsSync(aliasPath) ? readFileSync(aliasPath, 'utf8') : '';
const aliases = (aliasSrc ? YAML.parse(aliasSrc)?.aliases : null) ?? {};
const expand = (ns) => ns.flatMap((n) => (aliases[n] ? expand(aliases[n]) : [n]));
const expanded = [...new Set(expand(declared))];

// ── taksonomia: rdzeń (claude-patterns) + rozszerzenie projektu ────────────
// Rdzeń żyje w claude-patterns i projekt go nie widzi — bez scalenia tutaj agent
// pracujący w repo projektu znałby wyłącznie lokalne obszary i uznałby `api:auth`
// za nieznany tag. Wynik trafia do runtime.yml, bo to jedyny plik, który czytają
// silniki: żadnego chodzenia po dwóch źródłach i zgadywania, gdzie leży rdzeń.
const coreTaxPath = join(REPO, 'blocks/_taxonomy.yml');
const coreTax = existsSync(coreTaxPath) ? (YAML.parse(readFileSync(coreTaxPath, 'utf8')) ?? {}) : {};
const projTaxPath = join(projectDir, '.claude/config/taxonomy.yml');
const projTax = existsSync(projTaxPath) ? (YAML.parse(readFileSync(projTaxPath, 'utf8')) ?? {}) : {};

const taxonomy = { stacks: [], areas: [], variants_seen: {} };
const taxSource = new Map();          // wartość → 'rdzeń' | 'projekt'
for (const key of ['stacks', 'areas']) {
  for (const v of coreTax[key] ?? []) { taxonomy[key].push(v); taxSource.set(v, 'rdzeń'); }
  for (const v of projTax[key] ?? []) {
    // Rozszerzenie ma tylko DODAWAĆ. Przedefiniowanie pozycji rdzenia rozjeżdża wspólny
    // język między projektami, a on jest jedynym powodem, dla którego rdzeń istnieje.
    if (taxonomy[key].includes(v)) {
      warn(`.claude/config/taxonomy.yml: "${v}" jest już w rdzeniu — rozszerzenie ma tylko dodawać, pomijam`);
      continue;
    }
    taxonomy[key].push(v); taxSource.set(v, 'projekt');
  }
}
for (const src of [coreTax.variants_seen ?? {}, projTax.variants_seen ?? {}])
  for (const [area, list] of Object.entries(src))
    taxonomy.variants_seen[area] = [...new Set([...(taxonomy.variants_seen[area] ?? []), ...(list ?? [])])];

// ── wczytanie bloków (centralne + lokalne ./) ──────────────────────────────
const blockPath = (name) => (name.startsWith('./')
  ? join(projectDir, '.claude/blocks', `${name.slice(2)}.yml`)
  : join(REPO, 'blocks', `${name}.yml`));

function loadBlock(name) {
  const path = blockPath(name);
  if (!existsSync(path)) fail(`blok "${name}" nie istnieje (${path})`);
  const src = readFileSync(path, 'utf8');
  const doc = YAML.parseDocument(src);
  if (doc.errors?.length) fail(`blok "${name}" nie jest poprawnym YAML-em: ${doc.errors[0].message}`);
  return { name, path, src, doc };
}

// `extends:` — blok lokalny dziedziczy po centralnym i nadpisuje wybrane fragmenty.
// Bez tego projekt chcący zmienić JEDEN stage panelu musiał forkować cały blok i
// utrzymywać kopię, która cicho rozjeżdża się z centralą.
//
// Reguły scalania (baza ← lokalny):
//   patterns/overlay/hooks   — suma, bez duplikatów
//   analyze.panel            — pozycja lokalna o tym samym `stage` ZASTĘPUJE bazową,
//                              nowe stage'e dochodzą na koniec; usunięcie: `drop: true`
//   orchestrate/env/budgets/params — lokalna sekcja wygrywa w całości
// Głębokość ograniczona do JEDNEGO poziomu: łańcuch extends robi z kompozycji labirynt,
// a diagnozowanie „skąd wziął się ten stage" przestaje być możliwe.
function applyExtends(block, depth = 0) {
  const baseName = block.doc.get('extends');
  if (!baseName) return block;
  if (depth > 0) fail(`blok "${block.name}": łańcuch extends (dziedziczenie po bloku, który sam dziedziczy) — dozwolony jeden poziom`);
  if (String(baseName) === block.name) fail(`blok "${block.name}" dziedziczy po samym sobie`);
  const base = loadBlock(String(baseName));
  if (base.doc.get('extends')) fail(`blok "${block.name}" dziedziczy po "${baseName}", który sam używa extends — dozwolony jeden poziom`);

  const merged = base.doc;
  const local = block.doc;

  for (const key of ['name', 'axis', 'requires']) if (local.get(key) !== undefined) merged.set(key, local.get(key, true));

  const localPatterns = local.get('patterns', true);
  if (localPatterns) {
    const basePatterns = merged.get('patterns', true) ?? merged.createNode({});
    for (const sub of ['always', 'triggers']) {
      const add = localPatterns.get(sub, true);
      if (!add) continue;
      const cur = basePatterns.get(sub, true);
      if (!cur) basePatterns.set(sub, add);
      else for (const item of add.items) cur.add(item);
    }
    merged.set('patterns', basePatterns);
  }

  const localAnalyze = local.get('analyze', true);
  if (localAnalyze) {
    const baseAnalyze = merged.get('analyze', true) ?? merged.createNode({});
    const localPanel = localAnalyze.get('panel', true);
    if (localPanel) {
      const basePanel = baseAnalyze.get('panel', true) ?? merged.createNode([]);
      for (const item of localPanel.items) {
        const stage = String(item.get?.('stage') ?? '');
        const idx = basePanel.items.findIndex((i) => String(i.get?.('stage') ?? '') === stage);
        if (item.get?.('drop') === true) { if (idx > -1) basePanel.items.splice(idx, 1); continue; }
        if (idx > -1) basePanel.items[idx] = item; else basePanel.add(item);
      }
      baseAnalyze.set('panel', basePanel);
    }
    if (localAnalyze.get('exit') !== undefined) baseAnalyze.set('exit', localAnalyze.get('exit'));
    merged.set('analyze', baseAnalyze);
  }

  for (const key of ['orchestrate', 'env', 'budgets', 'params', 'requires_ecc', 'ralphinho']) {
    const v = local.get(key, true);
    if (v) merged.set(key, v);
  }

  const localOverlay = local.get('overlay', true);
  if (localOverlay) {
    const baseOverlay = merged.get('overlay', true) ?? merged.createNode({});
    for (const sub of ['agents', 'patterns', 'rules', 'hooks']) {
      const add = localOverlay.get(sub, true);
      if (!add) continue;
      const cur = baseOverlay.get(sub, true);
      if (!cur) baseOverlay.set(sub, add);
      else for (const item of add.items) if (!cur.items.some((i) => i.value === item.value)) cur.add(item);
    }
    merged.set('overlay', baseOverlay);
  }
  merged.delete('extends');
  return { ...block, doc: merged, src: `${base.src}\n# extends ←\n${block.src}`, extendsFrom: base.name };
}

const blocks = expanded.map((name) => applyExtends(loadBlock(name)));

// nieznane / zarezerwowane klucze — zgłaszane, nie połykane
for (const b of blocks)
  for (const item of b.doc.contents?.items ?? []) {
    const key = String(item.key?.value ?? '');
    if (BLOCK_KEYS.has(key)) continue;
    if (RESERVED_KEYS.has(key)) {
      warn(`blok "${b.name}": klucz "${key}" jest zarezerwowany, ale jeszcze nieobsługiwany — pomijam`);
      continue;
    }
    warn(`blok "${b.name}": nieznany klucz najwyższego poziomu "${key}" — pomijam (literówka?)`);
  }

// requires: twardy błąd przy brakującej zależności (ADR D1)
const present = new Set(expanded);
for (const b of blocks)
  for (const r of b.doc.toJS()?.requires ?? [])
    if (!present.has(r)) fail(`blok "${b.name}" wymaga "${r}" — dodaj go do stack_blocks`);

// ── parametry bloków (${...} → wartości z project.yml block_params) ────────
for (const b of blocks) {
  const spec = b.doc.toJS()?.params;
  if (!spec) continue;
  const given = blockParams[b.name] ?? {};
  const values = {};
  for (const [param, def] of Object.entries(spec)) {
    const type = def?.type ?? 'string';
    let value = given[param] ?? def?.default ?? null;
    if (value === null || value === undefined || (Array.isArray(value) && !value.length)) {
      if (def?.required)
        fail(`blok "${b.name}" wymaga parametru "${param}" (${def?.doc ?? type}) — ` +
          `dodaj project.block_params."${b.name}".${param} w project.yml`);
      values[param] = type.endsWith('[]') ? [] : null;
      continue;
    }
    if (type === 'path' || type === 'path[]') {
      const list = resolvePathList(Array.isArray(value) ? value : [value], { param, block: b.name });
      value = type === 'path' ? list[0] : list;
    }
    values[param] = value;
  }
  substituteParams(b.doc, values, b.name);
  b.params = values;
}

// ── merge ──────────────────────────────────────────────────────────────────
// Zrzut do JS robimy PO podstawieniu parametrów — inaczej w danych zostałyby
// surowe `${...}`. Węzły (doc) nadal są źródłem dla panelu i orchestrate, bo
// tylko one niosą komentarze bloku do wyniku.
for (const b of blocks) b.data = b.doc.toJS() ?? {};
const axisOf = (b) => b.data.axis ?? null;

const always = [];           // {path, source}
const triggers = [];         // {keywords, include, source}
const panel = [];            // {node, source}
let analyzeExit = null, analyzeExitSrc = null;
let orch = null;             // {node, source}
const contributions = [];    // {match, patterns?, checks?, source} — wkłady do cudzych warstw
let ralph = null, reqEcc = null;
const hooks = [], env = new Map(), envSrc = new Map();
const overlay = { agents: [], patterns: [], rules: [] };
const budgets = new Map();   // slot → {fields: Map, source}
const paramsOut = new Map(); // blok → rozwinięte wartości (do wglądu w runtime.yml)

for (const b of blocks) {
  if (b.params && Object.keys(b.params).length) paramsOut.set(b.name, b.params);

  const pat = b.data.patterns;
  if (pat) {
    for (const p of pat.always ?? [])
      if (!always.some((a) => a.path === p)) always.push({ path: p, source: b.name });
    for (const g of pat.triggers ?? [])
      triggers.push({ keywords: g.keywords ?? [], include: g.include ?? [], source: b.name });
  }

  const an = b.doc.get('analyze', true);
  if (an) {
    for (const item of an.get('panel', true)?.items ?? []) panel.push({ node: item, source: b.name });
    const ex = an.get('exit');
    if (ex && (ex === 'PAUSE' || !analyzeExit)) { analyzeExit = ex; analyzeExitSrc = b.name; }
  }

  const or = b.doc.get('orchestrate', true);
  if (or?.get('layers', true)) {
    if (orch) fail(`orchestrate.layers definiują dwa bloki: "${orch.source}" i "${b.name}" — dozwolony jeden`);
    // Warstwy należą do osi architektury. Blok frameworka, który je wnosi, blokuje wymianę
    // architektury pod sobą: dołożenie drugiej osi kończy się błędem "dwa bloki", więc projekt
    // zostaje z jednym narzuconym układem katalogów. Dlatego twardy błąd, a nie ostrzeżenie —
    // po cichu przepuszczona pomyłka ujawnia się dopiero przy próbie złożenia innego stacku.
    if (axisOf(b) !== 'architecture')
      fail(`blok "${b.name}" wnosi orchestrate.layers, ale ma axis: ${axisOf(b) ?? '(brak)'} — ` +
        'warstwy może wnieść wyłącznie blok o "axis: architecture"; przenieś sekcję orchestrate ' +
        'do osobnego bloku tej osi (wzór: blocks/library-layers.yml wydzielony z ts-library.yml)');
    orch = { node: or, source: b.name };
  }

  // Wkłady do CUDZYCH warstw. Warstwy wnosi wyłącznie oś architektury, więc blok
  // walidacji czy persystencji nie miał jak dołożyć swojego wzorca ani bramki do
  // warstwy aplikacji — musiał albo przejąć całą oś, albo zrezygnować. Celowanie
  // po tagu rozwiązuje to bez naruszania zasady „jeden blok wnosi warstwy".
  for (const c of b.data.layer_contributions ?? []) {
    if (!c.match) fail(`blok "${b.name}": layer_contributions wymaga "match" (np. "*:app")`);
    contributions.push({ ...c, source: b.name });
  }

  const ra = b.doc.get('ralphinho', true);
  if (ra && !ralph) ralph = { node: ra, source: b.name };
  const re = b.doc.get('requires_ecc', true);
  if (re && !reqEcc) reqEcc = { node: re, source: b.name };

  const ov = b.data.overlay;
  if (ov) {
    for (const key of ['agents', 'patterns', 'rules'])
      for (const v of ov[key] ?? []) if (!overlay[key].includes(v)) overlay[key].push(v);
    for (const h of ov.hooks ?? []) if (!hooks.includes(h)) hooks.push(h);
  }

  const en = b.data.env;
  if (en)
    for (const [k, v] of Object.entries(en)) {
      const prev = env.get(k);
      if (prev === undefined) { env.set(k, v); envSrc.set(k, b.name); continue; }
      if (prev === v) continue;
      // Zmienne listowe SUMUJEMY — inaczej blok wyłączający swoje hooki kasuje
      // wyłączenia innego bloku. Rozpoznajemy je po NAZWIE, nie po obecności przecinka:
      // lista jednoelementowa też jest listą, a wykrywanie „po przecinku" zamieniało
      // ECC_DISABLED_HOOKS: "hook-a" + "hook-b" w błąd konfliktu zamiast w sumę.
      if (LIST_ENV.some((rx) => rx.test(k))) {
        const merged = [...new Set([...String(prev).split(','), ...String(v).split(',')].map((x) => x.trim()).filter(Boolean))];
        env.set(k, merged.join(','));
        envSrc.set(k, `${envSrc.get(k)} + ${b.name}`);
        continue;
      }
      // Skalar w konflikcie to sprzeczna konfiguracja, a nie „ostatni wygrywa":
      // po cichu przepuszczony rozjazd ujawnia się dopiero w działaniu hooków.
      fail(`env ${k}: blok "${envSrc.get(k)}" ustawia "${prev}", a "${b.name}" — "${v}". ` +
        'Sprzeczne wartości skalarne; uzgodnij bloki albo nadpisz jawnie w project.yml.');
    }

  const bu = b.data.budgets;
  if (bu)
    for (const [slot, fields] of Object.entries(bu)) {
      const cur = budgets.get(slot) ?? { fields: new Map(), source: b.name };
      for (const [k, v] of Object.entries(fields ?? {})) {
        const prev = cur.fields.get(k);
        // OQ3: przy konflikcie liczb wygrywa niższa wartość
        cur.fields.set(k, typeof v === 'number' && typeof prev === 'number' ? Math.min(v, prev) : (prev ?? v));
      }
      budgets.set(slot, cur);
    }
}

// Hooki projektu dokładane jawnie: bloki wnoszą to, czego wymaga stack, a projekt
// dopisuje własne w project.yml (`extra_hooks`). Bez tego kanału lokalne hooki żyły
// wyłącznie w settings.json i runtime.yml pokazywał niepełny obraz — w api-2 deklarował
// 4 hooki, a realnie działało 8.
for (const h of proj.project?.extra_hooks ?? []) if (!hooks.includes(h)) hooks.push(h);

// project.yml może nadpisać budżety bez ograniczeń (OQ3)
for (const [slot, fields] of Object.entries(proj.budgets ?? {})) {
  const cur = { fields: new Map(), source: 'project.yml' };
  for (const [k, v] of Object.entries(fields ?? {})) cur.fields.set(k, v);
  budgets.set(slot, cur);
}

// ── sloty panelu: model/effort muszą być rozpoznawalne ────────────────────
// Sloty lecą do runtime.yml jako węzły (żeby zachować komentarze bloku), więc bez
// tej kontroli literówka `modell: opus` przeszłaby cicho i silnik zignorowałby model.
const MODELS = new Set(['opus', 'sonnet', 'haiku', 'fable', 'inherit']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
for (const b of blocks) {
  for (const slot of b.data.analyze?.panel ?? []) {
    if (slot.model && !MODELS.has(String(slot.model)))
      fail(`blok "${b.name}", stage "${slot.stage}": nieznany model "${slot.model}" (dozwolone: ${[...MODELS].join(', ')})`);
    if (slot.effort && !EFFORTS.has(String(slot.effort)))
      fail(`blok "${b.name}", stage "${slot.stage}": nieznany effort "${slot.effort}" (dozwolone: ${[...EFFORTS].join(', ')})`);
  }
  for (const layer of b.data.orchestrate?.layers ?? [])
    if (layer.model && !MODELS.has(String(layer.model)))
      fail(`blok "${b.name}", warstwa "${layer.id}": nieznany model "${layer.model}"`);
}

// ── walidacje (OQ4 + ścieżki) ──────────────────────────────────────────────
if (always.length > 8)
  warn(`suma patterns.always = ${always.length} (>8) — zdegraduj coś na triggers/MCP:\n` +
    always.map((a) => `    ${a.path}  (${a.source})`).join('\n'));

// Wisząca ścieżka to twardy błąd, nie ostrzeżenie. Powód z praktyki (2026-08-11):
// literówka `convsentions-pattern.md` w bloku nestjs przeszła jako UWAGA, wylądowała
// w runtime.yml juz-ide-api-2 i /analyze traktował ją jako pozycję listy obowiązkowej —
// wzorzec „wczytywany" w każdym tasku, którego nikt nigdy nie przeczytał.
const patternSources = new Map();
for (const a of always) patternSources.set(a.path, a.source);
for (const t of triggers) for (const p of t.include) if (!patternSources.has(p)) patternSources.set(p, t.source);
const dangling = [...patternSources].filter(([p]) =>
  !existsSync(join(REPO, 'patterns', p)) && !existsSync(join(projectDir, p)));
// Wzorzec deklarujący `**Assumes**: <blok>` wymaga pojęć, których bez tego bloku
// w projekcie nie ma (command-handler-pattern mówi o agregatach 23 razy). Bez tej
// kontroli skład `[flat-service, ddd/cqrs]` dałby implementerowi instrukcję o modelu
// domenowym, którego projekt nie posiada — dokładnie to niedopasowanie, przed którym
// ADR 0008 miał chronić.
for (const [p, src] of patternSources) {
  const abs = existsSync(join(REPO, 'patterns', p)) ? join(REPO, 'patterns', p) : join(projectDir, p);
  if (!existsSync(abs)) continue;
  const m = readFileSync(abs, 'utf8').match(/^\*\*Assumes\*\*:\s*(.+)$/m);
  if (!m) continue;
  for (const dep of m[1].replace(/<!--[\s\S]*?-->/g, '').split(',').map((x) => x.trim().replace(/[`*]/g, '')))
    if (dep && !present.has(dep))
      fail(`wzorzec ${p} (wniesiony przez blok "${src}") zakłada blok "${dep}", którego nie ma w składzie.\n` +
        `  Dodaj "${dep}" do stack_blocks albo usuń wzorzec z bloku "${src}".`);
}

if (dangling.length)
  fail(`wiszące ścieżki wzorców (plik nie istnieje ani w ${join(REPO, 'patterns')}, ani w projekcie):\n` +
    dangling.map(([p, src]) => `    ${p}  ← blok "${src}"`).join('\n') +
    '\n  Popraw ścieżkę w bloku albo dodaj brakujący wzorzec.');

// ── emisja runtime.yml ─────────────────────────────────────────────────────
// Budowana przez Document API, nie sklejaniem stringów: komentarz `# source:` przy
// każdej pozycji jest jedynym śladem, z którego bloku coś przyszło, a węzły panelu
// i orchestrate przenoszone są z bloków razem z ich własnymi komentarzami.
// Do hasha wchodzi TEŻ treść tego skryptu. Powód, incydent 2026-08-16: `human_voice`
// jest defaultką zapisaną w kodzie (HUMAN_VOICE_DEFAULT), nie w żadnym bloku — więc
// commit d424fc5 zmienił kształt wyjścia, a hash liczony wyłącznie z bloków został ten
// sam. `--check` meldował „aktualny" trzem projektom, którym brakowało całej sekcji
// `human_voice:` (9920 B zamiast 10153 B), a audit-projects.mjs wpisał je do „bez
// zastrzeżeń". Strażnik, który przegapia zmianę generatora, pilnuje połowy wejścia.
//
// Hashujemy plik w całości, razem z komentarzami: edycja samego komentarza wywoła
// niepotrzebną rematerializację, ale wycinanie komentarzy z JS-a regexem jest zawodne
// (`//` żyje w stringach i regexach), a fałszywy alarm kosztuje jedno uruchomienie
// skryptu — fałszywy spokój kosztował trzy repozytoria bez sekcji.
const generatorSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const hash = createHash('sha256')
  .update(blocks.map((b) => b.src).join('\n') + aliasSrc + JSON.stringify([...paramsOut]) + JSON.stringify(taxonomy))
  .update(generatorSrc)
  .digest('hex').slice(0, 12);

const doc = new YAML.Document({});
doc.commentBefore =
  ' GENERATED przez materialize-runtime.mjs (ADR 0008) — NIE edytuj ręcznie.\n' +
  ' Zmiany rób w blokach (claude-patterns/blocks/ lub .claude/blocks/) i odpal setup-project.sh.';

const flowSeq = (arr) => { const n = doc.createNode(arr); n.flow = true; return n; };
const quoted = (v) => { const n = doc.createNode(String(v)); n.type = 'QUOTE_DOUBLE'; return n; };

// Komentarz `# source:` idzie na KLUCZ sekcji, nie na jej wartość — inaczej ląduje
// wewnątrz mapy i wypycha komentarze, które blok napisał o sobie sam.
// `spaceBefore` odtwarza puste linie między sekcjami: runtime.yml czyta agent, więc
// czytelność wyniku jest funkcjonalna, nie kosmetyczna.
const tagSection = (key, comment) => {
  const pair = doc.contents.items.find((i) => String(i.key?.value ?? i.key) === key);
  if (!pair) return;
  if (typeof pair.key === 'string') pair.key = doc.createNode(key);   // klucze z .set() są zwykłymi stringami
  if (comment) pair.key.comment = comment;
  pair.key.spaceBefore = true;
};

doc.set('schema_version', 1);
doc.set('materialized_at', quoted(new Date().toISOString()));
doc.set('source_hash', quoted(hash));
doc.set('stack_blocks', flowSeq(expanded));

const patternsMap = doc.createNode({});
const alwaysSeq = doc.createNode([]);
for (const a of always) {
  const n = doc.createNode(a.path);
  n.comment = ` source: ${a.source}`;
  alwaysSeq.add(n);
}
patternsMap.set('always', alwaysSeq);
const triggersSeq = doc.createNode([]);
for (const t of triggers) {
  const item = doc.createNode({ keywords: t.keywords, include: t.include });
  item.get('keywords', true).flow = true;
  item.commentBefore = ` source: ${t.source}`;
  triggersSeq.add(item);
}
patternsMap.set('triggers', triggersSeq);
doc.set('patterns', patternsMap);

const analyzeMap = doc.createNode({});
const panelSeq = doc.createNode([]);
for (const p of panel) {
  p.node.commentBefore = ` source: ${p.source}`;
  panelSeq.add(p.node);
}
analyzeMap.set('panel', panelSeq);
if (analyzeExit) {
  const exitNode = doc.createNode(analyzeExit);
  exitNode.comment = ` source: ${analyzeExitSrc}`;
  analyzeMap.set('exit', exitNode);
}
doc.set('analyze', analyzeMap);

// ── wkłady do warstw (layer_contributions) ────────────────────────────────
// `match` celuje w `tags` warstwy: "*:app" trafia w każdą warstwę otagowaną
// dowolnym stackiem i obszarem `app`. Wildcard tylko na całym segmencie — "ap*"
// nie jest wspierane celowo, bo dopasowanie po fragmencie to dokładnie ten błąd,
// który regexy `when:` popełniały na `auth` w `author`.
const matchesTag = (match, tag) => {
  const m = match.split(':'), t = tag.split(':');
  if (m.length > t.length) return false;              // "a:b:c" nie trafi w "a:b"
  return m.every((seg, i) => seg === '*' || seg === t[i]);
};

// Tag i `match` walidujemy wobec taksonomii — literówka w "api:aplication" po cichu
// przestałaby cokolwiek trafiać, a blok nadal twierdziłby, że wnosi wzorzec.
const checkTagLike = (value, where, allowStar) => {
  const parts = String(value).split(':');
  if (parts.length < 2 || parts.length > 3)
    fail(`${where}: "${value}" — format to <stack>:<obszar>[:<wariant>]`);
  const [stack, area] = parts;
  const okStack = (allowStar && stack === '*') || taxonomy.stacks.includes(stack);
  const okArea = (allowStar && area === '*') || taxonomy.areas.includes(area);
  if (!okStack) fail(`${where}: "${value}" — nieznany stack "${stack}" (dozwolone: ${taxonomy.stacks.join(', ')}${allowStar ? ', *' : ''})`);
  if (!okArea) fail(`${where}: "${value}" — nieznany obszar "${area}"; dopisz go do blocks/_taxonomy.yml, jeśli naprawdę brakuje`);
};

for (const c of contributions)
  checkTagLike(c.match, `blok "${c.source}": layer_contributions.match`, true);
for (const layerNode of (orch?.node.get('layers', true)?.items ?? []))
  for (const t of (layerNode.get('tags')?.toJSON?.() ?? []))
    checkTagLike(t, `blok "${orch.source}": warstwa "${layerNode.get('id')}" tags`, false);

if (orch && contributions.length) {
  const layersNode = orch.node.get('layers', true);
  const applied = new Set();
  for (const layerNode of layersNode?.items ?? []) {
    const tags = (layerNode.get('tags', false) ?? []).map?.(String)
      ?? (layerNode.get('tags')?.toJSON?.() ?? []);
    const id = String(layerNode.get('id') ?? '?');
    if (!tags.length) continue;                        // warstwa bez tagów jest nieosiągalna — patrz UWAGA niżej

    for (const [i, c] of contributions.entries()) {
      if (!tags.some((t) => matchesTag(String(c.match), String(t)))) continue;
      applied.add(i);
      for (const [field, values] of [['patterns', c.patterns], ['checks', c.checks]]) {
        if (!values?.length) continue;
        const prev = layerNode.get(field, true);
        const cur = prev?.toJSON?.() ?? [];
        const merged = [...new Set([...cur, ...values])];
        const node = flowSeq(merged);
        // Ślad AKUMULUJE źródła. Nadpisywanie komentarza gubiłoby wcześniejsze wkłady:
        // warstwa z dwoma wzorcami z dwóch bloków pokazywała tylko ten ostatni.
        const seen = (prev?.comment ?? '').trim().replace(/^\+/, '').split(/\s*\+/).filter(Boolean);
        node.comment = ` +${[...new Set([...seen, c.source])].join(' +')}`;
        layerNode.set(field, node);
      }
    }
  }
  // Ostrzegamy per BLOK, nie per `match`. Blok nie wie, z jaką osią architektury
  // zostanie złożony, więc deklarowanie kilku wariantów (`*:app` i `*:api-surface`)
  // jest poprawne — trafi ten, który pasuje do wybranej osi. Ostrzeżenie przy każdym
  // nietrafionym wariancie byłoby szumem na każdej materializacji, a szum uczy
  // ignorowania ostrzeżeń. Milczy dopiero blok, z którego NIC nie weszło.
  const bySource = new Map();
  contributions.forEach((c, i) => {
    const e = bySource.get(c.source) ?? { hit: false, matches: [] };
    e.hit ||= applied.has(i);
    e.matches.push(c.match);
    bySource.set(c.source, e);
  });
  for (const [source, e] of bySource) {
    if (e.hit) continue;
    warn(`blok "${source}": żaden layer_contributions nie trafił w warstwę ` +
      `(match: ${e.matches.join(', ')}; warstwy osi "${orch.source}": ${
        (layersNode?.items ?? []).map((l) => `${l.get('id')}=[${(l.get('tags')?.toJSON?.() ?? []).join(',')}]`).join(' ') || 'BRAK TAGÓW'
      })`);
  }
} else if (contributions.length && !orch) {
  for (const c of contributions)
    warn(`blok "${c.source}": layer_contributions "${c.match}" — kompozycja nie ma osi architektury, nie ma czego wzbogacić`);
}

if (orch) doc.set('orchestrate', orch.node);
if (hooks.length) doc.set('hooks', flowSeq(hooks));
if (env.size) {
  const envMap = doc.createNode({});
  for (const [k, v] of env) {
    const node = quoted(v);
    node.comment = ` source: ${envSrc.get(k)}`;
    envMap.set(k, node);
  }
  doc.set('env', envMap);
}
if (Object.values(overlay).some((v) => v.length)) {
  const ovMap = doc.createNode({});
  for (const key of ['agents', 'patterns', 'rules'])
    if (overlay[key].length) ovMap.set(key, flowSeq(overlay[key]));
  doc.set('overlay', ovMap);
}
// Kolekcja RAG mieszkała dotąd w osobnym .claude/config/knowledge.json — drugim pliku
// konfiguracyjnym obok runtime.yml, o którym trzeba było pamiętać. Źródłem jest teraz
// project.yml (`knowledge_collection`), a runtime.yml niesie wynik jak resztę planu.
const knowledgeCollection = proj.project?.knowledge_collection ?? null;
if (knowledgeCollection) {
  const kMap = doc.createNode({ collection: knowledgeCollection });
  doc.set('knowledge', kMap);
}
// Rejestr języka dla tekstu, który czyta CZŁOWIEK (otwarte pytania, synteza, raport
// końcowy, uzasadnienia decyzji). NIE jest kluczem bloku: stack nie ma zdania o tym,
// jakim językiem mówi się do użytkownika — to cecha odbiorcy, nie frameworka. Dlatego
// default siedzi tutaj, a project.yml (`project.human_voice`) go nadpisuje.
const humanVoice = { ...HUMAN_VOICE_DEFAULT, ...(proj.project?.human_voice ?? {}) };
{
  const hvMap = doc.createNode({});
  for (const [k, v] of Object.entries(humanVoice)) {
    hvMap.set(k, Array.isArray(v) ? flowSeq(v) : v);
  }
  doc.set('human_voice', hvMap);
}
if (taxonomy.stacks.length || taxonomy.areas.length) {
  const tMap = doc.createNode({});
  for (const key of ['stacks', 'areas']) {
    const seq = doc.createNode([]);
    for (const v of taxonomy[key]) {
      const n = doc.createNode(v);
      if (taxSource.get(v) === 'projekt') n.comment = ' projekt';
      seq.add(n);
    }
    tMap.set(key, seq);
  }
  if (Object.keys(taxonomy.variants_seen).length) {
    const vMap = doc.createNode({});
    for (const [area, list] of Object.entries(taxonomy.variants_seen)) vMap.set(area, flowSeq(list));
    tMap.set('variants_seen', vMap);
  }
  doc.set('taxonomy', tMap);
}
if (paramsOut.size) {
  // Rozwinięte parametry (globy → konkretne pliki) wchodzą do wyniku, żeby było widać,
  // co realnie dostanie stage — a nie tylko wzorzec, z którego to policzono.
  const pMap = doc.createNode({});
  for (const [block, values] of paramsOut) pMap.set(block, doc.createNode(values));
  doc.set('params', pMap);
}
if (reqEcc) doc.set('requires_ecc', reqEcc.node);
if (ralph) doc.set('ralphinho', ralph.node);
if (budgets.size) {
  const bMap = doc.createNode({});
  for (const [slot, s] of budgets) {
    const node = doc.createNode(Object.fromEntries(s.fields));
    node.flow = true;
    bMap.set(slot, node);
    bMap.get(slot, true).comment = ` source: ${s.source}`;
  }
  doc.set('budgets', bMap);
}

for (const [key, src] of [
  ['patterns', null], ['analyze', null],
  ['orchestrate', orch ? ` source: ${orch.source}` : null],
  ['hooks', null], ['env', null], ['overlay', null], ['params', null],
  ['knowledge', ' project.yml → knowledge_collection'],
  ['human_voice', ' język tekstu dla człowieka; nadpisz w project.yml → human_voice'],
  ['taxonomy', ' rdzeń blocks/_taxonomy.yml + .claude/taxonomy.yml projektu'],
  ['requires_ecc', reqEcc ? ` source: ${reqEcc.source}` : null],
  ['ralphinho', ralph ? ` source: ${ralph.source}` : null],
  ['budgets', null],
]) tagSection(key, src);

// Osie tuż pod stack_blocks — czytelniej tam niż w nagłówku pliku.
const axesLine = `# osie: ${blocks.map((b) => `${b.name}=${axisOf(b) ?? '?'}`).join(', ')}\n`;
const text = doc.toString({ lineWidth: 0, flowCollectionPadding: false })
  .replace(/^(stack_blocks:.*\n)/m, `$1${axesLine}`);

const dst = join(projectDir, '.claude/config/runtime.yml');

if (CHECK) {
  const cur = existsSync(dst)
    ? readFileSync(dst, 'utf8').match(/^source_hash:\s*"?([a-f0-9]+)"?/m)?.[1]
    : null;
  if (cur === hash) {
    console.log(`  runtime.yml aktualny (hash ${hash}, ${expanded.length} bloków)`);
    process.exit(0);
  }
  console.error(cur
    ? `  ROZJAZD: runtime.yml ma hash ${cur}, bloki dają ${hash}\n` +
      `  → node scripts/materialize-runtime.mjs ${projectDir}`
    : `  BRAK runtime.yml (albo bez source_hash) — bloki dają ${hash}\n` +
      `  → node scripts/materialize-runtime.mjs ${projectDir}`);
  process.exit(1);
}

mkdirSync(dirname(dst), { recursive: true });
writeFileSync(dst, text);
console.log(`  runtime.yml: ${expanded.length} bloków [${expanded.join(', ')}], hash ${hash}` +
  (paramsOut.size ? `, params: ${[...paramsOut.keys()].join(', ')}` : ''));

// ── warstwa lokalna routingu wzorców ───────────────────────────────────────
// hooks/lib/pattern-routing.generated.js powstaje WYŁĄCZNIE z blocks/**.yml centrali
// (scripts/generate-pattern-routing.mjs czyta tylko REPO/blocks) i jest współdzielony
// przez każde repo symlinkujące hooks/. Blok lokalny nie miał więc jak wnieść ani
// jednej reguły: dla `./geo`, obecnego w czterech juz-ide-api,
// `grep -c geo pattern-routing.generated.js` dawał 0.
//
// Co przez to nie działało: trigger słów kluczowych z runtime.yml owszem, bo czytają
// go /analyze i /orchestrate — ale bramki hookowe (check-patterns-read,
// check-delegation, check-subagent-pattern-reads) były na te pliki ślepe. Bramka
// stała tam, gdzie agent współpracuje, i znikała tam, gdzie mógłby ją obejść.
//
// Reguł lokalnych nie wolno dopisać do pliku centralnego — pojechałyby do wszystkich
// projektów. Projekt dostaje własną warstwę obok runtime.yml, a lib/pattern-routing.js
// dokłada ją PRZED regułami centralnymi: blok lokalny opisuje ten jeden stack, więc
// jest bardziej specyficzny z definicji.
const localRouting = { paths: [], filenames: [] };
const routingErrors = [];

for (const b of blocks) {
  if (!b.name.startsWith('./')) continue; // centralne obsługuje generate-pattern-routing.mjs
  const routing = b.doc.toJS?.()?.pattern_routing;
  if (!routing) continue;

  for (const kind of ['paths', 'filenames']) {
    for (const rule of routing[kind] ?? []) {
      if (!rule.match || !rule.pattern) {
        routingErrors.push(`blok "${b.name}": pattern_routing.${kind} — wpis bez "match" albo "pattern"`);
        continue;
      }
      // Wisząca ścieżka to reguła, która zablokuje edycję i każe przeczytać plik,
      // którego nie ma — gorsze niż brak reguły (ta sama kontrola co w generatorze).
      if (!existsSync(join(REPO, 'patterns', rule.pattern)) &&
          !existsSync(join(projectDir, '.claude/knowledge/patterns', rule.pattern)))
        routingErrors.push(`blok "${b.name}": pattern_routing wskazuje "${rule.pattern}" — nie ma takiego wzorca`);
      if (kind === 'filenames') {
        try { new RegExp(rule.match); }
        catch (e) { routingErrors.push(`blok "${b.name}": "${rule.match}" nie jest poprawnym regexem — ${e.message}`); }
      }
      localRouting[kind].push({ match: rule.match, pattern: rule.pattern, source: b.name });
    }
  }
}

if (routingErrors.length) fail('pattern_routing w bloku lokalnym:\n  ' + routingErrors.join('\n  '));

// „first match wins" — dłuższe dopasowanie jest bardziej specyficzne, przy równej
// długości alfabetycznie, żeby wynik był identyczny przy każdym uruchomieniu.
const bySpec = (a, b) => b.match.length - a.match.length || a.match.localeCompare(b.match);
localRouting.paths.sort(bySpec);
localRouting.filenames.sort(bySpec);

const routingDst = join(projectDir, '.claude/config/pattern-routing.local.json');
const routingCount = localRouting.paths.length + localRouting.filenames.length;
if (routingCount) {
  writeFileSync(routingDst, JSON.stringify({
    _generated_by: 'scripts/materialize-runtime.mjs — NIE edytuj ręcznie',
    _source: 'sekcje pattern_routing: w .claude/blocks/*.yml tego projektu',
    ...localRouting,
  }, null, 2) + '\n');
  console.log(`  pattern-routing.local.json: ${routingCount} reguł z bloków lokalnych`);
} else if (existsSync(routingDst)) {
  // Blok przestał wnosić routing — zostawienie starego pliku dałoby bramkę bez źródła,
  // czyli dokładnie ten dryf rejestru, którego pilnujemy gdzie indziej.
  rmSync(routingDst);
  console.log('  pattern-routing.local.json: usunięty (bloki lokalne nie wnoszą już routingu)');
}
