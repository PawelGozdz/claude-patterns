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
 *   WL9 (ERROR)  realny SyntaxError w skrypcie — WL1-WL8 to regexy na tekście, nie parsują
 *                składni. Incydent (TS-SEC-ONBEHALF-001, juz-ide-api-3): nieescapowany backtick
 *                wewnątrz template literala (fragment promptu zawierający `npx vitest run`)
 *                dał realny SyntaxError, ale wszystkie regexowe reguły przeszły na zielono —
 *                złapane dopiero ręcznym `node -e "new Function(...)"` przed każdym resume.
 *                WL9 odpala to jako TWARDY, PIERWSZY krok, przed WL1-WL8 — sensowność reguł
 *                regexowych jest bez znaczenia, jeśli skrypt się w ogóle nie sparsuje.
 *   WL10 (WARN)  agent({schema}) w roli weryfikatora (verify/final-gate) bez twardego limitu
 *                narzędzi + frazy wymuszającej werdykt ("wydaj werdykt natychmiast gdy budżet
 *                się kończy") w prompt-cie. Incydent (TS-REP-PIPELINE-001-F3a-remediation,
 *                juz-ide-api-1, 2026-07-19): TRZY niezależne awarie tej klasy w jednym
 *                przebiegu — verify(Testing) bez limitu, surowy `cfg.scope` (imperatywna lista
 *                poleceń dla warstwy Docs) wstrzyknięty 1:1 do promptu weryfikatora zamiast
 *                deklaratywnych pytań kontrolnych, finalPrompt bez limitu — verifier wyczerpuje
 *                budżet tur eksploracją i kończy turę BEZ StructuredOutput → twardy `Error`,
 *                `status: failed` całego Workflow (gorsze niż ESCALATE — wymaga `resume`, nie
 *                tylko kontynuacji). Koszt: 4 podejścia, ~3.1M tokenów subagentów. Jeśli skrypt
 *                definiuje kanoniczny `buildVerifierPrompt(...)` i JEGO ciało ma oba markery,
 *                wszystkie wywołania przez tę funkcję liczą się jako pokryte razem (nie trzeba
 *                markerów w każdym call-site z osobna) — to jest zalecany kształt, nie ręczne
 *                dopisywanie limitu per-warstwa (dokładnie to zawiodło w incydencie).
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

  // WL9 — realny syntax-check, PRZED wszystkimi regexowymi regułami (incydent
  // TS-SEC-ONBEHALF-001: nieescapowany backtick w template literalu dał SyntaxError, a WL1-WL8
  // (regex na tekście) dały zielone światło). Dwie właściwości realnych skryptów Workflow, które
  // gołe `new Function(src)` fałszywie odrzuciłoby jako SyntaxError mimo poprawności:
  //  1. `await agent(...)` na najwyższym poziomie ciała (opis narzędzia Workflow: "runs in an
  //     async context — use await directly") — nielegalne w zwykłej, nie-async funkcji.
  //  2. `export const meta = {...}` jako wymagana pierwsza linia (spec narzędzia Workflow) —
  //     `export` jest nielegalny wewnątrz ciała funkcji (tylko na top-level modułu).
  // Naprawiamy oba: zdejmujemy `export ` (tekstowo, bezpiecznie — meta to PURE LITERAL, `const
  // meta = {...}` bez export parsuje się identycznie) i walidujemy resztę owiniętą w async arrow
  // function. `new Function` tylko PARSUJE przy konstrukcji, nigdy nie wykonuje `src`.
  try {
    const withoutExports = src.replace(/^export\s+/gm, '');
    // eslint-disable-next-line no-new-func
    new Function(`return (async () => {\n${withoutExports}\n})`);
  } catch (e) {
    findings.push({ id: 'WL9', level: 'ERROR', line: 0, msg: `SyntaxError: ${e.message} — skrypt się nie sparsuje, regexowe reguły WL1-WL8 poniżej są bez znaczenia dopóki to nie jest naprawione` });
    // Fatal — dalsze reguły operują na tekście założeniem "to jest poprawny JS"; skoro nie jest,
    // zwróć od razu zamiast ryzykować myślące-że-to-OK WARN/ERROR na złamanym skrypcie.
    return findings;
  }

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

  // WL10 — agent({schema}) w roli weryfikatora bez twardego limitu narzędzi + frazy wymuszającej
  // werdykt (incydent TS-REP-PIPELINE-001-F3a-remediation, juz-ide-api-1: patrz komentarz
  // nagłówka). Jeśli skrypt definiuje kanoniczny `buildVerifierPrompt(...)` i jego CIAŁO ma oba
  // markery, wszystkie wywołania przez tę funkcję liczą się jako pokryte razem — bez tego
  // backstopu każdy realny skrypt (który komponuje prompt raz, w jednej funkcji) fałszywie
  // dostawałby WARN na każdym call-site z osobna.
  {
    const BUDGET_RE = /\b(limit|budget|budżet)\b/i;
    const VERDICT_RE = /wyda[jć].{0,15}werdykt|issue.{0,15}verdict|emit.{0,15}verdict/i;
    const hasBoth = (t) => BUDGET_RE.test(t) && VERDICT_RE.test(t);

    const builderMatch = /(?:function\s+buildVerifierPrompt\s*\(|const\s+buildVerifierPrompt\s*=)/.exec(src);
    const builderCovers = builderMatch && hasBoth(src.slice(builderMatch.index, builderMatch.index + 4000));

    if (!builderCovers) {
      // Okno TYLKO do następnego `agent(` (nie stały stride) — inaczej krótki prompt bez markerów
      // fałszywie "pożycza" markery z NASTĘPNEGO, niepowiązanego wywołania dalej w skrypcie.
      const agentCalls = snippetsOf(src, 'agent(');
      agentCalls.forEach((s, i) => {
        const end = s.text.indexOf('})');
        const t = end === -1 ? s.text : s.text.slice(0, end + 2);
        if (!(/schema\s*:/.test(t) && isVerifyish(t))) return;
        const windowEnd = agentCalls[i + 1] ? agentCalls[i + 1].at : src.length;
        if (!hasBoth(src.slice(s.at, windowEnd))) {
          findings.push({ id: 'WL10', level: 'WARN', line: s.line, msg: 'agent({schema}) weryfikatora bez twardego limitu narzędzi + frazy "wydaj werdykt natychmiast gdy budżet się kończy" — verifier może wyczerpać budżet tur eksploracją i skończyć BEZ StructuredOutput (twardy Error, status: failed całego Workflow, wymaga resume). Użyj kanonicznego buildVerifierPrompt() zamiast ręcznego promptu per-warstwa (incydent TS-REP-PIPELINE-001-F3a-remediation, juz-ide-api-1, 2026-07-19)' });
        }
      });
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
