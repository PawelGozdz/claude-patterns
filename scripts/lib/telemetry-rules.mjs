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

// TASK-ORC-LINT-DELEGATION-001 (E3): ID reguły z kartą, `<karta>#<ID>` (np. `command-handler-pattern_summary#N1`).
// Samo `N1` występuje w kilkudziesięciu kartach, więc nie da się go zmapować na regułę lintu ani zmierzyć pokrycia.
// `#` nie przechodzi SAFE_RULE_ID, dlatego zapis to `<karta>:<id>`, a slug karty to nazwa pliku bez ścieżki, `.md`
// i końcówki `-pattern_summary` / `_summary` (`command-handler:n1`). Goły `N1` (stary format) nadal przechodzi.
const CARD_SUFFIX = /(?:[-_]pattern)?[-_]summary$/;

function normalizeCardRuleId(raw) {
  const at = raw.indexOf('#');
  const card = raw.slice(0, at).trim().split('/').pop().toLowerCase().replace(/\.md$/, '').replace(CARD_SUFFIX, '').replace(/_/g, '-');
  const rule = raw.slice(at + 1).trim().toLowerCase().replace(/_/g, '-');
  if (!card || !rule) return null;
  const id = card + ':' + rule;
  return SAFE_RULE_ID.test(id) ? id : null;
}

/** Normalizuje identyfikator; zwraca null, gdy po normalizacji nie pasuje do formatu. */
export function normalizeRuleId(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.includes('#')) return normalizeCardRuleId(raw);
  const id = raw.trim().toLowerCase().replace(/\.md$/, '').replace(/_/g, '-').replace(MEMORY_PREFIX, '');
  return SAFE_RULE_ID.test(id) ? id : null;
}

/**
 * Lista reguł delegowanych do lintu (E2a, `<karta>#<ID>`) → unikalne `karta:id` w tym samym formacie co `ruleId` ustaleń,
 * żeby `lintMisses` dało się policzyć przez zwykłe porównanie. Wpis nie do znormalizowania odpada (to lista z konfiguracji, nie
 * ustalenia: liczba pozycji nie ma tu znaczenia).
 */
export function normalizeDelegatedRules(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    const id = typeof r === 'string' && r.includes('#') ? normalizeRuleId(r) : null;
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= MAX_RULE_HITS) break;
  }
  return out;
}

export const DELEGATION_STEP_MODES = ['on', 'holdout', 'fallback'];

/**
 * Pola delegacji z rekordu kroku (workflow-steps.jsonl) → pola zdarzenia v1: `delegation` (tryb), `delegatedRules`
 * (`karta:id`, tylko poza `fallback`) i `lintMisses` (liczba całkowita ≥ 0). Zły tryb = brak wszystkich pól.
 */
export function normalizeStepDelegation(s) {
  if (!s || !DELEGATION_STEP_MODES.includes(s.delegation)) return {};
  const out = { delegation: s.delegation };
  const rules = Array.isArray(s.delegatedRules)
    ? [...new Set(s.delegatedRules.filter((r) => typeof r === 'string' && SAFE_RULE_ID.test(r)))].slice(0, MAX_RULE_HITS)
    : [];
  if (s.delegation !== 'fallback' && rules.length) {
    out.delegatedRules = rules;
    if (Number.isInteger(s.lintMisses) && s.lintMisses >= 0) out.lintMisses = s.lintMisses;
  }
  return out;
}

/** Czy `ruleId` niesie kartę (`karta:id`)? Do pomiaru udziału ustaleń z kartą w rollupie. */
export function isQualifiedRuleId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9_.-]*:[a-z0-9][a-z0-9_.-]*$/.test(id);
}

export const MAX_FILE_LENGTH = 200;

/**
 * Ścieżka pliku z ustalenia (TASK-OBS-019): względna, z ukośnikami, bez `..`, bez znaków sterujących i bez `\`.
 * Zwraca null, gdy wartość nie spełnia warunków: ustalenie zostaje (bez `file`), bo liczba ustaleń ma być prawdziwa,
 * a niepewna ścieżka nie może trafić do zdarzenia. `file` żyje wyłącznie w lokalnych surowych zdarzeniach (ADR 0012, aneks
 * TASK-OBS-019); rollup i eksport nigdy go nie niosą.
 */
export function normalizeRuleFile(raw) {
  if (typeof raw !== 'string') return null;
  const file = raw.trim().replace(/^\.\//, '');
  if (!file || file.length > MAX_FILE_LENGTH || file.startsWith('/')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f]/.test(file)) return null;
  if (file.split('/').some((segment) => segment === '..')) return null;
  return file;
}

/**
 * Surowe `findings` z werdyktu → lista `{ruleId, line?, file?}` zgodna ze schematem zdarzeń.
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
    const file = normalizeRuleFile(obj.file);
    out.push({ ruleId, ...(line ? { line } : {}), ...(file ? { file } : {}) });
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
// `projectLint` (TASK-ORC-LINT-DELEGATION-001) = kontrola `lint-ratchet`: skrypt ratchet projektu na plikach zmiany; blokuje jak `conformance`.
export const PROBE_CHECK_FIELDS = ['typecheck', 'tests', 'lint', 'conformance', 'projectLint', 'shadowLint'];
const PROBE_VALUES = new Set(['pass', 'fail', 'skipped']);

export function normalizeProbeChecks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const field of PROBE_CHECK_FIELDS) if (PROBE_VALUES.has(raw[field])) out[field] = raw[field];
  return Object.keys(out).length ? out : null;
}
