// body-detectors.mjs — detektory AST dla reguł ciała pliku, poza `throw` i `import` (te siedzą w body-rules.mjs).
// (TASK-ORC-GATE-COST-001, E4: reguły klasy A z pamięci bramki końcowej — wzorce, które bramka (Opus, ok. $5 za
// wywołanie) łapała ręcznie, choć wystarcza do nich analiza jednego pliku.)
//
// Czysty moduł, bez I/O. Detektor dostaje (węzeł, reguła, { sf, relPath }) i zwraca listę `{ node, text }` albo null.
// `text` trafia do klucza baseline (hash), więc ma być STABILNY: opis ustalenia, nie wycinek kodu, który zmienia się
// z każdą edycją ciała (inaczej stare naruszenie wyglądałoby po edycji jak nowe).
import ts from "typescript";
import path from "node:path";

const isStr = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
const nameOf = (n) => (n && (ts.isIdentifier(n) || isStr(n)) ? n.text : null);
const calleeName = (call) => {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
};
const decorators = (n) => (ts.canHaveDecorators(n) ? (ts.getDecorators(n) ?? []) : []);
const className = (cls) => cls.name?.text ?? "(class)";
const FN = (n) => n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

// onFailed() bez @OnWorkerEvent('failed'): `@nestjs/bullmq` podpina do Workera tylko metody z metadanymi dekoratora,
// więc nadpisanie bez dekoratora jest martwym hookiem (alert przestaje działać po cichu). Bazowa klasa (bez `extends`)
// deklaruje metodę bez dekoratora celowo i nie jest flagowana.
function methodDecorator(n, rule) {
  if (!ts.isMethodDeclaration(n) || nameOf(n.name) !== rule.method) return null;
  const cls = n.parent;
  if (!cls || !ts.isClassLike(cls)) return null;
  if (rule.requireExtends && !(cls.heritageClauses ?? []).some((h) => h.token === ts.SyntaxKind.ExtendsKeyword)) return null;
  const has = decorators(n).some((d) => {
    const e = d.expression;
    if (!ts.isCallExpression(e) || calleeName(e) !== rule.decorator) return false;
    return rule.decoratorArg == null || (isStr(e.arguments[0]) && e.arguments[0].text === rule.decoratorArg);
  });
  if (has) return null;
  const want = rule.decoratorArg == null ? `@${rule.decorator}` : `@${rule.decorator}('${rule.decoratorArg}')`;
  return [{ node: n.name, text: `${className(cls)}.${rule.method} without ${want}` }];
}

// safeRun(() => commandBus.execute(...)) bez `throw` w callbacku: BaseCommandHandler zwraca Result.fail zamiast rzucać,
// więc safeRun nie widzi porażki i job BullMQ kończy się sukcesem bez ponowienia. Poprawnie: sprawdzić `result.isFailure`
// i rzucić w środku. Callback z `throw` jest czysty.
function wrappedCallWithoutThrow(n, rule) {
  if (!ts.isCallExpression(n) || calleeName(n) !== rule.wrapper || !FN(n.arguments[0])) return null;
  const re = new RegExp(rule.callee);
  let calls = false;
  let throws = false;
  const scan = (x) => {
    if (ts.isThrowStatement(x)) throws = true;
    if (ts.isCallExpression(x) && re.test(x.expression.getText())) calls = true;
    ts.forEachChild(x, scan);
  };
  scan(n.arguments[0]);
  return calls && !throws ? [{ node: n, text: `${rule.wrapper}() around ${rule.callee} without throw` }] : null;
}

// Klucz z listy `keys` w literale obiektu `property`, przekazanym jako argument wywołania `call`
// (np. createAuditEntry(name, { eventData: { reason } })): pole kanoniczne wygrywa ze spreadem, więc wartość znika.
// Nie widzi literału zbudowanego w helperze (`eventData: this.build()`): to granica analizy jednego pliku.
function objectKeyInCallArg(n, rule) {
  if (!ts.isCallExpression(n) || calleeName(n) !== rule.call) return null;
  const arg = n.arguments[rule.argIndex ?? 0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
  const prop = arg.properties.find((p) => ts.isPropertyAssignment(p) && nameOf(p.name) === rule.property);
  if (!prop || !ts.isObjectLiteralExpression(prop.initializer)) return null;
  const hits = [];
  for (const p of prop.initializer.properties) {
    const key = ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) ? nameOf(p.name) : null;
    if (key && rule.keys.includes(key)) hits.push({ node: p, text: `${rule.property}.${key} collides with a canonical field` });
  }
  return hits.length ? hits : null;
}

// Import względny, który wychodzi poza `src/` swojego pakietu: tsc bez `rootDir` wylicza go ze wspólnego katalogu wejść,
// więc jeden taki import przenosi emisję do dist/src/... (obraz produkcyjny przestaje startować, a tsc --noEmit i testy
// są zielone). Ścieżka pliku może mieć prefiks monorepo (apps/x/src/a.ts): korzeniem jest pierwszy segment `src/`.
function importOutsideRoot(n, rule, { relPath }) {
  const root = rule.root ?? "src";
  const m = new RegExp(`(^|/)${root}/`).exec(relPath);
  if (!m) return null;
  const prefix = relPath.slice(0, m.index + m[0].length);
  let spec = null;
  if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && isStr(n.moduleSpecifier)) spec = n.moduleSpecifier.text;
  else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && isStr(n.moduleReference.expression)) spec = n.moduleReference.expression.text;
  else if (
    ts.isCallExpression(n) && n.arguments.length === 1 && isStr(n.arguments[0]) &&
    (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))
  ) spec = n.arguments[0].text;
  if (!spec || !(spec.startsWith("./") || spec.startsWith("../"))) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relPath), spec));
  if (resolved.startsWith(prefix) || resolved + "/" === prefix) return null;
  return [{ node: n, text: `import of ${spec} leaves ${prefix}` }];
}

export const DETECTORS = {
  "method-decorator": methodDecorator,
  "wrapped-call-without-throw": wrappedCallWithoutThrow,
  "object-key-in-call-arg": objectKeyInCallArg,
  "import-outside-root": importOutsideRoot,
};
