// scripts/lib/script-minify.mjs — odchudza wyemitowany skrypt Workflow do limitu okna zatwierdzenia.
//
// Po co: Claude Code pokazuje skrypt w dialogu „Run a dynamic workflow?" tylko do 200 000 znaków
// (`maxUnits: 200000` w kodzie dialogu, wersja 2.1.322). Dłuższy skrypt = „approval is unavailable",
// jedyna opcja „No", a /orchestrate schodzi do trybu ręcznego (ORC-153) bez bramki, sond i telemetrii.
// Szablon ma ~197 KB, z czego ok. 40% to komentarze i wcięcia, a do tego dochodzą args (karty reguł).
//
// Co robi: (1) drukuje AST przez printer TypeScript z removeComments (komentarze znikają, kod jest
// ten sam z konstrukcji), (2) zdejmuje wcięcia linii, które NIE zaczynają się wewnątrz literału
// tekstowego (prompty w template literalach zostają bajt w bajt), (3) KONTROLUJE wynik: po ponownym
// sparsowaniu i wydrukowaniu musi wyjść dokładnie tekst z kroku 1. Rozjazd = zwraca null (wołający
// zostaje przy pełnym skrypcie i ostrzega), nigdy cicho zepsuty skrypt.
//
// Zero LLM, zero sieci. Wymaga `typescript` z tools/conformance/node_modules; brak = null z powodem.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Limit okna zatwierdzenia w znakach (Claude Code 2.1.322). Margines na narzut dialogu.
export const APPROVAL_LIMIT = 200000;
export const APPROVAL_MARGIN = 1000;

function loadTs() {
  const req = createRequire(import.meta.url);
  try { return req(join(REPO_ROOT, 'tools', 'conformance', 'node_modules', 'typescript')); }
  catch { return null; }
}

function parse(ts, text) {
  return ts.createSourceFile('script.mjs', text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
}

function print(ts, sf) {
  return ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(sf);
}

// Zakresy [start, end) literałów tekstowych: wnętrze nie może tracić wcięć ani pustych linii.
function literalRanges(ts, sf) {
  const ranges = [];
  (function walk(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)
      || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isRegularExpressionLiteral(n)) {
      ranges.push([n.getStart(sf), n.getEnd()]);
    }
    ts.forEachChild(n, walk);
  })(sf);
  return ranges.sort((a, b) => a[0] - b[0]);
}

function stripIndent(text, ranges) {
  let out = '';
  let ri = 0;
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? text.length : nl + 1;
    while (ri < ranges.length && ranges[ri][1] <= pos) ri++;
    const inLiteral = ri < ranges.length && ranges[ri][0] < pos && pos < ranges[ri][1];
    out += inLiteral ? text.slice(pos, lineEnd) : text.slice(pos, lineEnd).replace(/^ +/, '');
    pos = lineEnd;
  }
  return out;
}

// Zwraca { text } albo { text: null, reason }.
export function minifyScript(src) {
  const ts = loadTs();
  if (!ts) return { text: null, reason: 'brak typescript w tools/conformance/node_modules (npm install w tools/conformance)' };
  const printed = print(ts, parse(ts, src));
  const stripped = stripIndent(printed, literalRanges(ts, parse(ts, printed)));
  // Kontrola równoważności: ten sam tekst po ponownym sparsowaniu i wydrukowaniu.
  const again = print(ts, parse(ts, stripped));
  if (again !== printed) return { text: null, reason: 'kontrola równoważności AST nie przeszła (wydruk po minifikacji różni się od wzorca)' };
  return { text: stripped };
}
