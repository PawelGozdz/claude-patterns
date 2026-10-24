#!/usr/bin/env node
// Pre-commit gate (git hook, lokalny dev — NIE serwer CI): node scripts/pre-commit-guards.mjs
// Instalowany przez simple-git-hooks (package.json → "simple-git-hooks".pre-commit),
// aktywowany przez `npm install` (scripts.prepare) albo ręcznie `npx simple-git-hooks`.
//
// TASK-GUARDRAILS-001 Sekcja 1: cztery strażniki dodane 2026-08-17
// (lint-patterns --strict, generate-pattern-routing --check, rag-freshness,
// dyscyplina changelogu agentów z Sekcji 3) istniały, ale wymagały ręcznego
// odpalenia — dokładnie ten typ dyscypliny, który już raz zawiódł (TASK-EVAL-001,
// zasada D7: "eval komponentu odpala się, gdy TEN komponent się zmienia").
//
// Uruchamia WSZYSTKIE bramki po kolei i zbiera wszystkie błędy zamiast przerywać
// na pierwszej — jeden commit = jeden pełny raport, nie cykl popraw→commit→odkryj
// kolejny błąd.
//
// CELOWO POMIJA (patrz TASK-GUARDRAILS-001 Sekcja 1):
//   - materialize-runtime.mjs --check → dotyczy projektów satelitarnych
//     (juz-ide-api-*, ...), nie tego repo.
//   - eval retrievalu (tests/flow-evals/retrieval/run.js) i library-reference-schema
//     → wymagają żywego Qdranta (+ retrieval dodatkowo embeddera), zbyt kosztowne
//     na każdy commit (decyzja TASK-EVAL-001: "Retrieval WYKLUCZONY z auto").
//
// K11 (TASK-KAIZEN-001, 2026-08-27): dopięto 4 evale L1 (hooks/watcher/workflow-lint/
// workflow-metrics) + 6 walidatorów scripts/ci/validate-*.js — wszystkie deterministyczne,
// bez zależności na żywym Qdrancie, łącznie <2s. To jest realizacja Fazy 1 z
// TASK-EVAL-001 (ten sam pomysł: "git pre-commit → run-all.js"), zrobiona wewnątrz
// TEGO skryptu zamiast osobnego run-all.js — jedna instalacja simple-git-hooks,
// jeden punkt wejścia. Ujawniły 18 realnych błędów (2 agenty bez `tools`, 15 martwych
// referencji w commands/{finance,legal,marketing}.md + 1 w orchestrate.md), naprawionych
// w tym samym commicie.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInboxEntries, staleInboxEntries, STALE_AFTER_DAYS } from './lib/inbox.mjs';
import { emitPrecommitRun, gateId } from './lib/precommit-telemetry.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_STARTED = Date.now();
const results = [];

// Kontrole (audyt floty, evale w katalogach tymczasowych) wołają `git` w INNYCH repozytoriach.
// Git ustawia hookowi GIT_INDEX_FILE (przy `git commit -- <ścieżki>` to indeks tymczasowy
// o ścieżce bezwzględnej) — odziedziczony przez dziecko sprawiał, że `git` w aegis-flow czytał
// i odświeżał indeks claude-patterns, wpisując do niego obce ścieżki. Commit padał na
// „unable to read <sha>" (2026-10-10). Dzieci dostają środowisko bez wiązań z tym commitem.
const CHILD_ENV = Object.fromEntries(Object.entries(process.env)
  .filter(([k]) => !['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY'].includes(k)));

// TASK-OBS-010 (ADR 0012 aneks): każda bramka zostawia krok `step.end` w telemetrii. `id` to stała
// nazwa bramki (idzie do zdarzenia); `label` jest dla człowieka i bywa dynamiczny („zmienione: a.js")
// — dla takich bramek wołający MUSI podać `id`, inaczej nazwy plików wyjechałyby ze slugiem etykiety.
function runCheck(label, cmd, args, id = gateId(label)) {
  const startedAt = Date.now();
  try {
    const out = execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', stdio: 'pipe', env: CHILD_ENV });
    results.push({ label, id, ok: true, output: out.trim(), startedAt, endedAt: Date.now() });
  } catch (e) {
    const output = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
    results.push({ label, id, ok: false, output: output || e.message, startedAt, endedAt: Date.now() });
  }
}

runCheck('lint-patterns --strict', 'node', ['scripts/lint-patterns.mjs', '--strict']);
runCheck('generate-pattern-routing --check', 'node', ['scripts/generate-pattern-routing.mjs', '--check']);
runCheck('rag-freshness', 'node', ['scripts/rag-freshness.mjs']);

// K11: evale L1 deterministyczne (bez żywego Qdranta) + walidatory CI — patrz nagłówek.
runCheck('eval: hooks', 'node', ['tests/flow-evals/hooks/run.js']);
runCheck('eval: watcher', 'node', ['tests/flow-evals/watcher/run.js']);
runCheck('eval: workflow-lint', 'node', ['tests/flow-evals/workflow-lint/run.js']);
runCheck('eval: orchestrate-prepare', 'node', ['tests/flow-evals/orchestrate-prepare/run.js']);
runCheck('eval: orchestrate-script', 'node', ['tests/flow-evals/orchestrate-script/run.js']);
runCheck('eval: materialize-runtime', 'node', ['tests/flow-evals/materialize-runtime/run.js']);
runCheck('eval: setup-project', 'node', ['tests/flow-evals/setup-project/run.js']);
runCheck('eval: workflow-metrics', 'node', ['tests/flow-evals/workflow-metrics/run.js']);
runCheck('eval: project-yml', 'node', ['tests/flow-evals/project-yml/run.js']);
runCheck('eval: audit-projects', 'node', ['tests/flow-evals/audit-projects/run.js']);
runCheck('eval: telemetry-events', 'node', ['tests/flow-evals/telemetry-events/run.js']);
runCheck('eval: telemetry-sessions', 'node', ['tests/flow-evals/telemetry-sessions/run.js']);
runCheck('eval: telemetry-rollups', 'node', ['tests/flow-evals/telemetry-rollups/run.js']);
runCheck('eval: reporting-hygiene', 'node', ['tests/flow-evals/reporting-hygiene/run.js']);
runCheck('eval: flow-top', 'node', ['tests/flow-evals/flow-top/run.js']);
runCheck('eval: telemetry-export', 'node', ['tests/flow-evals/telemetry-export/run.js']);
runCheck('eval: telemetry-gate-blame', 'node', ['tests/flow-evals/telemetry-gate-blame/run.js']);
runCheck('eval: pre-commit-telemetry', 'node', ['tests/flow-evals/pre-commit-telemetry/run.js']);
runCheck('eval: hook-telemetry', 'node', ['tests/flow-evals/hook-telemetry/run.js']);
runCheck('validate-agents', 'node', ['scripts/ci/validate-agents.js']);
runCheck('validate-business-rules', 'node', ['scripts/ci/validate-business-rules.js']);
runCheck('validate-commands', 'node', ['scripts/ci/validate-commands.js']);
runCheck('validate-hooks', 'node', ['scripts/ci/validate-hooks.js']);
runCheck('validate-blocks', 'node', ['scripts/ci/validate-blocks.mjs']);
runCheck('validate-rules', 'node', ['scripts/ci/validate-rules.js']);
runCheck('validate-skills', 'node', ['scripts/ci/validate-skills.js']);
runCheck('count-assets --check', 'node', ['scripts/count-assets.mjs', '--check']);
runCheck('count-assets --check-docs', 'node', ['scripts/count-assets.mjs', '--check-docs']);
// K84 (TASK-KAIZEN-002, 2026-09-07): jeden schemat METADATA.yml katalogów wzorców.
// Poprzednik (`validate-metadata.sh`) znał tylko stary schemat, raportował 6/10 FAIL
// na poprawnych plikach i nie był wpięty nigdzie — stąd 7/16 kategorii bez metadanych.
runCheck('validate-metadata', 'node', ['scripts/validate-metadata.mjs']);
runCheck('validate-tasks', 'node', ['scripts/ci/validate-tasks.mjs']);

// K63 (TASK-KAIZEN-002, 2026-09-07): audyt floty przy zmianie źródeł kompozycji.
//
// Incydent „10/10 runtime.yml nieaktualnych" z 2026-08-12 powtórzył się co do joty
// miesiąc później, bo `audit-projects.mjs` odpalał wyłącznie człowiek, który akurat
// o nim pamiętał. Zmiana w `blocks/**` unieważnia `source_hash` KAŻDEGO projektu naraz
// — to jest dokładnie ten moment, w którym audyt ma sens, i jedyny, w którym autor
// zmiany jeszcze wie, co zmienił.
//
// Warunkowo, nie zawsze: audyt czyta jedenaście cudzych repozytoriów (~1,5 s), więc
// przy commicie dotykającym wyłącznie dokumentacji byłby podatkiem bez treści.
//
// Tryb `--gate`, nie domyślny: przerywa tylko na BŁĘDACH, czyli znaleziskach z wypisaną
// komendą naprawczą. OSTRZEŻENIA (fork bloku przez `extends`, brak manifestu) lecą do
// raportu, ale nie blokują commita — bramka, której nie da się wyzerować, jest
// obchodzona przez `--no-verify`, a wtedy nie chroni już niczego.
const stagedForAudit = execFileSync(
  'git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
  { cwd: REPO, encoding: 'utf8' },
).split('\n').filter((f) =>
  // Tylko `.yml`: `source_hash` liczy się z treści bloków, aliasów i taksonomii, więc
  // `blocks/README.md` nie unieważnia niczyjego runtime.yml i nie ma po co ciągnąć
  // przez to audytu całej floty.
  /^blocks\/.*\.yml$/.test(f) ||
  /^templates\/[^/]+-hooks\.json$/.test(f) ||
  /^templates\/settings\/[^/]+\.json$/.test(f));

if (stagedForAudit.length) {
  runCheck(`audit-projects --gate (zmienione: ${stagedForAudit.join(', ')})`,
    'node', ['scripts/audit-projects.mjs', '--gate'], 'audit-projects-gate');
}

// TASK-OBS-005 (ADR 0012): `_inbox/index.json` ma być odtwarzalny ze skrzynki, a ręczna edycja
// wykrywana. Warunkowo, bo rekordy `DEV-*.md` są u autora zgłoszenia nietrackowane (report-deviation
// ich nie staguje) — sprawdzanie przy każdym commicie wywalałoby się na maszynie, która tych
// rekordów nie ma. Ktokolwiek rusza skrzynkę (triage, index.json), odtwarza indeks przed commitem.
const stagedInbox = execFileSync(
  'git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'],
  { cwd: REPO, encoding: 'utf8' },
).split('\n').filter((f) => /^docs\/tasks\/_inbox\/[^/]+$/.test(f));

if (stagedInbox.length) {
  runCheck(`generate-inbox-index --check (zmienione: ${stagedInbox.length} plików skrzynki)`,
    'node', ['scripts/generate-inbox-index.mjs', '--check'], 'generate-inbox-index-check');
}

// Sekcja 3: dyscyplina zmian promptów agentów. Dla każdego stage'owanego `agents/**.md`
// z nietrywialnym diffem (nie samo formatowanie) wymagamy nowego wpisu w `## Changelog`
// z dzisiejszą datą.
//
// K15 (TASK-KAIZEN-001, 2026-08-27): pierwotnie plik BEZ sekcji `## Changelog` był
// pomijany („bootstrap wszystkich agentów naraz to osobna decyzja") — skutek: bramka
// chroniła 2 z 56 agentów (3,5%), bo nikt nie zrobił tego bootstrapu ręcznie, a fabrykowanie
// historii zmian dla 54 plików naraz byłoby zmyśloną treścią. Zamiast tego brak sekcji
// przy NIETRYWIALNEJ zmianie jest teraz błędem, nie cichym pominięciem — pokrycie rośnie
// organicznie, dokładnie tam, gdzie agent faktycznie jest edytowany (gdzie ryzyko dryfu
// promptu realnie występuje), bez zgadywania przeszłości.
function checkAgentChangelogs() {
  const staged = execFileSync(
    'git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
    { cwd: REPO, encoding: 'utf8' },
  ).split('\n').filter((f) => /^agents\/.*\.md$/.test(f) && !f.endsWith('/README.md') && f !== 'agents/README.md');

  const today = new Date().toISOString().slice(0, 10);
  const errors = [];

  for (const file of staged) {
    const diff = execFileSync('git', ['diff', '--cached', '-U0', '--', file], { cwd: REPO, encoding: 'utf8' });
    const changedLines = diff.split('\n').filter((l) => /^[+-][^+-]/.test(l));
    // Czysto biały diff (reformat/rewrap bez treści) nie wymaga nowego wpisu.
    const meaningful = changedLines.some((l) => l.slice(1).trim().length > 0);
    if (!meaningful) continue;

    // Zawartość ZASTAGE'OWANA (git index), nie working-tree: przy częściowym `git add`
    // working tree może mieć wpis w Changelogu, którego commit i tak nie obejmie.
    let content;
    try { content = execFileSync('git', ['show', `:${file}`], { cwd: REPO, encoding: 'utf8' }); }
    catch { continue; } // plik usunięty w tym commicie — nic do sprawdzenia

    if (!content.includes('## Changelog')) {
      errors.push(`${file}: brak sekcji \`## Changelog\` — dodaj ją przy tej zmianie (wzór: ` +
        `agents/stacks/nestjs-ddd/code-quality-verifier.md) zamiast pomijać (K15)`);
      continue;
    }

    const hasTodayEntry = new RegExp(`^-\\s+${today}\\s`, 'm').test(content);
    if (!hasTodayEntry) errors.push(`${file}: brak wpisu w \`## Changelog\` z dzisiejszą datą (${today})`);
  }
  return errors;
}

const changelogStartedAt = Date.now();
const changelogErrors = checkAgentChangelogs();
results.push({
  label: 'agent changelog discipline',
  id: 'agent-changelog-discipline',
  ok: changelogErrors.length === 0,
  output: changelogErrors.join('\n'),
  startedAt: changelogStartedAt,
  endedAt: Date.now(),
});

// ORC-066: podsumowanie docs/tasks/_inbox/ (zgłoszenia odstępstw z /orchestrate w satelitach,
// patrz scripts/report-deviation.mjs). CELOWO informacyjne, poza `results`/`failed` — nigdy
// nie blokuje commita. docs/adr/0006-cross-instance-broadcast.md padło, bo nikt nie czytał
// osobnego kanału; ten wpis daje widoczność w nawyku, który tu realnie działa — pre-commit.
function printInboxSummary() {
  const dir = join(REPO, 'docs', 'tasks', '_inbox');
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  if (!files.length) return;

  const rows = [];
  for (const f of files) {
    const raw = readFileSync(join(dir, f), 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([a-z_]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
    }
    rows.push(fm);
  }
  if (!rows.length) return;

  rows.sort((x, y) => Number(y.occurrences || 0) - Number(x.occurrences || 0));
  const oldest = rows.reduce((min, r) => (r.first_seen && (!min || r.first_seen < min) ? r.first_seen : min), null);

  console.log(`\nℹ inbox: ${rows.length} pozycji w docs/tasks/_inbox/ (najstarsza od ${oldest || '?'}), top wg occurrences:`);
  for (const r of rows.slice(0, 3)) {
    console.log(`  ${r.occurrences || '?'}x  ${r.id || '?'}  [${r.trigger || '?'}]  status=${r.status || '?'}`);
  }
  console.log('  → node scripts/report-deviation.mjs --list  (pełny przegląd / triage)');

  // TASK-OBS-007 (ADR 0011 B4): zgłoszenia bez ruchu — promoted > 7 dni, proposed > 14 dni.
  try {
    const stale = staleInboxEntries(readInboxEntries(dir));
    if (stale.length) {
      console.log(`⚠ inbox: ${stale.length} zgłoszeń bez ruchu (promoted > ${STALE_AFTER_DAYS.promoted} dni, proposed > ${STALE_AFTER_DAYS.proposed} dni):`);
      for (const r of stale.slice(0, 5)) console.log(`  ${r.days}d  ${r.id}  status=${r.status}`);
      if (stale.length > 5) console.log(`  … i ${stale.length - 5} więcej`);
    }
  } catch (e) {
    console.log(`  (postarzanie skrzynki pominięte: ${e.message})`);
  }
  console.log('');
}

// TASK-OBS-010: zapis telemetrii PO zebraniu wszystkich wyników — bramki nie mierzą samego zapisu,
// a jego błąd (emitPrecommitRun nie rzuca) jest jedną linią na stderr i nigdy nie zmienia kodu wyjścia.
const telemetry = emitPrecommitRun({ results, startedAt: RUN_STARTED });
if (telemetry.error || telemetry.rejected) {
  console.error(`ℹ telemetria pre-commit nie zapisana w całości (${telemetry.error || `odrzucone: ${telemetry.rejected}`})`);
}

const failed = results.filter((r) => !r.ok);

if (!failed.length) {
  console.log(`✔ pre-commit: wszystkie bramki przeszły (${results.map((r) => r.label).join(', ')})`);
  printInboxSummary();
  process.exit(0);
}

console.error(`✘ pre-commit: ${failed.length}/${results.length} bramek nie przeszło\n`);
for (const r of failed) {
  console.error(`── ${r.label} ──`);
  console.error(r.output || '(brak outputu)');
  console.error('');
}
printInboxSummary();
process.exit(1);
