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
 *   WL6 (WARN)   `git diff` bez --stat/--name-only/--numstat — pierwszy live end-to-end
 *                przebieg (juz-ide-api-1, 2026-07-04): pełny diff Domain (~3191 linii)
 *                wklejony w całości do promptu implementera Application zjadł budżet tury,
 *                2× pusty wynik z rzędu. Wstrzykuj tylko listę plików, niech agent Read sam.
 *   WL7 (WARN)   tsc/typecheck wygląda na punkt listy WEWNĄTRZ prompta implementera (proza,
 *                nieegzekwowalne), nie osobny dedykowany krok PRZED verify (juz-ide-api-2,
 *                2026-07-08, TS-PRICING-RADIUS-TIER-002): "tsc --noEmit bez nowych błędów" było
 *                punktem 4 listy kryteriów w prompt-cie implementera infra-consumers — nigdy nie
 *                uruchomione jako osobny krok. 4 nowe błędy TS + martwa deklaracja
 *                (isLocationInAdminBoundary) przeszły przez code-quality-verifier (poza jego
 *                zakresem — sprawdza wzorce, NIE kompiluje) aż do security-e2e-verifier.
 *   WL8 (WARN)   ciężki blok kontekstu kodu (np. EXISTING_INFRA/DECISIONS/PATTERNS) wstrzyknięty
 *                do warstwy, której `dirs` to WYŁĄCZNIE dokumentacja/config (juz-ide-api-2,
 *                2026-07-08): warstwa infra-docs dostała ten sam ciężki blok co warstwy kodu —
 *                agent zinterpretował to jako zachętę do re-audytu (30×Read + 21×Bash, ZERO
 *                Write) zamiast pisania 3 plików Markdown; maxTurns cliff.
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

  // WL6 — pełny `git diff` (bez --stat/--name-only/--numstat) wstrzyknięty do promptu warstwy N
  // (incydent 2026-07-04: diff ~3191 linii przeciążył budżet tury implementera, 2× pusty wynik)
  for (const s of snippetsOf(src, 'git diff')) {
    const line = s.text.slice(0, s.text.indexOf('\n') !== -1 ? s.text.indexOf('\n') : 120);
    if (!/--stat|--name-only|--numstat/.test(line)) {
      findings.push({ id: 'WL6', level: 'WARN', line: s.line, msg: 'git diff bez --stat/--name-only/--numstat — pełny tekst diffa jako input promptu przeciąża budżet tury implementera kolejnej warstwy; wstrzykuj listę plików, niech agent Read sam (incydent 2026-07-04)' });
    }
  }

  // WL7 — tsc/typecheck wygląda na punkt listy WEWNĄTRZ prompta implementera (proza), nie osobny
  // dedykowany krok PRZED verify (incydent 2026-07-08, juz-ide-api-2: patrz komentarz nagłówka).
  {
    const tscMarkers = [...snippetsOf(src, 'tsc'), ...snippetsOf(src, 'typecheck'), ...snippetsOf(src, 'type-check')];
    const hasDedicatedStep = /label\s*:\s*['"`][^'"`]{0,60}(tsc|typecheck|type-check)/i.test(src)
      || /phase\(\s*['"`][^'"`]{0,60}(tsc|typecheck|type-check)/i.test(src);
    if (!hasDedicatedStep) {
      const buried = tscMarkers.filter((s) => /\n\s*\d+\.\s/.test(src.slice(Math.max(0, s.at - 300), s.at)));
      if (buried.length) {
        findings.push({ id: 'WL7', level: 'WARN', line: buried[0].line, msg: 'tsc/typecheck wygląda na punkt listy wewnątrz prompta implementera (proza) — dodaj osobne wywołanie agent() z label zawierającym "typecheck" PRZED verify; code-quality-verifier nie kompiluje kodu (incydent 2026-07-08, juz-ide-api-2)' });
      }
    }
  }

  // WL8 — ciężki blok kontekstu kodu wstrzyknięty do warstwy, której `dirs` to wyłącznie
  // dokumentacja/config (incydent 2026-07-08, juz-ide-api-2: patrz komentarz nagłówka).
  {
    const dirsDecl = /const\s+\w*[Dd]irs\s*=\s*\[([^\]]*)\]/g;
    let m;
    while ((m = dirsDecl.exec(src))) {
      const raw = m[1];
      // string literals ('docs/x.md') LUB referencje do właściwości (FILES.geoDomainDoc) — realny
      // skrypt juz-ide-api-2 używał `infraDocsDirs = [FILES.geoDomainDoc, FILES.tokenEconomyDoc, ...]`,
      // nie inline stringów; bez tego fallbacku reguła by go nie złapała.
      const quoted = raw.match(/['"`][^'"`]+['"`]/g) || [];
      const idents = raw.match(/[A-Za-z_$][\w.$]*/g) || [];
      if (!quoted.length && !idents.length) continue;
      const touchesCode = quoted.some((e) => /\.(ts|tsx|js|jsx)['"`]/i.test(e))
        || idents.some((e) => /\b(src|handler|controller|service|repository|aggregate)\b/i.test(e));
      const looksDocsOnly = !touchesCode && (
        quoted.some((e) => /\.(md|ya?ml|json)['"`]|docs\//i.test(e))
        || (quoted.length === 0 && idents.length > 0 && idents.every((e) => /doc/i.test(e)))
      );
      if (!looksDocsOnly) continue;
      const window = src.slice(m.index, m.index + 4000);
      const hasHeavyBlock = /EXISTING_INFRA|DECISIONS\b|PATTERNS\b/.test(window);
      const hasMitigation = /ZAKAZ|NIE czytaj|NIE grepuj|NIE weryfikuj.{0,20}kod|already implemented|już zaimplementowane/i.test(window);
      if (hasHeavyBlock && !hasMitigation) {
        findings.push({ id: 'WL8', level: 'WARN', line: src.slice(0, m.index).split('\n').length, msg: 'warstwa z dirs wyłącznie docs/config dostaje ciężki blok kontekstu kodu bez terse-wariantu z jawnym zakazem eksploracji (src/) — ryzyko re-audytu zamiast pisania (incydent 2026-07-08, juz-ide-api-2: 30×Read+21×Bash, ZERO Write)' });
      }
    }
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
