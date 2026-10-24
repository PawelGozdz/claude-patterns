// Kanon dla bramki końcowej /orchestrate (blok `governance`, 2026-10-21).
//
// Blok governance podpinał kanon wyłącznie do panelu /analyze. Implementacja mogła więc złamać
// inwariant zatwierdzony w analizie, a żadna bramka tego nie widziała (juz-ide-api-2). Ten moduł
// składa dla prepare to, co wejdzie do prompta `final_gate`:
//   • `inject`  — pliki z `params.governance.canon_inject` (małe, inwarianty, ZAWSZE),
//   • `refs`    — dokumenty wskazane w `strategy_ref` / `canon_ref` frontmattera taska (i
//                 artefaktu analizy), rozwiązane do ścieżek. NIE cały korpus `canon`.
// Bez bloku `governance` w kompozycji zwraca `active: false` i nic nie wchodzi do prompta.
//
// Treść wklejamy (inject i refs są małe z założenia), ale pod limitem — przekroczenie to
// ostrzeżenie i sama ścieżka, żeby jeden duży plik nie rozdął prompta bramki w każdym przebiegu.

import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { walkFiles } from './path-globs.mjs';
import { resolveGlobParams } from './param-drift.mjs';

const FILE_CAP = 20 * 1024;    // pojedynczy dokument / sekcja (BDR-090 w juz-ide ma 14 KB)
const TOTAL_CAP = 60 * 1024;   // suma wklejonej treści

const asList = (v) => (v === null || v === undefined || v === '' ? [] : [].concat(v)).map(String).map((s) => s.trim()).filter(Boolean);

// `strategy_ref` w praktyce to często tekst wolny: 'BDR-076, BDR-077, BDR-044',
// 'ADR-0104 (Organization …); decyzja @founder 2026-08-08', 'docs/security/README.md (SSDLC)'.
// Pojedynczy token bez spacji to odniesienie wprost (ścieżka, `KANON`, `BDR-090#3`). Z tekstu
// wolnego wyciągamy WYŁĄCZNIE ścieżki `*.md` i ścisłe identyfikatory `LITERY-CYFRY` — reszta
// („strategia-ai §4") nie jest odniesieniem do pliku i nie ma generować ostrzeżeń.
const PATH_TOKEN = /[\w./-]+\.md(?:#[\w.-]+)?/g;
const ID_TOKEN = /\b[A-Z][A-Z0-9]*-\d{2,}(?:#[\w.-]+)?\b/g;
// `free: true` = identyfikator wyłuskany z tekstu wolnego. Taki id bywa numerem INNEGO zadania
// albo reguły (`GDPR-019`, `SEC-102`) — brak pliku to wtedy ostrzeżenie, nie „nierozwiązane
// odniesienie" w prompcie bramki (które kazałoby weryfikatorowi wpisywać je do unverified_scope).
function refTokens(values) {
  const out = [];
  for (const v of asList(values)) {
    if (!/\s/.test(v)) { out.push({ ref: v, free: false }); continue; }
    for (const ref of v.match(PATH_TOKEN) ?? []) out.push({ ref, free: false });
    for (const ref of v.replace(PATH_TOKEN, ' ').match(ID_TOKEN) ?? []) out.push({ ref, free: true });
  }
  return out;
}
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isGovernanceActive = (runtime) =>
  (runtime.stack_blocks ?? []).map(String).includes('governance') || Boolean(runtime.params?.governance);

/** Id (`BDR-090`) → ścieżki; ścieżka (`docs/decisions/x.md`) → ona sama, jeśli istnieje. */
function resolveRef(ref, { projectDir, canonFiles, docsFiles }) {
  const [target, anchor] = ref.split('#');
  const withAnchor = (p) => (anchor ? `${p}#${anchor}` : p);
  if (/[/\\]/.test(target) || /\.[a-z]{2,4}$/i.test(target)) {
    if (existsSync(join(projectDir, target))) return [withAnchor(target)];
    // Goła nazwa pliku (`system-tagow.md`) — tak powołują się zadania; szukamy jej w kanonie i docs/.
    const base = basename(target);
    const same = (files) => files.filter((f) => basename(f) === base);
    return (same(canonFiles).length ? same(canonFiles) : same(docsFiles)).slice(0, 3).map(withAnchor);
  }
  // Id musi kończyć się na granicy: BDR-09 nie jest BDR-090. Po id wolno `-`, `.`, `_`, koniec.
  // ADR-0104 bywa plikiem `0104-slug.md` (juz-ide: docs/adr/) — alias bez prefiksu literowego.
  const adrNum = /^ADR-?(\d+)$/i.exec(target)?.[1];
  const rxs = [new RegExp(`^${escapeRx(target)}(?![0-9A-Za-z])`, 'i'),
    ...(adrNum ? [new RegExp(`^${adrNum}(?![0-9A-Za-z])`)] : [])];
  const match = (files) => files.filter((f) => rxs.some((rx) => rx.test(basename(f))));
  const inCanon = match(canonFiles);
  return (inCanon.length ? inCanon : match(docsFiles)).slice(0, 3).map(withAnchor);
}

const slug = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

/**
 * Sekcja markdownu wskazana kotwicą: `#2` / `#3.1` → nagłówek zaczynający się od numeru
 * (opcjonalnie z `§`), `#inwarianty` → nagłówek o takim slugu. Sekcja trwa do następnego
 * nagłówka tego samego lub wyższego poziomu. Zwraca null, gdy nagłówka nie ma.
 * Bez tego `docs/KANON.md#2` wklejałoby 39 KB całego dokumentu zamiast jednej sekcji inwariantów.
 */
export function extractSection(markdown, anchor) {
  const lines = markdown.split('\n');
  const numeric = /^\d+(?:\.\d+)*$/.test(anchor);
  const numRx = numeric ? new RegExp(`^(?:§\\s*)?${escapeRx(anchor)}(?![\\d])[.\\s):—-]`) : null;
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const hit = numeric ? numRx.test(m[2].trim() + ' ') : slug(m[2]) === slug(anchor);
    if (hit) { start = i; level = m[1].length; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trimEnd();
}

function readCapped(projectDir, ref, budget, warnings) {
  const [file, anchor] = ref.split('#');
  let text;
  try { text = readFileSync(join(projectDir, file), 'utf8'); } catch { return { text: null, why: 'nieczytelny' }; }
  if (anchor) {
    const section = extractSection(text, anchor);
    if (section) text = section;
    else warnings.push(`canon: kotwica #${anchor} nie wskazuje nagłówka w ${file} — używam całego pliku`);
  }
  if (text.length > FILE_CAP) return { text: null, why: `${Math.round(text.length / 1024)} KB > limit ${FILE_CAP / 1024} KB` };
  if (budget.used + text.length > TOTAL_CAP) return { text: null, why: `suma > ${TOTAL_CAP / 1024} KB` };
  budget.used += text.length;
  return { text, why: null };
}

export function buildCanon({ projectDir, runtime, taskFm, analysisFm, warnings }) {
  const empty = { active: false, inject: [], refs: [], unresolved: [] };
  if (!isGovernanceActive(runtime)) return empty;

  const budget = { used: 0 };
  const entry = (path, extra = {}) => {
    const { text, why } = readCapped(projectDir, path, budget, warnings);
    if (why) warnings.push(`canon: ${path} wchodzi do bramki końcowej bez treści (${why}) — weryfikator dostanie samą ścieżkę`);
    return { path, text, ...extra };
  };

  const inject = [];
  for (const p of asList(runtime.params?.governance?.canon_inject)) {
    if (!existsSync(join(projectDir, p.split('#')[0]))) {
      warnings.push(`canon: canon_inject wskazuje nieistniejący plik ${p} — pomijam`);
      continue;
    }
    inject.push(entry(p));
  }

  // Korpus rozwijamy na żywo (nie z migawki runtime.yml): BDR dodany po setupie ma być
  // rozwiązywalny — to ten sam powód, dla którego /analyze woła resolve-params (ANL-042).
  let canonFiles = [].concat(runtime.params?.governance?.canon ?? []).map(String).map((f) => f.split('#')[0]);
  try {
    const live = resolveGlobParams(projectDir, runtime, { block: 'governance', param: 'canon' })[0];
    if (live && !live.error) canonFiles = live.live.map((f) => f.split('#')[0]);
  } catch { /* zostaje migawka */ }
  const docsFiles = walkFiles(projectDir, 'docs');

  const tokens = refTokens([].concat(taskFm?.strategy_ref ?? [], taskFm?.canon_ref ?? [],
    analysisFm?.strategy_ref ?? [], analysisFm?.canon_ref ?? []));
  const wanted = [...new Set(tokens.map((t) => t.ref))];
  const freeIds = new Set(tokens.filter((t) => t.free).map((t) => t.ref));
  const refs = [], unresolved = [], notFiles = [], seen = new Set(inject.map((i) => i.path));
  for (const ref of wanted) {
    const paths = resolveRef(ref, { projectDir, canonFiles, docsFiles });
    if (!paths.length) { (freeIds.has(ref) ? notFiles : unresolved).push(ref); continue; }
    if (paths.length > 1) warnings.push(`canon: odniesienie "${ref}" pasuje do ${paths.length} plików (${paths.join(', ')}) — wszystkie wchodzą do bramki`);
    for (const p of paths) {
      if (seen.has(p)) continue;
      seen.add(p);
      refs.push(entry(p, { ref }));
    }
  }
  if (notFiles.length)
    warnings.push(`canon: identyfikatory z tekstu strategy_ref bez pliku w kanonie ani docs/ (pominięte, mogą być numerami innych zadań): ${notFiles.join(', ')}`);
  if (unresolved.length)
    warnings.push(`canon: nie rozwiązano odniesień z strategy_ref/canon_ref: ${unresolved.join(', ')} — bramka końcowa ich nie oceni`);
  if (!inject.length && !wanted.length)
    warnings.push('canon: governance jest w kompozycji, ale ani canon_inject, ani strategy_ref/canon_ref taska nic nie wnoszą — sekcja „Zgodność z kanonem" będzie pusta');
  return { active: true, inject, refs, unresolved };
}
