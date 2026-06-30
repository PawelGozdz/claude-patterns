#!/usr/bin/env node
// /conformance-check engine — deterministic AST audit of intra-codebase pattern consistency.
// Finds: (1) HARD-RULE violations (e.g. aggregate not extending AggregateRoot, per rules.json /
// project .claude/conformance.json) and (2) MAJORITY OUTLIERS (e.g. 23/24 aggregates extend X, 1 doesn't).
// NO embeddings / NO Qdrant — pure TS compiler AST. Works offline.
//
// Usage: node check.mjs --dir <src> [--json]
import ts from "typescript";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadRules(projectDir) {
  const base = JSON.parse(readFileSync(join(HERE, "rules.json"), "utf8")).kinds;
  const override = join(projectDir, ".claude", "conformance.json");
  if (existsSync(override)) {
    try {
      const ov = JSON.parse(readFileSync(override, "utf8")).kinds ?? [];
      const byKind = new Map(base.map((r) => [r.kind, r]));
      for (const r of ov) byKind.set(r.kind, r); // project override wins
      return [...byKind.values()];
    } catch { /* fall through to base */ }
  }
  return base;
}

const SKIP = (n) => n === "node_modules" || n === "dist" || n === "__tests__" || n.startsWith(".");
const isTs = (n) => n.endsWith(".ts") && !n.endsWith(".spec.ts") && !n.endsWith(".d.ts");

function walk(dir, root, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (!SKIP(name)) walk(full, root, acc); }
    else if (isTs(name)) acc.push(full);
  }
}

// Expected primary class name from filename: money.vo.ts → "Money" (strip suffix + kebab→Pascal).
function expectedName(file) {
  const base = file.split("/").pop().replace(/\.ts$/, "")
    .replace(/\.(vo|aggregate|entity|specification|domain-service|handler|repository|policy)$/, "");
  return base.split(/[-.]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}

// Extract the PRIMARY class of a file (not the first — files often define Error/helper classes first).
// Selection: (1) class whose name matches the filename concept; (2) first exported non-Error class; (3) first class.
function inspect(file, root) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const classes = [];
  sf.forEachChild((node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return;
    let ext = null;
    for (const h of node.heritageClauses ?? []) {
      if (h.token === ts.SyntaxKind.ExtendsKeyword && h.types[0]) ext = h.types[0].expression.getText(sf);
    }
    const decorators = (ts.getDecorators?.(node) ?? []).map((d) => {
      const e = d.expression;
      return ts.isCallExpression(e) ? e.expression.getText(sf) : e.getText(sf);
    });
    const exported = (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    classes.push({ name: node.name.text, extends: ext, decorators, line, exported });
  });
  if (!classes.length) return null;
  const want = expectedName(file);
  const primary =
    classes.find((c) => c.name === want) ??
    classes.find((c) => c.exported && !/(Error|Exception)$/.test(c.name)) ??
    classes[0];
  return { file: relative(root, file), ...primary };
}

function classify(relPath, rules) {
  return rules.find((r) => new RegExp(r.match).test(relPath)) ?? null;
}

function mode(values) {
  const c = {};
  for (const v of values) c[v] = (c[v] ?? 0) + 1;
  let best = null, n = 0;
  for (const [v, k] of Object.entries(c)) if (k > n) { best = v; n = k; }
  return { value: best, count: n, total: values.length, dist: c };
}

function main() {
  const argv = process.argv.slice(2);
  const dir = argv[(argv.indexOf("--dir") + 1) || -1];
  const asJson = argv.includes("--json");
  if (!dir) { console.error("usage: check.mjs --dir <src> [--json]"); process.exit(2); }
  const root = process.cwd();
  const rules = loadRules(root);

  const files = [];
  walk(dir, root, files);

  const byKind = {}; // kind → [{...inspect, rule}]
  for (const f of files) {
    const info = inspect(f, root);
    if (!info) continue;
    const rule = classify(info.file, rules);
    if (!rule) continue;
    (byKind[rule.kind] ??= []).push({ ...info, rule });
  }

  const violations = []; // hard-rule
  const outliers = [];   // majority deviation

  for (const [kind, items] of Object.entries(byKind)) {
    const rule = items[0].rule;
    // hard-rule
    for (const it of items) {
      if (rule.expectExtends && it.name === rule.expectExtends) continue; // the base class itself — skip
      if (rule.expectExtends && it.extends !== rule.expectExtends) {
        violations.push({ kind, file: it.file, line: it.line, found: it.extends ?? "(none)", expected: rule.expectExtends, type: "extends" });
      }
      if (rule.expectDecorator && !it.decorators.includes(rule.expectDecorator)) {
        violations.push({ kind, file: it.file, line: it.line, found: it.decorators.join(",") || "(none)", expected: `@${rule.expectDecorator}`, type: "decorator" });
      }
    }
    // majority outlier (only if no hard rule for extends, and a clear majority exists)
    if (!rule.expectExtends && items.length >= 4) {
      const m = mode(items.map((i) => i.extends ?? "(none)"));
      if (m.count / m.total >= 0.6 && m.count < m.total) {
        for (const it of items) {
          if ((it.extends ?? "(none)") !== m.value) {
            outliers.push({ kind, file: it.file, line: it.line, found: it.extends ?? "(none)", majority: m.value, ratio: `${m.count}/${m.total}` });
          }
        }
      }
    }
  }

  if (asJson) { console.log(JSON.stringify({ scanned: files.length, kinds: Object.keys(byKind).length, violations, outliers }, null, 2)); }
  else {
    console.log(`\nCONFORMANCE REPORT — ${dir}`);
    console.log(`scanned ${files.length} files · ${Object.keys(byKind).length} pattern kinds\n`);
    console.log(`HARD-RULE violations (${violations.length}):`);
    for (const v of violations) console.log(`  ✗ ${v.file}:${v.line} [${v.kind}] ${v.type} "${v.found}" — expected "${v.expected}"`);
    console.log(`\nCONSISTENCY outliers (${outliers.length}):`);
    for (const o of outliers) console.log(`  ⚠ ${o.file}:${o.line} [${o.kind}] extends "${o.found}" — majority "${o.majority}" (${o.ratio})`);
    console.log("");
  }
  process.exit(violations.length > 0 ? 1 : 0);
}
main();
