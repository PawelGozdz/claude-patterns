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

import { readFileSync, existsSync, readdirSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg > -1 ? process.argv[rootArg + 1] : '/opt/projects';

const projects = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, '.claude/config/project.yml')))
  .map((e) => e.name)
  .filter((n) => n !== 'claude-patterns')
  .sort();

// Bez podążania za symlinkiem katalogu: projekt bywa podpięty JEDNYM dowiązaniem do
// całego drzewa wzorców centrali (vytches-ddd) i wtedy skan zszedłby do samej centrali.
const danglingIn = (dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) { if (!existsSync(p)) out.push([p, readlinkSync(p)]); }
    else if (e.isDirectory()) out.push(...danglingIn(p));
  }
  return out;
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
      try {
        execFileSync('node', [join(REPO, 'scripts/materialize-runtime.mjs'), P, '--check'],
          { stdio: 'pipe' });
      } catch {
        issues.push(['runtime.yml nieaktualny', `node scripts/materialize-runtime.mjs ${P}`]);
      }
    }
  }

  // 2. Martwe dowiązania — cel zniknął z centrali, nikt tego nie posprzątał.
  const dangling = ['.claude/knowledge/patterns', '.claude/knowledge/rules',
    '.claude/knowledge/skills', '.claude/agents'].flatMap((s) => danglingIn(join(P, s)));
  for (const [p, target] of dangling)
    issues.push([`martwe dowiązanie: ${p.slice(P.length + 1)} → ${target}`,
      `./scripts/setup-project.sh ${P}   # sprząta je automatycznie`]);

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

  rows.push({ name, composed, blocks, issues });
}

// Routing hooków jest GLOBALNY (jeden plik dla całej floty), więc sprawdzamy go raz,
// obok audytu projektów — rozjazd tutaj dotyczy każdego repo naraz.
let routingIssue = null;
try {
  execFileSync('node', [join(REPO, 'scripts/generate-pattern-routing.mjs'), '--check'], { stdio: 'pipe' });
} catch {
  routingIssue = ['hooks/lib/pattern-routing.generated.js nie odpowiada blokom',
    'node scripts/generate-pattern-routing.mjs'];
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
    './scripts/reseed-patterns.sh'];
}

const clean = rows.filter((r) => !r.issues.length);
const dirty = rows.filter((r) => r.issues.length);

console.log(`\nprojektów: ${rows.length}  (na kompozycji bloków: ${rows.filter((r) => r.composed).length})\n`);
for (const r of dirty) {
  console.log(`${r.name}${r.blocks ? `  [${r.blocks} bloków]` : ''}`);
  for (const [what, fix] of r.issues) console.log(`    ✗ ${what}\n      → ${fix}`);
}
if (clean.length)
  console.log(`\nbez zastrzeżeń (${clean.length}): ${clean.map((r) => r.name).join(', ')}`);

const globalIssues = [routingIssue, ragIssue].filter(Boolean);
if (globalIssues.length) {
  console.log('\nGLOBALNE');
  for (const [what, fix] of globalIssues) console.log(`    ✗ ${what}\n      → ${fix}`);
}

console.log(dirty.length || globalIssues.length
  ? `\n${dirty.length} projekt(ów) wymaga uwagi, znalezisk łącznie: ${
      dirty.reduce((n, r) => n + r.issues.length, 0) + globalIssues.length}`
  : '\nwszystko aktualne');
process.exit(dirty.length || globalIssues.length ? 1 : 0);
