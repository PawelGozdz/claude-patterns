// Code chunker — TS/TSX → per-symbol chunks via the TypeScript compiler AST.
// Granularity: each method / function / interface / type / enum / top-level const is a chunk,
// labeled `ClassName.method (L12-40)`. Better retrieval than per-file (the killer use-case:
// "find the existing implementation similar to this task").
import ts from "typescript";
import type { Chunk } from "./types.js";

const MIN_LEN = 30;

export function chunkCode(content: string, source: string): Chunk[] {
  const sf = ts.createSourceFile(source, content, ts.ScriptTarget.Latest, true);
  const chunks: Chunk[] = [];
  let idx = 0;

  const push = (name: string, node: ts.Node): boolean => {
    const text = node.getText(sf);
    if (text.trim().length < MIN_LEN) return false;
    const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    chunks.push({ id: `${source}#${idx++}`, source, section: `${name} (L${startLine}-${endLine})`, text, startLine, endLine });
    return true;
  };

  sf.forEachChild((node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const cls = node.name.text;
      let emitted = 0;
      for (const m of node.members) {
        if (ts.isMethodDeclaration(m) && m.name && ts.isIdentifier(m.name)) emitted += push(`${cls}.${m.name.text}`, m) ? 1 : 0;
        else if (ts.isConstructorDeclaration(m)) emitted += push(`${cls}.constructor`, m) ? 1 : 0;
      }
      if (emitted === 0) push(`class ${cls}`, node); // tiny class → whole thing
    } else if (ts.isFunctionDeclaration(node) && node.name) push(`function ${node.name.text}`, node);
    else if (ts.isInterfaceDeclaration(node)) push(`interface ${node.name.text}`, node);
    else if (ts.isTypeAliasDeclaration(node)) push(`type ${node.name.text}`, node);
    else if (ts.isEnumDeclaration(node)) push(`enum ${node.name.text}`, node);
    else if (ts.isVariableStatement(node)) {
      const d = node.declarationList.declarations[0];
      if (d && ts.isIdentifier(d.name)) push(`const ${d.name.text}`, node);
    }
  });

  return chunks;
}
