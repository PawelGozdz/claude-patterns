#!/usr/bin/env node
/**
 * workflow-lint.js — deterministyczny lint skryptu Workflow dla /orchestrate.
 *
 * NIE jest hookiem — to CLI. Mieszka w hooks/, bo ten katalog jest symlinkowany
 * globalnie (~/.claude/hooks/), więc każdy projekt woła:
 *   node "$HOME/.claude/hooks/workflow-lint.js" <plik-skryptu-workflow.js>
 *
 * Zamienia reguły-prozę z commands/orchestrate.md w twardą bramkę (eval L1, D7).
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

 *   WL11 (ERROR) wynik parallel()/pipeline() użyty bez guardu na null (juz-ide-api-2,
 *                2026-08-14, wf_23029d51-3a2, TS-GEO-QUERY-KERNEL-002a): `const [cat1, cat2,
 *                fix2] = await parallel([...])` i zaraz `if (cat1.status === 'GO')` — jeden
 *                thunk zmarł, parallel oddał na jego miejscu null, skrypt padł na
 *                `null is not an object (evaluating 'cat1.status')` po 22,5 minutach i 9
 *                agentach. Opis narzędzia Workflow mówi to wprost („filter with .filter(Boolean)"),
 *                ale proza nie jest bramką. Guard albo .filter(Boolean) — zawsze.
 *   WL12 (ERROR) agent-PRODUCENT bez schema, którego wynik jest wklejany do kolejnego promptu
 *                (ten sam przebieg): 6 z 17 zwrotów agentów to pusty string, bo agent kończy
 *                turę wywołaniem narzędzia, a nie tekstem. Najdroższy przypadek: konsultacja
 *                @geo-postgres-specialist (27 wywołań narzędzi, ~9,3k output) zwróciła "" —
 *                i ta pustka poszła do TRZECH kolejnych promptów, które miały się na niej
 *                oprzeć. Autor skryptu obchodził to prozą („Zakoncz odpowiedz zwyklym
 *                tekstem", 3× w różnych miejscach) — nieskutecznie. Jedyny niezawodny zwrot
 *                to schema.
 *   WL14 (ERROR) agent({schema}) poza blokiem try/catch (juz-ide-api-1, 2026-08-14,
 *                wf_d4b19f61-68c, TS-TOKEN-TOPUP-001): `agent()` ZE SCHEMĄ nie zwraca null, gdy
 *                subagent skończy bez StructuredOutput — RZUCA. Skrypt bronił się wzorowo przed
 *                nullem (`if (!impl)`, `if (!verify)`, retry 3×, ESCALATE), miał sondy i twarde
 *                maxTurns, i mimo to padł: implementer warstwy Domain przepracował 95 tur / 59
 *                wywołań narzędzi bez ani jednego StructuredOutput, wyjątek poleciał na samą górę
 *                i cały przebieg dostał status `failed` po 7,4 min — zamiast ESCALATE_AND_HALT ze
 *                stanem częściowym. W całym pliku było ZERO `try {`. Instrukcja w prompcie („gdy
 *                budżet się kończy, oddaj stan częściowy") tam BYŁA i nie wystarczyła — proza nie
 *                jest siatką bezpieczeństwa. To lustrzane odbicie WL12: bez schemy agent gubi dane
 *                po cichu, ze schemą wywraca przebieg. Obie ścieżki wymagają obsługi.
 *   WL13 (WARN)  prompt weryfikatora każe uruchomić typecheck/testy, choć skrypt ma osobny
 *                krok sondy (ten sam przebieg): 48 typechecków i 43 uruchomienia testów w
 *                jednym przebiegu, bo implementer robi swoje, a verifier to samo drugi raz.
 *                Każde `pnpm test:integration` wraca z 16-23 KB, które zostają w kontekście
 *                i są przeliczane w każdej następnej turze. Podaj verifierowi wynik sondy
 *                jako FAKT i zabroń ponawiania.

 *   WL15 (WARN)  jednostka DOPISUJĄCA testy/kontrole, której sonda nie mierzy przyrostu
 *                bloków wykonywalnych (juz-ide-api-4, 2026-08-14, wf_69187830-205, Faza 5):
 *                implementer trzy razy wyczerpał budżet bez StructuredOutput, za trzecim
 *                razem zdążył dopisać 133 linie — SAMYCH KOMENTARZY opisujących Check D i
 *                Check E zamiast ich implementacji. Sonda przepuściła: komentarze się
 *                kompilują (tsc pass) i nie czerwienią żadnego istniejącego testu
 *                (605/605 pass), a diff był niepusty. Bramka "zielono + niepusty diff" jest
 *                spełnialna prozą. Fabrykacja przeciekła do security-gaps.md i TECH-DEBT.md
 *                jako "naprawione", zanim złapał ją drogi code-quality-verifier w ostatniej
 *                dopuszczalnej próbie. Lek jest dalej deterministyczny, nie LLM-owy:
 *                `git diff --cached -U0 | grep -cE '^\+\s*(it|test|describe)\('`.
 *   WL16 (WARN)  ślepy retry implementera po cichej śmierci bez diff-sondy — cichy zgon
 *                zwykle znaczy "praca wykonana, budżet spalony na oddaniu wyniku"
 *                (TS-TOKEN-TOPUP-001/A2, api-1, 2026-08-14: kod kompletny + typecheck pass,
 *                a skrypt spalił drugą pełną próbę i eskalował). Po nullu: tania sonda
 *                `git diff --name-only`, przy niepustym diffie → verify-existing (§2a′ p. 6a).
 *
 * 2026-09-01 (TS-ARCH-HANDLER-CONTRACT-001 faza 5, juz-ide-api-3): trzy fałszywe alarmy na
 * celowo SEKWENCYJNYM skrypcie, dwa blokujące — (a) WL2 strzelił w KOMENTARZ „zero
 * parallel()/pipeline()"; (b) WL2 uznał runImplementAgent() (7 linii ciała) za
 * verifier-helper, bo „ciałem" funkcji było sztywne okno 4000 znaków połykające NASTĘPNE
 * funkcje w pliku; (c) WL4 nie widział `schema:` schowanej za promptem dłuższym niż
 * 600-znakowy snippet. Od tej zmiany: reguły regexowe działają na źródle z WYMAZANYMI
 * komentarzami (stripComments — WL9 parsuje oryginał), ciało funkcji wyznacza parowanie
 * nawiasów (fnBodyAt), a call-site agent()/helpera obejmuje CAŁE wywołanie (exactCall).
 *
 * Exit: 0 = czysto lub tylko WARN · 1 = ERROR (NIE uruchamiaj Workflow) · 2 = zły input.
 */

const fs = require('fs');

function snippetsOf(src, marker, len = 600) {
  const out = [];
  let idx = 0;
  while ((idx = src.indexOf(marker, idx)) !== -1) {
    out.push({ at: idx, text: src.slice(idx, idx + len), line: src.slice(0, idx).split('\n').length });
    idx += marker.length;
  }
  return out;
}

// Wymazuje komentarze (// i /* */) SPACJAMI — długość i numery linii bez zmian, stringi
// i template literale (wraz z zagnieżdżeniem ${}) nietknięte. Reguły WL1-WL16 to regexy na
// tekście: komentarz „zero parallel()" w sekwencyjnym skrypcie blokował przebieg (WL2,
// juz-ide-api-3, 2026-09-01). Świadome ograniczenie: literały regexowe nie są rozpoznawane —
// gołe `//` wewnątrz klasy znaków regexa wymazałoby resztę linii; w skryptach workflow ten
// kształt praktycznie nie występuje, a skutkiem byłaby co najwyżej cisza reguły (fail-open).
function stripComments(src) {
  const out = src.split('');
  let i = 0;
  let quote = null; // null = kod · '"' `'` '`' = wnętrze literału
  const tmplBraces = []; // głębokość klamr per otwarte ${…} (powrót do template przy 0)
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (quote === null) {
      if (c === '/' && d === '/') {
        while (i < src.length && src[i] !== '\n') out[i++] = ' ';
        continue;
      }
      if (c === '/' && d === '*') {
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] !== '\n') out[i] = ' ';
          i++;
        }
        if (i < src.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
      if (tmplBraces.length) {
        if (c === '{') tmplBraces[tmplBraces.length - 1]++;
        else if (c === '}') {
          if (tmplBraces[tmplBraces.length - 1] === 0) { tmplBraces.pop(); quote = '`'; i++; continue; }
          tmplBraces[tmplBraces.length - 1]--;
        }
      }
      i++;
      continue;
    }
    if (c === '\\') { i += 2; continue; }
    if (quote === '`' && c === '$' && d === '{') { tmplBraces.push(0); quote = null; i += 2; continue; }
    if (c === quote) quote = null;
    i++;
  }
  return out.join('');
}

// Rzeczywiste ciało funkcji od indeksu jej deklaracji: sparuj nawiasy parametrów, potem
// klamry ciała. Zastępuje sztywne okna (600/4000 znaków), które „ciałem" krótkiej funkcji
// czyniły także NASTĘPNE funkcje w pliku — tak runImplementAgent() został verifier-helperem
// (WL2, juz-ide-api-3, 2026-09-01). null przy niedomkniętych nawiasach/przekroczonym capie —
// wołający wraca wtedy do starego okna (fałszywy alarm możliwy, ale nie gorszy niż dotąd).
function fnBodyAt(src, declIndex, cap = 20000) {
  const paren = src.indexOf('(', declIndex);
  if (paren === -1) return null;
  let depth = 0, i = paren;
  for (; i < src.length && i < paren + 2000; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) break;
  }
  if (depth !== 0) return null;
  const braceZone = src.slice(i, i + 40);
  const rel = braceZone.indexOf('{');
  if (rel === -1) {
    const nl = src.indexOf('\n', i); // arrow z ciałem-wyrażeniem: do końca linii
    return src.slice(declIndex, nl === -1 ? src.length : nl);
  }
  const open = i + rel;
  depth = 0;
  for (let j = open; j < src.length && j < open + cap; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(declIndex, j + 1);
  }
  return null;
}

// Pełny tekst wywołania od `name(` do sparowanego `)`. null, gdy nawiasy się nie domykają
// w capie (np. nadmiar ')' w prozie prompta) — wołający zostaje przy przyciętym snippecie.
function exactCall(src, at, cap = 6000) {
  const open = src.indexOf('(', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length && i < open + cap; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(at, i + 1);
  }
  return null;
}

// Nazwy funkcji owijających agent() — `ask`, `safeAgent`, cokolwiek. Wzorzec z
// commands/orchestrate.md §2a (helper sprowadzający wyjątek do nulla) jest ZALECANY, ale sprawia,
// że reguły szukające dosłownego `agent(` przestają widzieć wywołania: w skrypcie api-2
// (2026-08-14) trzy wywołania szły przez `ask(`, jedyne `agent(` siedziało w helperze — i WL1,
// WL4, WL10 oraz WL13 zamilkły komplet. Implementer dostał wtedy schema z polem `verdict`
// (self-ocena, incydent wf_8f8aeeb3) i nic tego nie zgłosiło. Reguły muszą widzieć OBIE formy.
function agentHelperNames(src) {
  const names = [];
  const declRe = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
  let m;
  while ((m = declRe.exec(src))) {
    const name = m[1] || m[2];
    if (!name || name === 'agent') continue;
    const body = fnBodyAt(src, m.index) || src.slice(m.index, m.index + 600);
    if (/\bawait\s+agent\s*\(/.test(body)) names.push(name);
  }
  return [...new Set(names)];
}

function lint(src) {
  const findings = [];
  // Wszystkie miejsca wywołania agenta: bezpośrednie i przez owijkę.
  const callSites = (source) => {
    const out = snippetsOf(source, 'agent(');
    for (const h of agentHelperNames(source)) out.push(...snippetsOf(source, h + '('));
    for (const s of out) {
      const exact = exactCall(source, s.at);
      if (exact) { s.text = exact; s.exact = true; }
    }
    return out.sort((a, b) => a.at - b.at);
  };
  // Tekst wywołania do klasyfikacji: pełne wywołanie (exactCall — schema po długim prompcie
  // JEST widoczna), a przy niedomkniętych nawiasach stare zachowanie: snippet przycięty do
  // pierwszego '})', żeby nie połykał sąsiednich wywołań.
  const callText = (s) => {
    if (s.exact) return s.text;
    const end = s.text.indexOf('})');
    return end === -1 ? s.text : s.text.slice(0, end + 2);
  };

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

  // Od tego miejsca reguły widzą źródło BEZ komentarzy (pozycje i numery linii bez zmian) —
  // komentarz to nie kod i nie ma prawa triggerować reguły (incydent 2026-09-01: WL2 na
  // „zero parallel()" w nagłówku sekwencyjnego skryptu). WL9 wyżej parsował oryginał.
  src = stripComments(src);

  const isVerifyish = (t) => /verif|final[_\s-]?gate|security[-_]e2e/i.test(t);

  // Producent danych ≠ implementer. Rozróżnienie wprowadzone po wf_23029d51-3a2 (2026-08-14):
  // WL1 karało KAŻDĄ schema poza verify, więc pchało autorów skryptów do zostawiania
  // konsultantów/analityków bez schema — a to jedyna rzecz, która gwarantuje niepusty zwrot
  // (patrz WL12). Zakaz z WL1 dotyczy SELF-OCENY („czy zrobiłem dobrze"), nie zwracania faktów
  // („co zmieniłem"). Implementer oceniający własną pracę to wf_8f8aeeb3; implementer zwracający
  // listę plików to zwykły, potrzebny protokół.
  const isImplementish = (t) => /implement|impl-|scaffold|migrat|fix-|-fix|writer|autor/i.test(t);

  // SONDA — tani krok, który tylko URUCHAMIA deterministyczne bramki (typecheck/testy/lint)
  // i oddaje ich wynik przez schema. Bywa w fazie 'Verify', więc isVerifyish() klasyfikuje ją
  // jako weryfikatora i reguły WL7/WL13 strzelają w kanoniczny kształt zamiast w błąd. Sonda
  // NIE ocenia, więc nie podlega ani zakazowi self-oceny (WL1), ani wymogom stawianym verify.
  // Rozpoznanie sondy musi obejmować formy, w jakich realnie występuje — inaczej reguły
  // WL7/WL10/WL13 strzelają w kanoniczny kształt zamiast w błąd (juz-ide-api-4, 2026-08-14:
  // sonda w helperze `async function probe(label)` z shorthandem `{ label, phase: 'Verify' }`
  // i schematem PROBE_SCHEMA dostała dwa fałszywe alarmy — WL13 zarzucił jej uruchamianie
  // typechecku, czyli robienie dokładnie tego, po co istnieje):
  //   • label jawny ('foo-checks') LUB przekazany zmienną (shorthand `{ label, ... }`),
  //   • nazwa schematu z PROBE/CHECK/DIFF (PROBE_SCHEMA, CHECKS_SCHEMA, DIFF_PROBE_SCHEMA),
  //   • `effort: 'low'` — weryfikator nigdy nie jest tani; sonda zawsze,
  //   • wywołanie wewnątrz funkcji o nazwie probe/check/sonda.
  const PROBE_PROMPT = /NIC nie czytaj|nie analizuj, nie poprawiaj|do not read|nothing else/i;
  const isProbeish = (t) => /label\s*:[^,\n]{0,80}(checks?|probe|sonda|typecheck|gate-?check)/i.test(t)
    || /schema\s*:\s*[A-Za-z_$][\w$]*(PROBE|CHECK|DIFF)[\w$]*/i.test(t)
    || /typecheck\s*:\s*\{/.test(t)
    || /effort\s*:\s*['"`]low['"`]/.test(t)
    || PROBE_PROMPT.test(t);

  // Wywołanie ukryte w helperze: nazwa najbliższej wcześniejszej deklaracji funkcji.
  const enclosingFn = (at) => {
    const before = src.slice(0, at);
    const m = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
    let last = null, x;
    while ((x = m.exec(before))) last = x[1] || x[2];
    return last;
  };
  const inProbeFn = (at) => /probe|check|sonda/i.test(enclosingFn(at) || '');
  const SELF_GRADE_FIELD = /\b(verdict|status|passed|success|ok|compliant|quality|score|approved)\s*:/i;

  // WL1 — schema tylko na verify/final gate. callText() daje pełne wywołanie (bez sąsiadów);
  // dawne przycinanie do '})' na 600-znakowym snippecie gubiło `schema:` za długim promptem
  // i WL4 fałszywie alarmował (juz-ide-api-3, 2026-09-01).
  for (const s of callSites(src)) {
    const t = callText(s);
    if (/schema\s*:/.test(t) && !isVerifyish(t) && isImplementish(t)) {
      // Sama obecność schema już nie wystarcza — dopiero schema z polem OCENIAJĄCYM. Nazwę
      // schematu rozwijamy do jego definicji (`schema: FOO_SCHEMA` → `const FOO_SCHEMA = {...}`),
      // bo realne skrypty nie wstawiają obiektu inline.
      const ref = /schema\s*:\s*([A-Za-z_$][\w$]*)/.exec(t);
      let body = t;
      if (ref) {
        const def = new RegExp('(?:const|let|var)\\s+' + ref[1] + '\\s*=\\s*\\{').exec(src);
        if (def) {
          // Domknięcie TEGO consta znajdź licząc głębokość nawiasów od jego otwierającego '{' —
          // niezależnie od wcięcia i zagnieżdżenia. Historia dwóch złych podejść: sztywne okno
          // 900 znaków połykało SĄSIEDNI schemat z legalnym `verdict:` (2026-08-14,
          // TS-TOKEN-TOPUP-001); indexOf('\n}') naprawiał to tylko dla definicji top-level,
          // a dla zagnieżdżonych skanował do pierwszego '}' w kolumnie 0 — czyli do końca
          // NIEZWIĄZANEJ funkcji dalej w pliku (review 2026-08-15, empirycznie potwierdzone).
          const open = src.indexOf('{', def.index);
          let depth = 0, end = -1;
          for (let i = open; i !== -1 && i < src.length && i < open + 4000; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}' && --depth === 0) { end = i; break; }
          }
          body = end === -1 ? src.slice(def.index, def.index + 900) : src.slice(def.index, end + 1);
        }
      }
      if (SELF_GRADE_FIELD.test(body)) {
        findings.push({ id: 'WL1', level: 'ERROR', line: s.line, msg: 'implementer zwraca schema z polem OCENIAJĄCYM własną pracę (verdict/status/passed/...) — sukces implementacji mierzy bramka git-diff i niezależny verifier, nie self-report (incydent wf_8f8aeeb3). Schema z samymi FAKTAMI (changed_files, summary, notes) jest w porządku i zalecana — patrz WL12.' });
      }
    }
    if (isVerifyish(t) && !/schema\s*:/.test(t) && /agentType|code-quality|security-e2e/i.test(t)) {
      findings.push({ id: 'WL4', level: 'WARN', line: s.line, msg: 'wywołanie weryfikatora bez schema — null nie odróżni "agent umarł" od złego wyniku' });
    }
  }

  // WL2 — weryfikator nigdy w parallel(). Regex na treści `parallel(` łapie tylko wywołania
  // WPISANE wprost; realny skrypt (wf_23029d51-3a2) chował verify w funkcji `runUnit(...)`
  // wołanej z parallel() i przechodził na zielono, mając 3 równoległe verify. Dlatego najpierw
  // zbieramy nazwy funkcji, które SAME wołają weryfikatora, i traktujemy je jak verify.
  const verifierHelpers = [];
  {
    const declRe = /(?:async\s+function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\()/g;
    let d;
    while ((d = declRe.exec(src))) {
      const name = d[1] || d[2];
      if (!name) continue;
      // Realne ciało (parowanie klamr), nie sztywne okno — okno 4000 znaków robiło
      // z 7-liniowego runImplementAgent() verifier-helpera, bo połykało NASTĘPNE
      // funkcje z verify w środku (juz-ide-api-3, 2026-09-01).
      const body = fnBodyAt(src, d.index) || src.slice(d.index, d.index + 4000);
      if (/agent\s*\(/.test(body) && isVerifyish(body)) verifierHelpers.push(name);
    }
  }
  for (const s of snippetsOf(src, 'parallel(')) {
    const viaHelper = verifierHelpers.find((n) => new RegExp('\\b' + n + '\\s*\\(').test(s.text));
    if (isVerifyish(s.text) || viaHelper) {
      findings.push({ id: 'WL2', level: 'ERROR', line: s.line, msg: viaHelper
        ? `weryfikator wewnątrz parallel() — ukryty w funkcji ${viaHelper}(), która sama woła verify; verify ZAWSZE sekwencyjnie (CONFORMANCE §3: 9/9 martwych wywołań)`
        : 'weryfikator wewnątrz parallel() — verify ZAWSZE sekwencyjnie (CONFORMANCE §3: 9/9 martwych wywołań)' });
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
      findings.push({ id: 'WL6', level: 'WARN', line: s.line, msg: 'git diff bez --stat/--name-only/--numstat — pełny tekst diffa ląduje w kontekście i jest przeliczany w KAŻDEJ kolejnej turze agenta. Dotyczy obu wariantów: diffa wstrzykniętego do promptu (incydent 2026-07-04: ~3191 linii, 2× pusty wynik) i diffa, który agent zrobi sam na Twoje polecenie (wf_23029d51-3a2: `git diff -- spatial-column.types.ts` = 21 KB, ten sam diff guardiana 3× po 14,5 KB). Proś o --stat, a treść niech czyta Read na konkretnym pliku' });
    }
  }

  // WL7 — tsc/typecheck wygląda na punkt listy WEWNĄTRZ prompta implementera (proza), nie osobny
  // dedykowany krok PRZED verify (incydent 2026-07-08, juz-ide-api-2: patrz komentarz nagłówka).
  {
    const tscMarkers = [...snippetsOf(src, 'tsc'), ...snippetsOf(src, 'typecheck'), ...snippetsOf(src, 'type-check')];
    // Label sondy to zwykle konkatenacja (`label: unitId + '-checks'`), więc wzorzec „cudzysłów
    // zaraz po label:" jej nie widzi — stąd druga, luźniejsza alternatywa i wariant po schemacie.
    const hasDedicatedStep = /label\s*:\s*['"`][^'"`]{0,60}(tsc|typecheck|type-check)/i.test(src)
      || /phase\(\s*['"`][^'"`]{0,60}(tsc|typecheck|type-check)/i.test(src)
      || /label\s*:[^,\n]{0,80}(checks?|probe|sonda|gate-?check)/i.test(src)
      || /typecheck\s*:\s*\{/.test(src)
      || /(?:async\s+)?function\s+\w*(probe|check)\w*\s*\(/i.test(src)
      || /schema\s*:\s*[A-Za-z_$][\w$]*(PROBE|CHECK)[\w$]*/i.test(src);
    if (!hasDedicatedStep) {
      // `(?:\n|\\n)` — w źródle skryptu prompty są jednoliniowymi literałami z ESCAPOWANYM
      // '\n' (dwa znaki), a nie realnym końcem linii. Sam /\n/ dawał fałszywy negatyw: skrypt
      // wf_23029d51-3a2 miał '3. pnpm typecheck.' w prozie prompta verifiera i przeszedł czysto.
      const buried = tscMarkers.filter((s) => {
        const before = src.slice(Math.max(0, s.at - 300), s.at);
        // numerowana lista kryteriów ALBO proza rozkazująca („Na koniec uruchom pnpm typecheck")
        // — wf_23029d51-3a2 używał tej drugiej formy we wszystkich 6 jednostkach i przechodził
        // czysto, choć typecheck nigdy nie był osobnym, mierzalnym krokiem.
        return /(?:\n|\\n)\s*\d+\.\s/.test(before)
          || /(na\s+koniec|na\s+ko\u0144cu|uruchom|odpal)\b[^.]{0,80}$/i.test(before);
      });
      if (buried.length) {
        findings.push({ id: 'WL7', level: 'WARN', line: buried[0].line, msg: 'tsc/typecheck jest poleceniem w prozie prompta, a nie osobnym mierzalnym krokiem — dodaj SONDĘ: agent() z label zawierającym "typecheck"/"checks", effort: low i schema {typecheck, tests, tail}, uruchamianą RAZ przed verify, a jej wynik wstrzyknij verifierowi jako fakt (patrz WL13). Proza jest nieegzekwowalna: code-quality-verifier nie kompiluje kodu (incydent 2026-07-08), a gdy kompiluje — robi to drugi raz po implementerze (wf_23029d51-3a2: 48 typechecków w jednym przebiegu)' });
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
      const agentCalls = callSites(src);
      agentCalls.forEach((s, i) => {
        const t = callText(s);
        if (!(/schema\s*:/.test(t) && isVerifyish(t)) || isProbeish(t) || inProbeFn(s.at)) return;
        const windowEnd = agentCalls[i + 1] ? agentCalls[i + 1].at : src.length;
        if (!hasBoth(src.slice(s.at, windowEnd))) {
          findings.push({ id: 'WL10', level: 'WARN', line: s.line, msg: 'agent({schema}) weryfikatora bez twardego limitu narzędzi + frazy "wydaj werdykt natychmiast gdy budżet się kończy" — verifier może wyczerpać budżet tur eksploracją i skończyć BEZ StructuredOutput (twardy Error, status: failed całego Workflow, wymaga resume). Użyj kanonicznego buildVerifierPrompt() zamiast ręcznego promptu per-warstwa (incydent TS-REP-PIPELINE-001-F3a-remediation, juz-ide-api-1, 2026-07-19)' });
        }
      });
    }
  }

  // WL11 — wynik parallel()/pipeline() użyty bez guardu na null (wf_23029d51-3a2, 2026-08-14).
  // parallel() NIGDY nie rzuca: thunk, który padł, zostaje w tablicy jako null. Skrypt sięgnął
  // po `cat1.status` i wywrócił cały przebieg po 22,5 min. Dwa akceptowane kształty obrony:
  // guard na zmiennej (`!cat1`, `cat1?.`, `cat1 &&`) albo `.filter(Boolean)` na wyniku.
  {
    const GUARDED = (name) => new RegExp(
      '!\\s*' + name + '\\b'
      + '|' + name + '\\s*\\?\\.'
      + '|' + name + '\\s*&&'
      + '|' + name + '\\s*(?:===|==|!==|!=)\\s*null'
      + '|' + name + '\\s*\\?\\s'
      + '|\\b' + name + '\\s*\\|\\|'
    );
    const destructRe = /const\s*\[([^\]]+)\]\s*=\s*await\s+(parallel|pipeline)\s*\(/g;
    let m;
    while ((m = destructRe.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      const after = src.slice(m.index);
      for (const raw of m[1].split(',')) {
        const name = raw.trim().replace(/^\.\.\./, '');
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
        const dereferenced = new RegExp('\\b' + name + '\\.[A-Za-z_$]').test(after);
        if (dereferenced && !GUARDED(name).test(after)) {
          findings.push({ id: 'WL11', level: 'ERROR', line, msg: `\`${name}\` pochodzi z ${m[2]}() i jest dereferencjonowany bez guardu na null — thunk, który padł, wraca jako null, nie wyjątek; \`${name}.pole\` wywróci CAŁY przebieg (wf_23029d51-3a2: 22,5 min i 9 agentów w powietrze). Dodaj \`if (!${name} || ...)\` albo .filter(Boolean)` });
        }
      }
    }
    const assignRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+(parallel|pipeline)\s*\(/g;
    while ((m = assignRe.exec(src))) {
      const name = m[1];
      const after = src.slice(m.index);
      const iterated = new RegExp('\\b' + name + '\\s*\\.\\s*(map|forEach|flatMap|some|every|reduce|find)\\b').test(after);
      const filtered = new RegExp('\\b' + name + '[\\s\\S]{0,80}?filter\\s*\\(\\s*Boolean').test(after)
        || new RegExp('\\b' + name + '\\s*\\.\\s*filter\\s*\\(').test(after);
      if (iterated && !filtered) {
        findings.push({ id: 'WL11', level: 'ERROR', line: src.slice(0, m.index).split('\n').length, msg: `\`${name}\` to wynik ${m[2]}() iterowany bez .filter(Boolean) — pozycje po padniętych agentach są nullami i wysypią pierwszą operację, która ich dotknie` });
      }
    }
  }

  // WL12 — agent-PRODUCENT bez schema, którego wynik jest wklejany do kolejnego promptu.
  // Bez schema zwrotem jest tekst OSTATNIEJ wiadomości agenta; agent kończący turę wywołaniem
  // narzędzia oddaje "" (6/17 zwrotów w wf_23029d51-3a2, w tym cała konsultacja specjalisty,
  // wklejona potem do trzech promptów). Proza w prompcie („zakończ zwykłym tekstem") tego nie
  // egzekwuje — sprawdzone, było tam 3×.
  {
    const prodRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+agent\s*\(/g;
    let m;
    while ((m = prodRe.exec(src))) {
      const name = m[1];
      let opts = exactCall(src, m.index);
      if (!opts) {
        const call = src.slice(m.index, m.index + 3000);
        const end = call.indexOf('})');
        opts = end === -1 ? call : call.slice(0, end + 2);
      }
      if (/schema\s*:/.test(opts)) continue;
      const after = src.slice(m.index + m[0].length);
      const interpolated = new RegExp('(\\+\\s*' + name + '\\b|\\$\\{\\s*' + name + '\\b|\\b' + name + '\\s*\\+)').test(after);
      if (!interpolated) continue;
      const feedsAgent = /agent\s*\(/.test(after);
      if (feedsAgent) {
        findings.push({ id: 'WL12', level: 'ERROR', line: src.slice(0, m.index).split('\n').length, msg: `\`${name}\` to zwrot agenta BEZ schema wklejany do kolejnego promptu — agent kończący turę wywołaniem narzędzia oddaje pusty string i następny etap dostaje pustkę zamiast wejścia (wf_23029d51-3a2: 6/17 zwrotów puste, w tym cała konsultacja specjalisty). Dodaj schema z polami FAKTOGRAFICZNYMI (to nie jest self-ocena z WL1)` });
      }
    }
  }

  // WL13 — verifier ponawia typecheck/testy, które zrobiła już sonda albo implementer.
  // 48 typechecków i 43 uruchomienia testów w jednym przebiegu (wf_23029d51-3a2); każde
  // `pnpm test:integration` wraca z 16-23 KB, które zostają w kontekście i są przeliczane w
  // każdej następnej turze agenta. Wynik deterministycznej bramki podaje się jako FAKT.
  {
    const hasProbe = /label\s*:\s*[^,\n]{0,80}(check|gate|typecheck|probe|sonda)/i.test(src);
    if (hasProbe) {
      const agentCalls = callSites(src);
      agentCalls.forEach((s2, i) => {
        const t = callText(s2);
        if (!isVerifyish(t) || isProbeish(t) || inProbeFn(s2.at)) return;
        const windowEnd = agentCalls[i + 1] ? agentCalls[i + 1].at : src.length;
        const win = src.slice(s2.at, windowEnd);
        const ordersRun = /(uruchom|odpal|run)\b[\s\S]{0,160}(typecheck|tsc|vitest|pnpm test|jest)/i.test(win);
        const forbidsRerun = /nie\s+(uruchamiaj|odpalaj|powtarzaj)|do\s+not\s+re-?run|bez\s+ponown/i.test(win);
        if (ordersRun && !forbidsRerun) {
          findings.push({ id: 'WL13', level: 'WARN', line: s2.line, msg: 'prompt weryfikatora każe uruchomić typecheck/testy, choć skrypt ma osobny krok sondy — to samo polecenie wykonuje się drugi raz, a jego wyjście (16-23 KB) zostaje w kontekście i jest przeliczane w każdej kolejnej turze. Wstrzyknij wynik sondy jako fakt i dopisz „NIE uruchamiaj ich ponownie"' });
        }
      });
    }
  }

  // WL14 — agent({schema}) musi być osłonięty try/catch. Ze schemą brak StructuredOutput to
  // WYJĄTEK, nie null: guard `if (!x)` go nie złapie, a nieobsłużony wywraca cały Workflow
  // (status: failed, wymaga resume) zamiast ESCALATE ze stanem częściowym.
  // Parowanie try…catch tekstowo (bez AST): dla każdego `try {` bierzemy najbliższy późniejszy
  // `catch` — zagnieżdżone try/catch w skryptach workflow praktycznie nie występują, a nadmiarowo
  // szeroki przedział daje co najwyżej fałszywy NEGATYW (cisza), nigdy fałszywy alarm.
  {
    const ranges = [];
    const tryRe = /\btry\s*\{/g;
    let t;
    while ((t = tryRe.exec(src))) {
      const c = src.indexOf('catch', t.index);
      if (c !== -1) ranges.push([t.index, c]);
    }
    const covered = (at) => ranges.some(([a, b]) => at > a && at < b);
    for (const s2 of snippetsOf(src, 'agent(')) {
      const exact = exactCall(src, s2.at);
      if (exact) { s2.text = exact; s2.exact = true; }
      const t2 = callText(s2);
      if (!/schema\s*:/.test(t2)) continue;
      if (covered(s2.at)) continue;
      findings.push({ id: 'WL14', level: 'ERROR', line: s2.line, msg: 'agent({schema}) poza try/catch — ze schemą brak StructuredOutput RZUCA WYJĄTEK, nie zwraca null, więc guard `if (!wynik)` go nie złapie. Nieobsłużony kończy CAŁY Workflow jako failed zamiast ESCALATE ze stanem częściowym (wf_d4b19f61-68c: implementer przepracował 95 tur bez StructuredOutput i wywrócił przebieg po 7,4 min; w pliku było zero `try {`). Owiń w try/catch i potraktuj wyjątek jak NO_GO z powodem „brak StructuredOutput w budżecie"' });
    }
  }

  // WL15 — jednostka dopisująca testy/kontrole bez pomiaru PRZYROSTU bloków wykonywalnych.
  // Odpalamy tylko, gdy skrypt faktycznie zleca pisanie testów (agentType/label z 'test'
  // albo prompt mówiący o dopisaniu describe/it) — inaczej byłby to szum na każdym skrypcie
  // infrastrukturalnym.
  {
    // Sygnał musi być JEDNOZNACZNY. Pierwsza wersja używała `[^.]{0,120}`, co przeskakuje
    // przez końce linii i łapało przypadkowe zbitki ("dodaj wpis…" + "…spec.ts" dwie linie
    // niżej) — 5 z 7 historycznych skryptów dostawało WARN, w tym czysty final-gate bez
    // jednego test-implementera. Teraz: rola agenta albo rozkaz dopisania testu bez
    // przeskoku przez nową linię.
    const writesTests = /agentType\s*:\s*['"`][^'"`]*test[^'"`]*implementer/i.test(src)
      || /label\s*:[^,\n]{0,60}test[^,\n]{0,20}(impl|write|add)/i.test(src)
      || /(dopisz|napisz|dodaj)\s+(?:\w+\s+){0,3}(test|testy|describe|asercj|guardian)/i.test(src);
    if (writesTests) {
      const measuresDelta = /grep\s+-c|newTestBlocks|assertionsAdded|newAssertions|describe\\\(|it\\\(/.test(src)
        && /(grep|count|liczb|delta|przyrost|newTest|assertions)/i.test(src);
      if (!measuresDelta) {
        findings.push({ id: 'WL15', level: 'WARN', line: 0, msg: 'skrypt zleca dopisanie testów/kontroli, ale żadna bramka nie mierzy PRZYROSTU bloków wykonywalnych — "tsc pass + testy pass + niepusty diff" jest spełnialne samym komentarzem (wf_69187830-205: 133 dopisane linie opisujące Check D/E zamiast ich implementacji przeszły sondę i wyciekły do TECH-DEBT.md jako "naprawione"). Dodaj do sondy `git diff --cached -U0 | grep -cE \'^\\+\\s*(it|test|describe)\\(\'` i traktuj zero nowych bloków przy dużym diffie jako NO_GO (wzorzec: orchestrate.md §2a′ punkt 5)' });
      }
    }
  }

  // WL16 — ślepy retry implementera po cichej śmierci, bez diff-sondy. Cicha śmierć
  // (null/wyjątek bez StructuredOutput) najczęściej znaczy „praca WYKONANA, budżet spalony
  // na oddaniu wyniku", nie „praca niezrobiona". Incydent TS-TOKEN-TOPUP-001/A2 (api-1,
  // 2026-08-14): kod leżał kompletny w drzewie, typecheck pass, a skrypt spalił drugą pełną
  // próbę (~40 tur) i eskalował — ratunkiem była ręczna zamiana na verify-existing.
  // Forma błędu: pętla retry z licznikiem cichych zgonów (`++silent`/`silent >= 2`) albo
  // null-branch z `continue`, w skrypcie wołającym implementera — bez żadnej taniej sondy
  // stanu drzewa (--name-only/--numstat/status --short) i bez ścieżki verify-existing.
  {
    const retriesImplementer = /agentType\s*:\s*['"`][^'"`]*implementer/i.test(src)
      && (/\+\+\s*silent|silent\s*>=\s*\d/.test(src) || /if\s*\(\s*!\w+\s*\)\s*\{[\s\S]{0,300}?continue/.test(src));
    const probesDiff = /--name-only|--numstat|status --short|status -s\b|verifyExisting/i.test(src);
    if (retriesImplementer && !probesDiff) {
      const m = /\+\+\s*silent|silent\s*>=\s*\d|if\s*\(\s*!\w+\s*\)\s*\{/.exec(src);
      findings.push({ id: 'WL16', level: 'WARN', line: m ? src.slice(0, m.index).split('\n').length : 0, msg: 'retry implementera po cichej śmierci bez diff-sondy — cichy zgon zwykle znaczy „praca wykonana, budżet spalony na oddaniu wyniku", a ślepa powtórka pali drugą pełną próbę na gotowym kodzie (TS-TOKEN-TOPUP-001/A2, api-1, 2026-08-14: kod kompletny + typecheck pass, a skrypt eskalował po 2 próbach). Po nullu odpal tanią sondę `git diff --name-only` (haiku, effort low) i przy niepustym diffie jednostki idź do verify-existing zamiast re-implementacji (wzorzec: orchestrate.md §2a′ punkt 6a)' });
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
    : `\n✅ LINT OK${findings.length ? ` (${findings.length} warn)` : ''} — skrypt zgodny z regułami orchestrate.\n`);
  process.exit(errors ? 1 : 0);
}

if (require.main === module) main();
module.exports = { lint };
