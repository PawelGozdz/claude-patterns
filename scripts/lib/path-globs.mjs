// Globy dla parametrów ścieżkowych bloków (`type: "path"` / `"path[]"`).
//
// Wydzielone z materialize-runtime.mjs (2026-10-21, governance), bo rozwinięcie globu musi
// dać TEN SAM wynik w trzech miejscach: przy materializacji (runtime.yml), przy starcie
// /analyze (kanon rozwijany w chwili analizy, nie setupu) i w verify-project-setup
// (wykrycie rozjazdu glob ↔ lista). Trzy kopie regexu rozjechałyby się po pierwszej poprawce.
//
// Własna implementacja zamiast zależności: `*` (płasko), `**` (rekurencyjnie), `?`,
// wykluczenia `!wzorzec`. Wynik posortowany, żeby runtime.yml był deterministyczny.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

export function globToRegExp(pattern) {
  // Bez markera-znaku w środku (poprzednia wersja używała bajtu, który robił z tego
  // pliku „binary data" dla grep/diff): segmenty składamy jawnie.
  const esc = (seg) => seg
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  const parts = pattern.split('/');
  let rx = '';
  parts.forEach((seg, i) => {
    const last = i === parts.length - 1;
    if (seg === '**') rx += last ? '.*' : '(?:[^/]+/)*';   // ** na końcu łapie też pliki głębiej
    else rx += esc(seg) + (last ? '' : '/');
  });
  return new RegExp(`^${rx}$`);
}

export function walkFiles(root, dir = '', acc = []) {
  const abs = join(root, dir);
  let entries;
  try { entries = readdirSync(abs); } catch { return acc; }   // brak uprawnień / zniknął katalog
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const relPath = dir ? posix.join(dir, entry) : entry;
    let isDir;
    try { isDir = statSync(join(root, relPath)).isDirectory(); } catch { continue; }
    if (isDir) walkFiles(root, relPath, acc);
    else acc.push(relPath);
  }
  return acc;
}

export const hasGlob = (pattern) => /[*?]/.test(pattern);

export const globBase = (pattern) => {
  const parts = pattern.split('/');
  const stop = parts.findIndex((p) => hasGlob(p));
  return (stop <= 0 ? '' : parts.slice(0, stop).join('/'));
};

/**
 * Rozwija listę wzorców względem `projectDir`. Błędy zgłasza przez `onError(msg)` (domyślnie
 * rzuca) — materializacja chce `fail()` z kodem wyjścia, verify/analyze chcą wyjątku do złapania.
 * Pusty glob i nieistniejący plik to ZAWSZE błąd: cicha pustka znaczyłaby „kanon jest pusty".
 */
export function createPathResolver(projectDir, onError = (msg) => { throw new Error(msg); }) {
  const scanCache = new Map();
  const filesUnder = (prefix) => {
    if (!scanCache.has(prefix)) scanCache.set(prefix, walkFiles(projectDir, prefix));
    return scanCache.get(prefix);
  };

  return function resolvePathList(patterns, { param, block }) {
    const includes = [], excludes = [];
    for (const p of patterns) (String(p).startsWith('!') ? excludes : includes).push(String(p).replace(/^!/, ''));
    const excludeRx = excludes.map(globToRegExp);
    const out = [];
    for (const inc of includes) {
      if (!hasGlob(inc)) {                          // zwykła ścieżka — musi istnieć
        // Kotwica sekcji (`plik.md#5`) jest częścią wartości, ale nie istnieje na dysku —
        // kanon zwykle wskazuje paragraf, nie cały dokument.
        const [filePart] = inc.split('#');
        if (!existsSync(join(projectDir, filePart)))
          onError(`parametr "${param}" bloku "${block}": plik nie istnieje — ${filePart}`);
        if (!excludeRx.some((rx) => rx.test(filePart))) out.push(inc);
        continue;
      }
      const rx = globToRegExp(inc);
      const hits = filesUnder(globBase(inc))   // walkFiles zwraca ścieżki względem projektu, z prefiksem
        .filter((f) => rx.test(f) && !excludeRx.some((ex) => ex.test(f)));
      // Pusty glob to prawie zawsze literówka albo przeniesiony katalog.
      if (!hits.length)
        onError(`parametr "${param}" bloku "${block}": wzorzec "${inc}" nie trafił w żaden plik projektu`);
      out.push(...hits);
    }
    return [...new Set(out)].sort();
  };
}
