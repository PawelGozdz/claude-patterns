#!/usr/bin/env node
/**
 * pre-workflow-lint.js — PreToolUse hook (matcher: Workflow)
 *
 * Problem, który rozwiązuje: `workflow-lint.js` ma 13 reguł zakodowanych z realnych
 * incydentów, ale do 2026-08-14 NIC go nie uruchamiało. Był CLI, o którym
 * `commands/orchestrate.md` wspominał w nawiasie — więc bramka istniała wyłącznie
 * na papierze, a skrypty szły do Workflow niesprawdzone. Ostatni taki przebieg
 * (wf_23029d51-3a2, juz-ide-api-2) padł po 22,5 min na błędzie, który reguła WL11
 * łapie w ułamku sekundy.
 *
 * Reguła: przed uruchomieniem narzędzia Workflow zlintuj skrypt, który ma pójść
 * w ruch. Znaleziony ERROR → blokada (exit 2) z pełną listą. Same WARN → przepuść,
 * ale wypisz je na stderr, żeby trafiły do modelu.
 *
 * Skąd bierze skrypt (w tej kolejności):
 *   1. tool_input.script      — skrypt inline, najczęstszy przypadek
 *   2. tool_input.scriptPath  — iteracja/resume na zapisanym pliku
 *   3. tool_input.name        — nazwany workflow z .claude/workflows/; NIE lintujemy
 *      (nie znamy jego treści bez rozwiązywania rejestru, a to nie jest nasz kod)
 *
 * Wyłączenie: WORKFLOW_LINT=off (albo =warn, żeby ERROR-y nie blokowały).
 * Hook NIGDY nie blokuje z powodu własnej awarii — nieparsowalne wejście, nieczytelna
 * ścieżka, brak modułu reguł: przepuszcza i milczy. Bramka jakości nie może być
 * pojedynczym punktem awarii dla całego /orchestrate.
 */

const fs = require('fs');
const path = require('path');

const MODE = (process.env.WORKFLOW_LINT || 'block').toLowerCase();

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  if (MODE === 'off') process.exit(0);

  let payload;
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0); // nieparsowalne wejście to nie powód, żeby zatrzymać przebieg
  }

  const input = payload.tool_input || payload.toolInput || {};
  let src = typeof input.script === 'string' ? input.script : null;
  let origin = 'skrypcie inline';

  if (!src && typeof input.scriptPath === 'string') {
    try {
      src = fs.readFileSync(input.scriptPath, 'utf8');
      origin = input.scriptPath;
    } catch {
      process.exit(0); // ścieżka nieczytelna — Workflow sam zgłosi sensowniejszy błąd
    }
  }

  if (!src) process.exit(0); // nazwany workflow albo wywołanie bez skryptu

  let lint;
  try {
    ({ lint } = require(path.join(__dirname, 'workflow-lint.js')));
  } catch {
    process.exit(0);
  }

  let findings = [];
  try {
    findings = lint(src) || [];
  } catch {
    process.exit(0);
  }

  if (!findings.length) process.exit(0);

  const errors = findings.filter((f) => f.level === 'ERROR');
  const warns = findings.filter((f) => f.level !== 'ERROR');
  const fmt = (f) => `    ${f.level === 'ERROR' ? '🛑' : '⚠️ '} [${f.id}] ${f.line ? `L${f.line}: ` : ''}${f.msg}`;

  if (!errors.length) {
    process.stderr.write(
      `\nworkflow-lint: ${warns.length} ostrzeżenie(a) w ${origin} — przebieg NIE jest wstrzymany:\n`
      + warns.map(fmt).join('\n') + '\n\n'
    );
    process.exit(0);
  }

  const blocking = MODE !== 'warn';
  process.stderr.write(
    `\n${blocking ? 'BLOCKED' : 'WARNING'}: workflow-lint w ${origin} — ${errors.length} błąd(ów)`
    + `${warns.length ? `, ${warns.length} ostrzeżenie(a)` : ''}:\n\n`
    + errors.concat(warns).map(fmt).join('\n')
    + `\n\n    Każda z tych reguł koduje przebieg, który realnie padł albo przepalił budżet.\n`
    + `    Kanoniczny kształt skryptu (sonda, twarde maxTurns, schema producenta,\n`
    + `    pipeline + .filter(Boolean)) jest w commands/orchestrate.md §2a — skopiuj stamtąd.\n`
    + (blocking
      ? `    Świadomie chcesz uruchomić mimo to? WORKFLOW_LINT=warn (ostrzega) albo =off (cisza).\n\n`
      : `    Tryb warn — uruchamiam mimo błędów.\n\n`)
  );
  process.exit(blocking ? 2 : 0);
}

main();
