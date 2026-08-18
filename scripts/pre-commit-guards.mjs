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
//   - eval retrievalu (tests/flow-evals/retrieval/run.js) → wymaga żywego
//     Qdranta + embeddera, zbyt kosztowne na każdy commit (decyzja
//     TASK-EVAL-001: "Retrieval WYKLUCZONY z auto").
//
// Koordynacja z TASK-EVAL-001 Faza 1 (ten sam pomysł: "git pre-commit → run-all.js"
// dla evali L1 hooks/watcher/workflow-lint): TEN skrypt JEST tym hookiem. Gdy
// TASK-EVAL-001 zbuduje tests/flow-evals/run-all.js, dopisze tu jedno runCheck(...)
// zamiast instalować drugi pre-commit — jedna instalacja simple-git-hooks, jeden
// punkt wejścia.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function runCheck(label, cmd, args) {
  try {
    const out = execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8', stdio: 'pipe' });
    results.push({ label, ok: true, output: out.trim() });
  } catch (e) {
    const output = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
    results.push({ label, ok: false, output: output || e.message });
  }
}

runCheck('lint-patterns --strict', 'node', ['scripts/lint-patterns.mjs', '--strict']);
runCheck('generate-pattern-routing --check', 'node', ['scripts/generate-pattern-routing.mjs', '--check']);
runCheck('rag-freshness', 'node', ['scripts/rag-freshness.mjs']);

// Sekcja 3: dyscyplina zmian promptów agentów. Dla każdego stage'owanego `agents/**.md`
// z nietrywialnym diffem (nie samo formatowanie) wymagamy nowego wpisu w `## Changelog`
// z dzisiejszą datą. Plik BEZ sekcji `## Changelog` = pomiń — bootstrap wszystkich
// agentów naraz to osobna, większa decyzja, świadomie poza zakresem tego taska.
function checkAgentChangelogs() {
  const staged = execFileSync(
    'git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
    { cwd: REPO, encoding: 'utf8' },
  ).split('\n').filter((f) => /^agents\/.*\.md$/.test(f));

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

    if (!content.includes('## Changelog')) continue; // bootstrap poza zakresem

    const hasTodayEntry = new RegExp(`^-\\s+${today}\\s`, 'm').test(content);
    if (!hasTodayEntry) errors.push(`${file}: brak wpisu w \`## Changelog\` z dzisiejszą datą (${today})`);
  }
  return errors;
}

const changelogErrors = checkAgentChangelogs();
results.push({
  label: 'agent changelog discipline',
  ok: changelogErrors.length === 0,
  output: changelogErrors.join('\n'),
});

const failed = results.filter((r) => !r.ok);

if (!failed.length) {
  console.log(`✔ pre-commit: wszystkie bramki przeszły (${results.map((r) => r.label).join(', ')})`);
  process.exit(0);
}

console.error(`✘ pre-commit: ${failed.length}/${results.length} bramek nie przeszło\n`);
for (const r of failed) {
  console.error(`── ${r.label} ──`);
  console.error(r.output || '(brak outputu)');
  console.error('');
}
process.exit(1);
