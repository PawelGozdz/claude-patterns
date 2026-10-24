// scripts/lib/telemetry-stats.mjs — drobne funkcje wspólne dla agregatów telemetrii (ADR 0012).
// Wydzielone z telemetry-rollup.mjs (re-eksportuje je dalej), żeby moduły liczące werdykty i taski
// mogły z nich korzystać bez cyklu importów.

/**
 * Jednostka weryfikacji = id kroku bez numeru rundy. Runda ma w danych kilka postaci:
 * `…verifier#2` (orchestrate), `verify:core.2`, `verify:schemas:1`, `verify:x:a1` (workflow).
 * `fixes` wskazuje werdykt rundy N, a następny werdykt jednostki to runda N+1 — oba dają ten sam klucz.
 */
export function unitOf(stepId) {
  return String(stepId).replace(/#\d+$/, '').replace(/\.\d+$/, '').replace(/:a?\d+$/, '');
}

/** Nearest-rank. `sorted` rosnąco; pusta lista → null. */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];
}

export const round6 = (x) => Math.round(x * 1e6) / 1e6;
