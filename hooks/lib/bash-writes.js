/**
 * bash-writes.js — które pliki zapisuje polecenie Bash? (wspólne dla hooków SubagentStop)
 *
 * Wyjęte z check-test-implementer-scope.js (TASK-AGENT-MANUAL-SPAWN-RULES-001, pkt 2), żeby
 * check-subagent-pattern-reads.js rozpoznawał te same cele zapisu. Dwie kopie heurystyki rozjechałyby się
 * przy pierwszej poprawce.
 *
 * Przypisanie jest celowo wąskie. Pierwsza wersja oznaczała każdą ścieżkę w poleceniu, które gdziekolwiek
 * zawierało konstrukcję zapisu, i na prawdziwym transkrypcie wymieniała pliki, które agent tylko czytał
 * (`tsc -p tsconfig.json > log`, heredoc YAML, który jedynie WSPOMINA pliki produkcyjne). Ścieżka liczy się
 * dopiero jako CEL zapisu:
 *   • słowo po `>` / `>>` / `tee` / miejsce docelowe `cp` / `mv`,
 *   • pliki `sed -i` / `perl -pi` w tym samym segmencie powłoki,
 *   • w snippecie python/node: ścieżka przypisana do p/f/path/file/…, albo pierwszy argument
 *     open(…,'w') / Path(…).write_* / writeFileSync(…). Ścieżki w treści ciągów NIE są celami.
 * `$VAR` rozwijamy z prostych przypisań `NAME=value` w tym samym poleceniu; nierozwiązane `$VAR` pomijamy.
 *
 * To heurystyka, nie piaskownica: nie widzi zapisu ukrytego w skrypcie ani w interpreterze czytającym
 * program z pliku.
 */
const path = require('path');

const SRC_EXT = /\.(?:[cm]?[jt]sx?|json|ya?ml|sql|prisma|env[\w.]*)$/;

// Ścieżka względem cwd; null = poza projektem (np. /tmp) — nie nasza sprawa.
function toRel(p, cwd) {
  const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
  const rel = path.relative(cwd, abs);
  return rel.startsWith('..') ? null : rel.split(path.sep).join('/');
}

function resolveVars(command) {
  const vars = {};
  for (const m of command.matchAll(/(?:^|[\s;&])([A-Za-z_]\w*)=(?!=)(["']?)([^\s;&|"']+)\2/g)) vars[m[1]] = m[3];
  const sub = (t) => t.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (_, n) => (n in vars ? vars[n] : '$'));
  return { sub };
}

function bashWrites(command, cwd) {
  const { sub } = resolveVars(command);
  const targets = new Set();
  const add = (raw, requireSlash) => {
    const t = sub(String(raw).replace(/^['"`]|['"`,;)]+$/g, ''));
    if (!t || t.includes('$') || t.startsWith('-') || t.startsWith('/tmp/') || t.startsWith('/dev/')) return;
    if (!SRC_EXT.test(t) || (requireSlash && !t.includes('/'))) return;
    const rel = toRel(t, cwd);
    if (rel) targets.add(rel);
  };
  // redirections and tee: the single word that follows
  for (const m of command.matchAll(/(?:^|[^>&\d=])>>?\s*([^\s&|;<>()]+)/g)) add(m[1], false);
  for (const m of command.matchAll(/\btee\s+(?:-\S+\s+)*([^\s|;&]+)/g)) add(m[1], false);
  // cp / mv: the last argument of the segment is the destination
  for (const seg of command.split(/\n|;|&&|\|\|/)) {
    const cm = seg.match(/\b(?:cp|mv)\s+((?:-\S+\s+)*)(.+)$/);
    if (cm) { const args = cm[2].trim().split(/\s+/); if (args.length >= 2) add(args[args.length - 1], false); }
    // sed -i / perl -pi: every source-looking file argument in this segment
    if (/\bsed\s+(?:-[a-zA-Z]*\s+)*-[a-zA-Z]*i|\bperl\s+-[a-zA-Z]*i/.test(seg)) for (const t of seg.split(/\s+/)) add(t, true);
  }
  // python / node: path-valued assignments and the target of an explicit write
  if (/\.write(?:_text|_bytes)?\(|open\([^)]*['"][wa]b?\+?['"]|\b(?:writeFileSync|appendFileSync|writeFile)\b/.test(command)) {
    for (const m of command.matchAll(/\b(?:p|f|fn|path|file|target|dst|out)\s*=\s*['"]([^'"\n]+)['"]/g)) add(m[1], true);
    for (const m of command.matchAll(/open\(\s*['"]([^'"\n]+)['"]\s*,\s*['"][wa]/g)) add(m[1], true);
    for (const m of command.matchAll(/Path\(\s*['"]([^'"\n]+)['"]\s*\)\.write_/g)) add(m[1], true);
    for (const m of command.matchAll(/\b(?:writeFileSync|appendFileSync|writeFile)\(\s*['"`]([^'"`\n]+)['"`]/g)) add(m[1], true);
  }
  return [...targets];
}

module.exports = { SRC_EXT, toRel, bashWrites };
