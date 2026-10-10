#!/usr/bin/env node
// Audyt wszystkich projektów podłączonych do claude-patterns:
//   node scripts/audit-projects.mjs [--root /opt/projects]
//
// Po co: zmiany w centrali propagują się przez symlinki NATYCHMIAST, ale wszystko,
// co jest kopią (szablony) albo materializacją (runtime.yml), zostaje w tyle po cichu.
// Audyt z 2026-08-12 zastał: 18 martwych dowiązań w 18 repozytoriach, 10 nieaktualnych
// runtime.yml (w tym dwie instancje BEZ bloków decision-registry/governance, czyli bez
// blokującego stage'a `decision-gate` w panelu /analyze) i brak szablonu artefaktu
// analizy w 9 z 10 projektów. Żadnej z tych rzeczy nie zgłaszało nic — stąd ten skrypt.
//
// Read-only. Niczego nie naprawia; wypisuje komendę naprawczą przy każdym znalezisku.
// Exit 1, gdy cokolwiek wymaga uwagi — nadaje się do CI albo do /loop.
//
// K63 (TASK-KAIZEN-002, 2026-09-07): trzy wagi znalezisk zamiast jednej.
//   BŁĄD  — coś jest zepsute i da się to naprawić wypisaną komendą;
//   OSTRZEŻENIE — coś wymaga decyzji człowieka, ale żadna komenda tego nie zamknie;
//   INFO  — dotyczy projektu uśpionego albo jest czystą obserwacją.
// Powód: audyt wpięty w `pre-commit-guards.mjs` (przy zmianie `blocks/**`) musi umieć być
// zielony. Bramka, która świeci na czerwono na stałe — bo pojedyncze repo ma fork bloku
// przez `extends`, czego NIE DA SIĘ „naprawić" — zostaje po tygodniu obchodzona przez
// `--no-verify` i przestaje chronić cokolwiek. Stąd `--gate`: exit ≠ 0 tylko przy BŁĘDZIE.
//
//   node scripts/audit-projects.mjs                # pełny raport, exit 1 przy BŁĘDZIE lub OSTRZEŻENIU
//   node scripts/audit-projects.mjs --gate         # tryb bramki: exit 1 wyłącznie przy BŁĘDZIE
//   node scripts/audit-projects.mjs --all          # bez heurystyki „dormant" — wszystkie repo równo
//   node scripts/audit-projects.mjs --root <dir>   # inny katalog floty

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { deadLinkIssues, gitHygieneIssues, envDenyIssues, claudeMdIssues, outsideBlockSystem } from './lib/audit-checks.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg > -1 ? process.argv[rootArg + 1] : '/opt/projects';
const GATE = process.argv.includes('--gate');
const ALL = process.argv.includes('--all');

const ERROR = 'error', WARN = 'warn', INFO = 'info';

// Heurystyka „dormant" (K63c). Repo bez historii sesji nie jest zaniedbane — ono po prostu
// nie jest używane, a jego znaleziska w jednym worku z api-1..4 zamieniają raport w listę,
// której nikt nie czyta (audyt 2026-09-07: `pcu` z 5 agentami poza kompozycją i
// `my-intelligence` z 11 hookami `.sh` sprzed migracji flagowane tą samą wagą co repo
// z ~90 sesjami). Miara: liczba transkryptów w ~/.claude/projects/<slug>, bo to jedyny
// zapis „ktoś tu faktycznie pracował" — mtime plików kłamie po każdym `setup-project.sh`.
const DORMANT_MAX_SESSIONS = 6;
const sessionCount = (projectPath) => {
  const slug = projectPath.replace(/\//g, '-');
  const dir = join(homedir(), '.claude/projects', slug);
  if (!existsSync(dir)) return 0;
  try { return readdirSync(dir).filter((f) => f.endsWith('.jsonl')).length; }
  catch { return 0; }
};

// Rozjazd MAJOR w wersji kontraktu znaczy „format się zmienił, a to repo go nie dostało";
// MINOR/PATCH to zwykły postęp centrali i nie jest niczyim problemem.
const majorOf = (v) => String(v ?? '').split('.')[0];

let HEAD_SHA = null;
try {
  HEAD_SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* centrala poza gitem — porównanie SHA po prostu odpada */ }

let CONTRACT_VERSION = 'unknown';
try {
  CONTRACT_VERSION = String(YAML.parse(readFileSync(join(REPO, 'METADATA.yml'), 'utf8'))?.version ?? 'unknown');
} catch { /* jw. */ }

// Katalogi `_*` są ignorowane w całości (decyzja użytkownika, 2026-10-10): to prototypy,
// spike'i i kopie robocze (`_spike`, `_ecc`, `_test-projekt`), które nie mają być audytowane.
const projects = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_')
    && existsSync(join(ROOT, e.name, '.claude/config/project.yml')))
  .map((e) => e.name)
  .filter((n) => n !== 'claude-patterns')
  .sort();

// Staleness runtime.yml rozbity na dwie klasy (2026-10-10). `source_hash` obejmuje źródło
// generatora, więc każda edycja materialize-runtime.mjs dawała 21/21 „nieaktualny" i
// zagłuszała prawdziwe sygnały. `--check` zwraca tę samą decyzję co dawniej, a dodatkowo
// drukuje `inputs_hash:` (bez generatora) — porównujemy go z polem w runtime.yml projektu.
const stalenessIssue = (P) => {
  const res = spawnSync('node', [join(REPO, 'scripts/materialize-runtime.mjs'), P, '--check'],
    { encoding: 'utf8' });
  if (res.status === 0) return null;
  const fix = `node scripts/materialize-runtime.mjs ${P}`;
  const current = (res.stdout + res.stderr).match(/^\s*inputs_hash:\s*([a-f0-9]+)/m)?.[1];
  const stored = readFileSync(join(P, '.claude/config/runtime.yml'), 'utf8')
    .match(/^inputs_hash:\s*"?([a-f0-9]+)"?/m)?.[1];
  if (!current || !stored)
    return [`runtime.yml nieaktualny (${stored ? 'materializacja nie zwróciła inputs_hash' : 'brak inputs_hash — rozróżnienie po następnym setupie'})`, fix];
  if (current === stored)
    return ['generator zmieniony — rematerializacja zalecana (bloki, project.yml, aliasy i taksonomia bez zmian)', fix, INFO];
  return ['runtime.yml nieaktualny: zmieniły się wejścia kompozycji (bloki / project.yml / aliasy / taksonomia)', fix];
};

const rows = [];
for (const name of projects) {
  const P = join(ROOT, name);
  const pyml = readFileSync(join(P, '.claude/config/project.yml'), 'utf8');
  const composed = /^\s*stack_blocks:/m.test(pyml);
  const issues = [];

  // 1. runtime.yml — istnienie i świeżość względem bloków (source_hash, nie mtime:
  //    mtime dowolnego bloku fałszywie oznaczyłby wszystkie projekty jako nieaktualne).
  let blocks = null;
  if (composed) {
    const rt = join(P, '.claude/config/runtime.yml');
    if (!existsSync(rt)) {
      issues.push(['BRAK runtime.yml', `node scripts/materialize-runtime.mjs ${P}`]);
    } else {
      blocks = (readFileSync(rt, 'utf8').match(/^stack_blocks:\s*\[(.*)\]/m)?.[1] ?? '')
        .split(',').filter(Boolean).length;
      const stale = stalenessIssue(P);
      if (stale) issues.push(stale);
    }
  }

  // 2. Martwe dowiązania — cel zniknął z centrali, nikt tego nie posprzątał.
  issues.push(...deadLinkIssues(P));

  // 2b. Higiena gita i konfiguracja bezpieczeństwa (2026-10-10) — patrz lib/audit-checks.mjs.
  issues.push(...gitHygieneIssues(P), ...envDenyIssues(P), ...claudeMdIssues(P));

  // 3. Szablony — KOPIE, więc nie propagują się same. Wymagane warunkowo: artefakt
  //    analizy tam, gdzie w ogóle działa /analyze; TM tam, gdzie jest docs/security/.
  const tpl = (dst, src, need) => {
    if (!need) return;
    const d = join(P, dst);
    if (!existsSync(d)) { issues.push([`brak ${dst}`, `cp ${src} ${d}`]); return; }
    const have = readFileSync(d, 'utf8');
    if (!have.includes('LOCAL-CUSTOMIZED') && have !== readFileSync(join(REPO, src), 'utf8'))
      issues.push([`${dst} odbiega od centrali`, `cp ${src} ${d}`]);
  };
  tpl('project-orchestration/analysis/TEMPLATE.md', 'templates/task-analysis-template.md', composed);
  tpl('docs/security/THREAT_MODEL_TEMPLATE.md', 'templates/THREAT_MODEL_TEMPLATE.md',
    existsSync(join(P, 'docs/security')));

  // 4. Blok lokalny z `extends:` NADPISUJE sekcje w całości (nie merguje) — jeśli
  //    nadpisuje sekcję, którą blok bazowy TEŻ ma (np. `orchestrate`), przyszłe zmiany
  //    bazy nigdy nie dotrą do forka bez ręcznej synchronizacji, i nic tego nie
  //    sygnalizuje (K44, TASK-KAIZEN-001 — odkryte na iam-verifiers.yml kopiującym całą
  //    sekcję `orchestrate` z blocks/flat-service.yml). UPROSZCZONE: ostrzega zawsze,
  //    gdy nakładanie się sekcji istnieje — nie śledzi hashów bazowego bloku w czasie
  //    (wymagałoby stanu zapisywanego przy każdej ręcznej synchronizacji; poza zakresem
  //    tej poprawki). Człowiek i tak musi zdecydować, czy fork nadal pasuje do bazy.
  const localBlocksDir = join(P, '.claude/blocks');
  if (existsSync(localBlocksDir)) {
    for (const f of readdirSync(localBlocksDir).filter((f) => f.endsWith('.yml'))) {
      let doc;
      try { doc = YAML.parse(readFileSync(join(localBlocksDir, f), 'utf8')); } catch { continue; }
      const baseName = doc?.extends;
      if (!baseName) continue;
      const basePath = join(REPO, 'blocks', `${baseName}.yml`);
      if (!existsSync(basePath)) continue;
      let baseDoc;
      try { baseDoc = YAML.parse(readFileSync(basePath, 'utf8')); } catch { continue; }
      // Tylko sekcje, które applyExtends (materialize-runtime.mjs) NADPISUJE w całości.
      // `patterns`/`overlay`/`hooks` są sumowane, a `analyze.panel` scalany per stage —
      // do 2026-10-10 ostrzeżenie obejmowało i je, więc każdy blok lokalny dokładający
      // jeden trigger albo stage dostawał fałszywe „przyszłe zmiany bazy nie dotrą".
      const REPLACED = new Set(['orchestrate', 'env', 'budgets', 'params', 'requires_ecc', 'ralphinho']);
      const overlap = Object.keys(doc).filter((k) => REPLACED.has(k) && baseDoc && k in baseDoc);
      if (overlap.length) {
        issues.push([
          `.claude/blocks/${f} ma extends: ${baseName} i nadpisuje sekcj${overlap.length > 1 ? 'e' : 'ę'} ` +
          `[${overlap.join(', ')}] obecn${overlap.length > 1 ? 'e' : 'ą'} też w blocks/${baseName}.yml — ` +
          `przyszłe zmiany bazy NIE trafiają tu automatycznie (extends nadpisuje sekcję w całości, nie merguje)`,
          `porównaj ręcznie: diff blocks/${baseName}.yml .claude/blocks/${f}`,
          // OSTRZEŻENIE, nie BŁĄD (K63a, 2026-09-07). Znalezisko jest z konstrukcji
          // niedomykalne: check nie śledzi hashy bloku bazowego, więc świeżo zsynchronizowany
          // fork wygląda identycznie jak zapomniany i żadna komenda go nie wycisza. Jako BŁĄD
          // trzymałby bramkę pre-commit na czerwono w nieskończoność. Odrzucony wariant —
          // plik `.claude/config/audit-accept.yml` z listą akceptacji w satelicie — dokłada
          // drugi plik konfiguracyjny do utrzymania i przerzuca dyscyplinę na człowieka
          // dokładnie tam, gdzie już raz zawiodła. Właściwa naprawa to K95 (semantyka
          // override/subtract w kompozycji); po niej ta kategoria wraca do BŁĘDU.
          WARN,
        ]);
      }
    }
  }

  // 5. verify-project-setup.mjs cyklicznie, nie tylko ręcznie po fakcie (K47,
  //    TASK-KAIZEN-001) — łapie dokładnie klasę błędów z K02/K03/K06/K46: świeży setup,
  //    który wygląda kompletnie, dopóki ktoś nie odpali /analyze i nie trafi na
  //    nieosiągalny wzorzec albo brakujący agent.
  if (composed) {
    try {
      execFileSync('node', [join(REPO, 'scripts/verify-project-setup.mjs'), P], { stdio: 'pipe' });
    } catch (e) {
      const detail = String(e.stdout ?? '').split('\n').filter((l) => l.trim().startsWith('✗') || l.includes('BRAKI')).join('; ').trim();
      issues.push([`verify-project-setup: setup niekompletny${detail ? ` (${detail})` : ''}`,
        `node scripts/verify-project-setup.mjs ${P} --verbose`]);
    }
  }

  // 6. Manifest instalacji (ADR 0007 D1/D2, K66). `source_hash` w runtime.yml pilnuje treści
  //    bloków, ale nie odpowiada na „z jakiego stanu centrali to wyszło": zmiana skryptów,
  //    szablonów albo schematu kontraktu jest dla niego niewidoczna.
  if (composed) {
    const manifestPath = join(P, '.claude/config/installed.yml');
    if (!existsSync(manifestPath)) {
      issues.push(['brak .claude/config/installed.yml (manifest instalacji, ADR 0007 D1)',
        `node scripts/materialize-runtime.mjs ${P}`, WARN]);
    } else {
      let m = null;
      try { m = YAML.parse(readFileSync(manifestPath, 'utf8')); } catch { /* niżej */ }
      if (!m) {
        issues.push(['installed.yml nie parsuje się jako YAML',
          `node scripts/materialize-runtime.mjs ${P}`, WARN]);
      } else {
        if (majorOf(m.contract_version) !== majorOf(CONTRACT_VERSION)) {
          issues.push([
            `kontrakt MAJOR rozjechany: zainstalowano ${m.contract_version ?? '?'}, centrala ma ${CONTRACT_VERSION} ` +
            '— format konfiguracji zmienił się od czasu instalacji',
            `./scripts/setup-project.sh ${P} && node scripts/materialize-runtime.mjs ${P}`, ERROR]);
        }
        // Sam rozjazd SHA to informacja, nie usterka: centrala dostaje commity codziennie,
        // a większość z nich nie dotyczy setupu. BŁĘDEM jest dopiero to, co z tego wynika
        // i co łapią checki wyżej (nieaktualny runtime.yml, martwe dowiązania, braki setupu).
        if (m.claude_patterns_sha && HEAD_SHA && m.claude_patterns_sha !== HEAD_SHA) {
          issues.push([
            `zainstalowano z claude-patterns ${m.claude_patterns_sha}${m.claude_patterns_dirty ? ' (dirty)' : ''}, ` +
            `teraz ${HEAD_SHA}${m.materialized_at ? ` — materializacja ${String(m.materialized_at).slice(0, 10)}` : ''}`,
            `node scripts/materialize-runtime.mjs ${P}   # gdy chcesz przypiąć do bieżącego stanu`, INFO]);
        }
      }
    }
  }

  const sessions = sessionCount(P);
  const dormant = !ALL && sessions <= DORMANT_MAX_SESSIONS;
  // Domyślna waga to BŁĄD — checki sprzed K63 zgłaszają rzeczy naprawialne komendą.
  // Projekt uśpiony schodzi w całości do INFO: jego stan nikogo dziś nie blokuje, a jako
  // BŁĄD zajmowałby miejsce w raporcie, który ma być czytany.
  const normalized = issues.map(([what, fix, sev = ERROR]) => [what, fix, dormant ? INFO : sev]);

  rows.push({ name, composed, blocks, issues: normalized, sessions, dormant });
}

// Routing hooków jest GLOBALNY (jeden plik dla całej floty), więc sprawdzamy go raz,
// obok audytu projektów — rozjazd tutaj dotyczy każdego repo naraz.
let routingIssue = null;
try {
  execFileSync('node', [join(REPO, 'scripts/generate-pattern-routing.mjs'), '--check'], { stdio: 'pipe' });
} catch {
  routingIssue = ['hooks/lib/pattern-routing.generated.js nie odpowiada blokom',
    'node scripts/generate-pattern-routing.mjs', ERROR];
}

// Telemetria harnessa (K76) — też globalna, bo ~/.claude jest jedno na całą flotę.
// OSTRZEŻENIE, nie BŁĄD: zerwany pomiar nie psuje ani jednego repozytorium, ale przez
// trzy tygodnie nikt nie zauważył, że metryki workflowów przestały powstawać, więc
// musi to gdzieś widać. Szczegóły i uzasadnienie metody: scripts/telemetry-freshness.mjs.
let telemetryIssue = null;
try {
  execFileSync('node', [join(REPO, 'scripts/telemetry-freshness.mjs')], { stdio: 'pipe' });
} catch (e) {
  const lines = String(e.stdout ?? '').split('\n').concat(String(e.stderr ?? '').split('\n'))
    .map((l) => l.trim()).filter((l) => l.startsWith('✗'));
  telemetryIssue = [lines.map((l) => l.replace(/^✗\s*/, '')).join(' | ') || 'telemetria harnessa nie jest aktualizowana',
    'node scripts/telemetry-freshness.mjs --verbose', WARN];
}

// Świeżość RAG też jest globalna: kolekcje `patterns_global`/`library_reference_global`
// obsługują całą flotę, więc nieświeży chunk trafia do każdego projektu naraz. Do
// 2026-08-16 nie pilnowało tego nic — karta reguł geo siedziała w kolekcji w wersji
// sprzed dwóch reguł, a audyt meldował „wszystko aktualne".
let ragIssue = null;
try {
  execFileSync('node', [join(REPO, 'scripts/rag-freshness.mjs')], { stdio: 'pipe' });
} catch (e) {
  const detail = String(e.stderr ?? '').trim().split('\n')[0].trim();
  ragIssue = [detail || 'kolekcje RAG nie odpowiadają drzewu patterns/**+rules/**',
    './scripts/reseed-patterns.sh', ERROR];
}

// Katalogi z `.claude/`, ale bez project.yml, nie są audytowane w ogóle — lista, żeby
// „poza systemem" było widoczne, a nie dedukowane z nieobecności w raporcie.
const outside = outsideBlockSystem(ROOT, ['claude-patterns']);
const outsideIssue = outside.length
  ? [`poza systemem bloków (jest .claude/, brak .claude/config/project.yml): ${outside.join(', ')}`,
    'node scripts/setup-project.sh <katalog>   # albo świadomie zostaw', INFO]
  : null;

const globalIssues = [routingIssue, telemetryIssue, ragIssue, outsideIssue].filter(Boolean);

const MARK = { [ERROR]: '✗', [WARN]: '!', [INFO]: 'i' };
const sevOf = (list, sev) => list.filter(([, , s]) => s === sev);

// „Wymaga uwagi" znaczy BŁĄD albo OSTRZEŻENIE. Projekt, który ma wyłącznie INFO — bo jest
// uśpiony albo bo jedyne znalezisko to rozjazd SHA — nie trafia na listę; inaczej raport
// znów urósłby do rozmiaru, w którym się go przewija zamiast czytać.
const actionable = (r) => r.issues.some(([, , s]) => s !== INFO);
const dirty = rows.filter(actionable);
const infoOnly = rows.filter((r) => !actionable(r) && r.issues.length);
const clean = rows.filter((r) => !r.issues.length);
const dormantCount = rows.filter((r) => r.dormant).length;
const dormantSilenced = rows.filter((r) => r.dormant && r.issues.length).length;

console.log(`\nprojektów: ${rows.length}  (na kompozycji bloków: ${rows.filter((r) => r.composed).length})\n`);
for (const r of dirty) {
  console.log(`${r.name}${r.blocks ? `  [${r.blocks} bloków]` : ''}`);
  for (const [what, fix, sev] of r.issues) console.log(`    ${MARK[sev]} ${what}\n      → ${fix}`);
}

if (infoOnly.length) {
  const dormantOnes = infoOnly.filter((r) => r.dormant).map((r) => `${r.name} (${r.sessions} sesji)`);
  const rest = infoOnly.filter((r) => !r.dormant).map((r) => r.name);
  console.log(`\nTYLKO INFO (${infoOnly.length})${dormantOnes.length ? `\n    uśpione: ${dormantOnes.join(', ')}` : ''}` +
    `${rest.length ? `\n    pozostałe: ${rest.join(', ')}` : ''}`);
  console.log('    → szczegóły: node scripts/audit-projects.mjs --all');
}

if (clean.length)
  console.log(`\nbez zastrzeżeń (${clean.length}): ${clean.map((r) => r.name).join(', ')}`);

if (globalIssues.length) {
  console.log('\nGLOBALNE');
  for (const [what, fix, sev] of globalIssues) console.log(`    ${MARK[sev]} ${what}\n      → ${fix}`);
}

const projectIssues = dirty.flatMap((r) => r.issues).filter(([, , s]) => s !== INFO);
const errors = sevOf(projectIssues, ERROR).length + sevOf(globalIssues, ERROR).length;
const warns = sevOf(projectIssues, WARN).length + sevOf(globalIssues, WARN).length;

if (!errors && !warns) {
  console.log('\nwszystko aktualne');
} else {
  console.log(`\n${dirty.length} projekt(ów) wymaga uwagi; błędów: ${errors}, ostrzeżeń: ${warns}` +
    (dormantCount && !ALL
      ? `; uśpionych (≤${DORMANT_MAX_SESSIONS} sesji): ${dormantCount}, z tego ze znaleziskami zdegradowanymi do INFO: ${dormantSilenced}`
      : ''));
}
if (dormantCount && !ALL && !errors && !warns)
  console.log(`(uśpionych: ${dormantCount}, ze znaleziskami: ${dormantSilenced} — pełny obraz: --all)`);

// `--report` (2026-10-10): BŁĘDY trafiają do docs/tasks/_inbox/ przez report-deviation.mjs
// jako `setup_drift` (`--source audit`). Do tej daty skrzynkę karmił tylko /orchestrate, więc
// dryf konfiguracji floty — który nigdy nie kończy się HALT-em, tylko cichą degradacją — był
// widoczny wyłącznie temu, kto akurat czytał raport. Sygnatura = TYP kontroli (nie tekst),
// więc jeden rekord zbiera wszystkie projekty z tym samym problemem; `--once-per-project`
// sprawia, że codzienny przebieg nie dopisuje wystąpień znanych już projektów.
if (process.argv.includes('--report')) {
  const RULES = [
    [/martwe dowiązanie/, 'AUD-DEAD-LINK'],
    [/absolutną ścieżką w gicie/, 'AUD-GIT-ABS-SYMLINK'],
    [/\.bak/, 'AUD-GIT-BAK'],
    [/w \.gitignore/, 'AUD-GIT-IGNORED-DEP'],
    [/permissions|\.env/, 'AUD-ENV-DENY'],
    [/CLAUDE-LOCAL|CLAUDE\.md/, 'AUD-CLAUDE-LOCAL'],
    [/BRAK runtime\.yml/, 'AUD-RUNTIME-MISSING'],
    [/runtime\.yml nieaktualny/, 'AUD-RUNTIME-STALE'],
    [/verify-project-setup/, 'AUD-SETUP-INCOMPLETE'],
    [/RAG/, 'AUD-RAG-DRIFT'],
  ];
  const ruleOf = (what) => RULES.find(([rx]) => rx.test(what))?.[1]
    ?? `AUD-${String(what).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30)}`;
  const toReport = [
    ...rows.flatMap((r) => r.issues.map((i) => [r.name, ...i])),
    ...globalIssues.map((i) => ['claude-patterns', ...i]),
  ].filter(([, , , sev]) => (sev ?? ERROR) === ERROR);
  let failed = 0;
  for (const [project, what] of toReport) {
    const res = spawnSync(process.execPath, [join(REPO, 'scripts/report-deviation.mjs'),
      '--project', project, '--trigger', 'setup_drift', '--rule', ruleOf(what),
      '--reason', String(what).slice(0, 300), '--source', 'audit', '--once-per-project'],
      { encoding: 'utf8' });
    if (res.status !== 0) failed++;
  }
  console.log(`\nskrzynka: ${toReport.length} błędów przekazanych do docs/tasks/_inbox/` +
    (failed ? ` (${failed} nie zapisało się — sprawdź report-deviation.mjs)` : ''));
}

// `--gate`: wywołanie automatyczne (pre-commit, /loop). Przerywa wyłącznie na BŁĘDZIE,
// czyli na czymś, co ma wypisaną komendę naprawczą. Bez `--gate` — wywołanie ręczne —
// próg jest niższy, bo człowiek czytający raport ma OSTRZEŻENIA zobaczyć, a nie ominąć.
process.exit(GATE ? (errors ? 1 : 0) : (errors || warns ? 1 : 0));
