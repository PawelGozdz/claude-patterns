// scripts/lib/blog-seed/scrub.mjs — czyszczenie identyfikatorów i bramka deny-listy (ADR 0013).
//
// Dwie różne operacje, celowo rozdzielone:
//   - IDENTYFIKATORY (nazwy repo, ścieżki, hashe, ID zadań, adresy, tokeny) → REDAKCJA:
//     zastępujemy znacznikiem, zalążek zostaje. Zliczamy RODZAJ, nigdy treści.
//   - ZAKAZANE TEMATY (absolute_bans, topic_bans bloga, exclude.topics projektu) → ODRZUCENIE:
//     skrypt nie umie bezpiecznie przepisać tematu na ogólnik, więc nie próbuje.
// Warstwy się sumują: wbudowane wzorce + deny-lista bloga + wykluczenia projektu. Żadna nie
// luzuje innej. Deny-lista należy do repo bloga i jest czytana przy każdym zapisie — NIE
// kopiujemy jej do claude-patterns.

const BUILTIN_PATTERNS = {
  email: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  internal_url: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|[\w.-]+\.(?:local|internal|lan|corp))(?::\d+)?[^\s)]*/gi,
  secret_token: /\b(?:sk|pk|rk|ghp|gho|ghs|xox[abprs]|AKIA|AIza)[-_A-Za-z0-9]{12,}\b/g,
  long_secret: /\b[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9])/g,
  abs_path: /(?:^|(?<=[\s`("']))(?:~|\/(?:opt|home|usr|var|etc|tmp|srv|root|mnt))\/[^\s`)"']+/g,
  // Ścieżki względne z DOWOLNYM rozszerzeniem (deny-lista bloga może znać tylko część, np. bez .py)
  // i ścieżki katalogów (`src/contexts/auth/`). Smoke test 2026-10-12: `engine/x.py` przeszło.
  rel_path: /(?<![\w/.])(?:\.{1,2}\/)?(?:[\w.-]+\/)+[\w-]+\.[A-Za-z0-9]{1,6}\b/g,
  dir_path: /(?<![\w/.])(?:[\w.-]+\/){2,}(?=[\s`'"),.;:]|$)/g,
};

const MARKER = /^\[usunięto: [\w ]+\]$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Granice słowa świadome Unicode: `\b` w JS nie zna polskich liter, a podciąg bez granic
// trafiałby w środek słów (krótka nazwa kodowa siedząca w zwykłym przymiotniku).
export function termRegex(term) {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(String(term).trim())}(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * Kompiluje reguły dla JEDNEGO bloga. Błędny regex w deny-liście = wyjątek (fail-closed:
 * wołający traktuje to jako `config` i nie pisze zalążka do tego bloga).
 */
export function compileRules({ denyList, projectName, publicAlias, sourceRef, excludeTopics = [] }) {
  const redactions = [];
  for (const name of [...(denyList.repo_names || [])].sort((a, b) => b.length - a.length)) {
    redactions.push({ kind: 'repo_name', re: termRegex(name), replace: '[usunięto: nazwa repo]' });
  }
  if (projectName) redactions.push({ kind: 'project_name', re: termRegex(projectName), replace: publicAlias || '[projekt]' });
  if (sourceRef) {
    for (const part of String(sourceRef).split(/[#\s]+/).filter((p) => p.length >= 3)) {
      redactions.push({ kind: 'source_ref', re: termRegex(part), replace: '[usunięto: identyfikator]' });
    }
  }
  for (const [kind, re] of Object.entries(BUILTIN_PATTERNS)) {
    redactions.push({ kind, re: new RegExp(re.source, re.flags), replace: `[usunięto: ${kind}]` });
  }
  for (const [kind, src] of Object.entries(denyList.regex || {})) {
    // Bez flagi `i`: wzorce bloga rozróżniają wielkość liter (np. zmienne środowiskowe WIELKIMI).
    redactions.push({ kind, re: new RegExp(src, 'g'), replace: `[usunięto: ${kind}]` });
  }
  const bans = [
    ...(denyList.absolute_bans || []).map((t) => ({ list: 'absolute', re: termRegex(t) })),
    ...(denyList.topic_bans || []).map((t) => ({ list: 'topic', re: termRegex(t) })),
    ...excludeTopics.map((t) => ({ list: 'project', re: termRegex(t) })),
  ];
  return { redactions, bans };
}

/** Pierwsza trafiona lista zakazów albo null. Zwraca tylko NAZWĘ listy — nie termin. */
export function findBan(text, rules) {
  for (const b of rules.bans) {
    b.re.lastIndex = 0;
    if (b.re.test(text)) return b.list;
  }
  return null;
}

/** Redaguje tekst; `counts` (Map rodzaj→liczba) to akumulator współdzielony przez wołającego. */
export function redactText(text, rules, counts) {
  let out = String(text);
  for (const r of rules.redactions) {
    r.re.lastIndex = 0;
    out = out.replace(r.re, (m) => {
      if (MARKER.test(m.trim())) return m;
      counts.set(r.kind, (counts.get(r.kind) || 0) + 1);
      return r.replace;
    });
  }
  return out;
}

/**
 * Przechodzi po całej strukturze (stringi w obiektach i tablicach). Zwraca
 * { value, ban, redactions: [{kind, count}] }. Bramka zakazów działa na SUROWYM tekście,
 * zanim redakcja cokolwiek wytnie — zakazany temat nie może przejść dlatego, że redakcja
 * usunęła mu słowo kluczowe.
 */
export function scrubDeep(value, rules) {
  const counts = new Map();
  let ban = null;
  const walk = (v) => {
    if (typeof v === 'string') {
      if (!ban) ban = findBan(v, rules);
      return redactText(v, rules, counts);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const out = walk(value);
  const redactions = [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => a.kind.localeCompare(b.kind));
  return { value: out, ban, redactions };
}

/** Kontrola gotowego tekstu (walidator — druga linia obrony po renderze). Zwraca rodzaje trafień. */
export function scanForLeaks(text, rules) {
  const hits = [];
  for (const r of rules.redactions) {
    r.re.lastIndex = 0;
    const found = String(text).match(r.re) || [];
    if (found.some((x) => !MARKER.test(x.trim()))) hits.push(r.kind);
  }
  const ban = findBan(text, rules);
  if (ban) hits.push(`ban:${ban}`);
  return [...new Set(hits)];
}
