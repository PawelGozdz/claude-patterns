// body-rules.mjs — deterministic BODY-level rules for /conformance-check (no I/O, no git).
//
// check.mjs do tej pory sprawdzał tylko kształt klasy (`extends`, dekorator). Reguły z kart, które
// dotyczą CIAŁA pliku — „handler komendy nie rzuca", „handler komendy nie importuje BullMQ" —
// nie miały żadnego mechanicznego strażnika, więc przechodziły przez weryfikatora-LLM
// (juz-ide-api-1, TS-SEC-D0-BETA-HARDENING-001: 12 `throw` w ChangePasswordHandler, ukrytych
// w prywatnej metodzie, oraz `@InjectQueue` w dwóch handlerach komend).
//
// Moduł jest czysty: dostaje ścieżkę, źródło i reguły, zwraca ustalenia. Baseline z gita i
// ratchet siedzą w baseline.mjs, żeby ten plik dało się testować bez repozytorium.
import ts from "typescript";
import { createHash } from "node:crypto";

const norm = (s) => s.replace(/\s+/g, " ").trim();
const short = (s, n = 110) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const hash8 = (s) => createHash("sha1").update(s).digest("hex").slice(0, 8);

const FN_LIKE = (n) => n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

// Najbliższa NAZWANA metoda/funkcja zawierająca węzeł. Anonimowe callbacki (`.then(() => { throw })`)
// należą do metody, w której stoją — klucz baseline nie może zależeć od numeru linii ani od
// kształtu callbacka.
function enclosingMember(node, sf) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (ts.isConstructorDeclaration(cur) || ts.isMethodDeclaration(cur) || ts.isGetAccessor(cur) || ts.isSetAccessor(cur)) {
      const cls = cur.parent && ts.isClassLike(cur.parent) ? (cur.parent.name?.text ?? "(class)") : null;
      const name = ts.isConstructorDeclaration(cur) ? "constructor" : cur.name.getText(sf);
      return cls ? `${cls}.${name}` : name;
    }
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isPropertyDeclaration(cur) && FN_LIKE(cur.initializer)) {
      const cls = cur.parent && ts.isClassLike(cur.parent) ? (cur.parent.name?.text ?? "(class)") : null;
      return cls ? `${cls}.${cur.name.getText(sf)}` : cur.name.getText(sf);
    }
    if (ts.isVariableDeclaration(cur) && FN_LIKE(cur.initializer)) return cur.name.getText(sf);
  }
  return "(module)";
}

// Wyjątek przez komentarz `// <MARKER>: <powód>` w tej samej linii albo w ciągłym bloku komentarzy
// tuż nad ustaleniem (wzór: RP12-EXCEPTION). Marker bez powodu NIE jest wyjątkiem — nieudokumentowany
// wyjątek jest nie do odróżnienia od nieznajomości reguły.
export function exceptionFromComments(lines, line1, marker) {
  if (!marker) return null;
  const withReason = new RegExp(`${marker}:\\s*(\\S.*)`);
  const bare = new RegExp(`${marker}\\b`);
  const candidates = [lines[line1 - 1] ?? ""];
  for (let i = line1 - 2; i >= 0; i--) {
    const t = (lines[i] ?? "").trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) candidates.push(t);
    else break;
  }
  for (const t of candidates) {
    const m = withReason.exec(t);
    if (m) return { reason: m[1].replace(/\*\/\s*$/, "").trim() };
  }
  for (const t of candidates) if (bare.test(t)) return { invalid: `${marker} bez powodu` };
  return null;
}

const moduleHit = (spec, modules) => modules.some((m) => spec === m || spec.startsWith(m + "/"));

function decoratorName(d) {
  const e = d.expression;
  return ts.isCallExpression(e) ? e.expression.getText() : e.getText();
}

// → [{ rule, file, line, member, text, key, message, hint, card, exception? , invalidException? }]
// `key` jest stabilny przy przesunięciu linii i zmianie whitespace: plik + reguła + metoda + hash tekstu.
export function analyzeBody(relPath, source, rules) {
  const active = rules.filter((r) => !r.disabled && new RegExp(r.match).test(relPath));
  if (!active.length) return [];
  const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = source.split("\n");
  const out = [];

  const record = (rule, node, text) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const member = enclosingMember(node, sf);
    const normalized = norm(text);
    const f = {
      rule: rule.id, file: relPath, line, member,
      text: short(normalized),
      key: `${relPath}::${rule.id}::${member}::${hash8(normalized)}`,
      message: rule.message ?? rule.id, hint: rule.hint ?? "", card: rule.card ?? "",
    };
    const ex = exceptionFromComments(lines, line, rule.exceptionMarker);
    if (ex?.reason) { f.exception = ex.reason; f.exceptionSource = "marker"; }
    else if (ex?.invalid) f.invalidException = ex.invalid;
    out.push(f);
  };

  const visit = (n) => {
    for (const rule of active) {
      if (rule.detect === "throw" && ts.isThrowStatement(n)) record(rule, n, n.getText(sf));
      if (rule.detect === "import") {
        const modules = rule.modules ?? [];
        if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && moduleHit(n.moduleSpecifier.text, modules)) {
          record(rule, n, n.getText(sf));
        } else if (
          // `export { Queue } from 'bullmq'` re-eksportuje kolejkę przez handler bez importu
          ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && moduleHit(n.moduleSpecifier.text, modules)
        ) {
          record(rule, n, n.getText(sf));
        } else if (
          // `import q = require('bullmq')` (CommonJS w TS) nie jest ImportDeclaration ani CallExpression
          ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) &&
          n.moduleReference.expression && ts.isStringLiteral(n.moduleReference.expression) &&
          moduleHit(n.moduleReference.expression.text, modules)
        ) {
          record(rule, n, n.getText(sf));
        } else if (
          ts.isCallExpression(n) && n.arguments.length === 1 && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0])) &&
          (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require")) &&
          moduleHit(n.arguments[0].text, modules)
        ) {
          record(rule, n, n.getText(sf));
        } else if (ts.isDecorator(n) && (rule.identifiers ?? []).includes(decoratorName(n))) {
          record(rule, n, n.getText(sf));
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
