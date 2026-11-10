// scripts/lib/telemetry-rules.mjs — identyfikatory reguł z ustaleń weryfikatora i bramki końcowej
// (TASK-OBS-018, ADR 0012 aneks). Jedno miejsce normalizacji, żeby kolektor, konwerter, rollup i
// walidator zdarzeń zgadzały się co do tego, co jest `ruleId`.
//
// Zasady:
//   - `ruleId` to krótki identyfikator, nigdy wolny tekst: karta reguł (`A1`, `CLR7`), nazwa wpisu pamięci
//     bramki (`onfailed-requires-onworkerevent`) albo literał `new` dla ustalenia bez znanego identyfikatora.
//   - Wartość niepasująca do formatu NIE jest odrzucana, tylko zamieniana na `new`: liczba ustaleń zostaje
//     prawdziwa (mierzymy luki katalogu), a oryginalny tekst nie trafia do zdarzenia.
//   - Format = `SAFE_KEY` z telemetry-export.mjs, bo `ruleId` jest kluczem w rollupie i w eksporcie.

import crypto from 'node:crypto';

export const SAFE_RULE_ID = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
export const UNKNOWN_RULE = 'new';
export const MAX_RULE_HITS = 50;
// Nazwa pliku wpisu pamięci agenta: feedback_<slug>.md / project_<slug>.md / reference_<slug>.md
const MEMORY_PREFIX = /^(?:feedback|project|reference)-/;

/** Normalizuje identyfikator; zwraca null, gdy po normalizacji nie pasuje do formatu. */
export function normalizeRuleId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase().replace(/\.md$/, '').replace(/_/g, '-').replace(MEMORY_PREFIX, '');
  return SAFE_RULE_ID.test(id) ? id : null;
}

/**
 * Surowe `findings` z werdyktu → lista `{ruleId, line?}` zgodna ze schematem zdarzeń.
 * Zwraca null, gdy pole nie jest tablicą (= weryfikator nie raportował); `[]` znaczy „raportował, zero ustaleń".
 * Wpis jako string traktowany jest jak `{ruleId: string}`; wpis, którego nie da się odczytać, nie znika
 * (liczba ustaleń ma być prawdziwa), tylko staje się `new`. Bez deduplikacji: pięć naruszeń tej samej
 * reguły to pięć ustaleń. Limit MAX_RULE_HITS.
 */
export function normalizeRuleHits(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const entry of raw) {
    const item = typeof entry === 'string' ? { ruleId: entry } : entry;
    const obj = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const ruleId = normalizeRuleId(obj.ruleId) || UNKNOWN_RULE;
    const line = Number.isInteger(obj.line) && obj.line >= 1 ? obj.line : null;
    out.push(line ? { ruleId, line } : { ruleId });
    if (out.length >= MAX_RULE_HITS) break;
  }
  return out;
}

/** `rulesChecked` z werdyktu: liczba całkowita ≥ 0 albo null. */
export function normalizeRulesChecked(raw) {
  return Number.isInteger(raw) && raw >= 0 ? raw : null;
}

/**
 * Odcisk ustaleń: posortowane unikalne `ruleId` (bez `new`), SHA-1, 12 znaków hex.
 * `new` jest pomijane celowo: dwa różne nieznane ustalenia nie mogą dawać tego samego odcisku,
 * bo wyłącznik pętli zatrzymywałby niepowiązane runy. Brak znanych identyfikatorów → null
 * (nie da się zidentyfikować powtórzenia).
 */
export function ruleSignature(ruleHits) {
  if (!Array.isArray(ruleHits)) return null;
  const ids = [...new Set(ruleHits.map((h) => h && h.ruleId).filter((id) => typeof id === 'string' && id !== UNKNOWN_RULE))].sort();
  if (!ids.length) return null;
  return crypto.createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 12);
}

// Wynik sondy (CHECKS_SCHEMA) → `step.checks` zdarzenia roli `probe`: tylko znane pola i znane wartości.
// `shadowLint` to kontrola w trybie cienia (`shadow:<skrypt>` w `checks:`) — nie blokuje warstwy i służy porównaniu
// z werdyktem weryfikatora tej samej warstwy i próby. Zwraca null, gdy wynik nie ma żadnego rozpoznanego pola
// (weryfikator, implementer), więc pole `checks` nie powstaje poza sondami.
export const PROBE_CHECK_FIELDS = ['typecheck', 'tests', 'lint', 'conformance', 'shadowLint'];
const PROBE_VALUES = new Set(['pass', 'fail', 'skipped']);

export function normalizeProbeChecks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const field of PROBE_CHECK_FIELDS) if (PROBE_VALUES.has(raw[field])) out[field] = raw[field];
  return Object.keys(out).length ? out : null;
}
