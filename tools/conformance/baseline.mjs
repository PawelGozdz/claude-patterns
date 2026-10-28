// baseline.mjs — git-backed ratchet for body rules.
//
// Baseline jest LICZONY Z COMMITA (domyślnie HEAD), nie z drzewa roboczego i nie z pliku w repo:
//   • plik-baseline zestarzałby się i dałoby się go "odświeżyć" razem z naruszeniem;
//   • baseline PLIKOWY ("ten plik już ma throw") przepuściłby 4 nowe `throw` w pliku, który ma
//     8 starych (ChangePasswordHandler). Dlatego klucz jest LINIOWY: plik + reguła + metoda + hash
//     tekstu linii (nie numer linii), a porównanie idzie WIELOZBIOREM — N identycznych linii w
//     baseline daje N miejsc, kolejne są nowe.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeBody } from "./body-rules.mjs";

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

export const repoRoot = (cwd) => {
  const r = git(["rev-parse", "--show-toplevel"], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
};

export const resolveRef = (ref, cwd) => {
  const r = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
};

const SKIP_SEGMENT = (s) => s === "node_modules" || s === "dist" || s === "__tests__" || s.startsWith(".");
export const isCandidate = (p) =>
  p.endsWith(".ts") && !p.endsWith(".spec.ts") && !p.endsWith(".d.ts") && !p.split("/").some(SKIP_SEGMENT);

// Pliki zmienione względem `ref` (staged + unstaged + nieśledzone) oraz mapa rename: nowa → stara ścieżka.
// Nieśledzony plik nie ma rename'u — jest nowy i dostaje pusty baseline (reguły twarde).
//
// Zwykły `mv` (albo Write nowego pliku + usunięcie starego) to dla `git diff` na drzewie roboczym "D + nieśledzony", więc
// rename nie zostałby rozpoznany i przeniesiony plik dostałby pusty baseline (stary dług = nowe naruszenia). Dlatego diff
// liczymy z TYMCZASOWEGO indeksu po `git add -A` (prawdziwy indeks i HEAD zostają nietknięte; to samo podejście co hash drzewa
// ORC-139): nieśledzone pliki wchodzą, ignorowane nie, a rename wykrywa próg podobieństwa gita (domyślnie 50%).
// Gdy tymczasowy indeks się nie uda, wracamy do diffu na drzewie roboczym + listy nieśledzonych.
function diffViaTempIndex(ref, root) {
  let dir = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "conf-idx-"));
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, "index") };
    const run = (args) => spawnSync("git", args, { cwd: root, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (run(["add", "-A", "--", "."]).status !== 0) return null;
    const d = run(["diff", "--cached", "--name-status", "-M", "-z", ref, "--"]);
    return d.status === 0 ? d.stdout : null;
  } catch { return null; }
  finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
}

export function changedFiles(ref, root) {
  const files = new Set();
  const renamedFrom = new Map();
  const viaIndex = diffViaTempIndex(ref, root);
  const d = viaIndex != null ? { status: 0, stdout: viaIndex } : git(["diff", "--name-status", "-M", "-z", ref, "--"], root);
  if (d.status !== 0) return null;
  const t = d.stdout.split("\0").filter((x, i, a) => !(i === a.length - 1 && x === ""));
  for (let i = 0; i < t.length; ) {
    const st = t[i++];
    if (st[0] === "R" || st[0] === "C") {
      const oldP = t[i++], newP = t[i++];
      if (isCandidate(newP)) { files.add(newP); if (st[0] === "R") renamedFrom.set(newP, oldP); }
    } else {
      const p = t[i++];
      if (st[0] !== "D" && isCandidate(p)) files.add(p);
    }
  }
  const u = viaIndex != null ? { status: 1 } : git(["ls-files", "-o", "--exclude-standard", "-z"], root);
  if (u.status === 0) for (const p of u.stdout.split("\0")) if (p && isCandidate(p)) files.add(p);
  return { files: [...files].sort(), renamedFrom };
}

export const showAtRef = (ref, path, root) => {
  const r = git(["show", `${ref}:${path}`], root);
  return r.status === 0 ? r.stdout : null;
};

// Wyjątki z .claude/conformance.json: { rule, file, member?, reason }. Dopasowanie po regule i dokładnej
// ścieżce (opcjonalnie metodzie). Zużyte wpisy trafiają do `used`, żeby wskazać wpisy martwe.
function applyConfigExceptions(findings, exceptions, used) {
  for (const f of findings) {
    if (f.exception) continue;
    const i = exceptions.findIndex((e) => e.rule === f.rule && e.file === f.file && (!e.member || e.member === f.member));
    if (i !== -1) { f.exception = `config: ${exceptions[i].reason}`; used.add(i); }
  }
  return findings;
}

const blocking = (f) => !f.exception || f.invalidException;

// → { findings: [{...ustalenie, status: 'new'|'baseline'|'excepted'|'exception-new'}], stale: [wpisy wyjątków bez trafienia] }
// `ref` = null → tryb ścisły (audyt): każde nieobjęte wyjątkiem ustalenie jest 'new'.
//
// `exception-new` (ratchet): ustalenie objęte wyjątkiem, którego NIE było jako wyjątek w baseline. Wyjątek to komentarz
// z powodem albo wpis w .claude/conformance.json — obie rzeczy może dopisać ten sam agent, którego kod sprawdzamy,
// więc wyjątek dodany w tym przebiegu jest ustaleniem blokującym do zgody człowieka (zgoda = commit przed przebiegiem).
// `baseExceptions` = wpisy z .claude/conformance.json z `ref`; nie wolno ich brać z drzewa roboczego.
export function evaluateBodyRules({ root, files, rules, exceptions = [], baseExceptions = [], ref = null, renamedFrom = new Map(), readFile }) {
  const used = new Set();
  const all = [];
  for (const file of files) {
    const cur = applyConfigExceptions(analyzeBody(file, readFile(file), rules), exceptions, used);
    if (!cur.length) continue;

    let baseCounts = null;
    let baseExcCounts = null;
    if (ref) {
      const oldPath = renamedFrom.get(file) ?? file;
      const src = showAtRef(ref, oldPath, root);
      baseCounts = new Map();
      baseExcCounts = new Map();
      if (src != null) {
        // Baseline analizowany po STAREJ ścieżce (reguła, która ją wtedy obejmowała): plik spoza `match`, przeniesiony
        // do `*.handler.ts`, nie wnosi swoich `throw` jako długu. Klucz przepisujemy na BIEŻĄCĄ ścieżkę, bo rename
        // nie zmienia tożsamości naruszenia.
        for (const b0 of applyConfigExceptions(analyzeBody(oldPath, src, rules), baseExceptions, new Set())) {
          const b = oldPath === file ? b0 : { ...b0, key: b0.key.replace(`${oldPath}::`, `${file}::`) };
          const bag = blocking(b) ? baseCounts : baseExcCounts;
          bag.set(b.key, (bag.get(b.key) ?? 0) + 1);
        }
      }
    }

    const seen = new Map();
    const seenEx = new Map();
    for (const f of cur) {
      if (!blocking(f)) {
        if (ref) {
          const n = (seenEx.get(f.key) ?? 0) + 1;
          seenEx.set(f.key, n);
          if (n > (baseExcCounts.get(f.key) ?? 0)) { all.push({ ...f, status: "exception-new" }); continue; }
        }
        all.push({ ...f, status: "excepted" });
        continue;
      }
      const n = (seen.get(f.key) ?? 0) + 1;
      seen.set(f.key, n);
      const inBase = baseCounts ? (baseCounts.get(f.key) ?? 0) : 0;
      all.push({ ...f, status: n <= inBase ? "baseline" : "new" });
    }
  }
  const stale = exceptions.filter((_, i) => !used.has(i));
  return { findings: all, stale };
}
