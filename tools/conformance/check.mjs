#!/usr/bin/env node
// /conformance-check engine — deterministic AST audit of intra-codebase pattern consistency.
// Finds: (1) HARD-RULE violations (e.g. aggregate not extending AggregateRoot, per rules.json /
// project .claude/conformance.json), (2) MAJORITY OUTLIERS (e.g. 23/24 aggregates extend X, 1 doesn't)
// and (3) BODY-RULE violations (e.g. `throw` or a BullMQ import in a command handler file), optionally
// as a git-backed RATCHET (only violations NOT present at the baseline commit fail).
// NO embeddings / NO Qdrant — pure TS compiler AST. Works offline.
//
// Usage:
//   node check.mjs --dir <src> [--json] [--ratchet] [--baseline-ref <ref>]   full audit of a directory
//   node check.mjs --changed --ratchet [--json] [--baseline-ref <ref>]       files changed vs <ref> only (probe mode)
//
// Exit codes: 0 clean · 1 violations · 2 usage/config error · 3 baseline unavailable (not a git repo / unknown ref)
import ts from "typescript";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot, resolveRef, changedFiles, evaluateBodyRules, isCandidate, showAtRef } from "./baseline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

class ConfigError extends Error {}

const CONFIG_REL = ".claude/conformance.json";

// Wyjątki z .claude/conformance.json na `ref` (nie z drzewa roboczego: agent mógł go właśnie zmienić) + surowa treść
// do wykrycia samej zmiany pliku. Brak pliku / zły JSON na ref = brak wyjątków w baseline.
function loadBaseConfig(root, ref) {
  const raw = showAtRef(ref, CONFIG_REL, root);
  if (raw == null) return { exceptions: [], parsed: null };
  try {
    const parsed = JSON.parse(raw);
    const exceptions = (parsed.exceptions ?? []).filter((e) => e && e.rule && e.file && typeof e.reason === "string" && e.reason.trim());
    return { exceptions, parsed };
  } catch { return { exceptions: [], parsed: null }; }
}

const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

// Zmiana .claude/conformance.json względem `ref` to osobne ustalenie: konfiguracja potrafi wyłączyć regułę (`disabled`),
// zawęzić `match`, dodać wyjątek albo przestawić `baselineRef`, a pisze ją ten sam agent, którego kod sprawdzamy.
// → null albo { keys: [nazwy zmienionych kluczy najwyższego poziomu] }
function configChange(root, ref) {
  const curPath = join(root, CONFIG_REL);
  let cur = null;
  if (existsSync(curPath)) { try { cur = JSON.parse(readFileSync(curPath, "utf8")); } catch { cur = "(invalid json)"; } }
  const base = loadBaseConfig(root, ref).parsed;
  if (cur === null && base === null) return null;
  if (stable(cur) === stable(base)) return null;
  const keys = new Set([...Object.keys(cur && typeof cur === "object" ? cur : {}), ...Object.keys(base ?? {})]);
  const changed = [...keys].filter((k) => stable(cur?.[k]) !== stable(base?.[k]));
  return { keys: changed.length ? changed : ["(file)"] };
}

// Zakres sondy: `--only <dir|plik>` (powtarzalne) zawęża do katalogów/plików warstwy, `--skip <plik>` wyklucza pliki
// brudne przed startem (cudza praca). Katalogi warstw bywają nazwą segmentu ("application/"), nie ścieżką od korzenia,
// więc katalog pasuje do prefiksu ścieżki ALBO do segmentu w środku. Dotyczy reguł ciała pliku.
const normPath = (p) => p.replace(/^\.\//, "");
function scopeFilter(only, skip) {
  const skipSet = new Set(skip.map(normPath));
  const entries = only.map(normPath).map((d) => d.replace(/\/+$/, "")).filter(Boolean);
  // wpis pasuje jako plik (dokładnie / jako sufiks ścieżki) ALBO jako katalog (prefiks / segment w środku); "apps/api.v2"
  // z kropką w nazwie jest więc katalogiem, a "myapplication/" nie pasuje do "application/" (granica segmentu)
  return (p) => {
    if (skipSet.has(p)) return false;
    if (!entries.length) return true;
    return entries.some((d) => p === d || p.endsWith(`/${d}`) || p.startsWith(`${d}/`) || p.includes(`/${d}/`));
  };
}

// rules.json + .claude/conformance.json. Override merges `kinds` by kind and `bodyRules` by id
// (`"disabled": true` switches a default rule off); `exceptions` are project-only and every entry
// MUST carry a reason — an undocumented exception is indistinguishable from not knowing the rule.
function loadConfig(projectDir) {
  const base = JSON.parse(readFileSync(join(HERE, "rules.json"), "utf8"));
  const cfg = { kinds: base.kinds, bodyRules: base.bodyRules ?? [], exceptions: [], baselineRef: null };
  const override = join(projectDir, ".claude", "conformance.json");
  if (!existsSync(override)) return cfg;
  let ov;
  try { ov = JSON.parse(readFileSync(override, "utf8")); }
  catch (e) { process.stderr.write(`warn: ${override} is not valid JSON (${e.message}) — project overrides ignored\n`); return cfg; }

  const byKind = new Map(cfg.kinds.map((r) => [r.kind, r]));
  for (const r of ov.kinds ?? []) byKind.set(r.kind, r); // project override wins
  cfg.kinds = [...byKind.values()];

  const byId = new Map(cfg.bodyRules.map((r) => [r.id, r]));
  for (const r of ov.bodyRules ?? []) byId.set(r.id, { ...(byId.get(r.id) ?? {}), ...r });
  cfg.bodyRules = [...byId.values()];

  for (const [i, e] of (ov.exceptions ?? []).entries()) {
    if (!e || !e.rule || !e.file || typeof e.reason !== "string" || !e.reason.trim()) {
      throw new ConfigError(`${override}: exceptions[${i}] needs "rule", "file" and a non-empty "reason"`);
    }
    cfg.exceptions.push(e);
  }
  if (typeof ov.baselineRef === "string" && ov.baselineRef) cfg.baselineRef = ov.baselineRef;
  return cfg;
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
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? null : (argv[i + 1] ?? null); };
  const dir = opt("--dir");
  const asJson = argv.includes("--json");
  const changedMode = argv.includes("--changed");
  const ratchet = argv.includes("--ratchet");
  const optAll = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
  const inScope = scopeFilter(optAll("--only"), optAll("--skip"));
  if (!dir && !changedMode) {
    console.error("usage: check.mjs --dir <src> [--json] [--ratchet] [--baseline-ref <ref>]\n       check.mjs --changed --ratchet [--json] [--baseline-ref <ref>] [--only <dir|file>]... [--skip <file>]...");
    process.exit(2);
  }

  // Git-backed modes work from the repository root so paths in the report are repo-relative.
  const gitMode = ratchet || changedMode;
  const root = gitMode ? (repoRoot(process.cwd()) ?? null) : process.cwd();
  if (!root) { console.error("conformance: not a git repository — ratchet/--changed unavailable"); process.exit(3); }

  let cfg;
  try { cfg = loadConfig(root); } catch (e) {
    if (e instanceof ConfigError) { console.error(`conformance: ${e.message}`); process.exit(2); }
    throw e;
  }

  let refSha = null;
  const refName = opt("--baseline-ref") ?? cfg.baselineRef ?? "HEAD";
  if (gitMode) {
    refSha = resolveRef(refName, root);
    if (!refSha) { console.error(`conformance: baseline ref "${refName}" not found — ratchet unavailable`); process.exit(3); }
  }

  // ── which files ────────────────────────────────────────────────────────────
  let files = [];        // absolute paths (dir mode)
  let relFiles;          // repo/cwd-relative paths
  let unfilteredCount = null; // zmienione pliki przed --only/--skip (do ostrzeżenia o pustym zakresie)
  let renamedFrom = new Map();
  if (changedMode) {
    const ch = changedFiles(refSha, root);
    if (!ch) { console.error("conformance: git diff against the baseline failed"); process.exit(3); }
    unfilteredCount = ch.files.length;
    relFiles = ch.files.filter(inScope);
    renamedFrom = ch.renamedFrom;
  } else {
    walk(resolve(process.cwd(), dir), root, files);
    relFiles = files.map((f) => relative(root, f)).filter(isCandidate).filter(inScope);
  }

  // ── hard rules + majority outliers (directory mode only: they need the whole population) ──
  const violations = []; // hard-rule
  const outliers = [];   // majority deviation
  const byKind = {};     // kind → [{...inspect, rule}]
  if (!changedMode) {
    for (const f of files) {
      const info = inspect(f, root);
      if (!info) continue;
      const rule = classify(info.file, cfg.kinds);
      if (!rule) continue;
      (byKind[rule.kind] ??= []).push({ ...info, rule });
    }
    for (const [kind, items] of Object.entries(byKind)) {
      const rule = items[0].rule;
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
  }

  // ── body rules ─────────────────────────────────────────────────────────────
  const body = evaluateBodyRules({
    root, files: relFiles, rules: cfg.bodyRules, exceptions: cfg.exceptions,
    baseExceptions: ratchet ? loadBaseConfig(root, refSha).exceptions : [],
    ref: ratchet ? refSha : null, renamedFrom,
    readFile: (p) => readFileSync(join(root, p), "utf8"),
  });
  // Martwy wyjątek to wpis bez trafienia — w trybie zawężonym (--changed, --only/--skip) większość plików nie jest skanowana,
  // więc brak trafienia nic nie znaczy. Oceniamy wtedy tylko wpisy, których plik w ogóle nie istnieje.
  const scoped = changedMode || optAll("--only").length > 0 || optAll("--skip").length > 0;
  if (scoped) body.stale = body.stale.filter((e) => !existsSync(join(root, e.file)));
  // --only, który nie dopasował żadnego ze zmienionych plików, jest albo literówką, albo legalnie pustą warstwą — silnik
  // nie odróżni tych dwóch, więc zawsze mówi o tym wprost (stderr + JSON), zamiast milczeć jak zielona kontrola.
  const emptyScope = changedMode && optAll("--only").length > 0 && unfilteredCount > 0 && relFiles.length === 0;
  if (emptyScope) process.stderr.write(`warn: --only nie dopasował żadnego z ${unfilteredCount} zmienionych plików (sprawdź zapis ścieżek: od korzenia repo)\n`);
  // Zmiana .claude/conformance.json względem baseline to osobne, blokujące ustalenie (tylko w ratchecie: bez baseline nie ma "zmiany").
  const cfgChange = ratchet ? configChange(root, refSha) : null;
  if (cfgChange) {
    body.findings.push({
      rule: "CONFIG-CHANGED", file: CONFIG_REL, line: 1, member: "(config)", status: "new",
      text: `zmieniono: ${cfgChange.keys.join(", ")}`,
      message: "konfiguracja kontroli zmieniona względem baseline — wyjątki, wyłączenia reguł i baselineRef zatwierdza człowiek",
      hint: "zacommituj zmianę przed przebiegiem (zgoda człowieka) albo ją cofnij", card: "",
    });
  }
  const bodyNew = body.findings.filter((f) => f.status === "new" || f.status === "exception-new");
  const bodyBase = body.findings.filter((f) => f.status === "baseline");
  const bodyEx = body.findings.filter((f) => f.status === "excepted");

  if (asJson) {
    console.log(JSON.stringify({
      scanned: relFiles.length, kinds: Object.keys(byKind).length, violations, outliers,
      scope: { only: optAll("--only"), skip: optAll("--skip"), changedBeforeScope: unfilteredCount, matched: relFiles.length, emptyScope },
      body: { mode: changedMode ? "changed" : "dir", ratchet, ref: ratchet || changedMode ? { name: refName, sha: refSha } : null,
              findings: body.findings, staleExceptions: body.stale },
    }, null, 2));
  } else {
    console.log(`\nCONFORMANCE REPORT — ${changedMode ? `changed files vs ${refName}` : dir}`);
    console.log(`scanned ${relFiles.length} files${changedMode ? "" : ` · ${Object.keys(byKind).length} pattern kinds`}\n`);
    if (!changedMode) {
      console.log(`HARD-RULE violations (${violations.length}):`);
      for (const v of violations) console.log(`  ✗ ${v.file}:${v.line} [${v.kind}] ${v.type} "${v.found}" — expected "${v.expected}"`);
      console.log(`\nCONSISTENCY outliers (${outliers.length}):`);
      for (const o of outliers) console.log(`  ⚠ ${o.file}:${o.line} [${o.kind}] extends "${o.found}" — majority "${o.majority}" (${o.ratio})`);
      console.log("");
    }
    const newFiles = new Set(bodyNew.map((f) => f.file)).size;
    const head = ratchet
      ? `BODY-RULE violations (ratchet vs ${refName} ${refSha.slice(0, 8)}): ${bodyNew.length} new in ${newFiles} file(s) · ${bodyBase.length} baseline · ${bodyEx.length} excepted`
      : `BODY-RULE violations (strict): ${bodyNew.length} in ${newFiles} file(s) · ${bodyEx.length} excepted`;
    console.log(head);
    for (const f of bodyNew) {
      console.log(`  ✗ ${ratchet ? "NEW " : ""}${f.file}:${f.line} [${f.rule}] ${f.member} — ${f.text}`);
      const why = f.status === "exception-new"
        ? `WYJĄTEK DODANY W TYM PRZEBIEGU (${f.exception}) — czeka na zgodę człowieka; commit przed przebiegiem = zgoda. `
        : f.invalidException ? `${f.invalidException} — not an exception. ` : "";
      console.log(`      ${why}${f.message}${f.card ? ` (${f.card})` : ""}${f.hint ? ` — ${f.hint}` : ""}`);
    }
    if (ratchet && bodyBase.length) {
      const nFiles = new Set(bodyBase.map((f) => f.file)).size;
      console.log(`  · baseline (not blocking): ${bodyBase.length} in ${nFiles} file(s) — run without --ratchet for the list`);
    }
    for (const f of bodyEx) console.log(`  ○ excepted ${f.file}:${f.line} [${f.rule}] — ${f.exception}`);
    for (const e of body.stale) console.log(`  ⚠ stale exception (no matching finding): [${e.rule}] ${e.file} — ${e.reason}`);
    console.log("");
  }
  process.exit(violations.length > 0 || bodyNew.length > 0 ? 1 : 0);
}
main();
