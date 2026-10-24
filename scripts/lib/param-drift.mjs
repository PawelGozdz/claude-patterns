// Rozwinięcie parametrów ścieżkowych runtime.yml w chwili WYWOŁANIA i porównanie z migawką.
//
// runtime.yml niesie dla każdego parametru z globem dwie rzeczy: `params.<blok>.<param>` —
// listę plików rozwiniętą przy setupie (migawka) oraz `params_globs.<blok>.<param>` — surowe
// wzorce. Migawka starzeje się z każdym nowym plikiem pasującym do wzorca; ten moduł liczy
// stan aktualny i różnicę. Używają go `resolve-params.mjs` (start /analyze) oraz
// `verify-project-setup.mjs` (ostrzeżenie o rozjeździe).

import { createPathResolver } from './path-globs.mjs';

/**
 * @param {string} projectDir
 * @param {object} rt  sparsowany runtime.yml
 * @param {{block?: string, param?: string}} [only]
 * @returns {Array<{block, param, patterns, live, snapshot, added, removed, drift, error}>}
 */
export function resolveGlobParams(projectDir, rt, only = {}) {
  const resolve = createPathResolver(projectDir);
  const rows = [];
  for (const [block, byParam] of Object.entries(rt.params_globs ?? {})) {
    if (only.block && only.block !== block) continue;
    for (const [param, patterns] of Object.entries(byParam ?? {})) {
      if (only.param && only.param !== param) continue;
      const snapshot = [].concat(rt.params?.[block]?.[param] ?? []).map(String);
      const row = { block, param, patterns: patterns.map(String), live: [], snapshot, added: [], removed: [], drift: false, error: null };
      try {
        row.live = resolve(row.patterns, { param, block });
      } catch (e) {
        // Pusty glob / zniknięty plik: nie przerywamy — wołający decyduje, czy to STOP, czy uwaga.
        row.error = e.message;
        rows.push(row);
        continue;
      }
      row.added = row.live.filter((f) => !snapshot.includes(f));
      row.removed = snapshot.filter((f) => !row.live.includes(f));
      row.drift = row.added.length > 0 || row.removed.length > 0;
      rows.push(row);
    }
  }
  return rows;
}
