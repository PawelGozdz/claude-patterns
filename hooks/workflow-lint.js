#!/usr/bin/env node
/**
 * workflow-lint.js — deterministyczny lint skryptu Workflow dla /orchestrate-ddd.
 *
 * NIE jest hookiem — to CLI. Mieszka w hooks/, bo ten katalog jest symlinkowany
 * globalnie (~/.claude/hooks/), więc każdy projekt woła:
 *   node "$HOME/.claude/hooks/workflow-lint.js" <plik-skryptu-workflow.js>
 *
 * Zamienia reguły-prozę z commands/orchestrate-ddd.md w twardą bramkę (eval L1, D7).
 * Każda reguła koduje realny incydent:
 *   WL1 (ERROR)  schema poza verify/final-gate — wf_8f8aeeb3 padł w 2 min na
 *                implement({schema}); sukces implementacji mierzy bramka git-diff.
 *   WL2 (ERROR)  wywołanie weryfikatora wewnątrz parallel() — 9/9 martwych
 *                wywołań verify szło przez parallel() (CONFORMANCE §3).
 *   WL3 (ERROR)  brak bramki „kod istnieje" (git diff) przed verify —
 *                weryfikacja kodu, który nigdy nie powstał (CONFORMANCE §2).
 *   WL4 (WARN)   verify bez schema — null przestaje odróżniać „agent umarł"
 *                od złego wyniku (ślepe retry).
 *   WL5 (WARN)   brak ESCALATE w skrypcie — pętla bez jawnej eskalacji wisi.
 *
 * Exit: 0 = czysto lub tylko WARN · 1 = ERROR (NIE uruchamiaj Workflow) · 2 = zły input.
 */

const fs = require('fs');

function snippetsOf(src, marker) {
  const out = [];
  let idx = 0;
  while ((idx = src.indexOf(marker, idx)) !== -1) {
    out.push({ at: idx, text: src.slice(idx, idx + 600), line: src.slice(0, idx).split('\n').length });
    idx += marker.length;
  }
  return out;
}

function lint(src) {
  const findings = [];
  const isVerifyish = (t) => /verif|final[_\s-]?gate|security[-_]e2e/i.test(t);

  // WL1 — schema tylko na verify/final gate. Snippet przycinamy do końca obiektu opcji ('})'),
  // inaczej połyka SĄSIEDNIE wywołania i fałszuje klasyfikację (złapane przez eval L1).
  for (const s of snippetsOf(src, 'agent(')) {
    const end = s.text.indexOf('})');
    const t = end === -1 ? s.text : s.text.slice(0, end + 2);
    if (/schema\s*:/.test(t) && !isVerifyish(t)) {
      findings.push({ id: 'WL1', level: 'ERROR', line: s.line, msg: 'agent({schema}) poza verify/final-gate — implement/fix mierzy bramka git-diff, nie self-report (incydent wf_8f8aeeb3)' });
    }
    if (isVerifyish(t) && !/schema\s*:/.test(t) && /agentType|code-quality|security-e2e/i.test(t)) {
      findings.push({ id: 'WL4', level: 'WARN', line: s.line, msg: 'wywołanie weryfikatora bez schema — null nie odróżni "agent umarł" od złego wyniku' });
    }
  }

  // WL2 — weryfikator nigdy w parallel()
  for (const s of snippetsOf(src, 'parallel(')) {
    if (isVerifyish(s.text)) {
      findings.push({ id: 'WL2', level: 'ERROR', line: s.line, msg: 'weryfikator wewnątrz parallel() — verify ZAWSZE sekwencyjnie (CONFORMANCE §3: 9/9 martwych wywołań)' });
    }
  }

  // WL3 — bramka „kod istnieje"
  if (!/git\s+diff|git_diff|diff\s+--stat/i.test(src)) {
    findings.push({ id: 'WL3', level: 'ERROR', line: 0, msg: 'brak bramki git-diff po implement — ryzyko weryfikacji kodu, który nie powstał (CONFORMANCE §2)' });
  }

  // WL5 — jawna eskalacja
  if (!/ESCALATE/i.test(src)) {
    findings.push({ id: 'WL5', level: 'WARN', line: 0, msg: 'brak ESCALATE w skrypcie — pętla bez jawnej ścieżki eskalacji' });
  }

  return findings;
}

function main() {
  const file = process.argv[2];
  if (!file) { process.stderr.write('usage: workflow-lint.js <workflow-script.js>\n'); process.exit(2); }
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { process.stderr.write(`cannot read ${file}: ${e.message}\n`); process.exit(2); }

  const findings = lint(src);
  for (const f of findings) {
    process.stdout.write(`  ${f.level === 'ERROR' ? '🛑' : '⚠️ '} [${f.id}] ${f.line ? `L${f.line}: ` : ''}${f.msg}\n`);
  }
  const errors = findings.filter((f) => f.level === 'ERROR').length;
  process.stdout.write(errors
    ? `\n🛑 LINT FAILED (${errors} error) — NIE uruchamiaj Workflow; popraw skrypt.\n`
    : `\n✅ LINT OK${findings.length ? ` (${findings.length} warn)` : ''} — skrypt zgodny z regułami orchestrate-ddd.\n`);
  process.exit(errors ? 1 : 0);
}

if (require.main === module) main();
module.exports = { lint };
